#!/usr/bin/env bash
# PoopSeek installer — macOS и Linux
# Использование: curl -fsSL https://raw.githubusercontent.com/Aver005/poopseek/main/install.sh | bash
set -euo pipefail

REPO="Aver005/poopseek"
INSTALL_DIR="${HOME}/.local/share/poopseek"
BIN_DIR="${HOME}/.local/bin"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"

# --- Определить платформу ---
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) OS_KEY="darwin" ;;
  Linux)  OS_KEY="linux"  ;;
  *)      echo "Неподдерживаемая ОС: $OS"; exit 1 ;;
esac

case "$ARCH" in
  x86_64)        ARCH_KEY="x64"   ;;
  arm64|aarch64) ARCH_KEY="arm64" ;;
  *)             echo "Неподдерживаемая архитектура: $ARCH"; exit 1 ;;
esac

ASSET_NAME="poopseek-${OS_KEY}-${ARCH_KEY}.tar.gz"

# --- Получить последний релиз ---
echo "==> Получаю информацию о последнем релизе..."

RELEASE_JSON="$(curl -fsSL -H "Accept: application/vnd.github+json" "$API_URL")"

LATEST_VERSION="$(printf '%s' "$RELEASE_JSON" \
  | grep '"tag_name"' | head -1 \
  | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"

DOWNLOAD_URL="$(printf '%s' "$RELEASE_JSON" \
  | grep '"browser_download_url"' \
  | grep "$ASSET_NAME" | head -1 \
  | sed 's/.*"browser_download_url": *"\([^"]*\)".*/\1/')"

if [ -z "$LATEST_VERSION" ]; then
  echo "Ошибка: не удалось получить версию релиза"
  exit 1
fi

if [ -z "$DOWNLOAD_URL" ]; then
  echo "Ошибка: в релизе нет файла ${ASSET_NAME}"
  exit 1
fi

# --- Проверить установленную версию ---
INSTALLED_VERSION=""
if [ -f "${INSTALL_DIR}/VERSION.txt" ]; then
  INSTALLED_VERSION="$(cat "${INSTALL_DIR}/VERSION.txt" | tr -d '[:space:]')"
fi

INSTALLED_TAG="${INSTALLED_VERSION}"
# Нормализовать: убрать ведущий v если есть
LATEST_TAG_BARE="${LATEST_VERSION#v}"
INSTALLED_TAG_BARE="${INSTALLED_TAG#v}"

if [ "$INSTALLED_TAG_BARE" = "$LATEST_TAG_BARE" ]; then
  echo "==> Уже установлена актуальная версия: ${LATEST_VERSION}"
  echo "   ${BIN_DIR}/poopseek"
  exit 0
fi

if [ -n "$INSTALLED_VERSION" ]; then
  echo "==> Обновляю ${INSTALLED_VERSION} → ${LATEST_VERSION}..."
else
  echo "==> Устанавливаю PoopSeek ${LATEST_VERSION}..."
fi

# --- Скачать и распаковать ---
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "==> Скачиваю ${ASSET_NAME}..."
curl -fSL --progress-bar "$DOWNLOAD_URL" -o "${TMP_DIR}/${ASSET_NAME}"

echo "==> Распаковываю..."
tar -xzf "${TMP_DIR}/${ASSET_NAME}" -C "$TMP_DIR"

# --- Установить ---
mkdir -p "$INSTALL_DIR"
rm -rf "${INSTALL_DIR}/assets" "${INSTALL_DIR}/docs"

cp -f  "${TMP_DIR}/poopseek/poopseek"    "${INSTALL_DIR}/poopseek"
chmod +x "${INSTALL_DIR}/poopseek"
cp -R  "${TMP_DIR}/poopseek/assets"      "${INSTALL_DIR}/assets"
cp -R  "${TMP_DIR}/poopseek/docs"        "${INSTALL_DIR}/docs"
cp -f  "${TMP_DIR}/poopseek/VERSION.txt" "${INSTALL_DIR}/VERSION.txt"

# --- Создать симлинк в bin ---
mkdir -p "$BIN_DIR"
ln -sf "${INSTALL_DIR}/poopseek" "${BIN_DIR}/poopseek"

# --- Добавить ~/.local/bin в PATH если нужно ---
PATH_ADDED=0
if [[ ":${PATH}:" != *":${BIN_DIR}:"* ]]; then
  add_to_rc() {
    local rc="$1"
    [ -f "$rc" ] || return 0
    grep -q '\.local/bin' "$rc" && return 0
    printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$rc"
    echo "   Добавлен PATH в $rc"
  }
  add_to_rc "${HOME}/.bashrc"
  add_to_rc "${HOME}/.zshrc"
  add_to_rc "${HOME}/.profile"
  PATH_ADDED=1
fi

# --- Готово ---
echo ""
echo "✅ PoopSeek ${LATEST_VERSION} установлен!"
echo "   Бинарник: ${BIN_DIR}/poopseek"
echo "   Данные:   ${INSTALL_DIR}/"

if [ "$PATH_ADDED" -eq 1 ]; then
  echo ""
  echo "   Перезапустите терминал или выполните:"
  echo '   export PATH="$HOME/.local/bin:$PATH"'
fi
