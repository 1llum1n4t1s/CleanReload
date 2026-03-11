# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Clean Reload — ワンクリックでキャッシュ完全クリア+リロード（スーパーリロード）を実行するChrome拡張機能（Manifest V3）。

リロード時の処理:
1. Service Worker登録をすべて解除（`navigator.serviceWorker.getRegistrations()`）
2. CacheStorage内のキャッシュをすべて削除（`caches.keys()` → `caches.delete()`）
3. HTTPキャッシュをバイパスしてリロード（`chrome.tabs.reload({ bypassCache: true })`）

## ビルドコマンド

```bash
npm install                # 依存関係インストール（sharp, puppeteer）
npm run generate-icons     # icons/icon.svg → images/icon-{16,48,128}.png
npm run generate-screenshots # webstore/*.html → webstore/images/*.png
npm run build              # 上記2つを順次実行
```

## パッケージング

```powershell
powershell -ExecutionPolicy Bypass -File zip.ps1
```
manifest.json, scripts/, images/ のみをZIPに含める。node_modules や webstore/ は含まない。

## アーキテクチャ

- **manifest.json** — 拡張機能の定義。権限は `activeTab` + `scripting` のみ。popupなし（アイコンクリックで即実行）。
- **scripts/background.js** — 唯一のランタイムコード。`chrome.action.onClicked` でキャッシュクリア+リロードを実行。`chrome.scripting.executeScript` でページコンテキスト内のSW/CacheStorageを操作。
- **icons/icon.svg** — マスターアイコン。ここを変更すれば `generate-icons.js` で全サイズ生成。
- **webstore/*.html** — ストア掲載画像のHTMLテンプレート。`generate-screenshots.js`（Puppeteer）でPNGに変換。

## 制約事項

- `chrome://`, `edge://`, `chrome-extension://` などの内部ページではスクリプト実行不可（早期return）
- Chrome Web Storeページでも `executeScript` が失敗するため、try/catchで吸収
