# Clean Reload

ワンクリックでキャッシュを完全クリアしてページを再読み込みする Chrome / Firefox 拡張機能です。

## 機能

ツールバーのアイコンをクリックするだけで、以下を自動実行します：

1. **Service Worker** の登録をすべて解除
2. **CacheStorage** 内のキャッシュをすべて削除
3. **HTTPキャッシュ**をバイパスしてページをリロード

通常のスーパーリロード（Ctrl+Shift+R）ではクリアされないService WorkerキャッシュやCacheStorageも含めて完全にリセットします。

### 全タブをクリーンリロード

ツールバーのアイコンを **右クリック** →「**全タブをクリーンリロード**」で、開いている全タブに対して一括でキャッシュクリア＋リロードを実行します。

## インストール

### Chrome / Edge
Chrome Web Store からインストールします。

### Firefox (142 以降)
[addons.mozilla.org](https://addons.mozilla.org/) で「Clean Reload」を検索してインストールします。

> **Firefox 版での挙動の違い**
> Firefox の browsingData API は Chrome と仕様が異なります。
> - **Service Worker / CacheStorage**: 対象タブのホスト名単位で削除します（Firefox は origin 単位の精密削除に未対応のため、ホスト名単位にフォールバック）。
> - **HTTP キャッシュ**: Firefox の `removeCache` はオリジンを絞り込めない仕様のため、Firefox 全体の HTTP キャッシュをクリアします（Chrome 版は該当オリジンのみ）。

## 使い方

1. ストアから拡張機能をインストール
2. リロードしたいページでツールバーのアイコンをクリック（単一タブ）
3. 全タブを一括リロードしたい場合はアイコンを右クリック →「全タブをクリーンリロード」

## 権限

- **activeTab** — クリック時にアクティブなタブのみにアクセス
- **browsingData** — 該当オリジンの Service Worker 登録 / CacheStorage / HTTP キャッシュを削除するために使用
- **contextMenus** — 右クリックメニューに「全タブをクリーンリロード」を追加
- **tabs** — 全タブリロード時に全タブのURL情報を取得

## ライセンス

MIT License
