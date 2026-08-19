# syntax=docker/dockerfile:1
# Imagen autosuficiente para Fly linux/amd64: Node + CLI piper (piper-tts==1.6.0)
# + modelo es_AR-daniela-high en /models. El .onnx no se commitea; se descarga
# en el build. Sin volumen obligatorio.
#
# Pin de revisión de Hugging Face:
#   docker build --build-arg HF_REVISION=<commit_sha> -t argentine-tts .

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    python3-pip \
    ca-certificates \
    curl \
    libgomp1 \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m venv /opt/piper \
  && /opt/piper/bin/pip install --no-cache-dir 'piper-tts==1.6.0'

# Modelo Piper (rhasspy/piper-voices). Default: rama main. Pinneá el commit en prod.
ARG HF_REVISION=main
ENV HF_REVISION=${HF_REVISION}
RUN mkdir -p /models \
  && curl -fL --retry 3 --retry-delay 2 --retry-all-errors \
    "https://huggingface.co/rhasspy/piper-voices/resolve/${HF_REVISION}/es/es_AR/daniela/high/es_AR-daniela-high.onnx" \
    -o /models/es_AR-daniela-high.onnx \
  && curl -fL --retry 3 --retry-delay 2 --retry-all-errors \
    "https://huggingface.co/rhasspy/piper-voices/resolve/${HF_REVISION}/es/es_AR/daniela/high/es_AR-daniela-high.onnx.json" \
    -o /models/es_AR-daniela-high.onnx.json \
  && test -s /models/es_AR-daniela-high.onnx \
  && test -s /models/es_AR-daniela-high.onnx.json

COPY --from=build /app/package.json ./
COPY --from=build /app/dist ./dist

ENV PATH="/opt/piper/bin:${PATH}" \
    PORT=8787 \
    ARG_TTS_BACKEND=piper \
    ARG_ALLOWED_ORIGINS= \
    PIPER_BIN=piper \
    PIPER_MODEL_PATH=/models/es_AR-daniela-high.onnx \
    PIPER_CONFIG_PATH=/models/es_AR-daniela-high.onnx.json \
    ARG_MAX_TEXT_CHARS=800

EXPOSE 8787
CMD ["node", "dist/index.js"]
