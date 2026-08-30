# CalorieTracker AI 🍎

A personal AI-powered calorie & macro tracker I built as my own alternative to Cal AI.
I wanted the same experience without paying a yearly subscription, so I created an app that costs less than €1/month to run while still providing accurate AI-powered food analysis.
Beyond photo recognition, you can improve estimates by adding a meal description, scan barcodes for exact nutrition data, and follow an adaptive calorie and macro plan that evolves with your goals and progress.

Built with **Expo** + **React Native**.
Runs on **iOS, Android, and web** from a single codebase.

A **premium, dark-first UI** built around a focused emerald accent on flat
near-black surfaces — fluid spring animations, animated progress rings, and
delightful micro-interactions throughout.

## 🌐 Live demo

**Try it in your browser → [calorie-tracker-ai-demo.vercel.app](https://calorie-tracker-ai-demo.vercel.app)**

> ⚠️ **This is a demo build.** It is exported with **no backend configured**, so
> every AI feature falls back to its offline behaviour: food estimation runs a
> keyword heuristic over the bundled food library instead of the vision model,
> and **Food → Ideas** ranks only the recipes bundled into the app. There is no
> API key in the bundle and no proxy for it to call, so the demo cannot spend
> anyone's Anthropic credit. Data lives in your browser's local storage and is
> never synced. For real AI estimates and cloud sync, clone the repo and point it
> at your own Supabase project (see [Configuration](#configuration) below).

## 📱 The interface

<p align="center">
  <img src="docs/screenshots/welcome.png"  alt="Welcome"  width="19%">
  &nbsp;
  <img src="docs/screenshots/home.png"     alt="Home — today's dashboard"  width="19%">
  &nbsp;
  <img src="docs/screenshots/progress.png" alt="Progress — weight trends"  width="19%">
  &nbsp;
  <img src="docs/screenshots/food.png"     alt="Food — meal ideas ranked against what's left today"  width="19%">
  &nbsp;
  <img src="docs/screenshots/profile.png"  alt="Profile — goals & settings"  width="19%">
</p>

<p align="center"><sub><b>Welcome</b> · <b>Home</b> dashboard with animated calorie ring &amp; floating nutrient chips · <b>Progress</b> weight trends &amp; adaptive plan · <b>Food</b> meal ideas ranked against the calories &amp; protein you have left · <b>Profile</b> settings</sub></p>

## Get started

```bash
npm install
npx expo start     # then press i (iOS), a (Android), or w (web)
```

Other scripts:

```bash
npm run ios        # open iOS simulator
npm run android    # open Android emulator
npm run web        # open in the browser
npm run lint       # expo lint
npx tsc --noEmit   # type-check
```

The app runs out of the box with **no configuration** — food estimation falls
back to an offline heuristic and data is stored locally. Add an Anthropic key
and a Supabase project (below) to unlock real AI estimates and cloud sync.

## What's in the box

- **Expo Router** file-based routing with a bottom tab bar (Home · Progress · Food · Profile) plus modal screens for logging.
- **Onboarding wizard** that collects your stats and computes a personalized calorie/macro plan (Mifflin-St Jeor BMR × activity, adjusted toward a target weight/date).
- **AI food logging** — snap a photo and/or describe a meal and get a calorie + macro estimate from Claude's vision model, with an offline keyword heuristic as a no-key fallback.
- **Barcode scanning** — scan a packaged product's barcode for exact, label-sourced nutrition (via the free [Open Food Facts](https://world.openfoodfacts.org) database). More accurate than a photo guess for anything with a label.
- **Food ideas & Ask** — a Food tab that ranks 100+ bundled recipes against what you
  actually have in the pantry and the calories/protein you have *left today*, learning
  from what you have logged before; plus a read-only Ask surface that answers questions
  about your own food log. Both work without a backend, and get better with one.
- **Weight tracking** with an SVG trend chart and projection toward your goal.
- **Accounts & cloud sync** — optional Supabase email/password auth; meals, weights, and compressed meal photos sync per-user across devices (local-only until configured).
- **Premium, motion-rich design** — a dark-first theme built around a focused emerald accent on flat near-black surfaces, animated calorie rings, smoothly-filling macro bars, shimmer loading states, confetti on streak milestones, and haptic feedback. All colors/shadows live as tokens in [`src/constants/theme.ts`](src/constants/theme.ts); light & dark are both first-class.
- **Streak reminders** — optional local notifications (no-ops on web).

## Project structure

```
src/
├── app/                      # Routes (Expo Router)
│   ├── _layout.tsx           # Root: providers, splash, auth-gated stack
│   ├── +not-found.tsx        # 404 route
│   ├── add.tsx               # Log food — photo / description / barcode
│   ├── log-weight.tsx        # Log a body-weight measurement
│   ├── entry/[id].tsx        # Edit or delete a logged food
│   ├── (auth)/               # Signed-out group: welcome → onboarding → sign-in
│   └── (tabs)/               # Signed-in bottom tabs
│       ├── index.tsx         # Home — today's dashboard & meal list
│       ├── progress.tsx      # Progress — weight chart, streak, calendar
│       ├── food.tsx          # Food — ranked meal ideas + Ask your log
│       └── profile.tsx       # Profile — goals & preferences
├── components/               # Reusable UI (Card, Button, Field, CalorieRing, WeightChart, BarcodeScanner…)
├── context/                  # App state: Auth, Diary, Theme, Food, Celebration
├── lib/
│   ├── claude.ts             # The one AI transport — calls the Supabase Edge Function
│   ├── ai.ts                 # Fused photo/description/barcode estimation (+ fallback)
│   ├── recipes.ts            # Ranks meal ideas against pantry & remaining budget
│   ├── food-qa.ts            # The Ask surface — retrieval over your own log
│   ├── recipe-data.ts        # Bundled ingredients & recipes
│   ├── food-library.ts       # ~300 foods per 100 g, with named portions
│   ├── barcode.ts            # Barcode → nutrition via Open Food Facts
│   ├── nutrition.ts          # Calorie/macro/BMR math + date & unit helpers
│   ├── weight-trend.ts       # Smoothed bodyweight & Theil–Sen rate fitting
│   ├── sync.ts / merge.ts    # Pure sync decisions & union merge (heavily tested)
│   ├── image.ts              # Camera/library photo picking + compression
│   ├── supabase.ts           # Supabase client (cloud sync)
│   ├── remote.ts             # Cloud persistence
│   ├── notifications.ts      # Local streak reminders
│   └── storage.ts            # Typed AsyncStorage wrapper
├── constants/theme.ts        # Colors, spacing, radii, fonts
├── hooks/                    # useTheme, useColorScheme, useEntryPhoto
└── types/index.ts            # Domain types (FoodEntry, Goals, Profile…)
```

## Configuration

Both are optional — the app works local-only without them. Copy your keys into
`.env` (gitignored) and restart the dev server.

### AI food estimation (Anthropic)

The Anthropic key is **not** an app environment variable. It lives as a Supabase
secret behind an Edge Function, so it is never compiled into the bundle:

```
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy claude
```

[`src/lib/claude.ts`](src/lib/claude.ts) sends the signed-in user's Supabase
access token to that function, which verifies the session, counts the call
against a per-user daily limit, and forwards it to Claude Haiku (the cheapest
vision model). Without a Supabase project configured, `estimateFood` falls back
to an offline keyword heuristic over the bundled food library, so the logger
always works. Barcode scanning needs no key at all.

> ⚠️ **Never reintroduce `EXPO_PUBLIC_ANTHROPIC_API_KEY`.** Every
> `EXPO_PUBLIC_` variable is inlined into the JavaScript bundle and is readable
> by anyone with the app or the web build — and a leaked Anthropic key is a
> bill, not just an exposure. There is deliberately no direct-to-Anthropic
> fallback in the client for the same reason.

### Cloud sync & accounts (Supabase)

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor to
create the tables, row-level security, and the AI usage limiter. It is
idempotent and additive, so it is also the upgrade path for an existing
project. Meal photos are **not** uploaded — they stay on the device, which is
what keeps years of logging inside the free tier. Full
walkthrough in [`supabase/SETUP.md`](supabase/SETUP.md). The anon key is safe to
ship — RLS is what protects each user's data.
