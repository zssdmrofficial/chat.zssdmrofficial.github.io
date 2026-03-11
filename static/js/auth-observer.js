auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    updateUserProfile(user);
    updateAuthUI(user);
    if (user) {
        setAuthHint(`已登入：${user.email}`);
        
        try {
            const userDoc = await db.collection('userSettings').doc(user.uid).get();
            if (userDoc.exists) {
                const data = userDoc.data();
                if (typeof data.isPythonEnabled !== 'undefined') {
                    isPythonEnabled = data.isPythonEnabled;
                }
            } else {
                isPythonEnabled = true;
            }
        } catch (e) {
            console.warn('讀取使用者設定失敗', e);
        }

        await loadConversations(user.uid);
        updateSendButtonState();
    } else {
        setAuthHint('未登入：對話不會被儲存');
        isPythonEnabled = true;
        clearHistoryList();
        currentConversationId = null;
        closeMobileSidebar();
        updateSendButtonState();
    }
});

