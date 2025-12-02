const API_KEY = "AIzaSyDo6isc-iR_Sv0XIznh4Tx7b8sn9pfKa6I";
const MODEL = "gemma-3-27b-it";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// Firebase 來自 index.html 的初始化
const auth = firebase.auth();
const db = firebase.firestore();

let history = [];
let currentConversationId = null;
let currentUser = null;

const chatBoxEl = document.getElementById("chat-box");
const inputEl = document.getElementById("user-input");
const sendButtonEl = document.getElementById("send-button");
const conversationListEl = document.getElementById("conversation-list");
const newChatBtn = document.getElementById("new-chat-btn");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const logoutBtn = document.getElementById("logout-btn");
const authEmailEl = document.getElementById("auth-email");
const authPasswordEl = document.getElementById("auth-password");
const authHintEl = document.getElementById("auth-hint");
const authHintInlineEl = document.getElementById("auth-hint-inline");
const userNameEl = document.getElementById("user-name");
const userAvatarEl = document.getElementById("user-avatar");
const mobileMenuBtn = document.getElementById("mobile-menu-btn");
const mobileBackdrop = document.getElementById("mobile-backdrop");

function setElementVisibility(el, shouldShow) {
    if (!el) return;
    el.style.display = shouldShow ? '' : 'none';
}

function setAuthHint(msg, isError = false) {
    const text = msg || '';
    const color = isError ? '#ef4444' : '#b4b4b4';
    if (authHintEl) {
        authHintEl.textContent = text;
        authHintEl.style.color = color;
    }
    if (authHintInlineEl) {
        authHintInlineEl.textContent = text;
        authHintInlineEl.style.color = color;
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
    conversationListEl.innerHTML = '<div class="history-empty">登入後會顯示你的對話</div>';
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
        item.textContent = conv.title || '未命名對話';
        item.dataset.id = conv.id;
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

async function createConversation(title = 'New chat') {
    const user = auth.currentUser;
    if (!user) {
        setAuthHint('請先登入再建立對話', true);
        return null;
    }
    try {
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
        sendButtonEl.disabled = inputEl.value.trim() === '';
    } else {
        setAuthHint('請先登入以儲存對話');
        clearChatUI();
        clearHistoryList();
        currentConversationId = null;
        closeMobileSidebar();
        sendButtonEl.disabled = true;
    }
});

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

    if (!currentUser) {
        setAuthHint('請先登入後再發送訊息', true);
        return;
    }

    if (!currentConversationId) {
        const newId = await createConversation('New chat');
        if (!newId) return;
    }

    inputEl.value = "";
    inputEl.style.height = 'auto';
    sendButtonEl.disabled = true;

    const userMsg = { role: "user", parts: [{ text }] };
    history.push(userMsg);
    renderMessage("user", text);

    const loadingId = showLoading();

    try {
        await addMessage(currentConversationId, "user", text);
        await updateConversationTitleIfEmpty(currentConversationId, text);

        const payloadHistory = [
            { role: "user", parts: [{ text: SYSTEM_INSTRUCTION }] },
            ...history
        ];

        const data = await callApiWithRetry({ contents: payloadHistory });
        removeLoading(loadingId);

        const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "API returned no content.";
        const modelMsg = { role: "model", parts: [{ text: responseText }] };
        history.push(modelMsg);
        renderMessage("model", responseText);
        await addMessage(currentConversationId, "model", responseText);
        if (currentUser) {
            await loadConversations(currentUser.uid);
        }
    } catch (e) {
        removeLoading(loadingId);
        renderMessage("model", `Error: ${e.message}`, true);
        console.error(e);
    } finally {
        sendButtonEl.disabled = inputEl.value.trim() === '' || !currentUser;
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
    sendButtonEl.disabled = this.value.trim() === '' || !currentUser;
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
});
