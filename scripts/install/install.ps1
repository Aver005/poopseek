# PoopSeek installer for Windows (PowerShell)
# Использование: irm https://raw.githubusercontent.com/Aver005/poopseek/main/install.ps1 | iex
#Requires -Version 5.1
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo       = "Aver005/poopseek"
$InstallDir = "$env:LOCALAPPDATA\Programs\poopseek"
$AssetName  = "poopseek-windows-x64.zip"
$ApiUrl     = "https://api.github.com/repos/$Repo/releases/latest"

# --- Получить последний релиз ---
Write-Host "==> Получаю информацию о последнем релизе..."

try {
    $Release = Invoke-RestMethod -Uri $ApiUrl `
        -Headers @{ "Accept" = "application/vnd.github+json"; "User-Agent" = "PoopSeek-Installer" }
} catch {
    Write-Error "Не удалось получить данные релиза: $_"
    exit 1
}

$LatestVersion = $Release.tag_name
$Asset = $Release.assets | Where-Object { $_.name -eq $AssetName } | Select-Object -First 1

if (-not $LatestVersion) {
    Write-Error "Не удалось определить версию релиза"
    exit 1
}
if (-not $Asset) {
    Write-Error "В релизе нет файла: $AssetName"
    exit 1
}

# --- Проверить установленную версию ---
$InstalledVersion = ""
$VersionFile = "$InstallDir\VERSION.txt"
if (Test-Path $VersionFile) {
    $InstalledVersion = (Get-Content $VersionFile -Raw).Trim()
}

$LatestBare    = $LatestVersion -replace '^v', ''
$InstalledBare = $InstalledVersion -replace '^v', ''

if ($InstalledBare -eq $LatestBare) {
    Write-Host "==> Уже установлена актуальная версия: $LatestVersion"
    Write-Host "   $InstallDir\poopseek.exe"
    exit 0
}

if ($InstalledVersion) {
    Write-Host "==> Обновляю $InstalledVersion -> $LatestVersion..."
} else {
    Write-Host "==> Устанавливаю PoopSeek $LatestVersion..."
}

# --- Скачать ---
$TmpDir  = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
$ZipPath = Join-Path $TmpDir $AssetName
New-Item -ItemType Directory -Path $TmpDir | Out-Null

try {
    Write-Host "==> Скачиваю $AssetName..."
    Invoke-WebRequest -Uri $Asset.browser_download_url -OutFile $ZipPath -UseBasicParsing

    Write-Host "==> Распаковываю..."
    Expand-Archive -Path $ZipPath -DestinationPath $TmpDir -Force

    $Extracted = Join-Path $TmpDir "poopseek"

    # --- Установить ---
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

    # Удалить старые ресурсы перед заменой
    @("assets", "docs") | ForEach-Object {
        $target = Join-Path $InstallDir $_
        if (Test-Path $target) { Remove-Item $target -Recurse -Force }
    }

    Copy-Item "$Extracted\poopseek.exe"  "$InstallDir\poopseek.exe"  -Force
    Copy-Item "$Extracted\assets"        "$InstallDir\assets"        -Recurse -Force
    Copy-Item "$Extracted\docs"          "$InstallDir\docs"          -Recurse -Force
    Copy-Item "$Extracted\VERSION.txt"   "$InstallDir\VERSION.txt"   -Force

    # --- Добавить в PATH если нужно ---
    $UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($UserPath -notlike "*$InstallDir*") {
        $NewPath = ($InstallDir + ";" + $UserPath).TrimEnd(";")
        [Environment]::SetEnvironmentVariable("PATH", $NewPath, "User")
        $env:PATH = "$InstallDir;$env:PATH"
        Write-Host "   Добавлен в PATH: $InstallDir"
    }

    # --- Готово ---
    Write-Host ""
    Write-Host "✅ PoopSeek $LatestVersion установлен!"
    Write-Host "   Бинарник: $InstallDir\poopseek.exe"
    Write-Host ""
    Write-Host "   Запустите новый терминал и выполните: poopseek"

} finally {
    Remove-Item $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
}
