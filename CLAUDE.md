# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

CalAI is an AI-assisted calorie/macro tracker built with Expo + React Native, targeting **iOS, Android, and web** from one codebase. Expo SDK 57, React Native 0.86, React 19, TypeScript strict mode.

## Commands

```bash
npx expo start          # dev server; press i (iOS), a (Android), w (web)
npm run ios | android | web
npx tsc --noEmit        # type-check (primary correctness gate — there is no test suite)
npm run lint            # expo lint (eslint-config-expo)
npx expo export --platform web   # full-graph bundle + static render; best "does it build" check
```

There are no unit tests. Verify changes with `npx tsc --noEmit` and, for anything touching the module graph or routing, an `npx expo export --platform web` (renders every route and also regenerates the typed-routes file at `.expo/types/router.d.ts` — run this, or `npx expo start`, after adding/renaming a route or tsc will report stale route-type errors for the new path).

## Architecture

**Routing (Expo Router, file-based).** Routes live in `src/app` (not the repo root — `src/app` is the router root). `typedRoutes` is on, so `href`/`Link` targets are type-checked against actual route files.

- `_layout.tsx` mounts every provider (see below), waits for both `AuthContext` and `DiaryContext` to hydrate, and holds the splash screen until then.
- Root-level `<Stack.Protected>` branches on `session` (from `AuthContext`):
  - **Signed out** → `(auth)/` group: `welcome.tsx` (Get Started / Sign in) → `onboarding.tsx` (the multi-step plan wizard) → `sign-in.tsx`.
  - **Signed in** → `(tabs)/` group (Home / Progress / Profile) plus modal routes: `add.tsx` (photo/description food logger, accepts an optional `?date=` param to log against a past day), `log-weight.tsx`, `entry/[id].tsx` (edit/delete a logged food). There is no separate day-detail screen — tapping a day in the Home week-strip or the Progress calendar calls `setSelectedDate` so Home re-points at that date.
- `(tabs)/_layout.tsx` renders the JS `Tabs` navigator plus a floating "+" button (not a tab) that opens `add.tsx`.

**State is split across four contexts, composed in `_layout.tsx`.** All persist to AsyncStorage via `src/lib/storage.ts` (namespaced keys in `StorageKeys`) and hydrate on mount behind a `ready` flag so hydration never clobbers storage with defaults.

- `AuthContext` — local mock session (`session: Session | null`). "Continue with Google" and email sign-in both just create a `Session` object; there is no real backend yet. Gates the root stack.
- `DiaryContext` — the main domain store: `Profile` (goals, metrics, units, theme, notification pref), `FoodEntry[]`, `WeightEntry[]`, plus derived values (`entriesForDate`, `totalsForDate`, `streak`, `loggedDates`, `weighedDates`) and `recommendation` — an adaptive, muscle-sparing calorie/macro plan for cutters from `computeAdaptivePlan()` in `nutrition.ts` (null for maintain/gain goals), which drives the Progress screen's plan card. Screens never touch storage directly — they call `useDiary()`.
- `ThemeContext` (`ResolvedThemeProvider`) — maps `profile.theme` ('light' | 'dark' only) to the active scheme; `useTheme()` / `useGradients()` read through this, not directly off `useColorScheme()`.
- `CelebrationContext` — imperative `celebrate(message)` that mounts a full-screen reward animation (`components/celebration.tsx`); fired after logging food or weight.

**The "AI" is a swappable seam.** `src/lib/ai.ts` `estimateFood({ description?, photoUri? })` is an offline keyword heuristic so the app runs with zero backend. It's meant to be replaced by a `fetch` to a server-side model proxy — keep the `FoodEstimate` return shape stable and never call an LLM provider directly from the client with a key. An `EXPO_PUBLIC_ANTHROPIC_API_KEY` in `.env` is available for local testing only; anything prefixed `EXPO_PUBLIC_` is bundled into the client, so a real release must proxy through a server instead.

**Onboarding computes a real nutrition plan.** `(auth)/onboarding.tsx` is a linear wizard (sex → workouts/week → height → weight → birth date → goal → target weight/date → diet → review → animated "calculating" → plan → account) that builds a `UserMetrics` object and calls `computeGoals()` in `src/lib/nutrition.ts` (Mifflin-St Jeor BMR × workout-volume multiplier, then a deficit/surplus sized to hit a target weight by a target date if given, else a flat default). The wizard is a `StepId` state machine (`flow` array of steps + a `validators` map + a `StepBody` switch) — adding a step means adding the `StepId`, pushing it into `flow` (conditionally if situational), adding a `validators` entry, and adding a `case` in `StepBody`.

**Layering.** `src/lib/` is pure logic (nutrition math, storage, ai, image picking, notifications) with no React. `src/context/` composes lib into app state. `src/components/` are presentational and read colors via `useTheme()`. `src/app/` screens wire context to components. Import everything via the `@/*` alias (→ `src/`).

**Theming.** All colors/spacing/radii live in `src/constants/theme.ts` as light/dark token objects; components consume them through `useTheme()` (and `useGradients()` for the `LinearGradient` color arrays). Do not hardcode colors — add a token. The look is deliberately **flat**: a single emerald accent on near-black surfaces, with `brand` gradients kept tone-on-tone (a narrow emerald→emerald ramp, never a multi-hue rainbow). There is intentionally **no colored glow and no ambient/radial backdrop** — both were removed on purpose (per design direction); don't reintroduce them or a `Shadow.glow`-style helper. Text/icons sitting on an emerald fill use the `onTint` token (dark ink in dark mode, white in light), never a hardcoded `#FFFFFF`. `Screen` renders the standard header; pass its `brand` prop for the one-line "CalorieTracker AI" bar on the tab screens. `themed-text.tsx` / `themed-view.tsx` are the base primitives; `CalorieRing` and `WeightChart` are `react-native-svg`-based.

## Conventions

- Files are kebab-case; components/types are PascalCase; the `@/*` path alias maps to `src/`.
- Cross-platform is a hard requirement: prefer RN primitives and `Platform.select`; the JS `Tabs` navigator is used (not `NativeTabs`) specifically so tabs render identically on web. Any new dependency must work on iOS, Android, and web. `expo-notifications` calls are no-ops on web by design (guarded in `src/lib/notifications.ts`) — don't add web-only fallbacks for them.
- Use `npx expo install <pkg>` (not `npm install`) so versions stay compatible with the SDK.
- Dates are plain `YYYY-MM-DD` strings ("date keys"), manipulated via helpers in `src/lib/nutrition.ts` (`toDateKey`, `fromDateKey`, `addDays`, `daysBetween`, `weekOf`, `relativeDayLabel`) — don't reach for a date library.
- Weight/height unit conversion (`kgToLb`, `lbToKg`, `cmToIn`, `ftInToCm`, `formatWeight`, `formatHeight`) also lives in `src/lib/nutrition.ts`; `profile.units` ('metric' | 'imperial') drives which unit inputs/labels default to.
