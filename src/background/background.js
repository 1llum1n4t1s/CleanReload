// Chrome は chrome.* / Firefox は browser.*（Promise を返す）を優先取得し、
// .catch() チェーンを両ブラウザで統一する
const api = (typeof browser !== 'undefined') ? browser : chrome;

// Firefox は browsingData.RemovalOptions.origins を非対応（MDN BCD: version_added=false）。
// さらに removeCache は options を無視して常に全 HTTP キャッシュを消す仕様。
// そのため Firefox では「Service Worker 登録を hostnames で絞って削除（FF77+）
// + 全 HTTP キャッシュ削除」へフォールバックする。DOM Cache API は browsingData で削除できない。
// Chrome は従来どおり origins で Service Worker / CacheStorage / HTTP キャッシュを精密削除する。
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
]);

// 渡されたオリジン群（Chrome）/ ホスト名群（Firefox）の Service Worker 登録と HTTP キャッシュを削除する。
// Chrome では CacheStorage も削除する。Chrome / Firefox の browsingData 仕様差をここ 1 箇所で吸収する。
async function clearCacheData(origins, hostnames) {
  if (isFirefox) {
    // Firefox: origins 非対応。Service Worker 登録は hostnames で絞って削除（FF77+）。
    // DOM Cache API は serviceWorkers / cache のどちらでも削除されない（Mozilla Bug 1526246）。
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

  // file: など opaque origin（origin === 'null'）は SW / CacheStorage を持てず、
  // browsingData の origin/hostname 絞り込みも効かない。キャッシュ削除はスキップし、
  // HTTP キャッシュ層をバイパスするリロードだけを行う。
  if (origin && origin !== 'null') {
    await clearCacheData([origin], [hostname]);
  }

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
  api.contextMenus.create({
    id: 'discard-all-background-tabs',
    title: '全バックグラウンドタブを強制スリープ',
    contexts: ['action'],
  });
});

api.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'discard-all-background-tabs') {
    const tabs = await api.tabs.query({ active: false, discarded: false });
    const discardTargets = tabs.filter(tab => Number.isInteger(tab.id));
    if (discardTargets.length === 0) return;

    showBadge('ZZZ');

    await Promise.all(discardTargets.map(tab =>
      api.tabs.discard(tab.id).catch(error => {
        console.warn('Clean Reload: スリープスキップ:', error.message);
      })
    ));
    return;
  }

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
      // file: など opaque origin はキャッシュ削除対象から外すが、bypassCache リロードはする
      if (parsed.origin && parsed.origin !== 'null') {
        origins.add(parsed.origin);
        hostnames.add(parsed.hostname);
      }
      reloadTargets.push(tab.id);
    } catch {
      continue;
    }
  }

  if (reloadTargets.length === 0) return;

  if (origins.size > 0) {
    await clearCacheData([...origins], [...hostnames]);
  }

  for (const tabId of reloadTargets) {
    api.tabs.reload(tabId, { bypassCache: true }).catch(error => {
      console.warn('Clean Reload: リロードスキップ:', error.message);
    });
  }
});
