const zhangQuotesAppendix = readStaticTextSync('/static/md/張國語錄文字版.md');

if (typeof window !== 'undefined') {
  window.ZHANG_QUOTES_APPENDIX = zhangQuotesAppendix;
}
