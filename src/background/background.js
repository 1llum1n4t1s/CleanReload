// Chrome は chrome.* / Firefox は browser.*（Promise を返す）を優先取得し、
// .catch() チェーンを両ブラウザで統一する
const api = (typeof browser !== 'undefined') ? browser : chrome;

// Firefox は browsingData.RemovalOptions.origins を非対応（MDN BCD: version_added=false）。
// さらに removeCache は options を無視して常に全 HTTP キャッシュを消す仕様。
// そのため Firefox では「serviceWorkers を hostnames で絞って削除（FF77+、Cache API も巻き取る）
// + 全 HTTP キャッシュ削除」へフォールバックする。Chrome は従来どおり origins で精密削除する。
const isFirefox = typeof browser !== 'undefined' && navigator.userAgent.includes('Firefox');

const BLOCKED_PROTOCOLS = new Set([
  'chrome:',
  'chrome-extension:',
  'moz-extension:',
  'edge:',
  'about:',
  'data:',
  'javascript:',
  'blob:',
  'file:',
]);

// 渡されたオリジン群（Chrome）/ ホスト名群（Firefox）の Service Worker 登録・CacheStorage・
// HTTP キャッシュを削除する。Chrome / Firefox の browsingData 仕様差をここ 1 箇所で吸収する。
async function clearCacheData(origins, hostnames) {
  if (isFirefox) {
    // Firefox: origins 非対応。Service Worker（と Cache API）は hostnames で絞って削除（FF77+）。
    // 万一 reject されたら SW 全消しへフォールバックする。
    await api.browsingData.remove(
      { hostnames },
      { serviceWorkers: true }
    ).catch(() =>
      api.browsingData.remove({}, { serviceWorkers: true })
    ).catch(error => {
      console.warn('Clean Reload: SW 削除スキップ:', error.message);
    });

    // removeCache は options が無視され常に全 HTTP キャッシュを消す（Firefox の仕様）
    api.browsingData.removeCache({}).catch(error => {
      console.warn('Clean Reload: HTTPキャッシュ削除スキップ:', error.message);
    });
  } else {
    // Chrome: origins で該当オリジンのみを精密削除
    await api.browsingData.remove(
      { origins },
      { cacheStorage: true, serviceWorkers: true }
    ).catch(error => {
      console.warn('Clean Reload: SW/CacheStorage 削除スキップ:', error.message);
    });

    api.browsingData.removeCache({ origins }).catch(error => {
      console.warn('Clean Reload: HTTPキャッシュ削除スキップ:', error.message);
    });
  }
}

async function cleanReloadTab(tab) {
  if (!tab?.url) return;

  let origin;
  let hostname;
  try {
    const parsed = new URL(tab.url);
    if (BLOCKED_PROTOCOLS.has(parsed.protocol)) return;
    origin = parsed.origin;
    hostname = parsed.hostname;
  } catch {
    return;
  }
  if (!origin || origin === 'null') return;

  await clearCacheData([origin], [hostname]);

  api.tabs.reload(tab.id, { bypassCache: true }).catch(error => {
    console.warn('Clean Reload: リロードスキップ:', error.message);
  });
}

async function showBadge(text) {
  await api.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  await api.action.setBadgeText({ text });
  setTimeout(() => api.action.setBadgeText({ text: '' }), 1500);
}

api.action.onClicked.addListener(async (tab) => {
  showBadge('✓');
  await cleanReloadTab(tab);
});

api.runtime.onInstalled.addListener(() => {
  api.contextMenus.create({
    id: 'clean-reload-all-tabs',
    title: '全タブをクリーンリロード',
    contexts: ['action'],
  });
});

api.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== 'clean-reload-all-tabs') return;
  const allTabs = await api.tabs.query({});
  showBadge('ALL');

  const reloadTargets = [];
  const origins = new Set();
  const hostnames = new Set();
  for (const tab of allTabs) {
    if (!tab?.url) continue;
    try {
      const parsed = new URL(tab.url);
      if (BLOCKED_PROTOCOLS.has(parsed.protocol)) continue;
      if (!parsed.origin || parsed.origin === 'null') continue;
      origins.add(parsed.origin);
      hostnames.add(parsed.hostname);
      reloadTargets.push(tab.id);
    } catch {
      continue;
    }
  }

  if (origins.size === 0) return;

  await clearCacheData([...origins], [...hostnames]);

  for (const tabId of reloadTargets) {
    api.tabs.reload(tabId, { bypassCache: true }).catch(error => {
      console.warn('Clean Reload: リロードスキップ:', error.message);
    });
  }
});
