# AGENTS.md

このファイルは、このリポジトリで作業するエージェント向けのコマンド・検証手順・制約を定める。システム構造と設計判断の正本は [DESIGN.md](DESIGN.md) を参照する。

## プロジェクト概要

Clean Reload — ワンクリックで Service Worker 登録と HTTP キャッシュをクリアして再読み込みし、Chrome では CacheStorage も削除するスーパーリロードと、右クリックメニューからの全タブ一括リロード・全バックグラウンドタブ強制スリープを提供する Chrome / Firefox 拡張機能（Manifest V3）。

リロード時の処理（Chrome は origin スコープ）:
1. Service Worker 登録を削除（`browsingData.remove({origins}, {serviceWorkers: true})`）
2. CacheStorage を削除（`browsingData.remove({origins}, {cacheStorage: true})`）
3. HTTP キャッシュを削除（`browsingData.removeCache({origins})`）
4. HTTP キャッシュをバイパスしてリロード（`tabs.reload({ bypassCache: true })`）

ランタイム API は `const api = (typeof browser !== 'undefined') ? browser : chrome;` で取得し、Chrome / Firefox 両対応。Firefox 固有の挙動差は §Firefox AMO 対応 を参照。

## ビルドコマンド

```bash
pnpm install                # 依存関係インストール（sharp + puppeteer/Chromium DL、初回は重い）
pnpm run generate-icons     # icons/icon.svg → icons/icon-{16,48,128}.png（sharp のみ使用）
pnpm run generate-screenshots # webstore/*.html → webstore/images/*.png（puppeteer 使用）
pnpm run build              # 上記2つを順次実行
```

- テスト・Lint・フォーマッタは**未定義**。`pnpm test` などは存在しない。
- 拡張機能本体の開発には `sharp` しか不要。`generate-screenshots` はストア画像用途で、普段のコード編集では実行しなくてよい。
- `generate-screenshots` は Chromium の応答待ちで数分かかることがある。CDP の protocol timeout は 300 秒なので、出力が止まって見えても重複起動せず完了を待つ。

### 依存の overrides / patch（[pnpm-workspace.yaml](pnpm-workspace.yaml)）

devDependency の `web-ext` 配下に出た脆弱性を、上流が未修正のため `overrides` で解消している（`adm-zip` / `shell-quote` / `fast-uri` / `brace-expansion` / `undici` / `js-yaml`）。拡張機能の配布物には含まれない開発時専用の依存。

`brace-expansion` は修正版が **5.0.9 以降**（1.x〜4.x に patch なし）で、唯一の利用者 `minimatch@3` が `require('brace-expansion')` を関数として呼ぶ一方、5.x は named export の `{ expand }` になった。そのため [patches/minimatch@3.1.5.patch](patches/minimatch@3.1.5.patch) で両形式を受け付ける 1 行の interop シムを当てている。

- pnpm 11 は `package.json` の `pnpm` フィールドを**読まない**。overrides / patchedDependencies は `pnpm-workspace.yaml` に書く。
- `patchedDependencies` のキーは `minimatch@3.1.5` と exact version 固定。**minimatch が 3.1.6 以降へ上がると `pnpm install` が patch 未適用で失敗する**。その場合は `pnpm patch minimatch@<新version>` で同じ 1 行シムを当て直し、キーを更新する。
- 上流（eslint / addons-linter）が minimatch 10 系へ移行したら、この override と patch は両方とも削除してよい。

## 開発時の読み込み

1. `pnpm install && pnpm run generate-icons` でアイコン PNG を生成（`icons/icon-*.png` は gitignore なので初回必須）
2. Chrome で `chrome://extensions/` → デベロッパーモードON → 「パッケージ化されていない拡張機能を読み込む」→ リポジトリルートを選択

## パッケージング

```powershell
pnpm install --frozen-lockfile
pnpm run generate-icons
Compress-Archive -Path manifest.json,icons,src -DestinationPath clean-reload.zip -Force
```
`clean-reload.zip` に `manifest.json` + `icons/` + `src/` のみ含める（`node_modules`, `webstore/`, `scripts/` は除外）。

`zip.ps1` / `zip.sh` は現在 `npm install` を呼ぶため、pnpm の overrides / patch を使う本リポジトリのリリース検証には使用しない。正式な公開パッケージは `.github/workflows/publish.yml` と同じく、pnpm で依存とアイコンを用意して上記3パスだけをZIP化する。

## リリース (Chrome Web Store + Firefox AMO 自動公開)

1. `manifest.json`、`manifest.firefox.json`、`package.json` の `version` を上げてコミット（3ファイルは一致必須。更新は `/vava` 経由）
2. `release/x.y.z`（`x.y.z` は manifest の version と一致必須）ブランチを push
3. [.github/workflows/publish.yml](.github/workflows/publish.yml) が 2 job を並列起動:
   - **publish**（Chrome）: `pnpm install --frozen-lockfile` → `generate-icons` → zip → `chrome-webstore-upload-cli --auto-publish`
   - **publish-firefox**（AMO）: firefox-build 構築 → `web-ext lint` → `web-ext sign --channel=listed`
4. ブランチ名と manifest バージョンの整合性チェックあり（不一致なら fail）。Firefox の初回登録のみローカル sign（§Firefox AMO 対応）。

## ディレクトリ構造（統一規約）

```
CleanReload/
├── DESIGN.md               # 現在実装の構造・責務・設計判断の正本
├── manifest.json            # Chrome 用 manifest（background.service_worker）
├── manifest.firefox.json    # Firefox 用 manifest（background.scripts + gecko 設定）
├── .amo-metadata.json       # AMO 提出メタ（categories + license: MIT）
├── icons/                   # アイコン（icon.svg + 生成PNG、PNGはgitignore）
├── src/
│   └── background/
│       └── background.js    # ランタイムコード（Chrome=SW / Firefox=event page 兼用）
├── scripts/
│   └── generate-icons.js    # PNGアイコン生成（sharp）
├── webstore/                # ストア申請アセット
│   ├── *.html               # 掲載画像テンプレート
│   ├── generate-screenshots.js  # HTML→PNG変換（puppeteer、scripts/ ではなくここ）
│   ├── store-listing.txt    # Chrome ストア説明文
│   ├── store-listing.firefox.ja.txt  # Firefox AMO 説明文（日本語）
│   └── store-listing.firefox.en.txt  # Firefox AMO 説明文（英語）
├── docs/
│   ├── privacy-policy.md    # プライバシーポリシー（日本語）
│   └── privacy-policy.en.md # プライバシーポリシー（英語、AMO listing 用）
├── vava.config.json         # /vava スキル用設定（amo.slug / listingFiles 等）
├── web/                     # cleanreload.kagayoi.com の独立した静的 LP Worker
└── .github/workflows/publish.yml  # Chrome + Firefox 自動公開ワークフロー
```

> `firefox-build/` と `web-ext-artifacts/` はビルド成果物で gitignore 済み（CI とローカル sign 時に生成）。

## アーキテクチャ

- **manifest.json / manifest.firefox.json** — 拡張機能の定義。権限は `activeTab` + `browsingData` + `contextMenus` + `tabs`。popupなし（アイコンクリックで即実行）。差分は **background のみ**（Chrome=`service_worker` / Firefox=`scripts` 配列）と Firefox 側の `browser_specific_settings.gecko`（gecko id + `strict_min_version: 142.0` + `data_collection_permissions`）。
- **src/background/background.js** — 唯一のランタイムコード。Chrome / Firefox 共通の単一ファイル。`api.action.onClicked` で、まず `clearCacheData()` を **await** して SW 登録の削除（Chrome では CacheStorage も削除）を確実に待機（SW が fetch を横取りする race を排除）、続けて `tabs.reload({bypassCache: true})` を発火。アイコン右クリックの「全タブをクリーンリロード」と、非アクティブかつ未破棄のタブへ `tabs.discard()` を実行する「全バックグラウンドタブを強制スリープ」は `contextMenus` で実装する。ページ注入は使わない。
  - **`clearCacheData(origins, hostnames)`** が Chrome / Firefox の browsingData 仕様差を吸収する唯一の分岐点。詳細は §Firefox AMO 対応。
- **icons/icon.svg** — マスターアイコン。ここを変更すれば `generate-icons.js` で全サイズ生成。
- **webstore/*.html** — ストア掲載画像のHTMLテンプレート。`generate-screenshots.js`（Puppeteer）でPNGに変換。

## Firefox AMO 対応

Firefox 版は **Chrome と同じ `src/` を共有**し、`manifest.firefox.json` と background.js のランタイム分岐だけで両対応する（別ソースツリーや strip マーカーは持たない）。

### browsingData の仕様差（Firefox の制約）
Firefox の browsingData は Chrome と挙動が異なるため、`clearCacheData()` で `isFirefox` 分岐する:
- **`RemovalOptions.origins` は Firefox 未対応**（MDN BCD: version_added=false）。Firefox では Service Worker 登録を `hostnames`（FF77+）で絞って削除し、ダメなら SW 全消しにフォールバック。
- **CacheStorage（DOM Cache API）は Firefox の browsingData で削除できない**（Mozilla Bug 1526246）。`serviceWorkers` は登録解除だけを行い、保存済みの CacheStorage は残る。ページ注入と広域ホスト権限を追加しない既存設計を維持し、README・AMO 掲載文・LPでこの制限を明示する。
- **`removeCache` は options を無視して常に全 HTTP キャッシュを消す**（Firefox 仕様）。よって Firefox では HTTP キャッシュは**ブラウザ全体**がクリアされる（Chrome は origin 単位）。ストア説明文（`store-listing.firefox.{ja,en}.txt`）と README にこの挙動差を明記済み。
- `tabs.reload({bypassCache})` / `action.*` バッジ / `contextMenus contexts:['action']` は Firefox でも動作（action API は FF109+）。

### manifest.firefox.json の不変条件
- `background` は `scripts` 配列のみ（Firefox MV3 は `service_worker` 非対応）。`service_worker` キーは書かない。
- `browser_specific_settings.gecko.strict_min_version` は **`142.0`**。`data_collection_permissions` が Firefox 142+ 導入のため、140 等にすると AMO の `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` 警告が出る。両者を 142 で揃える。
- gecko id は本拡張専用の UUID `{a4a7df25-9281-44f6-9d06-5959599c6473}`（他拡張と共有しない）。
- version は `manifest.json` と `package.json` に一致させる（CI がversionの相互整合とブランチ名を照合）。

### 初回 AMO 登録（CI からは新規 add-on 作成不可 → ローカルで実施）
1. ローカルで `pnpm install && node scripts/generate-icons.js`
2. firefox-build を構築: `mkdir firefox-build && cp manifest.firefox.json firefox-build/manifest.json && cp -r icons src firefox-build/`
3. `pnpm exec web-ext lint --source-dir=firefox-build`（errors 0 を確認）
4. AMO の JWT credentials は `dev/Secret/secrets.json` の `amo`（`jwt_issuer` / `jwt_secret`）から環境変数で渡す（値はログ/コミットに残さない）:
   ```bash
   WEB_EXT_API_KEY=<jwt_issuer> WEB_EXT_API_SECRET=<jwt_secret> \
     pnpm exec web-ext sign --source-dir=firefox-build --channel=listed --amo-metadata=.amo-metadata.json
   ```
5. gecko id をキーに AMO 上へ新規 add-on が自動作成される。2 回目以降は CI の `publish-firefox` job が担う。

> **timeout 挙動**: `web-ext sign --channel=listed` は AMO の auto-sign を待たず約 15 分で `Approval: timeout exceeded` を返して exit 1 になるが、submission は受理済み。CI の `publish-firefox` job は timeout / version conflict を warning 化して green を保つ。

### CI（publish.yml の `publish-firefox` job）
`release/x.y.z` push で Chrome `publish` job と**並列・独立**に実行（`if: success() || failure()` で Chrome 失敗時も submit）。GitHub Secrets `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` を使用。firefox-build 構築 → `web-ext lint` → `web-ext sign` の順。

### AMO listing（説明文）の更新は API 経由（スクショは手動）
listing の name / summary / description / homepage / support_url / categories / privacy_policy は **AMO API v5 で PATCH 可能**。`/vava` スキルの `~/.claude/skills/vava/scripts/update-amo-listing.mjs` が `vava.config.json` の `amo` ブロック + `store-listing.firefox.{ja,en}.txt` + `docs/privacy-policy{,.en}.md` を読んで JWT 認証で送る。手動実行:
```bash
# AMO 認証は secrets.json の amo ブロックから env で渡す（値はログ/コミットに残さない）
AMO_JWT_ISSUER=<jwt_issuer> AMO_JWT_SECRET=<jwt_secret> \
  node ~/.claude/skills/vava/scripts/update-amo-listing.mjs --dry-run   # 確認
AMO_JWT_ISSUER=<jwt_issuer> AMO_JWT_SECRET=<jwt_secret> \
  node ~/.claude/skills/vava/scripts/update-amo-listing.mjs             # 本番
```
**スクリーンショットだけは API 非対応** → AMO Developer Hub から手動アップロード（`webstore/images/*-1280x800.png`）。

## 制約事項

- 内部・危険プロトコルのページ（`chrome:`, `chrome-extension:`, `moz-extension:`, `edge:`, `about:`, `data:`, `javascript:`, `blob:`）は `BLOCKED_PROTOCOLS` で早期 return。`new URL()` の throw も try-catch で吸収
- **`file:`（ローカル HTML）は許可**する。ただし opaque origin（`origin === 'null'`）で SW / CacheStorage を持てず `browsingData` の origins/hostnames 絞り込みも効かないため、キャッシュ削除はスキップし `tabs.reload({bypassCache:true})` だけ実行する（HTTP キャッシュ層のみバイパス）。全タブ版も同様に file: タブを reloadTargets には含めつつ origins/hostnames Set からは外す
- SW 登録の削除（Chrome では CacheStorage も削除）は `await` で完了を待つ（`bypassCache` は HTTP キャッシュ層のみバイパスし SW の fetch 介入はバイパスできないため、古い SW の race を防ぐ必要がある）
- HTTP キャッシュ削除と `tabs.reload({bypassCache:true})` は `.catch()` でログするだけの fire-and-forget（初版から継続する設計判断）
- 強制スリープは `tabs.query({ active: false, discarded: false })` の結果だけを対象にする。各ウィンドウのアクティブタブはブラウザ仕様上破棄できないため対象外とし、個別失敗は残りのタブ処理を止めず警告へ記録する
- API は `api`（`browser ?? chrome`）経由で呼ぶ。Firefox の browsingData 仕様差は `clearCacheData()` の `isFirefox` 分岐に集約する（個別呼び出し箇所で分岐を散らさない）
