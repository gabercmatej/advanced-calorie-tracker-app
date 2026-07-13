#!/usr/bin/env bash
#
# Build and deploy the public web demo to Vercel — safely.
#
# Handles three gotchas that will otherwise bite you:
#   1. EXPO_PUBLIC_* vars (your Anthropic key) get inlined into the client
#      bundle. We build with .env moved aside so the demo ships key-free
#      (offline heuristic only), then hard-fail if a key leaked into the build.
#   2. Metro caches the key-inlined module, so we clear the cache (--clear).
#   3. Expo puts the icon fonts under assets/node_modules/..., and Vercel's
#      uploader drops any "node_modules" directory — which kills every icon.
#      We rename that folder and add a rewrite so the hardcoded URLs resolve.
#
# Usage:  npm run deploy:web-demo    (or: bash scripts/deploy-web-demo.sh)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STAGE="$ROOT/.web-demo-deploy"

restore_env() { [ -f "$ROOT/.env.deploybak" ] && mv "$ROOT/.env.deploybak" "$ROOT/.env"; }
trap restore_env EXIT

echo "==> Building key-free web export"
[ -f "$ROOT/.env" ] && mv "$ROOT/.env" "$ROOT/.env.deploybak"
rm -rf "$ROOT/dist"
npx expo export --platform web --clear

echo "==> Verifying no Anthropic key leaked into the bundle"
if grep -rqE "sk-ant-[a-zA-Z0-9]" "$ROOT/dist"; then
  echo "!!! ABORT: an Anthropic key is present in dist/ — refusing to deploy." >&2
  exit 1
fi
echo "    clean."

echo "==> Staging deploy folder (renaming node_modules asset dir)"
rm -rf "$STAGE"
cp -R "$ROOT/dist" "$STAGE"
[ -d "$STAGE/assets/node_modules" ] && mv "$STAGE/assets/node_modules" "$STAGE/assets/nm"

cat > "$STAGE/vercel.json" <<'JSON'
{
  "cleanUrls": true,
  "trailingSlash": false,
  "rewrites": [
    { "source": "/assets/node_modules/:path*", "destination": "/assets/nm/:path*" }
  ]
}
JSON

echo "==> Deploying to Vercel (production)"
cd "$STAGE"
npx vercel deploy --prod --yes --project calorie-tracker-ai-demo

echo "==> Done: https://calorie-tracker-ai-demo.vercel.app"
