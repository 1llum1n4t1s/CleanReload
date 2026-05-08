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

async function showBadge(text) {
  await chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  await chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 1500);
}

chrome.action.onClicked.addListener(async (tab) => {
  showBadge('✓');
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
  const allTabs = await chrome.tabs.query({});
  showBadge('ALL');

  const reloadTargets = [];
  const origins = new Set();
  for (const tab of allTabs) {
    if (!tab?.url) continue;
    try {
      const parsed = new URL(tab.url);
      if (BLOCKED_PROTOCOLS.has(parsed.protocol)) continue;
      if (!parsed.origin || parsed.origin === 'null') continue;
      origins.add(parsed.origin);
      reloadTargets.push(tab.id);
    } catch {
      continue;
    }
  }

  if (origins.size === 0) return;

  await chrome.browsingData.remove(
    { origins: [...origins] },
    { cacheStorage: true, serviceWorkers: true }
  ).catch(error => {
    console.warn('Clean Reload: SW/CacheStorage 削除スキップ:', error.message);
  });

  chrome.browsingData.removeCache({
    origins: [...origins]
  }).catch(error => {
    console.warn('Clean Reload: HTTPキャッシュ削除スキップ:', error.message);
  });

  for (const tabId of reloadTargets) {
    chrome.tabs.reload(tabId, { bypassCache: true }).catch(error => {
      console.warn('Clean Reload: リロードスキップ:', error.message);
    });
  }
});
