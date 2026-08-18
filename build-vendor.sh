#!/usr/bin/env bash
# Deja en vendor/ TODO lo que el deck necesita para proyectarse sin internet.
# Se corre una sola vez. Después basta con abrir index.html.
#
# Si candado-lan ya corrió en esta máquina, esto es una copia local y no toca la red:
# los dos repos usan las mismas librerías y las mismas tres fuentes a propósito.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR="$HERE/vendor"
FONTS="$VENDOR/fonts"
SIBLING="${CANDADO_LAN:-$HERE/../candado-lan}/public/vendor"
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

mkdir -p "$VENDOR" "$FONTS"

# Ya está y no se pidió --force: no se rehace. El original de candado-lan sí
# rebaja todo en cada corrida, y aquí molesta: esto se ejecuta el día de la charla.
falta () { [[ $FORCE -eq 1 || ! -s "$1" ]]; }

# ---------- librerías ----------

fetch_lib () {
  local file="$1" url="$2"
  if ! falta "$VENDOR/$file"; then
    echo "==> $file (ya está)"
  elif [[ -s "$SIBLING/$file" ]]; then
    echo "==> $file (copiado de candado-lan)"
    cp "$SIBLING/$file" "$VENDOR/$file"
  else
    echo "==> $file (descargando)"
    curl -fsSL -o "$VENDOR/$file" "$url"
  fi
}

fetch_lib elliptic.min.js   https://cdnjs.cloudflare.com/ajax/libs/elliptic/6.5.4/elliptic.min.js
fetch_lib crypto-js.min.js  https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js
fetch_lib qrcode.min.js     https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js

# ---------- fuentes ----------

# Google sirve woff2 solo si el User-Agent parece un navegador de escritorio; con el
# curl por defecto devuelve ttf. Cada archivo se guarda como <prefijo>-<n>.woff2 y su
# URL se reescribe dentro del CSS, para que fonts.css referencie a sus vecinos de disco.
fetch_family () {
  local family_query="$1" prefix="$2"
  local css
  css="$(curl -fsSL -A "$UA" "https://fonts.googleapis.com/css2?family=${family_query}&display=swap")"
  local i=0
  while IFS= read -r url; do
    i=$((i+1))
    curl -fsSL -o "$FONTS/${prefix}-${i}.woff2" "$url"
    css="${css//$url/${prefix}-${i}.woff2}"
  done < <(printf '%s\n' "$css" | grep -o 'https://[^)]*\.woff2' | awk '!seen[$0]++')
  printf '%s\n' "$css" >> "$FONTS/fonts.css"
}

if ! falta "$FONTS/fonts.css"; then
  echo "==> fuentes (ya están)"
elif [[ -s "$SIBLING/fonts/fonts.css" ]]; then
  echo "==> fuentes (copiadas de candado-lan)"
  cp "$SIBLING"/fonts/*.woff2 "$SIBLING/fonts/fonts.css" "$FONTS/"
else
  echo "==> fuentes (descargando woff2)"
  : > "$FONTS/fonts.css"
  fetch_family 'Zilla+Slab:wght@600;700' zillaslab
  fetch_family 'Inter:wght@400;500;600'  inter
  fetch_family 'JetBrains+Mono:wght@400;500;600' jetbrainsmono
fi

echo
echo "Listo. Contenido de vendor:"
ls -la "$VENDOR"
echo "Fuentes: $(ls "$FONTS" | wc -l) archivos"
