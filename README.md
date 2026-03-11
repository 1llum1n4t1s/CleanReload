# Clean Reload

ワンクリックでキャッシュを完全クリアしてページを再読み込みするChrome拡張機能です。

## 機能

ツールバーのアイコンをクリックするだけで、以下を自動実行します：

1. **Service Worker** の登録をすべて解除
2. **CacheStorage** 内のキャッシュをすべて削除
3. **HTTPキャッシュ**をバイパスしてページをリロード

通常のスーパーリロード（Ctrl+Shift+R）ではクリアされないService WorkerキャッシュやCacheStorageも含めて完全にリセットします。

## 使い方

1. Chrome Web Storeから拡張機能をインストール
2. リロードしたいページでツールバーのアイコンをクリック

## 権限

- **activeTab** — クリック時にアクティブなタブのみにアクセス
- **scripting** — ページ内のService Worker/CacheStorageをクリアするために使用
- **browsingData** — HTTPキャッシュを該当オリジンから実削除するために使用

## ライセンス

MIT License
