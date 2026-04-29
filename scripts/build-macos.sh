#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="$ROOT_DIR/build/macos"
VERSION="${1:-}"

cd "$ROOT_DIR"

echo "==> Устанавливаю зависимости..."
bun install --frozen-lockfile

echo "==> Собираю macOS-бинарник (arch: $(uname -m))..."
mkdir -p "$OUT_DIR"

DEFINE_ARGS=""
if [ -n "$VERSION" ]; then
    DEFINE_ARGS="--define:__APP_VERSION__=\"\\\"$VERSION\\\"\""
fi

eval bun build src/index.ts \
    --compile \
    --outfile "$OUT_DIR/poopseek.exec" \
    --target bun \
    $DEFINE_ARGS

echo "==> Копирую ресурсы..."
rm -rf "$OUT_DIR/assets" "$OUT_DIR/docs"
cp -R assets "$OUT_DIR/assets"
mkdir -p "$OUT_DIR/docs"
cp -R docs/tools "$OUT_DIR/docs/tools"

if [ -n "$VERSION" ]; then
    echo "$VERSION" > "$OUT_DIR/VERSION.txt"
fi

echo ""
echo "✅ build/macos/poopseek.exec${VERSION:+ v$VERSION}"
echo "   Архитектура: $(uname -m)"
echo "   Размер: $(du -h "$OUT_DIR/poopseek.exec" | cut -f1)"
