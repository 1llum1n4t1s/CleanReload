// アイコンクリック時にキャッシュ完全クリア+リロードを実行
// Service Workerキャッシュ、CacheStorage、HTTPキャッシュをすべて消去してからリロード
chrome.action.onClicked.addListener(async (tab) => {
  // chrome:// や edge:// などの内部ページは操作不可
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('chrome-extension://')) {
    return;
  }

  // 1. SW/CacheStorage消去とHTTPキャッシュ削除をfire-and-forget（完了を待たない）
  // bypassCache: true でHTTPキャッシュは無視されるため、削除完了前にリロードしても安全
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async () => {
      // Service Workerの登録をすべて解除
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(r => r.unregister()));
      }

      // CacheStorage内のキャッシュをすべて削除
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
    }
  }).catch(error => {
    // スクリプト実行が許可されないページ（例: Chrome Web Store）では無視
    console.warn('Clean Reload: スクリプト実行スキップ:', error.message);
  });

  chrome.browsingData.removeCache({
    origins: [new URL(tab.url).origin]
  }).catch(error => {
    console.warn('Clean Reload: キャッシュ削除スキップ:', error.message);
  });

  // 2. キャッシュをバイパスして即リロード（クリア完了を待たない）
  chrome.tabs.reload(tab.id, { bypassCache: true });
});
