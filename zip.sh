#!/bin/bash

# Clean Reload 拡張機能パッケージ生成スクリプト

cd "$(dirname "$0")" || exit 1

echo "拡張機能パッケージを生成中..."
echo ""

# 古いZIPファイルを削除
rm -f ./clean-reload.zip
echo "既存のZIPファイルを削除しました"

# アイコン生成
if [ -f scripts/generate-icons.js ]; then
  echo "アイコン生成中..."
  npm install --silent 2>/dev/null
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

if [ $? -eq 0 ]; then
  echo "ZIPファイルを作成しました: clean-reload.zip"
  echo ""
  echo "ファイルサイズ:"
  ls -lh ./clean-reload.zip
else
  echo "ZIPファイルの作成に失敗しました"
  exit 1
fi
