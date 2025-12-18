const crimsonCosmosAppendix = readStaticTextSync("/static/md/紅色宇宙論.md");

if (typeof window !== 'undefined') {
    window.RED_UNIVERSE_APPENDIX = crimsonCosmosAppendix;
}
