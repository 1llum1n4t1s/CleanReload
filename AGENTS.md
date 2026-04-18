# AGENTS.md

This file provides guidance to Codex (and other AI agents) when working with code in this repository.

## Overview

Chrome extension (Manifest V3) — ワンクリックでキャッシュ完全クリア + リロードを実行。Service Worker 登録削除 + CacheStorage クリア + HTTP キャッシュ削除を `chrome.browsingData.remove` の origin スコープ呼び出しに統合。Vanilla JS、ビルドステップなし（アイコン生成のみ）。日本語 UI/コメント。

## Commands

**Build:** `npm install && npm run build`（icons + screenshots 生成）
**Dev load:** `chrome://extensions` → デベロッパーモードON → Load unpacked → リポジトリルート
**Package:** `.\zip.ps1` (Windows) / `./zip.sh` (Linux/macOS) → `clean-reload.zip`（`manifest.json` + `icons/` + `src/`）

## Release

`manifest.json` の version を上げて `release/x.y.z` ブランチを push すると [.github/workflows/publish.yml](.github/workflows/publish.yml) が Chrome Web Store に自動公開。ブランチ名と manifest バージョンが一致しないと fail。

## Directory Structure (統一規約)

```
manifest.json
icons/                   # icon.svg (source) + icon-*.png (generated, gitignore)
src/background/          # service worker のランタイムコード
scripts/                 # ビルドツール (generate-icons.js)
webstore/                # ストア申請用スクショ HTML テンプレート
.github/workflows/       # 自動公開ワークフロー
```

## Architecture

- **`src/background/background.js`** — `chrome.action.onClicked` リスナー。`chrome.browsingData.remove({origins: [origin]}, {cacheStorage, serviceWorkers})` と `chrome.browsingData.removeCache({origins})` を fire-and-forget で投げ、即座に `chrome.tabs.reload({ bypassCache: true })`。ページ注入を使わないため Chrome Web Store 等でも同じ挙動。
- **アイコン**: `icons/icon.svg` をソースとして `scripts/generate-icons.js` (sharp) で 16/48/128 PNG を生成。

## Conventions

- 内部ページ（`chrome://`, `edge://`, `chrome-extension://`）は早期 return
- 権限は `activeTab` + `browsingData` のみ。`scripting` は使わない（v1.0.6 で除去）
- クリーンアップはリロード完了を待たない fire-and-forget（`bypassCache: true` で HTTP キャッシュ競合を回避、SW/CacheStorage は次回ナビゲーション以降で有効）
