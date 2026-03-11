// アイコンクリック時にキャッシュ完全クリア+リロードを実行
// Service Workerキャッシュ、CacheStorage、HTTPキャッシュをすべて消去してからリロード
chrome.action.onClicked.addListener(async (tab) => {
  // chrome:// や edge:// などの内部ページは操作不可
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('chrome-extension://')) {
    return;
  }

  try {
    // 1. Service Worker登録解除 + CacheStorage全消去をページコンテキストで実行
    await chrome.scripting.executeScript({
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
    });

    // 2. HTTPキャッシュを該当オリジンから実削除
    const origin = new URL(tab.url).origin;
    await chrome.browsingData.removeCache({ origins: [origin] });

    // 3. キャッシュをバイパスしてリロード
    await chrome.tabs.reload(tab.id, { bypassCache: true });
  } catch (error) {
    // スクリプト実行が許可されないページ（例: Chrome Web Store）では無視
    console.error('Clean Reload 実行エラー:', error.message);
  }
});
