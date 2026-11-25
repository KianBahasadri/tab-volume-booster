#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

open_xpi() {
  local xpi="$1"
  if command -v firefox >/dev/null 2>&1; then
    firefox "$xpi" >/dev/null 2>&1 &
    echo "Opened $xpi in Firefox — click Add to install."
  else
    echo "Signed add-on ready at: $xpi"
  fi
}

version="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p; T; q' manifest.json)"
if [[ -n "$version" ]]; then
  for f in "$PWD/web-ext-artifacts/"*"-${version}.xpi"; do
    if [[ -e "$f" ]]; then
      echo "Version $version is already signed (bump \"version\" in manifest.json to sign a new build)."
      open_xpi "$f"
      exit 0
    fi
  done
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

prompted=0
if [[ -z "${WEB_EXT_API_KEY:-}" ]]; then
  read -r -p "AMO API Key (JWT issuer): " WEB_EXT_API_KEY
  prompted=1
fi
if [[ -z "${WEB_EXT_API_SECRET:-}" ]]; then
  read -r -s -p "AMO API Secret (JWT secret): " WEB_EXT_API_SECRET
  echo
  prompted=1
fi

if [[ -z "${WEB_EXT_API_KEY:-}" || -z "${WEB_EXT_API_SECRET:-}" ]]; then
  echo "Both WEB_EXT_API_KEY and WEB_EXT_API_SECRET are required." >&2
  exit 1
fi

if (( prompted )); then
  umask 077
  {
    printf 'WEB_EXT_API_KEY=%q\n' "$WEB_EXT_API_KEY"
    printf 'WEB_EXT_API_SECRET=%q\n' "$WEB_EXT_API_SECRET"
  } > .env
  chmod 600 .env
  echo "Saved AMO credentials to .env"
fi

export WEB_EXT_API_KEY WEB_EXT_API_SECRET

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
cp manifest.json background.js content.js popup.html popup.js icon.svg "$stage/"

echo "Submitting to Mozilla's unlisted signing queue (may sit on 'Waiting for approval...' for a few minutes)."
echo "If it times out, Mozilla still finishes signing — download the .xpi at https://addons.mozilla.org/developers/addons"

npx --yes web-ext sign \
  --source-dir "$stage" \
  --artifacts-dir "$PWD/web-ext-artifacts" \
  --channel=unlisted

xpi=""
for f in "$PWD/web-ext-artifacts"/*.xpi; do
  [[ -e "$f" && ( -z "$xpi" || "$f" -nt "$xpi" ) ]] && xpi="$f"
done
[[ -n "$xpi" ]] && open_xpi "$xpi"
