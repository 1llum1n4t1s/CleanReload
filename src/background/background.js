// アイコンクリック時にキャッシュ完全クリア+リロードを実行
// Service Worker登録、CacheStorage、HTTPキャッシュをすべて消去してからリロード
chrome.action.onClicked.addListener(async (tab) => {
  // chrome:// や edge:// などの内部ページは操作不可
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('chrome-extension://')) {
    return;
  }

  const origin = new URL(tab.url).origin;

  // SW/CacheStorage/HTTPキャッシュ削除を fire-and-forget（完了を待たない）
  // bypassCache: true でHTTPキャッシュは無視されるため、削除完了前にリロードしても安全
  // browsingData.remove は origins 指定で対象オリジンのみをクリアでき、
  // chrome.scripting.executeScript が拒否されるページ（Chrome Web Store 等）でも動作する
  chrome.browsingData.remove(
    { origins: [origin] },
    { cacheStorage: true, serviceWorkers: true }
  ).catch(error => {
    console.warn('Clean Reload: SW/CacheStorage 削除スキップ:', error.message);
  });

  chrome.browsingData.removeCache({
    origins: [origin]
  }).catch(error => {
    console.warn('Clean Reload: HTTPキャッシュ削除スキップ:', error.message);
  });

  // キャッシュをバイパスして即リロード（クリア完了を待たない）
  chrome.tabs.reload(tab.id, { bypassCache: true });
});
