#!/usr/bin/env bash
# ── build-macos.sh ──────────────────────────────────────────────────
# Сборка исполняемого файла под macOS.
#
# Требования:
#   - macOS (arm64 или x86_64)
#   - Bun >= 1.1
#
# Использование:
#   chmod +x docker/build-macos.sh
#   ./docker/build-macos.sh
#   ./docker/build-macos.sh 1.2.3   # с версией
#
# Результат: build/poopseek-macos + ресурсы

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"
ARCH="$(uname -m)"
VERSION="${1:-}"

cd "$ROOT_DIR"

echo "==> Устанавливаю зависимости..."
bun install --frozen-lockfile

echo "==> Собираю macOS-бинарник (arch: $ARCH)..."
mkdir -p "$BUILD_DIR"

bun build src/index.ts \
    --compile \
    --outfile "$BUILD_DIR/poopseek-macos" \
    --target bun

echo "==> Копирую ресурсы..."
rm -rf "$BUILD_DIR/assets" "$BUILD_DIR/docs"
cp -R assets "$BUILD_DIR/assets"
cp -R docs "$BUILD_DIR/docs"

if [ -n "$VERSION" ]; then
    echo "$VERSION" > "$BUILD_DIR/VERSION.txt"
    echo "==> Версия: $VERSION"
fi

echo ""
echo "✅ Готово: $BUILD_DIR/poopseek-macos"
echo "   Архитектура: $ARCH"
echo "   Размер: $(du -h "$BUILD_DIR/poopseek-macos" | cut -f1)"
echo ""
echo "   Запуск:  $BUILD_DIR/poopseek-macos"
echo "   Установка: sudo cp $BUILD_DIR/poopseek-macos /usr/local/bin/poopseek"
