# AGENTS.md

このファイルは、このリポジトリで作業するエージェント向けのコマンド・検証手順・制約を定める。システム構造と設計判断の正本は [DESIGN.md](DESIGN.md) を参照する。

Bun は `package.json` の `packageManager` (`bun@1.4.4`) を正本とする。`bunfig.toml` の `minimumReleaseAge = 86400` は従来の24時間の公開待機を維持し、例外は `minimumReleaseAgeExcludes`、依存の実行許可は `package.json` の `trustedDependencies` に置く。CI は `scripts/Initialize-BunBuild.ps1 -VersionFile package.json` で同じ実行環境を準備する。

## プロジェクト概要

Clean Reload — ワンクリックで Service Worker 登録と HTTP キャッシュをクリアして再読み込みし、Chrome では CacheStorage も削除するスーパーリロードと、右クリックメニューからの全タブ一括リロード・全バックグラウンドタブ強制スリープを提供する Chrome / Firefox 拡張機能（Manifest V3）。

コンポーネントの配置、処理順序、ブラウザ差と設計理由は [DESIGN.md](DESIGN.md) を参照する。

## ビルドコマンド

```bash
bun install                # 依存関係インストール（sharp + puppeteer/Chromium DL、初回は重い）
bun --bun run generate-icons     # icons/icon.svg → icons/icon-{16,48,128}.png（sharp のみ使用）
bun --bun run generate-screenshots # webstore/*.html → webstore/images/*.png（puppeteer 使用）
bun --bun run build              # 上記2つを順次実行
```

- テスト・Lint・フォーマッタの package scripts は**未定義**。`bun --bun run test` などは存在しない。Firefox 配布前には下記の `bun --bun run web-ext lint` を実行する。
- CI と同じ依存解決には Bun 1.4.4 と `bun run deps` を使う。アイコン生成だけなら `PUPPETEER_SKIP_DOWNLOAD=1` で Chromium のダウンロードを省略できる。
- 拡張機能本体の開発には `sharp` しか不要。`generate-screenshots` はストア画像用途で、普段のコード編集では実行しなくてよい。
- `generate-screenshots` は Chromium の応答待ちで数分かかることがある。CDP の protocol timeout は 300 秒なので、出力が止まって見えても重複起動せず完了を待つ。

### 依存の overrides / patch（[package.json](package.json)）

devDependency の `web-ext` 配下に出た脆弱性を、上流が未修正のため `overrides` で解消している（`adm-zip` / `shell-quote` / `fast-uri` / `brace-expansion` / `undici` / `js-yaml`）。拡張機能の配布物には含まれない開発時専用の依存。

minimatch は `^11.0.4` へ、旧 default import を使う multimatch は `^8.0.0` へ override する。`@eslint/eslintrc@3.3.7` の ESM import は `patches/@eslint%2Feslintrc@3.3.7.patch` で named import へ修正する。Bun の `patchedDependencies` で適用し、同パッケージ更新時は上流の import と patch の要否を確認する。旧 minimatch 3 の brace-expansion interop patch は不要になった。

## 開発時の読み込み

1. `bun install && bun --bun run generate-icons` でアイコン PNG を生成（`icons/icon-*.png` は gitignore なので初回必須）
2. Chrome で `chrome://extensions/` → デベロッパーモードON → 「パッケージ化されていない拡張機能を読み込む」→ リポジトリルートを選択

## パッケージング

```powershell
bun run deps
bun --bun run generate-icons
Compress-Archive -Path manifest.json,icons,src -DestinationPath clean-reload.zip -Force
```
`clean-reload.zip` に `manifest.json` + `icons/` + `src/` のみ含める（`node_modules`, `webstore/`, `scripts/` は除外）。

PowerShell スクリプトは PowerShell 7 系（`pwsh`、検証版 7.6.9）で実行する。`zip.ps1` / `zip.sh` は `bun run deps` と `bun --bun run generate-icons` を実行し、上記3パスだけを `clean-reload.zip` にまとめる。既存ZIPは置き換え、`*.DS_Store` / `*.swp` / `*~` は除外する。正式な公開パッケージも `.github/workflows/publish.yml` で同じ依存解決と配布対象を使う。

## リリース (Chrome Web Store + Firefox AMO 自動公開)

1. `manifest.json`、`manifest.firefox.json`、`package.json` の `version` を上げてコミット（3ファイルは一致必須。更新は `/vava` 経由）
2. `release/x.y.z`（`x.y.z` は manifest の version と一致必須）ブランチを push
3. [.github/workflows/publish.yml](.github/workflows/publish.yml) が 2 job を並列起動:
   - **publish**（Chrome）: lockfile固定のbuild → ZIP実物verifier → receiptのSHA-256を `scripts/Publish-Cws.ps1` へ渡して提出する。
   - **publish-firefox**（AMO）: firefox-build 構築 → `web-ext lint` → 最終XPI検証 → `scripts/Publish-Amo.ps1`
4. ブランチ名と manifest バージョンの整合性チェックあり（不一致なら fail）。Firefox の初回登録のみ AMO Developer Hub で実施（§Firefox AMO 対応）。

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

### 初回 AMO 登録

初回は https://addons.mozilla.org/developers/ の「Submit a New Add-on」から、検証済みFirefox XPIをアップロードして登録する。GUIDは `{a4a7df25-9281-44f6-9d06-5959599c6473}` を維持し、categoriesは `other`、licenseはMITとする。PowerShell publisherは登録済みGUIDへの新version提出専用で、未登録の404では停止する。初回完了後はCIの `publish-firefox` jobが新versionの提出を担う。人手レビューの承認・公開はCI成功と区別する。

### CI（publish.yml の `publish-firefox` job）
`release/x.y.z` push で Chrome `publish` job と**並列・独立**に実行（`if: success() || failure()` で Chrome 失敗時も submit）。GitHub Secrets `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` を使用。firefox-build 構築 → `web-ext lint` → `scripts/Publish-Amo.ps1` の順。

### AMO listing（説明文）の更新は API 経由（スクショは手動）
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

### ストア掲載情報

リポジトリルートで実行する。AMO 更新は公開依頼時のみ実行し、事前に同じコマンドへ `--dry-run` を付けて入力を確認する。

```powershell
bun "$HOME/.agents/skills/vava/scripts/update-amo-listing.mjs" --slug 'clean-reload' --listing 'ja=webstore/store-listing.firefox.ja.txt' --listing 'en-US=webstore/store-listing.firefox.en.txt' --privacy 'ja=docs/privacy-policy.md' --privacy 'en-US=docs/privacy-policy.en.md' --name 'ja=Clean Reload' --name 'en-US=Clean Reload' --homepage 'https://github.com/1llum1n4t1s/CleanReload' --support-url 'https://github.com/1llum1n4t1s/CleanReload/issues' --category 'other'
```

### CWS 公開のHTTP境界

`publish.yml` はビルド済みZIPを `scripts/Publish-Cws.ps1`（PowerShell 7）へ渡す。既存のOAuth secrets・publisher/item IDを維持し、ZIPをストリーム送信し、upload成功を確認してからpublishする。重複・通信断・不明な応答を公開成功として扱わず、ストア状態を確認してから再開する。公開専用npm CLIは使用しない。変更時はHTTP fixtureで成功・版/ID不一致・upload失敗・publish拒否を確認する。

### AMO 公開のHTTP境界

公開workflowは生成した最終XPIを既存の配布物検証へ通し、SHA-256・GUID・versionを `scripts/Publish-Amo.ps1`（PowerShell 7）へ渡す。旧web-ext sign/承認タイムアウトを成功化する手順に代えて、JWT認証・全ページの非公開listed版検査・upload検証・GUIDに対するPUT提出の受付応答まで確認する。XPIの同一snapshotをhash検証と送信に使い、保存UUIDの再利用・重複・不明な受付結果は停止する。CI成功は審査完了・ストア公開を意味しない。

CWS公開workflowはrepository固定のconcurrency groupで直列化する。同期uploadの成功・ID・版を確認した場合だけpublishし、非同期uploadはAPI v2でdraft版を要求と結び付けられないため停止する。APIにはuploadとpublishの原子的なCASが無いため、提出中はDashboardや他の手動公開操作を並行しない。

## Bun依存の脆弱性検出

依存の固定復元は `bun run deps` を使う。lock欠落・破損を拒否し、`[run] bun=true` 経由で依存のpostinstallまでBunで実行する。Node.jsがあるPCでも通常の `bun install` を直接使う経路へ戻さない。

日次と手動実行では `bun audit` でlock全体を監査する。ローカルでも同じコマンドで確認できる。BunはDependabotの通常の更新PRには対応するが、脆弱性起点の自動修正PRは `dependency-security.yml` が補完する。日次・手動で全件監査し、隔離領域で `bun audit fix` による候補を作成し、同じrunから既存の Dependency validation を呼ぶ。未対策アドバイザリが減少し、依存以外のmanifest・パッチ・24時間待機を保ち、全検証が成功した場合だけ、検証したマージコミットを競合検知付きの通常pushで取り込む。保護されたブランチには自動pushせず、修正版未公開・互換性・検証失敗は単一のIssueに通知して次回再試行する。生の監査は警告を除外せず、対策済みパッチの認定も監査成功とは区別してsummaryへ残す。既知のdeepmerge対策はアドバイザリ・版・パッチSHAが完全一致した場合だけ修正対象から外し、生監査には残す。通常のDependabot更新と他ecosystemの設定は維持する。


### 依存の暫定セキュリティ修正

minimatch は 11.0.4 以降、multimatch は named import 対応の 8 系へ override する。ESLint 設定の ESM 経路は @eslint/eslintrc@3.3.7 と @eslint/config-array@0.21.2 の最小 import patch で互換性を保つ。web-ext@10.8.0 の FileFilter は Windows で windowsPathsNoEscape を明示し、開発用ファイルやアーカイブの除外を維持する。

CVE-2026-93753（GHSA-gcqx-w48m-w2h4）の deepmerge 4.3.1 は公式修正版が未公開のため、patches/deepmerge@4.3.1.patch で戻り値への書込みを own データ属性にし、__proto__ 経由の prototype 汚染を防ぐ。bun run test:dependencies で web-ext → addons-linter の実解決先の攻撃入力と通常 API を検証する。Bun 標準の patchedDependencies で適用し、公式修正版の採用時に patch の要否を再確認する。バージョンベースの bun audit 警告は残るため、警告を除外したり成功扱いにしない。
