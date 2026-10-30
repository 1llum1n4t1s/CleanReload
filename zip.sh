#!/bin/bash

# Clean Reload 拡張機能パッケージ生成スクリプト

set -euo pipefail

cd "$(dirname "$0")"

echo "拡張機能パッケージを生成中..."
echo ""

# アイコン生成 (失敗時は set -e により即 exit)
echo "アイコン生成中..."
pnpm install --frozen-lockfile
pnpm run generate-icons

echo "ZIPファイルを作成中..."

if ! command -v zip &> /dev/null; then
  echo "zipをインストールしてください"
  echo "   Linux: sudo apt install zip"
  echo "   macOS: brew install zip"
  exit 1
fi

zip -r - \
  manifest.json \
  icons/ \
  src/ \
  -x "*.DS_Store" "*.swp" "*~" > ./clean-reload.zip

echo "ZIPファイルを作成しました: clean-reload.zip"
echo ""
echo "ファイルサイズ:"
ls -lh ./clean-reload.zip
