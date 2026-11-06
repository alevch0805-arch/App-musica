#!/usr/bin/env bash
# Convierte una voz cantada de mujer a la voz de hombre de referencia con IA (Seed-VC),
# usando la configuración "B" que sonó mejor:
#   - limpieza previa de la voz de entrada (restos del separador de Moises)
#   - 50 pasos de difusión, inference-cfg-rate 0.5, bajada de 1 octava (-12 semitonos)
#   - pulido final: menos brillo metálico 3-7 kHz, de-esser, reverb ligera, volumen -16 LUFS
#
# Uso:  tools/voz_hombre.sh voz_mujer.(mp3|wav|m4a) salida.mp3 [referencia.flac]
# Requiere: ffmpeg y el comando seed-vc-infer-v1 (pip install seed-vc, con
#   huggingface_hub<1.0 y transformers<4.50) en el PATH o en $SEEDVC.
# En CPU tarda ~1 minuto por cada segundo de voz.
set -euo pipefail
SRC="$1"; OUT="$2"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
REF="${3:-$HERE/media/voz_ia/referencia_hombre.flac}"
SEEDVC="${SEEDVC:-seed-vc-infer-v1}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

ffmpeg -y -loglevel error -i "$SRC" -ac 1 -ar 44100 \
  -af "highpass=f=90,afftdn=nr=10:nf=-42:tn=1,equalizer=f=4500:t=q:w=1.5:g=-2,lowpass=f=12000" \
  "$TMP/src.wav"
ffmpeg -y -loglevel error -i "$REF" -ac 1 -ar 44100 "$TMP/ref.wav"

"$SEEDVC" --source "$TMP/src.wav" --target "$TMP/ref.wav" --output "$TMP/out" \
  --diffusion-steps 50 --inference-cfg-rate 0.5 --f0-condition True \
  --auto-f0-adjust False --semi-tone-shift -12 --fp16 False

ffmpeg -y -loglevel error -i "$TMP"/out/*.wav -ar 44100 \
  -af "highpass=f=75,afftdn=nr=8:nf=-40,equalizer=f=3500:t=q:w=1.2:g=-4,equalizer=f=6500:t=q:w=1.5:g=-3,deesser=i=0.5,lowpass=f=10000,aecho=0.8:0.6:45|90:0.18|0.10,loudnorm=I=-16:TP=-1" \
  -c:a libmp3lame -b:a 192k "$OUT"
echo "Listo: $OUT"
