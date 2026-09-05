# 変更履歴

Git のバージョン記録・コミット差分と既存の変更履歴をもとに、確認できた版ごとの変更点をまとめています。「Git 記録日」は公開日ではありません。番号の欠番だけから未確認のリリースは補っていません。

## 未リリース

## [1.0.16] — Git 記録日: 2026-08-31

- Firefoxのキャッシュ制限を正確に案内する

出典: [版の記録](https://github.com/1llum1n4t1s/CleanReload/commit/7ff5440bbc984708c7e6908a2510482aabec4e66) / [変更差分](https://github.com/1llum1n4t1s/CleanReload/compare/d6f4015dff368b1f99781b0952d4f5935796dc2e...7ff5440bbc984708c7e6908a2510482aabec4e66)。

## [1.0.15] — Git 記録日: 2026-08-30

- スクリーンショット生成のタイムアウトを延長
- Node依存関係を更新
- CWS審査中の重複公開を安全に判定
- 強制スリープ機能の権限用途を追記

出典: [版の記録](https://github.com/1llum1n4t1s/CleanReload/commit/d6f4015dff368b1f99781b0952d4f5935796dc2e) / [変更差分](https://github.com/1llum1n4t1s/CleanReload/compare/46f27d29769b0e3a7f538b6053e267b0cc3fd48b...d6f4015dff368b1f99781b0952d4f5935796dc2e)。

## [1.0.14] — Git 記録日: 2026-08-29

- 全バックグラウンドタブの強制スリープを追加
- Node依存関係を更新 (#27)

出典: [版の記録](https://github.com/1llum1n4t1s/CleanReload/commit/46f27d29769b0e3a7f538b6053e267b0cc3fd48b) / [変更差分](https://github.com/1llum1n4t1s/CleanReload/compare/3d40236749dec2d361ca22a253052c5a6e43d035...46f27d29769b0e3a7f538b6053e267b0cc3fd48b)。

## [1.0.13] — Git 記録日: 2026-08-08

- puppeteer/web-ext を更新し、undici・fast-uri・brace-expansion・js-yaml の脆弱性を解消
- ランディングページを追加

出典: [版の記録](https://github.com/1llum1n4t1s/CleanReload/commit/3d40236749dec2d361ca22a253052c5a6e43d035) / [変更差分](https://github.com/1llum1n4t1s/CleanReload/compare/bbdaf7aa424cc5eb96221dd2e904f157476d44b0...3d40236749dec2d361ca22a253052c5a6e43d035)。

## [1.0.12] — Git 記録日: 2026-07-27

- brace-expansion を 5.0.8 へ上げて残る high 脆弱性を解消
- web-ext 配下の推移的脆弱性 3 件を pnpm overrides で解消
- Chrome 重複ガードに ITEM_NOT_UPDATABLE を追加
- 同 version 再 push を冪等化（両ストアの重複を warning 化）
- Chrome 公開コマンドを chrome-webstore-upload に修正
- setup-node を Node 22 に上げて pnpm 11 の要件を満たす

出典: [版の記録](https://github.com/1llum1n4t1s/CleanReload/commit/bbdaf7aa424cc5eb96221dd2e904f157476d44b0) / [変更差分](https://github.com/1llum1n4t1s/CleanReload/compare/c724e163cf6a1b6b1c15c4daa25eb154b1c6d94b...bbdaf7aa424cc5eb96221dd2e904f157476d44b0)。

## [1.0.11] — Git 記録日: 2026-07-03

- ローカル HTML ファイルのクリーンリロード対応
- Firefox AMO 版に対応（pnpm 移行も確定）

出典: [版の記録](https://github.com/1llum1n4t1s/CleanReload/commit/c724e163cf6a1b6b1c15c4daa25eb154b1c6d94b) / [変更差分](https://github.com/1llum1n4t1s/CleanReload/compare/02579f069f1ed25b3f2f52f1e7f73d28e811c3fb...c724e163cf6a1b6b1c15c4daa25eb154b1c6d94b)。

## [1.0.10] — Git 記録日: 2026-05-09

- 通知をアイコンバッジ方式に変更し notifications 権限を削除
- 通知アイコンのパスを chrome.runtime.getURL() で解決

出典: [版の記録](https://github.com/1llum1n4t1s/CleanReload/commit/02579f069f1ed25b3f2f52f1e7f73d28e811c3fb) / [変更差分](https://github.com/1llum1n4t1s/CleanReload/compare/3d3820a68956790b5c51f81cb207f3642229d5c3...02579f069f1ed25b3f2f52f1e7f73d28e811c3fb)。

## [1.0.9] — Git 記録日: 2026-05-09

- ドキュメント更新
- 全タブリロード時の同一 origin 競合を解消
- リロード開始時にトースト通知を表示
- 右クリックメニューに「全タブをクリーンリロード」機能を追加

出典: [版の記録](https://github.com/1llum1n4t1s/CleanReload/commit/3d3820a68956790b5c51f81cb207f3642229d5c3) / [変更差分](https://github.com/1llum1n4t1s/CleanReload/compare/8821760e3f1c7cd7ca29e98f158a19bfe087fe2f...3d3820a68956790b5c51f81cb207f3642229d5c3)。

## [1.0.8] — Git 記録日: 2026-04-19

- セキュリティ強化とサプライチェーン堅牢化

出典: [版の記録](https://github.com/1llum1n4t1s/CleanReload/commit/8821760e3f1c7cd7ca29e98f158a19bfe087fe2f) / [変更差分](https://github.com/1llum1n4t1s/CleanReload/compare/77bcf4ad068866f05e8e21f49dca0fd223f913a2...8821760e3f1c7cd7ca29e98f158a19bfe087fe2f)。

## [1.0.7] — Git 記録日: 2026-04-18

- scripting 権限を廃止し browsingData 統合版へ移行 (#1)

出典: [版の記録](https://github.com/1llum1n4t1s/CleanReload/commit/77bcf4ad068866f05e8e21f49dca0fd223f913a2) / [変更差分](https://github.com/1llum1n4t1s/CleanReload/compare/aa637aa5e685810f48333250c86987d3d739f9fb...77bcf4ad068866f05e8e21f49dca0fd223f913a2)。

## [1.0.6] — Git 記録日: 2026-03-26

- キャッシュクリア処理をfire-and-forgetに変更してレスポンスを改善

出典: [版の記録](https://github.com/1llum1n4t1s/CleanReload/commit/aa637aa5e685810f48333250c86987d3d739f9fb) / [変更差分](https://github.com/1llum1n4t1s/CleanReload/compare/b367e7971fe709e6ae4a99b01f140b286456a1bf...aa637aa5e685810f48333250c86987d3d739f9fb)。

## [1.0.4] — Git 記録日: 2026-03-17

- キャッシュクリア処理を並列実行してリロード開始までのラグを軽減

出典: [版の記録](https://github.com/1llum1n4t1s/CleanReload/commit/b367e7971fe709e6ae4a99b01f140b286456a1bf) / [変更差分](https://github.com/1llum1n4t1s/CleanReload/compare/f42505cb691c03989208f6490ef20eb7f4f9e2c6...b367e7971fe709e6ae4a99b01f140b286456a1bf)。

## [1.0.2] — Git 記録日: 2026-03-12

- スクリプト注入不可ページでもリロードが実行されるよう修正
- プライバシーポリシーを現在の権限構成に合わせて更新

出典: [版の記録](https://github.com/1llum1n4t1s/CleanReload/commit/f42505cb691c03989208f6490ef20eb7f4f9e2c6) / [変更差分](https://github.com/1llum1n4t1s/CleanReload/compare/f41cd580c22b45a731ec8cf2df45ed65abe488d6...f42505cb691c03989208f6490ef20eb7f4f9e2c6)。

## [1.0.0] — Git 記録日: 2026-03-12

- Clean Reload拡張機能の実装一式を追加

出典: [版の記録](https://github.com/1llum1n4t1s/CleanReload/commit/f41cd580c22b45a731ec8cf2df45ed65abe488d6)。
