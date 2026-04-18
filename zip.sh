#!/bin/bash

# Clean Reload 拡張機能パッケージ生成スクリプト

set -euo pipefail

cd "$(dirname "$0")"

echo "拡張機能パッケージを生成中..."
echo ""

# 古いZIPファイルを削除
rm -f ./clean-reload.zip
echo "既存のZIPファイルを削除しました"

# アイコン生成 (失敗時は set -e により即 exit)
if [ -f scripts/generate-icons.js ]; then
  echo "アイコン生成中..."
  npm install --silent
  node scripts/generate-icons.js
fi

echo "ZIPファイルを作成中..."

if ! command -v zip &> /dev/null; then
  echo "zipをインストールしてください"
  echo "   Linux: sudo apt install zip"
  echo "   macOS: brew install zip"
  exit 1
fi

zip -r ./clean-reload.zip \
  manifest.json \
  icons/ \
  src/ \
  -x "*.DS_Store" "*.swp" "*~"

echo "ZIPファイルを作成しました: clean-reload.zip"
echo ""
echo "ファイルサイズ:"
ls -lh ./clean-reload.zip
