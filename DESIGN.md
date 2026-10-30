# Clean Reload 設計

この文書は現在の実装から確認できるシステム構造と設計判断の正本です。作業コマンド、検証手順、リリース手順は [AGENTS.md](AGENTS.md)、利用者向けの機能と使い方は [README.md](README.md) を参照してください。

## 目的と範囲

Clean Reload は Chrome / Firefox 向け Manifest V3 拡張機能です。利用者の明示操作に応じて、単一タブまたは全タブのキャッシュを消去して再読み込みするほか、非アクティブなタブをメモリから破棄します。ページへのコード注入、利用者データの保存、外部サーバーへの送信は行いません。

`../vps-web/lp/cleanreload/` は `cleanreload.kagayoi.com` の案内・プライバシーページを Cloudflare Workers Static Assets へ配信する静的ソースです。拡張機能の実行やストア配布には関与しません。

## 主要コンポーネントと境界

| コンポーネント | 責務 | 境界 |
| --- | --- | --- |
| `manifest.json` | Chrome 用権限、Action、Service Worker の定義 | `src/background/background.js` を `service_worker` として起動する |
| `manifest.firefox.json` | Firefox 用権限、event page、Gecko 固有設定の定義 | 同じ background を `scripts` 配列で起動し、Firefox 142 以降を対象にする |
| `src/background/background.js` | Action、右クリックメニュー、キャッシュ削除、再読み込み、タブ破棄 | 唯一の拡張ランタイム。Content Script や popup は持たない |
| `icons/`、`scripts/` | SVG正本から配布用PNGを生成 | 生成PNGはGit管理せず、ローカルとCIで再生成する |
| `webstore/`、`docs/` | Chrome掲載文は `webstore/store-listing.txt`、Firefox掲載文は `webstore/store-listing.firefox.{ja,en}.txt`、プライバシーは `docs/privacy-policy{,.en}.md` | 掲載画像は `webstore/generate-screenshots.js` がHTMLから生成。いずれもランタイム配布物には含めない |
| `.amo-metadata.json`、`vava.config.json` | AMO提出時のカテゴリ・ライセンス、listing更新時の入力定義 | バイナリ提出と説明文更新は別経路。後者は掲載文・プライバシーファイルを参照する |
| `.github/workflows/publish.yml` | Chrome Web StoreとFirefox AMOへの公開 | `release/x.y.z` pushで2ジョブを独立実行する |
| `../vps-web/lp/cleanreload/` | LP、プライバシー、静的素材のHTTP配信 | 未知パスは404。既知パスはGET / HEADを許可し、その他のmethodは405にする |

## 拡張機能のデータフロー

### 単一タブのクリーンリロード

1. Actionクリックで対象タブを受け取り、操作開始を示すバッジを1.5秒表示する。削除成功の表示ではない。
2. URLを解析し、内部・危険プロトコルを除外する。
3. 通常のoriginでは `clearCacheData()` にoriginとhostnameを渡す。`file:`とopaque originではキャッシュ削除を省略する。`file:`はoriginの表現がブラウザで異なるため、protocolでも判定する。
4. Service Worker 登録の削除処理が成功または失敗で確定した後（Chrome では CacheStorage も同じAPI呼び出しで削除）、HTTPキャッシュ削除を開始し、完了を待たずにキャッシュバイパスで再読み込みする。削除失敗は警告へ記録して再読み込みを継続する。

### 全タブのクリーンリロード

1. 右クリックメニューから全タブを列挙する。
2. URLを解析できる許可プロトコルのタブを再読み込み対象にし、通常originとhostnameを重複排除する。
3. 重複排除した対象群を単一タブと同じ `clearCacheData()` に渡し、その処理が戻ったら各タブをHTTPキャッシュバイパスで再読み込みする。
4. `file:`タブはキャッシュ削除集合へ入れず、再読み込み対象には残す。

### DNSキャッシュ画面への移動

Chromium 系では Action の右クリックメニューから `chrome://net-internals/#dns` を新しいタブで開く。Brave / Edge でも各ブラウザの内部ページへ解決される。DNS キャッシュの削除は利用者が画面内の `Clear host cache` を押して行い、拡張機能から自動削除はしない。Firefox では内部ページを開く制限があるためメニューを表示しない。

### 全バックグラウンドタブの強制スリープ

1. 右クリックメニューから `active: false` かつ `discarded: false` のタブを列挙する。
2. IDを持つタブへ `tabs.discard()` を並行実行する。
3. タブはタブバーに残り、利用者が次に選択したとき再読み込みされる。個別失敗は警告へ記録し、他のタブを継続する。

各ウィンドウのアクティブタブはブラウザが破棄を許可しないため、この操作の対象外です。

## ブラウザ差の吸収

ランタイムAPIは `browser` があれば優先し、それ以外では `chrome` を使います。キャッシュ削除の差は `clearCacheData(origins, hostnames)` だけに集約します。

- Chromeは `origins` でService Worker、CacheStorage、HTTPキャッシュを対象originへ限定する。
- Firefoxは `origins` を使わず、Service Worker 登録を`hostnames`で限定する。失敗時はService Worker全体削除へフォールバックする。DOM Cache API は browsingData で削除できないため残る。
- Firefoxの `removeCache` は対象を限定できないため、HTTPキャッシュ全体を削除する。

## 重要な不変条件

- Chrome / Firefox / `package.json` のversionは一致させる。
- Firefox manifestは `background.scripts` のみを使い、`service_worker` を持たない。
- FirefoxのGecko IDは `{a4a7df25-9281-44f6-9d06-5959599c6473}`、最小バージョンは142.0を維持する。
- `BLOCKED_PROTOCOLS`（`chrome:`、`chrome-extension:`、`moz-extension:`、`edge:`、`about:`、`data:`、`javascript:`、`blob:`）と、URLが無い・解析できないページはクリーンリロード対象から除外する。
- Service Worker 登録の削除処理（Chrome では CacheStorage も削除）は再読み込みより先にawaitする。成功時には古いService Workerがfetchを横取りする競合を避けられるが、失敗時も再読み込みは継続する。
- 配布ZIPは `manifest.json`、`icons/`、`src/` だけを含む。
- `release/x.y.z` のversionとmanifestのversionを一致させる。

## 採用済みの設計判断

- **単一ソースの両ブラウザ対応:** Chrome / Firefoxでbackgroundを共有し、仕様差を一つの関数へ閉じ込める。重複実装を避ける一方、FirefoxではHTTPキャッシュをorigin単位に限定できない。
- **popupを持たない即時操作:** Actionクリックをクリーンリロードへ直接割り当て、追加操作はActionの右クリックへ置く。操作は短いが、実行前の確認画面はない。
- **削除失敗時も再読み込みを継続:** 上記の待機後、HTTPキャッシュ削除とreloadはfire-and-forgetで開始し、失敗は個別に警告する。`bypassCache`がHTTPキャッシュ層を回避するため削除完了は待たないが、Service Worker削除が失敗した場合の古い応答は防げない。
- **メモリセーバー設定ではなくタブ破棄:** ブラウザ設定を変更せず、公開された `tabs.discard()` で現在のタブ内容だけをメモリから解放する。アクティブタブは残る。
- **ストア公開の独立ジョブ:** ChromeとFirefoxを並列・独立に提出し、一方のストア障害が他方のsubmissionを妨げない。同一versionの審査中・登録済み応答は安全な重複として扱う。
- **LPと拡張ランタイムの分離:** `../vps-web/lp/cleanreload/` は静的レスポンスだけを返し、ストアが配布する拡張パッケージやブラウザAPIへ依存しない。

## 製品ページの配信先

製品ページの配信HTMLは `../vps-web/lp/cleanreload/`（編集元は `../vps-web/tools/lp/templates/`）。`../vps-web/deploy/deploy-lp.ps1` が `deploy-site.ps1` を呼び出し、Cloudflare Workers Static Assets へ配信する。
公開パス・ヘッダーは `../vps-web/deploy/lp-sites.json`、Worker設定は `../vps-web/deploy/cloudflare/sites.json` に定義する。
`../vps-web/deploy/caddy-sites/lp-cleanreload.caddy` と旧VPSの `/srv/www/lp/cleanreload/` は互換経路であり、通常のコンテンツ更新先ではない。
