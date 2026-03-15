let history = [];
let currentConversationId = null;
let currentUser = null;
let isCreatingConversation = false;
let isAwaitingResponse = false;
let isEditingMessage = false;
let pythonExecutorInstance = null;
let isPythonEnabled = true;
let animatingConversationId = null;
let abortController = null;
let isThinkingEnabled = false;
let currentThinkingLevel = null;

