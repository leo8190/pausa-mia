# syntax=docker/dockerfile:1
# Imagen lista para Piper es_AR-daniela-high. El modelo NO se incluye en el build:
# montalo o descargalo en runtime (ver README).

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app

# Binario Piper: instalar desde el release oficial de rhasspy/piper en el host
# o copiarlo aquí. Por defecto se espera `piper` en PATH o PIPER_BIN.
# Ejemplo (no ejecutado en este Dockerfile para no fijar una URL frágil):
#   curl -L <release-piper-linux-x86_64.tar.gz> | tar -xz -C /usr/local/bin

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

ENV PORT=8787 \
    ARG_TTS_BACKEND=piper \
    ARG_ALLOWED_ORIGINS= \
    PIPER_BIN=piper \
    PIPER_MODEL_PATH=/models/es_AR-daniela-high.onnx \
    PIPER_CONFIG_PATH=/models/es_AR-daniela-high.onnx.json \
    ARG_MAX_TEXT_CHARS=800

EXPOSE 8787
VOLUME ["/models"]
CMD ["node", "dist/index.js"]
