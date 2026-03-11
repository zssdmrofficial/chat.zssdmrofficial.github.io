async function showCooldownCountdown(seconds, loadingId) {
    return new Promise((resolve) => {
        let remaining = seconds;
        const loadingEl = document.getElementById(loadingId);
        const contentEl = loadingEl?.querySelector('.text-content');
        const originalHtml = contentEl ? contentEl.innerHTML : '';

        console.log(`[COOLDOWN] 進入冷卻，總共 ${seconds} 秒`);

        const timer = setInterval(() => {
            if (contentEl) {
                contentEl.innerHTML = `<i>思想小助手回應中... (等待 ${remaining} 秒冷卻)</i>`;
            }
            console.log(`[COOLDOWN] 剩餘 ${remaining} 秒`);
            remaining--;

            if (remaining <= 0) {
                clearInterval(timer);
                if (contentEl) {
                    contentEl.innerHTML = originalHtml;
                }
                console.log(`[COOLDOWN] 冷卻結束，準備重試 API`);
                resolve();
            }
        }, 1000);
    });
}

async function callApiWithRetry(body, loadingId, maxRetries = 5) {
    let attempt = 0;
    while (attempt < maxRetries) {
        attempt++;
        console.log(`[API] 嘗試第 ${attempt} 次呼叫...`);

        try {
            const res = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (res.status === 503) {
                console.warn(`[API] 503 超載，第 ${attempt} 次 → 立即重試`);
                continue;
            }

            if (res.status === 429) {
                let retryAfter = parseInt(res.headers.get("Retry-After") || "0", 10);

                if (!retryAfter) {
                    const errData = await res.json().catch(() => ({}));
                    const msg = errData?.error?.message || "";
                    const match = msg.match(/retry in ([\d.]+)s/i);
                    if (match) retryAfter = Math.ceil(parseFloat(match[1]));
                }

                if (!retryAfter) retryAfter = 5 * attempt;

                console.warn(`[API] 429 配額超限 → 等待 ${retryAfter} 秒再重試 (第 ${attempt} 次)`);

                await showCooldownCountdown(retryAfter, loadingId);

                continue;
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.error(`[API] 非 503/429 錯誤: ${res.status}`, err);

                if (res.status === 400) {
                    const errorMsg = err?.error?.message || `HTTP ${res.status}`;
                    throw new Error(errorMsg);
                }
                throw new Error(err?.error?.message || `HTTP ${res.status}`);
            }

            console.log(`[API] 成功! 第 ${attempt} 次呼叫返回結果`);
            return await res.json();

        } catch (e) {
            console.error(`[API] 呼叫失敗 (第 ${attempt} 次):`, e);
            if (e.message && (e.message.startsWith("HTTP 400") || e.message.includes("Function calling is not enabled"))) {
                throw e;
            }
            if (attempt >= maxRetries) throw e;
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    throw new Error("已達最大重試次數仍失敗");
}

async function callApiStreamWithRetry(body, loadingId, onChunk, maxRetries = 5) {
    let attempt = 0;
    while (attempt < maxRetries) {
        attempt++;
        console.log(`[API Stream] 嘗試第 ${attempt} 次呼叫...`);

        try {
            const res = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-use-stream": "true"
                },
                body: JSON.stringify(body),
            });

            if (res.status === 503) continue;
            if (res.status === 429) {
                let retryAfter = parseInt(res.headers.get("Retry-After") || "0", 10);
                if (!retryAfter) retryAfter = 5 * attempt;
                await showCooldownCountdown(retryAfter, loadingId);
                continue;
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                if (res.status === 400) {
                    throw new Error(err?.error?.message || `HTTP ${res.status}`);
                }
                throw new Error(err?.error?.message || `HTTP ${res.status}`);
            }

            console.log(`[API Stream] 成功! 開始解析串流`);
            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    if (buffer.trim()) {
                        let lines = buffer.split('\n');
                        for (let line of lines) {
                            let dataStr = line.replace(/^data:\s*/, '').trim();
                            if (dataStr && dataStr !== '[DONE]') {
                                try {
                                    let data = JSON.parse(dataStr);
                                    let textChunk = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                                    if (textChunk) onChunk(textChunk);
                                } catch (e) { }
                            }
                        }
                    }
                    break;
                }
                buffer += decoder.decode(value, { stream: true });
                let lines = buffer.split('\n');
                buffer = lines.pop();

                for (let line of lines) {
                    let dataStr = line.replace(/^data:\s*/, '').trim();
                    if (dataStr === '[DONE]') continue;
                    if (!dataStr) continue;
                    try {
                        let data = JSON.parse(dataStr);
                        let textChunk = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (textChunk) {
                            onChunk(textChunk);
                        }
                    } catch (e) { }
                }
            }
            return;

        } catch (e) {
            console.error(`[API Stream] 呼叫失敗 (第 ${attempt} 次):`, e);
            if (e.message && (e.message.startsWith("HTTP 400") || e.message.includes("Function calling is not enabled"))) {
                throw e;
            }
            if (attempt >= maxRetries) throw e;
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    throw new Error("已達最大重試次數仍失敗");
}

