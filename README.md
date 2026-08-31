# Clean Reload

ワンクリックで Service Worker 登録と HTTP キャッシュをクリアしてページを再読み込みする Chrome / Firefox 拡張機能です。Chrome では CacheStorage も削除します。

## 機能

ツールバーのアイコンをクリックするだけで、以下を自動実行します：

1. **Service Worker** の登録をすべて解除
2. **CacheStorage** 内のキャッシュをすべて削除（Chrome のみ）
3. **HTTPキャッシュ**をバイパスしてページをリロード

通常のスーパーリロード（Ctrl+Shift+R）では残る Service Worker 登録も解除します。Chrome では CacheStorage も含めてリセットします。

### 全タブをクリーンリロード

ツールバーのアイコンを **右クリック** →「**全タブをクリーンリロード**」で、開いている全タブに対して一括でキャッシュクリア＋リロードを実行します。

### 全バックグラウンドタブを強制スリープ

ツールバーのアイコンを **右クリック** →「**全バックグラウンドタブを強制スリープ**」で、非アクティブなタブをメモリから解放します。タブは閉じず、次に選択したとき自動的に再読み込みします。Chrome / Firefox の仕様上、各ウィンドウで表示中のアクティブタブは対象外です。

## インストール

### Chrome / Edge
Chrome Web Store からインストールします。

### Firefox (142 以降)
[addons.mozilla.org](https://addons.mozilla.org/) で「Clean Reload」を検索してインストールします。

> **Firefox 版での挙動の違い**
> Firefox の browsingData API は Chrome と仕様が異なります。
> - **Service Worker 登録**: 対象タブのホスト名単位で削除します（Firefox は origin 単位の精密削除に未対応のため、ホスト名単位にフォールバック）。
> - **CacheStorage（DOM Cache API）**: Firefox の browsingData API では削除できないため残ります。
> - **HTTP キャッシュ**: Firefox の `removeCache` はオリジンを絞り込めない仕様のため、Firefox 全体の HTTP キャッシュをクリアします（Chrome 版は該当オリジンのみ）。

## 使い方

1. ストアから拡張機能をインストール
2. リロードしたいページでツールバーのアイコンをクリック（単一タブ）
3. 全タブを一括リロードしたい場合はアイコンを右クリック →「全タブをクリーンリロード」
4. バックグラウンドタブをメモリから解放したい場合はアイコンを右クリック →「全バックグラウンドタブを強制スリープ」

## 権限

- **activeTab** — クリック時にアクティブなタブのみにアクセス
- **browsingData** — Service Worker 登録と HTTP キャッシュを削除し、Chrome では CacheStorage も削除するために使用
- **contextMenus** — 右クリックメニューに全タブのクリーンリロードと強制スリープを追加
- **tabs** — 全タブリロード時のURL取得と、バックグラウンドタブのメモリ解放に使用

## ライセンス

MIT License
