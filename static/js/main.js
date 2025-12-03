const API_KEY = "AIzaSyDo6isc-iR_Sv0XIznh4Tx7b8sn9pfKa6I";
const MODEL = "gemma-3-27b-it";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// Firebase 來自 index.html 的初始化
const auth = firebase.auth();
const db = firebase.firestore();

let history = [];
let currentConversationId = null;
let currentUser = null;
let isCreatingConversation = false;
let isAwaitingResponse = false;

const chatBoxEl = document.getElementById("chat-box");
const inputEl = document.getElementById("user-input");
const sendButtonEl = document.getElementById("send-button");
const conversationListEl = document.getElementById("conversation-list");
const newChatBtn = document.getElementById("new-chat-btn");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const loginPageBtn = document.getElementById("login-page-btn");
const logoutBtn = document.getElementById("logout-btn");
const authEmailEl = document.getElementById("auth-email");
const authPasswordEl = document.getElementById("auth-password");
const authHintEl = document.getElementById("auth-hint");
const userNameEl = document.getElementById("user-name");
const userAvatarEl = document.getElementById("user-avatar");
const mobileMenuBtn = document.getElementById("mobile-menu-btn");
const mobileBackdrop = document.getElementById("mobile-backdrop");

const SEND_ICON_DEFAULT = `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 11L12 6L17 11M12 18V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
`;

const SEND_ICON_PENDING = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon">
        <path d="M4.5 5.75C4.5 5.05964 5.05964 4.5 5.75 4.5H14.25C14.9404 4.5 15.5 5.05964 15.5 5.75V14.25C15.5 14.9404 14.9404 15.5 14.25 15.5H5.75C5.05964 15.5 4.5 14.9404 4.5 14.25V5.75Z"></path>
    </svg>
`;

function setElementVisibility(el, shouldShow) {
    if (!el) return;
    el.style.display = shouldShow ? '' : 'none';
}

function updateSendButtonState() {
    if (!sendButtonEl || !inputEl) return;
    const hasText = inputEl.value.trim() !== '';
    sendButtonEl.disabled = isAwaitingResponse || !hasText;
    sendButtonEl.setAttribute('aria-busy', isAwaitingResponse.toString());
    const iconMarkup = isAwaitingResponse ? SEND_ICON_PENDING : SEND_ICON_DEFAULT;
    if (sendButtonEl.innerHTML.trim() !== iconMarkup.trim()) {
        sendButtonEl.innerHTML = iconMarkup;
    }
}

function setAuthHint(msg, isError = false) {
    const text = msg || '';
    const color = isError ? '#ef4444' : '#b4b4b4';
    if (authHintEl) {
        authHintEl.textContent = text;
        authHintEl.style.color = color;
    }
}

function clearAuthFields(clearEmail = false) {
    if (authPasswordEl) authPasswordEl.value = '';
    if (clearEmail && authEmailEl) authEmailEl.value = '';
}

function toggleMobileSidebar(forceOpen = null) {
    const shouldOpen = forceOpen !== null ? forceOpen : !document.body.classList.contains('sidebar-open');
    document.body.classList.toggle('sidebar-open', shouldOpen);
}

function closeMobileSidebar() {
    document.body.classList.remove('sidebar-open');
}

function updateUserProfile(user) {
    if (!userNameEl || !userAvatarEl) return;
    if (user) {
        userNameEl.textContent = user.email || 'User';
        userAvatarEl.textContent = (user.email || 'U').slice(0, 1).toUpperCase();
    } else {
        userNameEl.textContent = 'Guest';
        userAvatarEl.textContent = 'G';
    }
}

function updateAuthUI(user) {
    const isLoggedIn = !!user;
    setElementVisibility(loginBtn, !isLoggedIn);
    setElementVisibility(signupBtn, !isLoggedIn);
    setElementVisibility(loginPageBtn, !isLoggedIn);
    setElementVisibility(logoutBtn, isLoggedIn);

    if (authEmailEl) {
        authEmailEl.disabled = isLoggedIn;
        authEmailEl.value = isLoggedIn ? (user?.email || '') : '';
    }

    if (authPasswordEl) {
        authPasswordEl.disabled = isLoggedIn;
        authPasswordEl.value = '';
    }

    if (newChatBtn) {
        newChatBtn.classList.toggle('disabled', !isLoggedIn);
        newChatBtn.setAttribute('aria-disabled', (!isLoggedIn).toString());
    }
}

function clearChatUI() {
    chatBoxEl.innerHTML = '';
    history = [];
}

function clearHistoryList() {
    if (!conversationListEl) return;
    conversationListEl.innerHTML = '<div class="history-empty">登入後會顯示同志你的對話</div>';
}

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

    const userAvatarText = (userAvatarEl?.textContent || (currentUser?.email || 'U')).trim().slice(0, 1).toUpperCase();

    const iconHtml = isUser
        ? `<div class="avatar" id="user-avatar">${escapeHtml(userAvatarText)}</div>`
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

function renderConversationList(conversations) {
    if (!conversationListEl) return;
    if (!conversations.length) {
        conversationListEl.innerHTML = '<div class="history-empty">尚無對話，點擊「New chat」建立</div>';
        return;
    }

    conversationListEl.innerHTML = '';
    conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'history-item' + (conv.id === currentConversationId ? ' active' : '');
        item.dataset.id = conv.id;

        const title = document.createElement('span');
        title.className = 'history-title';
        title.textContent = conv.title || '未命名對話';

        const actions = document.createElement('div');
        actions.className = 'history-actions';

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-conv-btn';
        deleteBtn.title = '刪除此對話';
        deleteBtn.innerHTML = `
            <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>
        `;
        deleteBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            deleteConversation(conv.id);
        });

        actions.appendChild(deleteBtn);

        item.appendChild(title);
        item.appendChild(actions);

        item.addEventListener('click', () => {
            if (conv.id === currentConversationId) return;
            loadMessages(conv.id);
            closeMobileSidebar();
        });

        conversationListEl.appendChild(item);
    });
}

function renderHistory() {
    chatBoxEl.innerHTML = '';
    history.forEach((msg, index) => {
        if (msg.role === 'user' && msg.parts[0].text === SYSTEM_INSTRUCTION) return;
        renderMessage(msg.role, msg.parts[0].text);
    });
}

async function loadConversations(uid) {
    if (!uid) {
        clearHistoryList();
        return;
    }
    try {
        const snap = await db.collection('conversations')
            .where('userId', '==', uid)
            .orderBy('updatedAt', 'desc')
            .get();
        const conversations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderConversationList(conversations);
        if (!currentConversationId && conversations.length) {
            loadMessages(conversations[0].id);
        }
    } catch (e) {
        console.error('載入對話列表失敗', e);
        setAuthHint('載入對話列表失敗，請稍後再試', true);
    }
}

async function findUnusedNewChat(uid) {
    if (!uid) return null;
    try {
        const snap = await db.collection('conversations')
            .where('userId', '==', uid)
            .where('title', '==', 'New chat')
            .limit(1)
            .get();

        if (snap.empty) return null;

        const doc = snap.docs[0];
        const messagesSnap = await doc.ref.collection('messages').limit(1).get();
        if (!messagesSnap.empty) return null;

        return doc.id;
    } catch (e) {
        console.warn('查詢未使用的對話失敗', e);
        return null;
    }
}

async function createConversation(title = 'New chat') {
    const user = auth.currentUser;
    if (!user) {
        setAuthHint('請先登入再建立對話', true);
        return null;
    }
    try {
        if (title === 'New chat') {
            const existingDraftId = await findUnusedNewChat(user.uid);
            if (existingDraftId) {
                currentConversationId = existingDraftId;
                await loadMessages(existingDraftId);
                setAuthHint('為了厚道，有效率的壓榨資本家資源，請先使用已建立的New chat');
                return existingDraftId;
            }
        }

        if (isCreatingConversation) {
            setAuthHint('正在建立對話，請稍候');
            return currentConversationId;
        }
        isCreatingConversation = true;

        const doc = await db.collection('conversations').add({
            userId: user.uid,
            title,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        currentConversationId = doc.id;
        history = [];
        renderHistory();
        await loadConversations(user.uid);
        return doc.id;
    } catch (e) {
        console.error('建立對話失敗', e);
        setAuthHint('建立對話失敗，請稍後再試', true);
        return null;
    } finally {
        isCreatingConversation = false;
    }
}

async function handleNewChat() {
    if (!currentUser) {
        setAuthHint('請先登入再建立對話', true);
        return;
    }
    await createConversation('New chat');
}

async function loadMessages(convId) {
    if (!convId) return;
    const user = auth.currentUser;
    if (!user) {
        setAuthHint('請先登入再讀取對話', true);
        return;
    }
    try {
        const snap = await db.collection('conversations')
            .doc(convId)
            .collection('messages')
            .orderBy('ts', 'asc')
            .get();
        history = snap.docs.map(d => {
            const data = d.data();
            return { role: data.role, parts: [{ text: data.content }] };
        });
        currentConversationId = convId;
        renderHistory();
        await loadConversations(user.uid);
    } catch (e) {
        console.error('載入訊息失敗', e);
        setAuthHint('載入訊息失敗，請稍後再試', true);
    }
}

async function addMessage(convId, role, content) {
    if (!convId) return;
    const user = auth.currentUser;
    if (!user) return;
    try {
        const messagesRef = db.collection('conversations').doc(convId).collection('messages');
        await messagesRef.add({
            role,
            content,
            userId: user.uid,
            ts: firebase.firestore.FieldValue.serverTimestamp(),
        });
        await db.collection('conversations').doc(convId).update({
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (e) {
        console.error('寫入訊息失敗', e);
    }
}

async function deleteConversation(convId) {
    if (!convId) return;
    const user = auth.currentUser;
    if (!user) {
        setAuthHint('請先登入再刪除對話', true);
        return;
    }

    const confirmed = window.confirm('確定要刪除這個對話嗎？此動作無法復原。');
    if (!confirmed) return;

    try {
        const convRef = db.collection('conversations').doc(convId);
        const convSnap = await convRef.get();
        const convData = convSnap.data();

        if (!convSnap.exists || convData?.userId !== user.uid) {
            setAuthHint('無法刪除此對話', true);
            return;
        }

        const messagesSnap = await convRef.collection('messages').get();
        const commits = [];
        const BATCH_LIMIT = 450;
        let batch = db.batch();
        let counter = 0;

        messagesSnap.forEach((msgDoc) => {
            batch.delete(msgDoc.ref);
            counter++;
            if (counter === BATCH_LIMIT) {
                commits.push(batch.commit());
                batch = db.batch();
                counter = 0;
            }
        });
        if (counter > 0) {
            commits.push(batch.commit());
        }
        await Promise.all(commits);

        await convRef.delete();

        if (currentConversationId === convId) {
            currentConversationId = null;
            history = [];
            clearChatUI();
        }

        await loadConversations(user.uid);
        setAuthHint('對話已刪除');
    } catch (e) {
        console.error('刪除對話失敗', e);
        setAuthHint('刪除對話失敗，請稍後再試', true);
    }
}

async function updateConversationTitleIfEmpty(convId, text) {
    if (!convId || !text) return;
    try {
        const docRef = db.collection('conversations').doc(convId);
        const doc = await docRef.get();
        const data = doc.data() || {};
        if (!data.title || data.title === 'New chat') {
            const title = text.slice(0, 40);
            await docRef.set({ title }, { merge: true });
        }
    } catch (e) {
        console.warn('更新標題失敗', e);
    }
}

async function handleSignIn() {
    const email = authEmailEl.value.trim();
    const password = authPasswordEl.value.trim();
    if (!email || !password) {
        setAuthHint('請輸入 email 與密碼', true);
        return;
    }
    try {
        await auth.signInWithEmailAndPassword(email, password);
        setAuthHint('登入成功');
        clearAuthFields();
        closeMobileSidebar();
    } catch (e) {
        console.error(e);
        setAuthHint(e.message || '登入失敗', true);
    }
}

async function handleSignUp() {
    const email = authEmailEl.value.trim();
    const password = authPasswordEl.value.trim();
    if (!email || !password) {
        setAuthHint('請輸入 email 與密碼', true);
        return;
    }
    try {
        await auth.createUserWithEmailAndPassword(email, password);
        setAuthHint('註冊並登入成功');
        clearAuthFields();
        closeMobileSidebar();
    } catch (e) {
        console.error(e);
        setAuthHint(e.message || '註冊失敗', true);
    }
}

async function handleSignOut() {
    try {
        await auth.signOut();
        clearChatUI();
        clearHistoryList();
        currentConversationId = null;
        setAuthHint('已登出');
        clearAuthFields(true);
        closeMobileSidebar();
    } catch (e) {
        console.error(e);
        setAuthHint('登出失敗', true);
    }
}

auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    updateUserProfile(user);
    updateAuthUI(user);
    if (user) {
        setAuthHint(`已登入：${user.email}`);
        await loadConversations(user.uid);
        updateSendButtonState();
    } else {
        setAuthHint('未登入：對話不會被儲存');
        clearHistoryList();
        currentConversationId = null;
        closeMobileSidebar();
        updateSendButtonState();
    }
});

// [新增] 顯示冷卻倒數的函式
async function showCooldownCountdown(seconds, loadingId) {
    return new Promise((resolve) => {
        let remaining = seconds;
        const loadingEl = document.getElementById(loadingId);
        // 找到文字容器，原本裡面是 typing-indicator
        const contentEl = loadingEl?.querySelector('.text-content');

        // 備份原始 Loading 動畫 (typing dots)
        const originalHtml = contentEl ? contentEl.innerHTML : '';

        console.log(`[COOLDOWN] 進入冷卻，總共 ${seconds} 秒`);

        const timer = setInterval(() => {
            if (contentEl) {
                // 更新 UI 顯示倒數
                contentEl.innerHTML = `<i>思想小助手回應中... (等待 ${remaining} 秒冷卻)</i>`;
            }
            console.log(`[COOLDOWN] 剩餘 ${remaining} 秒`);
            remaining--;

            if (remaining <= 0) {
                clearInterval(timer);
                if (contentEl) {
                    // 冷卻結束，恢復原本的打字動畫，準備重試
                    contentEl.innerHTML = originalHtml;
                }
                console.log(`[COOLDOWN] 冷卻結束，準備重試 API`);
                resolve();
            }
        }, 1000);
    });
}

// [修改] 強化版 API 呼叫 (包含 429/503 處理與 UI 連動)
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

            // 處理 503 (服務超載) -> 立即重試
            if (res.status === 503) {
                console.warn(`[API] 503 超載，第 ${attempt} 次 → 立即重試`);
                continue;
            }

            // 處理 429 (請求過多) -> 進入倒數冷卻
            if (res.status === 429) {
                let retryAfter = parseInt(res.headers.get("Retry-After") || "0", 10);

                // 如果 Header 沒給時間，嘗試從錯誤訊息解析 (Gemini 常見錯誤格式)
                if (!retryAfter) {
                    const errData = await res.json().catch(() => ({}));
                    const msg = errData?.error?.message || "";
                    // 尋找類似 "retry in 12s" 的字串
                    const match = msg.match(/retry in ([\d.]+)s/i);
                    if (match) retryAfter = Math.ceil(parseFloat(match[1]));
                }

                // 如果都找不到，預設等待 5 秒 (隨著次數增加)
                if (!retryAfter) retryAfter = 5 * attempt;

                console.warn(`[API] 429 配額超限 → 等待 ${retryAfter} 秒再重試 (第 ${attempt} 次)`);

                // 呼叫 UI 倒數，傳入 loadingId 以便更新畫面
                await showCooldownCountdown(retryAfter, loadingId);

                continue;
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.error(`[API] 非 503/429 錯誤: ${res.status}`, err);
                throw new Error(err?.error?.message || `HTTP ${res.status}`);
            }

            console.log(`[API] 成功! 第 ${attempt} 次呼叫返回結果`);
            return await res.json();

        } catch (e) {
            console.error(`[API] 呼叫失敗 (第 ${attempt} 次):`, e);
            // 如果是最後一次嘗試仍然失敗，則拋出錯誤
            if (attempt >= maxRetries) throw e;
            // 發生網路錯誤等非 API 狀態碼錯誤時，稍作等待再重試
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    throw new Error("已達最大重試次數仍失敗");
}

async function sendMessage() {
    if (isAwaitingResponse) {
        return;
    }
    const text = inputEl.value.trim();
    if (!text) return;

    if (currentUser && !currentConversationId) {
        const newId = await createConversation('New chat');
        if (!newId) return;
    }

    isAwaitingResponse = true;
    inputEl.value = "";
    inputEl.style.height = 'auto';
    updateSendButtonState();

    const userMsg = { role: "user", parts: [{ text }] };
    history.push(userMsg);
    renderMessage("user", text);

    const loadingId = showLoading();

    try {
        if (currentUser && currentConversationId) {
            await addMessage(currentConversationId, "user", text);
            await updateConversationTitleIfEmpty(currentConversationId, text);
        }

        const payloadHistory = [
            { role: "user", parts: [{ text: SYSTEM_INSTRUCTION }] },
            ...history
        ];

        const data = await callApiWithRetry({ contents: payloadHistory }, loadingId);
        removeLoading(loadingId);

        const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "API returned no content.";
        const modelMsg = { role: "model", parts: [{ text: responseText }] };
        history.push(modelMsg);
        renderMessage("model", responseText);
        if (currentUser && currentConversationId) {
            await addMessage(currentConversationId, "model", responseText);
            await loadConversations(currentUser.uid);
        }
    } catch (e) {
        removeLoading(loadingId);
        renderMessage("model", `Error: ${e.message}`, true);
        console.error(e);
    } finally {
        isAwaitingResponse = false;
        updateSendButtonState();
        if (window.innerWidth > 768) {
            inputEl.focus();
        }
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
    updateSendButtonState();
});

document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI(currentUser);
    renderHistory();
    initCopyHandler(chatBoxEl);
    if (loginBtn) loginBtn.addEventListener('click', handleSignIn);
    if (signupBtn) signupBtn.addEventListener('click', handleSignUp);
    if (logoutBtn) logoutBtn.addEventListener('click', handleSignOut);
    if (newChatBtn) newChatBtn.addEventListener('click', handleNewChat);
    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => toggleMobileSidebar());
    if (mobileBackdrop) mobileBackdrop.addEventListener('click', closeMobileSidebar);
    updateSendButtonState();
});
