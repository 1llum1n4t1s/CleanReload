# AGENTS.md

このファイルは、このリポジトリで作業するエージェント向けのコマンド・検証手順・制約を定める。システム構造と設計判断の正本は [DESIGN.md](DESIGN.md) を参照する。

## プロジェクト概要

Clean Reload — ワンクリックで Service Worker 登録と HTTP キャッシュをクリアして再読み込みし、Chrome では CacheStorage も削除するスーパーリロードと、右クリックメニューからの全タブ一括リロード・全バックグラウンドタブ強制スリープを提供する Chrome / Firefox 拡張機能（Manifest V3）。

コンポーネントの配置、処理順序、ブラウザ差と設計理由は [DESIGN.md](DESIGN.md) を参照する。

## ビルドコマンド

```bash
pnpm install                # 依存関係インストール（sharp + puppeteer/Chromium DL、初回は重い）
pnpm run generate-icons     # icons/icon.svg → icons/icon-{16,48,128}.png（sharp のみ使用）
pnpm run generate-screenshots # webstore/*.html → webstore/images/*.png（puppeteer 使用）
pnpm run build              # 上記2つを順次実行
```

- テスト・Lint・フォーマッタの package scripts は**未定義**。`pnpm test` などは存在しない。Firefox 配布前には下記の `pnpm exec web-ext lint` を実行する。
- CI と同じ依存解決には Node.js 26.13.0 / pnpm 12.16.1 と `pnpm install --frozen-lockfile` を使う。アイコン生成だけなら `PUPPETEER_SKIP_DOWNLOAD=1` で Chromium のダウンロードを省略できる。
- 拡張機能本体の開発には `sharp` しか不要。`generate-screenshots` はストア画像用途で、普段のコード編集では実行しなくてよい。
- `generate-screenshots` は Chromium の応答待ちで数分かかることがある。CDP の protocol timeout は 300 秒なので、出力が止まって見えても重複起動せず完了を待つ。

### 依存の overrides / patch（[pnpm-workspace.yaml](pnpm-workspace.yaml)）

devDependency の `web-ext` 配下に出た脆弱性を、上流が未修正のため `overrides` で解消している（`adm-zip` / `shell-quote` / `fast-uri` / `brace-expansion` / `undici` / `js-yaml`）。拡張機能の配布物には含まれない開発時専用の依存。

`brace-expansion` は修正版が **5.0.9 以降**（1.x〜4.x に patch なし）で、唯一の利用者 `minimatch@3` が `require('brace-expansion')` を関数として呼ぶ一方、5.x は named export の `{ expand }` になった。そのため [patches/minimatch@3.1.5.patch](patches/minimatch@3.1.5.patch) で両形式を受け付ける 1 行の interop シムを当てている。

- overrides / patchedDependencies は `pnpm-workspace.yaml` に書く。開発用Nodeの正本は `.node-version`、pnpmの正本は `package.json` の `packageManager` とする。
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

PowerShell スクリプトは PowerShell 7 系（`pwsh`、検証版 7.6.9）で実行する。`zip.ps1` / `zip.sh` は `pnpm install --frozen-lockfile` と `pnpm run generate-icons` を実行し、上記3パスだけを `clean-reload.zip` にまとめる。既存ZIPは置き換え、`*.DS_Store` / `*.swp` / `*~` は除外する。正式な公開パッケージも `.github/workflows/publish.yml` で同じ依存解決と配布対象を使う。

## リリース (Chrome Web Store + Firefox AMO 自動公開)

1. `manifest.json`、`manifest.firefox.json`、`package.json` の `version` を上げてコミット（3ファイルは一致必須。更新は `/vava` 経由）
2. `release/x.y.z`（`x.y.z` は manifest の version と一致必須）ブランチを push
3. [.github/workflows/publish.yml](.github/workflows/publish.yml) が 2 job を並列起動:
   - **publish**（Chrome）: `pnpm install --frozen-lockfile` → `generate-icons` → zip → `pnpm exec chrome-webstore-upload --source clean-reload.zip`（v4 はサブコマンド省略でアップロードと公開を実行）
   - **publish-firefox**（AMO）: firefox-build 構築 → `web-ext lint` → `web-ext sign --channel=listed`
4. ブランチ名と manifest バージョンの整合性チェックあり（不一致なら fail）。Firefox の初回登録のみローカル sign（§Firefox AMO 対応）。

## 構造と編集先

構造・責務は [DESIGN.md の主要コンポーネントと境界](DESIGN.md#主要コンポーネントと境界) を参照する。アイコンの正本は `icons/icon.svg`、掲載画像の正本は `webstore/*.html`。`firefox-build/` と `web-ext-artifacts/` は Git 管理しない生成物。

## Firefox AMO 対応

Firefox 版は **Chrome と同じ `src/` を共有**し、`manifest.firefox.json` と background.js のランタイム分岐だけで両対応する（別ソースツリーや strip マーカーは持たない）。

### ブラウザ差の説明を保つ

[DESIGN.md のブラウザ差](DESIGN.md#ブラウザ差の吸収) を正本とし、Firefox の CacheStorage が残る制約と HTTP キャッシュが全体削除になる挙動を、README・`webstore/store-listing.firefox.{ja,en}.txt`・LP に明示する。ページ注入や広域ホスト権限を追加せず、共通ソースを維持する。

### manifest.firefox.json の不変条件
- `background` は `scripts` 配列のみ（Firefox MV3 は `service_worker` 非対応）。`service_worker` キーは書かない。
- `browser_specific_settings.gecko.strict_min_version` は **`142.0`**。`data_collection_permissions` が Firefox 142+ 導入のため、140 等にすると AMO の `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` 警告が出る。両者を 142 で揃える。
- gecko id は本拡張専用の UUID `{a4a7df25-9281-44f6-9d06-5959599c6473}`（他拡張と共有しない）。
- version は `manifest.json` と `package.json` に一致させる（CI がversionの相互整合とブランチ名を照合）。

### 初回 AMO 登録（ローカルで実施）
1. ローカルで `pnpm install && node scripts/generate-icons.js`
2. firefox-build を構築: `mkdir firefox-build && cp manifest.firefox.json firefox-build/manifest.json && cp -r icons src firefox-build/`
3. `pnpm exec web-ext lint --source-dir=firefox-build`（errors 0 を確認）
4. AMO の JWT credentials を `WEB_EXT_API_KEY`（issuer）/ `WEB_EXT_API_SECRET`（secret）へ設定し、値をログ/コミットに残さず実行する。提出メタは `.amo-metadata.json`（カテゴリ `other`、ライセンス MIT）を使う:
   ```bash
   pnpm exec web-ext sign --source-dir=firefox-build --channel=listed --amo-metadata=.amo-metadata.json
   ```
5. gecko id をキーに AMO 上へ新規 add-on が自動作成される。2 回目以降は CI の `publish-firefox` job が担う。

> **timeout の扱い**: `web-ext sign --channel=listed` が `Approval: timeout exceeded` で終了した場合、CI は提出済みとして warning 化する。同versionの重複も warning 化し、それ以外の失敗は fail にする。CI green は審査・公開完了を保証しないため、AMO 側の状態を確認する。

### CI（publish.yml の `publish-firefox` job）
`release/x.y.z` push で Chrome `publish` job と**並列・独立**に実行（`if: success() || failure()` で Chrome 失敗時も submit）。GitHub Secrets `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` を使用。firefox-build 構築 → `web-ext lint` → `web-ext sign` の順。

### AMO listing（説明文）の更新は API 経由（スクショは手動）
listing の name / summary / description / homepage / support_url / categories / privacy_policy は **AMO API v5 で PATCH 可能**。`/vava` スキルの `~/.agents/skills/vava/scripts/update-amo-listing.mjs` が `vava.config.json` の `amo` ブロック + `webstore/store-listing.firefox.{ja,en}.txt` + `docs/privacy-policy{,.en}.md` を読む。リポジトリルートから実行する:
```powershell
node "$HOME/.agents/skills/vava/scripts/update-amo-listing.mjs" --dry-run
# 公開依頼がある場合だけ、AMO_JWT_ISSUER / AMO_JWT_SECRET を環境変数へ設定して実行
node "$HOME/.agents/skills/vava/scripts/update-amo-listing.mjs"
```
`--dry-run` は資格情報・ネットワークなしで入力を検証する。このスクリプトはスクリーンショットを更新しないため、AMO Developer Hub から手動アップロードする（`webstore/images/*-1280x800.png`）。

## 制約事項

- 内部・危険プロトコルのページ（`chrome:`, `chrome-extension:`, `moz-extension:`, `edge:`, `about:`, `data:`, `javascript:`, `blob:`）は `BLOCKED_PROTOCOLS` で早期 return。`new URL()` の throw も try-catch で吸収
- **`file:`（ローカル HTML）は許可**する。ただし `origin` が `'file://'` になるブラウザもあるため、`protocol === 'file:'` でもキャッシュ削除対象から除外し、opaque origin（`origin === 'null'`）と同様に `tabs.reload({bypassCache:true})` だけ実行する（HTTP キャッシュ層のみバイパス）。全タブ版も同様に file: タブを reloadTargets には含めつつ origins/hostnames Set からは外す
- SW 登録の削除処理（Chrome では CacheStorage も削除）は `await` で成功・失敗の確定を待つ。失敗は警告してリロードを続行する現行挙動を保つ（理由は [DESIGN.md](DESIGN.md#重要な不変条件) を参照）
- HTTP キャッシュ削除と `tabs.reload({bypassCache:true})` は `.catch()` でログするだけの fire-and-forget（初版から継続する設計判断）
- 強制スリープは `tabs.query({ active: false, discarded: false })` の結果だけを対象にする。各ウィンドウのアクティブタブはブラウザ仕様上破棄できないため対象外とし、個別失敗は残りのタブ処理を止めず警告へ記録する
- API は `api`（`browser ?? chrome`）経由で呼ぶ。Firefox の browsingData 仕様差は `clearCacheData()` の `isFirefox` 分岐に集約する（個別呼び出し箇所で分岐を散らさない）

## 製品ページの保守

配信元・編集元・公開先は [DESIGN.md](DESIGN.md#製品ページの配信先) を参照する。公開URLを維持し、静的ファイルの配信は `../vps-web/deploy/deploy-lp.ps1` を使う。
