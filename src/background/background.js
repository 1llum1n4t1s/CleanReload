// Chrome は chrome.* / Firefox は browser.*（Promise を返す）を優先取得し、
// .catch() チェーンを両ブラウザで統一する
const api = (typeof browser !== 'undefined') ? browser : chrome;

// 共通の多言語モジュール。Chrome の Service Worker はここで読み込み、
// Firefox は manifest.firefox.json の background.scripts 先頭で読み込む（importScripts が無いため）。
if (typeof importScripts === 'function') importScripts('../shared/ui-localizer.js');

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

function getReloadUrl(tab) {
  if (!tab?.url) return null;

  try {
    const parsed = new URL(tab.url);
    return BLOCKED_PROTOCOLS.has(parsed.protocol) ? null : parsed;
  } catch {
    return null;
  }
}

async function cleanReloadTab(tab) {
  const parsed = getReloadUrl(tab);
  if (!parsed) return;

  // file: はブラウザによって origin が 'file://' になるため protocol でも除外する。
  // opaque origin と同様にキャッシュ削除はスキップし、バイパスリロードだけを行う。
  if (parsed.protocol !== 'file:' && parsed.origin && parsed.origin !== 'null') {
    await clearCacheData([parsed.origin], [parsed.hostname]);
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

// コンテキストメニューのタイトルは作成時に固定されるため、言語が変わったら作り直す。
// removeAll → create を直列に行い、連続呼び出しでも重複 ID を作らないよう直前の処理を待つ。
let menuBuild = Promise.resolve();
function rebuildMenus() {
  menuBuild = menuBuild.then(async () => {
    await Localizer.ready;
    await api.contextMenus.removeAll();
    api.contextMenus.create({
      id: 'clean-reload-all-tabs',
      title: Localizer.t('menuCleanReloadAllTabs', undefined, 'Clean reload all tabs'),
      contexts: ['action'],
    });
    api.contextMenus.create({
      id: 'discard-all-background-tabs',
      title: Localizer.t('menuDiscardBackgroundTabs', undefined, 'Force all background tabs to sleep'),
      contexts: ['action'],
    });
    if (!isFirefox) {
      api.contextMenus.create({
        id: 'open-dns-cache',
        title: Localizer.t('menuOpenDnsCache', undefined, 'Open the DNS cache clearing page'),
        contexts: ['action'],
      });
    }
  }).catch(error => {
    console.warn('Clean Reload: menu rebuild failed:', error.message);
  });
  return menuBuild;
}

api.runtime.onInstalled.addListener(async () => {
  await Localizer.ready;
  // 拡張の更新後に辞書が古ければ作り直してからメニューを作る。
  await Localizer.ensureFresh();
  await rebuildMenus();
});
// ブラウザの言語が変わった後の起動でもタイトルを追従させる。
api.runtime.onStartup.addListener(() => { rebuildMenus(); });
Localizer.onChange(() => { rebuildMenus(); });

api.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'open-dns-cache') {
    if (isFirefox) return;
    // Brave / Edge でも chrome: の内部URLは各ブラウザのページへ解決される。
    await api.tabs.create({ url: 'chrome://net-internals/#dns' }).catch(error => {
      console.warn('Clean Reload: DNSキャッシュ画面を開けませんでした:', error.message);
    });
    return;
  }

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
    const parsed = getReloadUrl(tab);
    if (!parsed) continue;
    // file: と opaque origin はキャッシュ削除対象から外すが、bypassCache リロードはする
    if (parsed.protocol !== 'file:' && parsed.origin && parsed.origin !== 'null') {
      origins.add(parsed.origin);
      hostnames.add(parsed.hostname);
    }
    reloadTargets.push(tab.id);
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
