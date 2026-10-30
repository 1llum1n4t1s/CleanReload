#requires -Version 7.0
# クリーンリロード 拡張機能パッケージ生成スクリプト
# 使い方: pwsh -NoProfile -File zip.ps1

$ErrorActionPreference = "Stop"

Write-Host "拡張機能パッケージを生成中..." -ForegroundColor Cyan
Write-Host ""

# スクリプトのディレクトリをカレントディレクトリに設定
Set-Location -LiteralPath $PSScriptRoot

# ロックファイルと同じ依存関係でアイコン生成
Write-Host "アイコンを生成中..." -ForegroundColor Yellow
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "pnpm install に失敗しました" }
pnpm run generate-icons
if ($LASTEXITCODE -ne 0) { throw "アイコン生成に失敗しました" }

# 配布対象だけを直接ZIP化し、既存ZIPの内容を置き換える
$zipName = "clean-reload.zip"
Write-Host "ZIPファイルを作成中..." -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$files = @(
    Get-Item -LiteralPath (Join-Path $PSScriptRoot 'manifest.json')
    Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'icons'), (Join-Path $PSScriptRoot 'src') -Recurse -File -Force |
        Where-Object { $_.Name -notlike '*.DS_Store' -and $_.Name -notlike '*.swp' -and $_.Name -notlike '*~' }
)
$stream = [IO.File]::Open((Join-Path $PSScriptRoot $zipName), [IO.FileMode]::Create)
$archive = $null
try {
    $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
    foreach ($file in $files) {
        $entryName = $file.FullName.Substring($PSScriptRoot.Length + 1).Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entryName) | Out-Null
    }
} finally {
    try {
        if ($archive) { $archive.Dispose() }
    } finally {
        $stream.Dispose()
    }
}

Write-Host "ZIPファイルを作成しました: $zipName" -ForegroundColor Green
Write-Host ""
Write-Host "ファイルサイズ:" -ForegroundColor Cyan
$fileSize = (Get-Item -LiteralPath $zipName).Length
$fileSizeKB = [math]::Round($fileSize / 1KB, 2)
Write-Host "   $fileSizeKB KB" -ForegroundColor White
Write-Host ""
Write-Host "パッケージが正常に作成されました!" -ForegroundColor Green
