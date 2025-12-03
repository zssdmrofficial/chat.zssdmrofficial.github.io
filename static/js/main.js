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

const MESSAGE_COPY_FEEDBACK_DURATION = 2000;
const MESSAGE_COPY_ICON = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon"><path d="M12.668 10.667C12.668 9.95614 12.668 9.46258 12.6367 9.0791C12.6137 8.79732 12.5758 8.60761 12.5244 8.46387L12.4688 8.33399C12.3148 8.03193 12.0803 7.77885 11.793 7.60254L11.666 7.53125C11.508 7.45087 11.2963 7.39395 10.9209 7.36328C10.5374 7.33197 10.0439 7.33203 9.33301 7.33203H6.5C5.78896 7.33203 5.29563 7.33195 4.91211 7.36328C4.63016 7.38632 4.44065 7.42413 4.29688 7.47559L4.16699 7.53125C3.86488 7.68518 3.61186 7.9196 3.43555 8.20703L3.36524 8.33399C3.28478 8.49198 3.22795 8.70352 3.19727 9.0791C3.16595 9.46259 3.16504 9.95611 3.16504 10.667V13.5C3.16504 14.211 3.16593 14.7044 3.19727 15.0879C3.22797 15.4636 3.28473 15.675 3.36524 15.833L3.43555 15.959C3.61186 16.2466 3.86474 16.4807 4.16699 16.6348L4.29688 16.6914C4.44063 16.7428 4.63025 16.7797 4.91211 16.8027C5.29563 16.8341 5.78896 16.835 6.5 16.835H9.33301C10.0439 16.835 10.5374 16.8341 10.9209 16.8027C11.2965 16.772 11.508 16.7152 11.666 16.6348L11.793 16.5645C12.0804 16.3881 12.3148 16.1351 12.4688 15.833L12.5244 15.7031C12.5759 15.5594 12.6137 15.3698 12.6367 15.0879C12.6681 14.7044 12.668 14.211 12.668 13.5V10.667ZM13.998 12.665C14.4528 12.6634 14.8011 12.6602 15.0879 12.6367C15.4635 12.606 15.675 12.5492 15.833 12.4688L15.959 12.3975C16.2466 12.2211 16.4808 11.9682 16.6348 11.666L16.6914 11.5361C16.7428 11.3924 16.7797 11.2026 16.8027 10.9209C16.8341 10.5374 16.835 10.0439 16.835 9.33301V6.5C16.835 5.78896 16.8341 5.29563 16.8027 4.91211C16.7797 4.63025 16.7428 4.44063 16.6914 4.29688L16.6348 4.16699C16.4807 3.86474 16.2466 3.61186 15.959 3.43555L15.833 3.36524C15.675 3.28473 15.4636 3.22797 15.0879 3.19727C14.7044 3.16593 14.211 3.16504 13.5 3.16504H10.667C9.9561 3.16504 9.46259 3.16595 9.0791 3.19727C8.79739 3.22028 8.6076 3.2572 8.46387 3.30859L8.33399 3.36524C8.03176 3.51923 7.77886 3.75343 7.60254 4.04102L7.53125 4.16699C7.4508 4.32498 7.39397 4.53655 7.36328 4.91211C7.33985 5.19893 7.33562 5.54719 7.33399 6.00195H9.33301C10.022 6.00195 10.5791 6.00131 11.0293 6.03809C11.4873 6.07551 11.8937 6.15471 12.2705 6.34668L12.4883 6.46875C12.984 6.7728 13.3878 7.20854 13.6533 7.72949L13.7197 7.87207C13.8642 8.20859 13.9292 8.56974 13.9619 8.9707C13.9987 9.42092 13.998 9.97799 13.998 10.667V12.665ZM18.165 9.33301C18.165 10.022 18.1657 10.5791 18.1289 11.0293C18.0961 11.4302 18.0311 11.7914 17.8867 12.1279L17.8203 12.2705C17.5549 12.7914 17.1509 13.2272 16.6553 13.5313L16.4365 13.6533C16.0599 13.8452 15.6541 13.9245 15.1963 13.9619C14.8593 13.9895 14.4624 13.9935 13.9951 13.9951C13.9935 14.4624 13.9895 14.8593 13.9619 15.1963C13.9292 15.597 13.864 15.9576 13.7197 16.2939L13.6533 16.4365C13.3878 16.9576 12.9841 17.3941 12.4883 17.6982L12.2705 17.8203C11.8937 18.0123 11.4873 18.0915 11.0293 18.1289C10.5791 18.1657 10.022 18.165 9.33301 18.165H6.5C5.81091 18.165 5.25395 18.1657 4.80371 18.1289C4.40306 18.0962 4.04235 18.031 3.70606 17.8867L3.56348 17.8203C3.04244 17.5548 2.60585 17.151 2.30176 16.6553L2.17969 16.4365C1.98788 16.0599 1.90851 15.6541 1.87109 15.1963C1.83431 14.746 1.83496 14.1891 1.83496 13.5V10.667C1.83496 9.978 1.83432 9.42091 1.87109 8.9707C1.90851 8.5127 1.98772 8.10625 2.17969 7.72949L2.30176 7.51172C2.60586 7.0159 3.04236 6.6122 3.56348 6.34668L3.70606 6.28027C4.04237 6.136 4.40303 6.07083 4.80371 6.03809C5.14051 6.01057 5.53708 6.00551 6.00391 6.00391C6.00551 5.53708 6.01057 5.14051 6.03809 4.80371C6.0755 4.34588 6.15483 3.94012 6.34668 3.56348L6.46875 3.34473C6.77282 2.84912 7.20856 2.44514 7.72949 2.17969L7.87207 2.11328C8.20855 1.96886 8.56979 1.90385 8.9707 1.87109C9.42091 1.83432 9.978 1.83496 10.667 1.83496H13.5C14.1891 1.83496 14.746 1.83431 15.1963 1.87109C15.6541 1.90851 16.0599 1.98788 16.4365 2.17969L16.6553 2.30176C17.151 2.60585 17.5548 3.04244 17.8203 3.56348L17.8867 3.70606C18.031 4.04235 18.0962 4.40306 18.1289 4.80371C18.1657 5.25395 18.165 5.81091 18.165 6.5V9.33301Z"></path></svg>
`;
const MESSAGE_COPY_SUCCESS_ICON = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon"><path d="M15.4835 4.14551C15.6794 3.85999 16.069 3.78747 16.3545 3.9834C16.6401 4.17933 16.7126 4.56897 16.5167 4.85449L8.9688 15.8545C8.86289 16.0088 8.69334 16.1085 8.50689 16.125C8.32053 16.1415 8.13628 16.0737 8.00494 15.9404L3.55377 11.4219L4.00005 10.9824L4.44634 10.542L8.36431 14.5176L15.4835 4.14551ZM3.55962 10.5352C3.80622 10.2922 4.20328 10.2955 4.44634 10.542L3.55377 11.4219C3.31073 11.1752 3.31297 10.7782 3.55962 10.5352Z"></path></svg>
`;

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

function setMessageCopyButtonState(button, state = 'default') {
    if (!button) return;
    const originalLabel = button.dataset.originalLabel || button.getAttribute('aria-label') || '複製';
    if (!button.dataset.originalLabel) {
        button.dataset.originalLabel = originalLabel;
    }

    if (state === 'copied') {
        button.classList.remove('copy-error');
        button.classList.add('copy-success');
        button.setAttribute('aria-label', '已複製');
        button.setAttribute('aria-pressed', 'true');
        button.dataset.state = 'open';
        return;
    }

    if (state === 'error') {
        button.classList.remove('copy-success');
        button.classList.add('copy-error');
        button.setAttribute('aria-label', '複製失敗');
        button.setAttribute('aria-pressed', 'false');
        button.dataset.state = 'error';
        return;
    }

    button.classList.remove('copy-error', 'copy-success');
    button.setAttribute('aria-label', originalLabel);
    button.setAttribute('aria-pressed', 'false');
    button.dataset.state = 'closed';
}

function flashMessageCopyState(button, state) {
    if (!button) return;
    setMessageCopyButtonState(button, state);
    if (state === 'default') return;
    if (button._copyTimer) {
        clearTimeout(button._copyTimer);
    }
    button._copyTimer = setTimeout(() => {
        setMessageCopyButtonState(button, 'default');
        button._copyTimer = null;
    }, MESSAGE_COPY_FEEDBACK_DURATION);
}

function initCopyHandler(element) {
    if (!element) return;
    element.addEventListener('click', async (ev) => {
        const codeBtn = ev.target.closest('.copy-button');
        if (codeBtn) {
            const container = codeBtn.closest('.code-container');
            const codeEl = container?.querySelector('code');
            const textToCopy = codeEl ? codeEl.innerText : '';

            try {
                await navigator.clipboard.writeText(textToCopy);
                const originalHtml = codeBtn.innerHTML;
                codeBtn.innerHTML = `
                <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Copied!
            `;
                setTimeout(() => codeBtn.innerHTML = originalHtml, 2000);
            } catch (err) {
                console.error('Copy failed', err);
                codeBtn.textContent = 'Failed';
            }
            return;
        }

        const messageBtn = ev.target.closest('.copy-message-btn');
        if (!messageBtn) return;

        const wrapper = messageBtn.closest('.message-wrapper');
        const datasetValue = wrapper?.dataset.raw || '';
        const fallbackValue = wrapper?.querySelector('.text-content')?.innerText || '';
        const textToCopy = datasetValue || fallbackValue;

        if (!textToCopy) {
            flashMessageCopyState(messageBtn, 'error');
            return;
        }

        try {
            await navigator.clipboard.writeText(textToCopy);
            flashMessageCopyState(messageBtn, 'copied');
        } catch (err) {
            console.error('複製訊息失敗', err);
            flashMessageCopyState(messageBtn, 'error');
        }
    });
}

function renderMessage(role, content, isError = false) {
    const isUser = role === "user";
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message-wrapper';
    msgDiv.dataset.role = role;
    msgDiv.dataset.raw = typeof content === 'string' ? content : '';

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
        <div class="message-footer">
            <button type="button" class="copy-message-btn text-token-text-secondary hover:bg-token-bg-secondary rounded-lg" aria-label="複製" aria-pressed="false" data-testid="copy-turn-action-button" data-state="closed">
                <span class="copy-button-inner flex items-center justify-center touch:w-10 h-8 w-8">
                    <span class="copy-icon copy-icon-default" aria-hidden="true">${MESSAGE_COPY_ICON}</span>
                    <span class="copy-icon copy-icon-success" aria-hidden="true">${MESSAGE_COPY_SUCCESS_ICON}</span>
                </span>
            </button>
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
