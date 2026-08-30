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

# Expo reads .env, .env.local, .env.production and friends — quarantining only
# ".env" left the real key file (.env.local) in place, so the "key-free" build
# was not key-free and only the abort check below stood between the key and a
# public deploy. Move every env file Expo would load.
ENV_FILES=(.env .env.local .env.production .env.production.local)
BAK_DIR="$ROOT/.env-deploybak"

restore_env() {
  [ -d "$BAK_DIR" ] || return 0
  for f in "${ENV_FILES[@]}"; do
    [ -f "$BAK_DIR/$f" ] && mv "$BAK_DIR/$f" "$ROOT/$f"
  done
  rmdir "$BAK_DIR" 2>/dev/null || true
}
trap restore_env EXIT

echo "==> Building key-free web export"
mkdir -p "$BAK_DIR"
for f in "${ENV_FILES[@]}"; do
  [ -f "$ROOT/$f" ] && mv "$ROOT/$f" "$BAK_DIR/$f"
done
rm -rf "$ROOT/dist"
npx expo export --platform web --clear

echo "==> Verifying no secrets leaked into the bundle"
# Belt and braces: even with the env files moved aside, never ship a build that
# contains an API key or a Supabase secret key.
if grep -rqE "sk-ant-[a-zA-Z0-9]" "$ROOT/dist"; then
  echo "!!! ABORT: an Anthropic key is present in dist/ — refusing to deploy." >&2
  exit 1
fi
# Match an actual key, not the bare prefix: `src/lib/supabase.ts` contains the
# string "sb_secret" in the guard that refuses to start with one, so a
# substring search matches every build and the abort stops meaning anything.
if grep -rqE "sb_secret_[A-Za-z0-9_-]{8}" "$ROOT/dist"; then
  echo "!!! ABORT: a Supabase secret key is present in dist/ — refusing to deploy." >&2
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
