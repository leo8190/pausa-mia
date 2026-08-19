#!/usr/bin/env bash
# Descarga y fija el modelo Piper es_AR-daniela-high desde Hugging Face.
# No se ejecuta en CI ni en despliegues de este repo: es un paso manual local.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL_DIR="${ROOT}/models"
VOICE_ID="es/es_AR/daniela/high"
BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/${VOICE_ID}"

# Pin opcional a un commit de rhasspy/piper-voices (recomendado en producción).
# Ejemplo: HF_REVISION=a1b2c3d4e5f6...
HF_REVISION="${HF_REVISION:-main}"
if [[ "${HF_REVISION}" != "main" ]]; then
  BASE="https://huggingface.co/rhasspy/piper-voices/resolve/${HF_REVISION}/${VOICE_ID}"
fi

mkdir -p "${MODEL_DIR}"
echo "Descargando es_AR-daniela-high → ${MODEL_DIR}"
echo "Revisión: ${HF_REVISION}"

curl -fL "${BASE}/es_AR-daniela-high.onnx" -o "${MODEL_DIR}/es_AR-daniela-high.onnx"
curl -fL "${BASE}/es_AR-daniela-high.onnx.json" -o "${MODEL_DIR}/es_AR-daniela-high.onnx.json"

ONNX_PATH="${MODEL_DIR}/es_AR-daniela-high.onnx"
JSON_PATH="${MODEL_DIR}/es_AR-daniela-high.onnx.json"

# Checksum opcional (recomendado con HF_REVISION fijado).
if [[ -n "${EXPECTED_ONNX_SHA256:-}" ]]; then
  if command -v sha256sum >/dev/null 2>&1; then
    echo "${EXPECTED_ONNX_SHA256}  ${ONNX_PATH}" | sha256sum -c -
  else
    actual="$(shasum -a 256 "${ONNX_PATH}" | awk '{print $1}')"
    if [[ "${actual}" != "${EXPECTED_ONNX_SHA256}" ]]; then
      echo "SHA256 mismatch: expected ${EXPECTED_ONNX_SHA256}, got ${actual}" >&2
      exit 1
    fi
    echo "${ONNX_PATH}: OK"
  fi
else
  if command -v sha256sum >/dev/null 2>&1; then
    echo "SHA256 (pinneá con EXPECTED_ONNX_SHA256=...):"
    sha256sum "${ONNX_PATH}"
  else
    echo "SHA256 (pinneá con EXPECTED_ONNX_SHA256=...):"
    shasum -a 256 "${ONNX_PATH}"
  fi
fi

ls -lh "${ONNX_PATH}" "${JSON_PATH}"
echo "Listo. Configurá PIPER_MODEL_PATH y PIPER_CONFIG_PATH o usá los defaults de .env.example."
