const SEARXNG_PROXY_URL = 'https://searxng-proxy.zssdmr.dpdns.org/';
const SEARCH_TIMEOUT_MS = 30000;
const SEARCH_RESULTS_LIMIT = 6;
const SNIPPET_LIMIT = 180;

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = SEARCH_TIMEOUT_MS,
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

async function runSearch(query) {
  const proxyUrl = SEARXNG_PROXY_URL + '?q=' + encodeURIComponent(query);
  const options = {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  };

  const res = await fetchWithTimeout(proxyUrl, options);
  if (!res.ok) {
    throw new Error(`SearXNG HTTP 錯誤: ${res.status}`);
  }

  const data = await res.json();
  const rawResults = data.results || [];
  const results = [];

  for (let i = 0; i < rawResults.length; i++) {
    if (results.length >= SEARCH_RESULTS_LIMIT) break;

    const item = rawResults[i];
    const title = (item.title || '').trim();
    const url = (item.url || '').trim();
    let snippet = (item.content || '').trim();

    if (!title || !url) continue;

    if (snippet.length > SNIPPET_LIMIT) {
      snippet = snippet.substring(0, SNIPPET_LIMIT) + '...';
    }

    results.push({ title, content: snippet, url });
  }

  return { results };
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

  return `【即時搜尋結果】(來源：SearXNG)\n請優先使用以下結果回答，若資訊不足請明確說明。\n${lines.join('\n')}`;
}

async function buildSearchContextPayload(query) {
  const { results } = await runSearch(query);
  return formatSearchContext(results);
}
