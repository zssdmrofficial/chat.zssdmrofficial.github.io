const API_KEY = "AIzaSyDo6isc-iR_Sv0XIznh4Tx7b8sn9pfKa6I";
const MODEL = "gemma-3-27b-it";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
const CHAT_STATE_KEY = 'chat_state_v1';

function isHardReload() {
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation');
    if (nav && nav.length) return nav[0].type === 'reload';
    if (performance.navigation) return performance.navigation.type === 1;
    return false;
}

let __restored = false;
try {
    const raw = sessionStorage.getItem(CHAT_STATE_KEY);
    if (raw && !isHardReload()) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved.history) && saved.history.length) {
            window.__CHAT_HISTORY__ = saved.history;
            __restored = true;
        }
    } else if (isHardReload()) {
        sessionStorage.removeItem(CHAT_STATE_KEY);
    }
} catch (e) {
    console.warn('恢復聊天狀態失敗：', e);
}

if (!__restored) {
    window.__CHAT_HISTORY__ = [
        { role: "user", parts: [{ text: SYSTEM_INSTRUCTION }] },
        { role: "model", parts: [{ text: "你好！我是 Gemma 助手。有什麼我可以幫你的嗎？" }] }
    ];
}
let history = window.__CHAT_HISTORY__;

const chatBoxEl = document.getElementById("chat-box");
const inputEl = document.getElementById("user-input");
const sendButtonEl = document.getElementById("send-button");

function escapeHtml(text) {
    if (typeof text !== "string") return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function markdownToHtml(mdText) {
    if (typeof mdText !== "string") return "";

    if (typeof marked !== 'undefined') {
        marked.setOptions({
            highlight: function (code, lang) {
                if (typeof hljs !== 'undefined') {
                    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                    return hljs.highlight(code, { language }).value;
                }
                return code;
            },
            langPrefix: 'hljs language-'
        });

        let html = marked.parse(mdText);

        const div = document.createElement('div');
        div.innerHTML = html;

        const preBlocks = div.querySelectorAll('pre');
        preBlocks.forEach(pre => {
            const code = pre.querySelector('code');
            let lang = 'text';
            if (code && code.className) {
                const match = code.className.match(/language-([a-zA-Z0-9-]+)/);
                if (match) lang = match[1];
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'code-container';

            const header = document.createElement('div');
            header.className = 'code-header';
            header.innerHTML = `
                <span>${lang}</span>
                <button type="button" class="copy-button">
                    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    Copy code
                </button>
            `;

            const newPre = pre.cloneNode(true);

            wrapper.appendChild(header);
            wrapper.appendChild(newPre);

            pre.parentNode.replaceChild(wrapper, pre);
        });

        return div.innerHTML;
    }

    return escapeHtml(mdText);
}

function initCopyHandler(element) {
    element.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('.copy-button');
        if (!btn) return;

        const container = btn.closest('.code-container');
        const codeEl = container.querySelector('code');
        const textToCopy = codeEl ? codeEl.innerText : '';

        try {
            await navigator.clipboard.writeText(textToCopy);
            const originalHtml = btn.innerHTML;
            btn.innerHTML = `
                <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Copied!
            `;
            setTimeout(() => btn.innerHTML = originalHtml, 2000);
        } catch (err) {
            console.error('Copy failed', err);
            btn.textContent = 'Failed';
        }
    });
}

function renderMessage(role, content, isError = false) {
    const isUser = role === "user";
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message-wrapper';

    let innerContent = "";
    if (isError) {
        innerContent = `<div style="color: #ef4444;">${escapeHtml(content)}</div>`;
    } else if (isUser) {
        innerContent = `<p>${escapeHtml(content).replace(/\n/g, '<br>')}</p>`;
    } else {
        innerContent = markdownToHtml(content);
    }

    const iconHtml = isUser
        ? `<div class="role-icon icon-user"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="16" width="16" color="white" xmlns="http://www.w3.org/2000/svg"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>`
        : `<div class="role-icon icon-model"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="16" width="16" color="white" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"></path><path d="M12 6v6l4 2"></path></svg></div>`;

    msgDiv.innerHTML = `
        <div class="message-content">
            ${iconHtml}
            <div class="text-content">${innerContent}</div>
        </div>
    `;

    chatBoxEl.appendChild(msgDiv);

    requestAnimationFrame(() => {
        chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
    });
}

function showLoading() {
    const loadingId = 'loading-' + Date.now();
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message-wrapper';
    msgDiv.id = loadingId;
    msgDiv.innerHTML = `
        <div class="message-content">
            <div class="role-icon icon-model">
                <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="16" width="16" color="white" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"></path><path d="M12 6v6l4 2"></path></svg>
            </div>
            <div class="text-content">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        </div>
    `;
    chatBoxEl.appendChild(msgDiv);
    chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
    return loadingId;
}

function removeLoading(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function renderHistory() {
    chatBoxEl.innerHTML = '';
    history.forEach((msg, index) => {
        if (msg.role === 'user' && msg.parts[0].text === SYSTEM_INSTRUCTION) return;
        renderMessage(msg.role, msg.parts[0].text);
    });
}

async function callApiWithRetry(body, maxRetries = 2) {
    let attempt = 0;
    while (attempt <= maxRetries) {
        attempt++;
        try {
            const res = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (res.status === 429) {
                console.warn(`[API] 429 Too Many Requests. Retrying...`);
                await new Promise(r => setTimeout(r, 2000 * attempt));
                continue;
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error?.message || `HTTP ${res.status}`);
            }

            return await res.json();
        } catch (e) {
            if (attempt > maxRetries) throw e;
            console.warn(`[API] Retry ${attempt} failed:`, e);
            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
}

async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = "";
    inputEl.style.height = 'auto';
    sendButtonEl.disabled = true;

    history.push({ role: "user", parts: [{ text }] });
    renderMessage("user", text);
    persistChatState();

    const loadingId = showLoading();

    try {
        const data = await callApiWithRetry({ contents: history });
        removeLoading(loadingId);

        if (data.candidates && data.candidates.length > 0) {
            const responseText = data.candidates[0].content.parts[0].text;
            history.push({ role: "model", parts: [{ text: responseText }] });
            renderMessage("model", responseText);
            persistChatState();
        } else {
            renderMessage("model", "API returned no content.", true);
        }
    } catch (e) {
        removeLoading(loadingId);
        renderMessage("model", `Error: ${e.message}`, true);
        console.error(e);
    } finally {
        sendButtonEl.disabled = false;
        if (window.innerWidth > 768) {
            inputEl.focus();
        }
    }
}

function persistChatState() {
    try {
        sessionStorage.setItem(CHAT_STATE_KEY, JSON.stringify({
            history: history
        }));
    } catch (e) {
        console.warn('Storage failed', e);
    }
}

sendButtonEl.addEventListener("click", sendMessage);

inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

inputEl.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    sendButtonEl.disabled = this.value.trim() === '';
});

document.addEventListener('DOMContentLoaded', () => {
    renderHistory();
    initCopyHandler(chatBoxEl);
});