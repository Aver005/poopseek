# ── Универсальная сборка poopseek (Linux/macOS/WSL) ──────────────
#
# Bun НЕ кросс-компилирует. Бинарник будет под ОС, на которой
# запущена сборка:
#   - Linux хост / Docker → linux-бинарник
#   - macOS хост + Docker Desktop → linux-бинарник (Docker на Mac = Linux VM)
#
# Чтобы получить macOS-бинарник БЕЗ Mac — это технически невозможно
# через Bun. См. docker/build-macos.sh для сборки на реальном Mac.
#
# Запуск:
#   docker build -f docker/Dockerfile -t poopseek .
#   docker create --name tmp-poopseek poopseek
#   docker cp tmp-poopseek:/out/poopseek ./build/
#   docker rm tmp-poopseek

FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY src/ ./src/
COPY assets/ ./assets/
COPY docs/ ./docs/
COPY scripts/ ./scripts/

RUN mkdir -p /out && \
    bun build src/index.ts \
        --compile \
        --outfile /out/poopseek \
        --target bun && \
    cp -R assets /out/ && \
    cp -R docs /out/

FROM scratch AS artifact
COPY --from=builder /out/ /out/
