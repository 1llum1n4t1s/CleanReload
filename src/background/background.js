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

async function cleanReloadTab(tab) {
  if (!tab?.url) return;

  let origin;
  try {
    const parsed = new URL(tab.url);
    if (BLOCKED_PROTOCOLS.has(parsed.protocol)) return;
    origin = parsed.origin;
  } catch {
    return;
  }
  if (!origin || origin === 'null') return;

  await chrome.browsingData.remove(
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

  chrome.tabs.reload(tab.id, { bypassCache: true }).catch(error => {
    console.warn('Clean Reload: リロードスキップ:', error.message);
  });
}

function notify(message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon-128.png', title: 'Clean Reload', message });
}

chrome.action.onClicked.addListener(async (tab) => {
  notify('リロード中…');
  await cleanReloadTab(tab);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'clean-reload-all-tabs',
    title: '全タブをクリーンリロード',
    contexts: ['action'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== 'clean-reload-all-tabs') return;
  const tabs = await chrome.tabs.query({});
  notify(`全 ${tabs.length} タブをリロード中…`);
  await Promise.all(tabs.map(cleanReloadTab));
});
