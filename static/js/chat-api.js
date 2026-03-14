async function stopGeneration() {
    if (abortController) {
        abortController.abort();
        abortController = null;
        isAwaitingResponse = false;
        updateSendButtonState();
        updateConversationLockUI();
    }
}

async function regenerateMessage(modelMessageIndex) {
    if (isAwaitingResponse) {
        await stopGeneration();
        return;
    }
    if (modelMessageIndex < 0 || modelMessageIndex >= history.length) return;
    const modelMsg = history[modelMessageIndex];
    if (!modelMsg || modelMsg.role !== 'model') return;

    let userMsgIndex = modelMessageIndex - 1;
    while (userMsgIndex >= 0) {
        const candidate = history[userMsgIndex];
        if (candidate.role === 'user') {
            const msgText = candidate.parts?.[0]?.text || '';
            const isSystemGenerated = msgText.startsWith('(System: Code execution result)');
            if (!isSystemGenerated) break;
        }
        userMsgIndex--;
    }
    if (userMsgIndex < 0) return;

    const userMsg = history[userMsgIndex];
    const userText = userMsg.displayText || userMsg.parts?.[0]?.text || '';
    const composedText = userMsg.parts?.[0]?.text || '';

    const isFirstPair = userMsgIndex === 0 ||
        (userMsgIndex === 1 && history[0]?.parts?.[0]?.text === SYSTEM_INSTRUCTION);

    const firstModelAfterUser = userMsgIndex + 1;
    const messagesToRemove = history.slice(firstModelAfterUser);
    history = history.slice(0, firstModelAfterUser);
    renderHistory();

    const activeConvId = currentConversationId;

    const idsToDelete = messagesToRemove
        .map(msg => msg?.messageId)
        .filter(id => typeof id === 'string' && id.length > 0);
    if (idsToDelete.length && activeConvId) {
        await deleteMessagesByIds(activeConvId, idsToDelete);
    }

    isAwaitingResponse = true;
    abortController = new AbortController();
    updateSendButtonState();
    updateConversationLockUI();

    let loadingId = showLoading();

    try {
        let keepGoing = true;
        let loopCount = 0;
        let isAborted = false;

        while (keepGoing && loopCount < API_MAX_RETRY_LOOPS) {
            loopCount++;

            let payloadHistory = [
                { role: "user", parts: [{ text: isPythonEnabled ? (SYSTEM_INSTRUCTION + "\n" + CUSTOM_SYSTEM_PROMPT_ADDITION) : SYSTEM_INSTRUCTION }] },
                ...history.map(msg => {
                    const sanitizedParts = msg.parts.map(p => {
                        if (p.functionCall) {
                            return { text: `[模型嘗試執行代碼]:\n${p.functionCall.args?.code || "(無代碼)"}` };
                        }
                        if (p.functionResponse) {
                            return { text: `[執行結果回報]:\n${JSON.stringify(p.functionResponse.response?.content || {})}` };
                        }
                        return p;
                    });
                    return {
                        role: (msg.role === 'function') ? 'user' : msg.role,
                        parts: sanitizedParts
                    };
                })
            ];

            const requestBody = { contents: payloadHistory };
            let currentResponseText = "";
            let beforePythonText = "";
            let hasEncounteredPython = false;

            let streamMsgDiv = null;
            let textContentEl = null;

            try {
                await callApiStreamWithRetry(requestBody, loadingId, (textChunk) => {
                    const el = document.getElementById(loadingId);
                    if (el) el.remove();

                    if (!streamMsgDiv) {
                        streamMsgDiv = document.createElement('div');
                        streamMsgDiv.className = 'message-wrapper';
                        streamMsgDiv.dataset.role = 'model';
                        streamMsgDiv.innerHTML = `
                            <div class="message-content">
                                <div class="role-icon icon-model">${MODEL_ROLE_ICON}</div>
                                <div class="text-content"></div>
                            </div>
                        `;
                        textContentEl = streamMsgDiv.querySelector('.text-content');
                        chatBoxEl.appendChild(streamMsgDiv);
                    }

                    currentResponseText += textChunk;
                    if (!hasEncounteredPython) {
                        let markerIdx = currentResponseText.indexOf("\`\`\`execute");
                        if (markerIdx !== -1) {
                            hasEncounteredPython = true;
                            beforePythonText = currentResponseText.substring(0, markerIdx).trim();
                            textContentEl.innerHTML = markdownToHtml(beforePythonText);
                        } else {
                            textContentEl.innerHTML = markdownToHtml(currentResponseText);
                        }
                        chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
                    }
                }, API_MAX_RETRY_LOOPS, abortController.signal);
            } catch (streamErr) {
                if (streamErr.name === 'AbortError') {
                    console.log("[API Stream] 串流已由使用者暫停");
                    if (streamMsgDiv) streamMsgDiv.remove();
                    if (!currentResponseText) {
                        removeLoading(loadingId);
                        return;
                    }
                    
                    keepGoing = false;
                    isAborted = true;
                } else {
                    throw streamErr;
                }
            }

            if (streamMsgDiv) streamMsgDiv.remove();
            const responseText = currentResponseText;
            const match = isPythonEnabled ? responseText.match(PYTHON_BLOCK_REGEX) : null;
            
            const isValidPython = keepGoing && match && pythonExecutorInstance;

            if (hasEncounteredPython && isValidPython) {
                if (beforePythonText) {
                    const textBeforeMsg = { role: "model", parts: [{ text: beforePythonText }], displayText: beforePythonText };
                    history.push(textBeforeMsg);
                    renderMessage("model", beforePythonText, false, beforePythonText, history.length - 1, false, false, true);

                    let lastMsgWrapper = chatBoxEl.lastElementChild;
                    if (lastMsgWrapper) {
                        let regenBtn = lastMsgWrapper.querySelector(".regenerate-message-btn");
                        if (regenBtn) regenBtn.remove();
                    }

                    if (currentUser && activeConvId) {
                        const beforeMsgId = await addMessage(activeConvId, "model", beforePythonText, beforePythonText);
                        textBeforeMsg.messageId = beforeMsgId;
                        if (isFirstPair && !isAborted) {
                            await generateAndSetConversationTitle(activeConvId, userText, beforePythonText);
                        }
                    }
                }
            }

            if (isValidPython) {
                const code = match[1];
                const indicatorId = `py-exec-${Date.now()}`;
                const escapedCode = escapeHtml(code);
                const pythonAnalysisHtml = `
                    <div class="python-analysis-indicator" id="${indicatorId}">
                        <div class="python-analysis-header" onclick="if(!event.target.closest('.copy-button')){this.parentElement.classList.toggle('expanded');scheduleBubbleShapeRefresh();}">
                            <div class="status-text">
                                ${PYTHON_ICON}
                                <span>模型正在使用 Python 分析</span>
                            </div>
                            <div class="python-analysis-actions">
                                <button type="button" class="copy-button" aria-label="複製程式碼">
                                    <span class="copy-btn-icon copy-btn-icon-default">${CODE_BLOCK_COPY_ICON}</span>
                                    <span class="copy-btn-icon copy-btn-icon-success">${CODE_BLOCK_COPIED_ICON}</span>
                                </button>
                                <div class="status-icon">
                                    ${CHEVRON_DOWN_ICON}
                                </div>
                            </div>
                        </div>
                        <div class="python-analysis-code">
                            <div class="code-container">
                                <div class="code-header">
                                    <span>python</span>
                                    <button type="button" class="copy-button" aria-label="複製程式碼">
                                        <span class="copy-btn-icon copy-btn-icon-default">${CODE_BLOCK_COPY_ICON}</span>
                                        <span class="copy-btn-icon copy-btn-icon-success">${CODE_BLOCK_COPIED_ICON}</span>
                                    </button>
                                </div>
                                <pre><code>${escapedCode}</code></pre>
                            </div>
                        </div>
                    </div>
                `;

                const newModelMsg = { role: "model", parts: [{ text: responseText }], displayText: pythonAnalysisHtml, isHtml: true };
                history.push(newModelMsg);
                renderMessage("model", responseText, false, pythonAnalysisHtml, history.length - 1, true, true);

                if (currentUser && activeConvId) {
                    const msgId = await addMessage(activeConvId, "model", responseText, pythonAnalysisHtml);
                    newModelMsg.messageId = msgId;
                }

                let resultLogs = "";
                let resultImages = [];
                let resultFiles = [];
                const execLoadingId = showLoading();

                try {
                    const execResult = await pythonExecutorInstance.execute(code, activeConvId);
                    resultLogs = execResult.logs || "No text output.";
                    resultImages = execResult.images || [];
                    resultFiles = execResult.files || [];
                } catch (err) {
                    resultLogs = `Execution Error: ${err.message}`;
                } finally {
                    removeLoading(execLoadingId);
                }

                let outputDisplay = `**Python 執行結果:**\n\`\`\`\n${resultLogs}\n\`\`\``;
                let textForModel = `**Python 執行結果:**\n\`\`\`\n${resultLogs}\n\`\`\``;
                if (resultImages.length > 0) {
                    const imgTags = resultImages.map(img => `<img src="data:${img.type};base64,${img.data}" alt="Plot">`).join('');
                    outputDisplay += `\n\n<div class="image-gallery">${imgTags}</div>`;
                }
                if (resultFiles.length > 0) {
                    const fileHtml = resultFiles.map(file =>
                        `<div style="margin-top:8px;"><a href="data:${file.type};base64,${file.data}" download="${file.name}" style="text-decoration:none; color:var(--accent-strong); display:inline-flex; align-items:center; gap:6px; padding:10px 14px; border:1px solid var(--accent-strong); border-radius:8px; transition:all 0.2s; background:rgba(255,255,255,0.02);">${DOWNLOAD_FILE_ICON} 下載檔案：${file.name}</a></div>`
                    ).join('');
                    outputDisplay += `\n\n**產生的檔案:**\n${fileHtml}`;
                }

                const userFeedbackMsg = {
                    role: "user",
                    parts: [{ text: `(System: Code execution result)\n${textForModel}\n請根據以上執行結果回答使用者的問題。` }],
                    displayText: outputDisplay,
                    messageId: null
                };
                history.push(userFeedbackMsg);
                renderMessage("model", "", false, outputDisplay, history.length - 1, false, true, false, true);

                if (currentUser && activeConvId) {
                    const resultMsgId = await addMessage(activeConvId, "model", "", outputDisplay);
                    userFeedbackMsg.messageId = resultMsgId;
                }

                loadingId = showLoading();
                continue;

            } else {
                const newModelMsg = { role: "model", parts: [{ text: responseText }], displayText: responseText };
                history.push(newModelMsg);
                removeLoading(loadingId);
                renderMessage("model", responseText, false, responseText, history.length - 1);

                if (currentUser && activeConvId) {
                    const msgId = await addMessage(activeConvId, "model", responseText, responseText);
                    newModelMsg.messageId = msgId;

                    if (isFirstPair && !isAborted) {
                        await generateAndSetConversationTitle(activeConvId, userText, responseText);
                    }

                    await loadConversations(currentUser.uid);
                }
                keepGoing = false;
            }
        }
    } catch (e) {
        removeLoading(loadingId);
        if (currentConversationId === activeConvId) {
            renderMessage("model", `Error: ${e.message}`, true);
        }
        console.error(e);
    } finally {
        removeLoading(loadingId);
        isAwaitingResponse = false;
        updateSendButtonState();
        updateConversationLockUI();
        if (window.innerWidth > 768 && currentConversationId === activeConvId) {
            inputEl.focus();
        }
    }
}

async function sendMessage() {
    if (isAwaitingResponse) {
        await stopGeneration();
        return;
    }

    const text = inputEl.value.trim();
    if (!text) return;

    const isFirstMessageTurn = history.length === 0;

    const toolContext = buildToolContextPayload();
    const composedText = toolContext
        ? `【工具資訊】\n${toolContext}\n\n【使用者提問】\n${text}`
        : text;

    if (currentUser && !currentConversationId) {
        const newId = await createConversation(DEFAULT_CHAT_TITLE);
        if (!newId) return;
    }

    const activeConvId = currentConversationId;

    if (isEditingMessage) {
        setEditingState(false);
    }

    isAwaitingResponse = true;
    abortController = new AbortController();
    inputEl.value = "";
    inputEl.style.height = 'auto';
    updateSendButtonState();
    updateConversationLockUI();

    const userMsg = { role: "user", parts: [{ text: composedText }], displayText: text, messageId: null };
    history.push(userMsg);
    renderMessage("user", composedText, false, text, history.length - 1);

    let loadingId = showLoading();

    try {
        if (currentUser && activeConvId) {
            const userMsgId = await addMessage(activeConvId, "user", composedText, text);
            userMsg.messageId = userMsgId;
            await updateConversationTitleIfEmpty(activeConvId, text);
        }

        let keepGoing = true;
        let loopCount = 0;
        let isAborted = false;

        while (keepGoing && loopCount < API_MAX_RETRY_LOOPS) {
            loopCount++;

            let payloadHistory = [
                { role: "user", parts: [{ text: isPythonEnabled ? (SYSTEM_INSTRUCTION + "\n" + CUSTOM_SYSTEM_PROMPT_ADDITION) : SYSTEM_INSTRUCTION }] },
                ...history.map(msg => {
                    const sanitizedParts = msg.parts.map(p => {
                        if (p.functionCall) {
                            return { text: `[模型嘗試執行代碼]:\n${p.functionCall.args?.code || "(無代碼)"}` };
                        }
                        if (p.functionResponse) {
                            return { text: `[執行結果回報]:\n${JSON.stringify(p.functionResponse.response?.content || {})}` };
                        }
                        return p;
                    });

                    return {
                        role: (msg.role === 'function') ? 'user' : msg.role,
                        parts: sanitizedParts
                    };
                })
            ];

            const requestBody = { contents: payloadHistory };
            let currentResponseText = "";
            let beforePythonText = "";
            let hasEncounteredPython = false;

            let streamMsgDiv = null;
            let textContentEl = null;

            try {
                await callApiStreamWithRetry(requestBody, loadingId, (textChunk) => {
                    const el = document.getElementById(loadingId);
                    if (el) el.remove();

                    if (!streamMsgDiv) {
                        streamMsgDiv = document.createElement('div');
                        streamMsgDiv.className = 'message-wrapper';
                        streamMsgDiv.dataset.role = 'model';
                        streamMsgDiv.innerHTML = `
                            <div class="message-content">
                                <div class="role-icon icon-model">${MODEL_ROLE_ICON}</div>
                                <div class="text-content"></div>
                            </div>
                        `;
                        textContentEl = streamMsgDiv.querySelector('.text-content');
                        chatBoxEl.appendChild(streamMsgDiv);
                    }

                    currentResponseText += textChunk;
                    if (!hasEncounteredPython) {
                        let markerIdx = currentResponseText.indexOf("\`\`\`execute");
                        if (markerIdx !== -1) {
                            hasEncounteredPython = true;
                            beforePythonText = currentResponseText.substring(0, markerIdx).trim();
                            textContentEl.innerHTML = markdownToHtml(beforePythonText);
                        } else {
                            textContentEl.innerHTML = markdownToHtml(currentResponseText);
                        }
                        chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
                    }
                }, API_MAX_RETRY_LOOPS, abortController.signal);
            } catch (streamErr) {
                if (streamErr.name === 'AbortError') {
                    console.log("[API Stream] 串流已由使用者暫停");
                    if (streamMsgDiv) streamMsgDiv.remove();
                    if (!currentResponseText) {
                        removeLoading(loadingId);
                        return;
                    }
                    
                    keepGoing = false;
                    isAborted = true;
                } else {
                    throw streamErr;
                }
            }

            if (streamMsgDiv) streamMsgDiv.remove();
            const responseText = currentResponseText;
            const match = isPythonEnabled ? responseText.match(PYTHON_BLOCK_REGEX) : null;
            
            const isValidPython = keepGoing && match && pythonExecutorInstance;

            if (hasEncounteredPython && isValidPython) {
                if (beforePythonText) {
                    const textBeforeMsg = { role: "model", parts: [{ text: beforePythonText }], displayText: beforePythonText };
                    history.push(textBeforeMsg);
                    renderMessage("model", beforePythonText, false, beforePythonText, history.length - 1, false, false, true);

                    let lastMsgWrapper = chatBoxEl.lastElementChild;
                    if (lastMsgWrapper) {
                        let regenBtn = lastMsgWrapper.querySelector(".regenerate-message-btn");
                        if (regenBtn) regenBtn.remove();
                    }

                    if (currentUser && activeConvId) {
                        const beforeMsgId = await addMessage(activeConvId, "model", beforePythonText, beforePythonText);
                        textBeforeMsg.messageId = beforeMsgId;
                        if (isFirstMessageTurn && !isAborted) {
                            await generateAndSetConversationTitle(activeConvId, text, beforePythonText);
                        }
                    }
                }
            }

            if (isValidPython) {
                const code = match[1];

                const indicatorId = `py-exec-${Date.now()}`;
                const escapedCode = escapeHtml(code);
                const pythonAnalysisHtml = `
                    <div class="python-analysis-indicator" id="${indicatorId}">
                        <div class="python-analysis-header" onclick="if(!event.target.closest('.copy-button')){this.parentElement.classList.toggle('expanded');scheduleBubbleShapeRefresh();}">
                            <div class="status-text">
                                ${PYTHON_ICON}
                                <span>模型正在使用 Python 分析</span>
                            </div>
                            <div class="python-analysis-actions">
                                <button type="button" class="copy-button" aria-label="複製程式碼">
                                    <span class="copy-btn-icon copy-btn-icon-default">${CODE_BLOCK_COPY_ICON}</span>
                                    <span class="copy-btn-icon copy-btn-icon-success">${CODE_BLOCK_COPIED_ICON}</span>
                                </button>
                                <div class="status-icon">
                                    ${CHEVRON_DOWN_ICON}
                                </div>
                            </div>
                        </div>
                        <div class="python-analysis-code">
                            <div class="code-container">
                                <div class="code-header">
                                    <span>python</span>
                                    <button type="button" class="copy-button" aria-label="複製程式碼">
                                        <span class="copy-btn-icon copy-btn-icon-default">${CODE_BLOCK_COPY_ICON}</span>
                                        <span class="copy-btn-icon copy-btn-icon-success">${CODE_BLOCK_COPIED_ICON}</span>
                                    </button>
                                </div>
                                <pre><code>${escapedCode}</code></pre>
                            </div>
                        </div>
                    </div>
                `;

                const modelMsg = { role: "model", parts: [{ text: responseText }], displayText: pythonAnalysisHtml, isHtml: true };
                history.push(modelMsg);
                renderMessage("model", responseText, false, pythonAnalysisHtml, history.length - 1, true, true);

                if (currentUser && activeConvId) {
                    const pyMsgId = await addMessage(activeConvId, "model", responseText, pythonAnalysisHtml);
                    modelMsg.messageId = pyMsgId;
                }

                let resultLogs = "";
                let resultImages = [];
                let resultFiles = [];
                const execLoadingId = showLoading();

                try {
                    const execResult = await pythonExecutorInstance.execute(code, activeConvId);
                    resultLogs = execResult.logs || "No text output.";
                    resultImages = execResult.images || [];
                    resultFiles = execResult.files || [];
                } catch (err) {
                    resultLogs = `Execution Error: ${err.message}`;
                } finally {
                    removeLoading(execLoadingId);
                }

                let outputDisplay = `**Python 執行結果:**\n\`\`\`\n${resultLogs}\n\`\`\``;
                let textForModel = `**Python 執行結果:**\n\`\`\`\n${resultLogs}\n\`\`\``;
                if (resultImages.length > 0) {
                    const imgTags = resultImages.map(img => `<img src="data:${img.type};base64,${img.data}" alt="Plot">`).join('');
                    outputDisplay += `\n\n<div class="image-gallery">${imgTags}</div>`;
                }

                if (resultFiles.length > 0) {
                    const fileHtml = resultFiles.map(file =>
                        `<div style="margin-top:8px;"><a href="data:${file.type};base64,${file.data}" download="${file.name}" style="text-decoration:none; color:var(--accent-strong); display:inline-flex; align-items:center; gap:6px; padding:10px 14px; border:1px solid var(--accent-strong); border-radius:8px; transition:all 0.2s; background:rgba(255,255,255,0.02);">${DOWNLOAD_FILE_ICON}${file.name}</a></div>`
                    ).join('');
                    outputDisplay += `\n\n**產生的檔案:**\n${fileHtml}`;
                }

                const userFeedbackMsg = {
                    role: "user",
                    parts: [{ text: `(System: Code execution result)\n${textForModel}\n請根據以上執行結果回答使用者的問題。` }],
                    displayText: outputDisplay,
                    messageId: null
                };

                history.push(userFeedbackMsg);
                renderMessage("model", "", false, outputDisplay, history.length - 1, false, true, false, true);

                if (currentUser && activeConvId) {
                    const resultMsgId = await addMessage(activeConvId, "model", "", outputDisplay);
                    userFeedbackMsg.messageId = resultMsgId;
                }

                loadingId = showLoading();
                continue;

            } else {
                const modelMsg = { role: "model", parts: [{ text: responseText }], displayText: responseText };
                history.push(modelMsg);
                removeLoading(loadingId);
                renderMessage("model", responseText, false, responseText, history.length - 1);

                if (currentUser && activeConvId) {
                    await addMessage(activeConvId, "model", responseText, responseText);

                    if (isFirstMessageTurn && !isAborted) {
                        await generateAndSetConversationTitle(activeConvId, text, responseText);
                    }

                    await loadConversations(currentUser.uid);
                }
                keepGoing = false;
            }

        }

    } catch (e) {
        removeLoading(loadingId);
        if (currentConversationId === activeConvId) {
            renderMessage("model", `Error: ${e.message}`, true);
        }
        console.error(e);
    } finally {
        removeLoading(loadingId);
        isAwaitingResponse = false;
        updateSendButtonState();
        updateConversationLockUI();
        if (window.innerWidth > 768 && currentConversationId === activeConvId) {
            inputEl.focus();
        }
    }
}

