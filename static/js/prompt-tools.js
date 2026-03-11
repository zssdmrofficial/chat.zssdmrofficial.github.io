const PROMPT_TOOLS = [];
(function initPromptTools() {
    const redContent = (typeof window !== 'undefined' && typeof window.RED_UNIVERSE_APPENDIX === 'string')
        ? window.RED_UNIVERSE_APPENDIX.trim()
        : '';
    if (redContent) {
        PROMPT_TOOLS.push({
            id: 'red-universe',
            label: '紅色宇宙論',
            description: '附加紅色宇宙論論文給模型參考',
            content: redContent,
            icon: RED_UNIVERSE_TOOL_ICON,
        });
    }
})();

const activeToolIds = new Set();

