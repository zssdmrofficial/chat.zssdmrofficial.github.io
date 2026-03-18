const DDG_SEARCH_TIMEOUT_MS = 30000;
const DDG_SEARCH_RESULTS_LIMIT = 6;
const DDG_SNIPPET_LIMIT = 180;

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = DDG_SEARCH_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new Error('請求超時')),
    timeoutMs,
  );
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`請求在 ${timeoutMs}ms 後超時`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runDDGSearch(query) {
  const WORKER_URL = 'https://ddg-proxy.zssdmrofficial.workers.dev/';
  const proxyUrl = WORKER_URL + '?q=' + encodeURIComponent(query);
  const options = {
    method: 'GET',
    headers: {
      Accept: 'text/html',
    },
  };

  const res = await fetchWithTimeout(proxyUrl, options);
  if (!res.ok) {
    throw new Error(`DuckDuckGo HTTP 錯誤: ${res.status}`);
  }

  const html = await res.text();
  const results = parseDDGHtml(html);
  return { results };
}
function parseDDGHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const resultElements = doc.querySelectorAll('.result');
  const results = [];

  for (let i = 0; i < resultElements.length; i++) {
    if (results.length >= DDG_SEARCH_RESULTS_LIMIT) break;

    const el = resultElements[i];
    const titleEl = el.querySelector('.result__title .result__a');
    const snippetEl = el.querySelector('.result__snippet');

    if (titleEl && snippetEl) {
      let title = titleEl.textContent.trim();
      let snippet = snippetEl.textContent.trim();
      let link = titleEl.getAttribute('href');

      if (link && link.startsWith('//duckduckgo.com/l/?uddg=')) {
        try {
          const urlStr = link.substring(link.indexOf('uddg=') + 5);
          const decoded = decodeURIComponent(urlStr);
          if (decoded) link = decoded;
        } catch (e) {}
      }

      if (snippet.length > DDG_SNIPPET_LIMIT) {
        snippet = snippet.substring(0, DDG_SNIPPET_LIMIT) + '...';
      }

      results.push({ title, content: snippet, url: link });
    }
  }
  return results;
}

function formatSearchContext(results) {
  if (!results || results.length === 0) return '';

  const lines = results.map((item, index) => {
    const parts = [];
    parts.push(`${index + 1}. ${item.title}`);
    if (item.content) {
      parts.push(`   摘要: ${item.content}`);
    }
    if (item.url) {
      parts.push(`   來源: ${item.url}`);
    }
    return parts.join('\n');
  });

  return `【即時搜尋結果】(來源：DuckDuckGo)\n請優先使用以下結果回答，若資訊不足請明確說明。\n${lines.join('\n')}`;
}

async function buildSearchContextPayload(query) {
  const { results } = await runDDGSearch(query);
  return formatSearchContext(results);
}
