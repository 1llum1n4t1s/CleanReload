# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Clean Reload — ワンクリックでキャッシュ完全クリア+リロード（スーパーリロード）を実行するChrome拡張機能（Manifest V3）。

リロード時の処理（すべて fire-and-forget・origin スコープ）:
1. Service Worker 登録を削除（`chrome.browsingData.remove({origins}, {serviceWorkers: true})`）
2. CacheStorage を削除（`chrome.browsingData.remove({origins}, {cacheStorage: true})`）
3. HTTP キャッシュを削除（`chrome.browsingData.removeCache({origins})`）
4. HTTP キャッシュをバイパスしてリロード（`chrome.tabs.reload({ bypassCache: true })`）

## ビルドコマンド

```bash
npm install                # 依存関係インストール（sharp, puppeteer）
npm run generate-icons     # icons/icon.svg → icons/icon-{16,48,128}.png
npm run generate-screenshots # webstore/*.html → webstore/images/*.png
npm run build              # 上記2つを順次実行
```

## 開発時の読み込み

1. `npm install && npm run generate-icons` でアイコン PNG を生成（`icons/icon-*.png` は gitignore なので初回必須）
2. Chrome で `chrome://extensions/` → デベロッパーモードON → 「パッケージ化されていない拡張機能を読み込む」→ リポジトリルートを選択

## パッケージング

```powershell
.\zip.ps1                  # Windows
./zip.sh                   # Linux/macOS
```
`clean-reload.zip` に `manifest.json` + `icons/` + `src/` のみ含める（`node_modules`, `webstore/`, `scripts/` は除外）。

## リリース (Chrome Web Store 自動公開)

1. `manifest.json` の `version` を上げてコミット
2. `release/x.y.z`（`x.y.z` は manifest の version と一致必須）ブランチを push
3. [.github/workflows/publish.yml](.github/workflows/publish.yml) が起動 → `npm ci` → `generate-icons` → zip → `chrome-webstore-upload-cli --auto-publish`
4. ブランチ名と manifest バージョンの整合性チェックあり（不一致なら fail）

## ディレクトリ構造（統一規約）

```
CleanReload/
├── manifest.json            # ルート直置き
├── icons/                   # アイコン（icon.svg + 生成PNG、PNGはgitignore）
├── src/
│   └── background/
│       └── background.js    # service worker
├── scripts/
│   └── generate-icons.js    # PNGアイコン生成（sharp）
├── webstore/                # ストア申請アセット
│   ├── *.html               # 掲載画像テンプレート
│   ├── generate-screenshots.js  # HTML→PNG変換（puppeteer、scripts/ ではなくここ）
│   └── store-listing.txt    # ストア説明文
├── docs/privacy-policy.md   # ストア申請に必須のプライバシーポリシー
└── .github/workflows/publish.yml  # 自動公開ワークフロー
```

## アーキテクチャ

- **manifest.json** — 拡張機能の定義。権限は `activeTab` + `browsingData`。popupなし（アイコンクリックで即実行）。
- **src/background/background.js** — 唯一のランタイムコード。`chrome.action.onClicked` で `chrome.browsingData.remove` を origin スコープで呼び、SW/CacheStorage/HTTPキャッシュを削除したうえで `tabs.reload({bypassCache: true})`。ページ注入を使わないため Chrome Web Store 等の制限ページでも同じ挙動で動く。
- **icons/icon.svg** — マスターアイコン。ここを変更すれば `generate-icons.js` で全サイズ生成。
- **webstore/*.html** — ストア掲載画像のHTMLテンプレート。`generate-screenshots.js`（Puppeteer）でPNGに変換。

## 制約事項

- `chrome://`, `edge://`, `chrome-extension://` などの内部ページは `tab.url` から origin を解決できないため早期 return
- `browsingData.remove` の失敗は `.catch()` でログのみ。fire-and-forget で UX を優先（v1.0.6 で確立した設計）
