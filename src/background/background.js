// アイコンクリック時にキャッシュ完全クリア+リロードを実行
// Service Worker登録、CacheStorage、HTTPキャッシュをすべて消去してからリロード
const BLOCKED_PROTOCOLS = new Set([
  'chrome:',
  'chrome-extension:',
  'edge:',
  'about:',
  'data:',
  'javascript:',
  'blob:',
  'file:',
]);

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.url) return;

  // 不正 URL / 内部ページ / opaque origin は早期 return
  let origin;
  try {
    const parsed = new URL(tab.url);
    if (BLOCKED_PROTOCOLS.has(parsed.protocol)) return;
    origin = parsed.origin;
  } catch {
    return;
  }
  if (!origin || origin === 'null') return;

  // SW 登録と CacheStorage は await して完了させる
  // 理由: bypassCache は HTTP キャッシュのみバイパスし、SW の fetch 介入はバイパスできない。
  // 古い SW が生きたままリロードすると caches.match() 経由で古いレスポンスが返る競合を防ぐ。
  await chrome.browsingData.remove(
    { origins: [origin] },
    { cacheStorage: true, serviceWorkers: true }
  ).catch(error => {
    console.warn('Clean Reload: SW/CacheStorage 削除スキップ:', error.message);
  });

  // HTTP キャッシュは bypassCache: true で確実に無視されるため fire-and-forget で OK
  chrome.browsingData.removeCache({
    origins: [origin]
  }).catch(error => {
    console.warn('Clean Reload: HTTPキャッシュ削除スキップ:', error.message);
  });

  chrome.tabs.reload(tab.id, { bypassCache: true }).catch(error => {
    console.warn('Clean Reload: リロードスキップ:', error.message);
  });
});
