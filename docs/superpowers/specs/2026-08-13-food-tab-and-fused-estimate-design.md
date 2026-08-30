# Food tab + fused calorie estimate — design

**Date:** 2026-08-13
**Status:** approved, implementing

Two features, built together because they share a Claude transport layer and a
nutrition reference table.

1. A **Food** tab between Progress and Profile: plan-aware meal recommendations
   filtered by meal type and available ingredients, plus a small
   retrieval-backed chatbot over the user's own food log.
2. A **reworked add-food flow** that fuses several photos, a free-text
   description, and any number of scanned barcodes into one estimate, instead
   of forcing a choice between photo and barcode.

## Constraints inherited from the codebase

- Cross-platform (iOS / Android / web) is a hard requirement. No new
  dependencies — everything below uses what is already installed.
- The app runs local-only by default (Supabase env vars are commented out).
  Every AI path degrades to a deterministic offline path, matching the existing
  `estimateFood` fallback.
- Anthropic exposes no embeddings endpoint, so "RAG" here is lexical retrieval
  over in-memory entries, not a vector index. This is adequate: the entire
  corpus is a few hundred rows.
- Colours come from `src/constants/theme.ts` tokens only. Flat look preserved —
  no glow, no ambient backdrop.
- `src/lib/` stays React-free. `src/context/` composes it. `src/components/`
  reads colour through `useTheme()`.

## Architecture

### New shared layer

**`src/lib/claude.ts`** — thin transport shared by all three AI callers.
Exports `hasClaudeKey` and
`callClaude<T>({ system, content, schema, maxTokens }): Promise<T>`. It owns the
fetch, the headers, `output_config.format` JSON-schema wiring, and JSON
extraction. Throws on any failure so each caller decides its own fallback. This
replaces the transport code currently inlined in `ai.ts`.

**`src/lib/food-facts.ts`** — `FOOD_FACTS`, ~45 common foods with per-serving
kcal and macros plus a serving label. Consumed by three places: the offline
estimate heuristic, the Ask fallback ("best low-calorie high-protein foods"),
and the retrieval context sent to Claude. Removes the duplicate keyword table.

### Feature 1 — Food tab

**Routing.** `src/app/(tabs)/food.tsx` registered third in
`(tabs)/_layout.tsx`, giving Home / Progress / Food / Profile. Recipe detail is
a modal route `src/app/recipe/[id].tsx`, mirroring `entry/[id].tsx`.

**State.** New `src/context/FoodContext.tsx`, mounted in `_layout.tsx`. Holds
pantry ingredient ids, favourite recipe ids, hidden recipe ids, AI-generated
recipes, and chat history. Persists each through `storage.ts` under new
`StorageKeys` entries, hydrating behind a `ready` flag. It reads `useDiary()`
for entries and goals rather than duplicating them. It is deliberately *not*
added to the splash gate in `_layout.tsx` — the Food tab renders a skeleton
while it hydrates, so app start-up is unaffected.

**Data.** `src/lib/recipe-data.ts` holds `INGREDIENTS` (~40 items grouped
protein / carbs / veg / dairy / pantry) and `RECIPES` (~40 curated, biased to
high-protein and low-calorie). Split from logic so neither file gets unwieldy.

**Logic.** `src/lib/recipes.ts`:

- `tasteProfile(entries)` — tokenises logged entry names over the last 60 days
  into a recency-weighted `Map<string, number>`.
- `scoreRecipe(recipe, ctx)` — sums fit to *remaining* calories and protein for
  the day, pantry coverage, diet compatibility, taste affinity, and a fixed
  boost for favourites.
- `filterRecipes(ctx)` — returns `{ ready, oneShort }` so the list is never
  empty when the pantry is sparse.
- `suggestRecipes(ctx)` — the Claude path. Returns `Recipe[]` shaped exactly
  like bundled ones so the UI cannot tell them apart. Offline it deals unseen
  cards from the bundled library instead of failing.

**Ideas surface**, top to bottom: a headroom line ("1,240 kcal · 78 g protein
left today"), a meal segmented control defaulting by time of day, a collapsible
"What I have" chip panel, ranked recipe cards, a dimmed "1 item short" section,
and a "Generate ideas" button.

**Ask surface.** `src/lib/food-qa.ts`:

- `buildContext(question, entries, profile)` assembles a compact block —
  entries whose names share tokens with the question (max 40, newest first),
  the last 14 days of daily totals, current goals and streak, the top 15
  most-logged foods with average kcal and protein, and `FOOD_FACTS`.
- `askFoodQuestion(question, context)` makes one Claude call whose system
  prompt forbids answering outside the supplied data and requires an explicit
  "you have not logged that" when a food is absent.
- Offline, a deterministic answerer covers the two shapes named in the brief:
  "when did I eat X" scans entries; "best low-calorie high-protein foods" sorts
  `FOOD_FACTS` by protein-per-calorie. Anything else returns a short prompt
  explaining what it can answer.

Chat is strictly read-only. It never writes a `FoodEntry`.

### Feature 2 — fused add-food estimate

**Capture.** `add.tsx` becomes one surface with no mode switch:

- A horizontal photo strip, up to 4 photos, each removable. The trailing "+"
  tile opens Camera / Gallery / Scan barcode.
- Scanning adds a **chip**, not a photo: name, per-unit kcal, and an editable
  count. The scanner stays open so several products can be scanned in a row.
- The description field and meal segmented control are unchanged.
- One primary button, `Calculate calories`, enabled as soon as there is at
  least one photo, one chip, or some text.

**Estimate.** `estimateFood` takes `photos: PickedPhoto[]` and
`knownItems: KnownItem[]`, and builds one message containing every image block
followed by a text block. The prompt states that known items came from product
labels and are exact — multiply by count, never re-estimate — that Claude
should estimate only what is visibly *additional*, and that multiple photos are
one meal from different angles so nothing should be double-counted.

The JSON schema gains an `items[]` array beside the existing totals. Each item
carries `source: 'label' | 'estimate'`, which the review card renders as a
"label" or "photo" marker. The `FoodEstimate` return shape is extended
additively, so the swappable-seam contract in CLAUDE.md holds.

Offline, the heuristic sums known items exactly and adds `FOOD_FACTS` keyword
matches for the description, producing the same `items[]` shape.

**Storage.** `FoodEntry` gains optional `items?: EntryItem[]` and
`photoUris?: string[]`. `photoUri` stays as the first photo so existing
entries, the Home list, and the Supabase upload path are untouched.
`entry/[id].tsx` renders the breakdown read-only when present.

**Model.** Stays on `claude-haiku-4-5`, as the file already documents. Four
photos costs roughly $0.006 per meal. Swapping to `claude-sonnet-5` is a
one-line change if fusion accuracy proves to matter more than cost.

## Files

**New:** `src/lib/claude.ts`, `src/lib/food-facts.ts`, `src/lib/recipe-data.ts`,
`src/lib/recipes.ts`, `src/lib/food-qa.ts`, `src/context/FoodContext.tsx`,
`src/app/(tabs)/food.tsx`, `src/app/recipe/[id].tsx`,
`src/components/chip.tsx`, `src/components/recipe-card.tsx`,
`src/components/photo-strip.tsx`, `src/components/chat-bubble.tsx`,
`src/components/stepper.tsx`.

**Modified:** `src/types/index.ts`, `src/lib/storage.ts`, `src/lib/ai.ts`,
`src/app/_layout.tsx`, `src/app/(tabs)/_layout.tsx`, `src/app/add.tsx`,
`src/app/entry/[id].tsx`, `src/components/barcode-scanner.tsx`.

## Verification

There is no test suite. Correctness gates are `npx tsc --noEmit` and
`npx expo export --platform web`, the latter also regenerating typed routes for
the two new paths. Then a manual pass in Chrome.
