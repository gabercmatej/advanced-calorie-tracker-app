# CalAI 🍎

An AI-assisted calorie & macro tracking app built with **Expo** + **React Native**.
Runs on **iOS, Android, and web** from a single codebase.

## Get started

```bash
npm install        # already done during scaffolding
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

## What's in the box

- **Expo Router** file-based routing with a bottom tab bar (Today · Log · Insights · Profile).
- **Light & dark mode** via design tokens in [`src/constants/theme.ts`](src/constants/theme.ts).
- **Local persistence** — logged meals and goals survive restarts (AsyncStorage).
- **AI food estimation** — describe a meal in plain text and get a calorie/macro estimate.
- **Zero native config needed** to start — works in Expo Go and the browser.

## Project structure

```
src/
├── app/                      # Routes (Expo Router)
│   ├── _layout.tsx           # Root: providers, splash, stack
│   ├── +not-found.tsx        # 404 route
│   └── (tabs)/               # Bottom tab group
│       ├── _layout.tsx       # Tab bar definition
│       ├── index.tsx         # Today — dashboard & meal list
│       ├── log.tsx           # Log — AI-assisted food entry
│       ├── insights.tsx      # Insights — 7-day trends
│       └── profile.tsx       # Profile — goals & preferences
├── components/               # Reusable UI (Card, Button, Screen, ProgressBar…)
├── context/DiaryContext.tsx  # App state + persistence
├── lib/
│   ├── ai.ts                 # 👉 Food estimation — swap for a real model backend
│   ├── nutrition.ts          # Calorie/macro math helpers
│   └── storage.ts            # Typed AsyncStorage wrapper
├── constants/theme.ts        # Colors, spacing, radii, fonts
├── hooks/                    # useTheme, useColorScheme
└── types/index.ts            # Domain types (FoodEntry, Goals, …)
```

## Wiring up real AI

The estimator in [`src/lib/ai.ts`](src/lib/ai.ts) ships as an offline heuristic so the
app runs with no setup. To use a real model, replace the body of `estimateFood()`
with a call to a backend you control:

```ts
const res = await fetch(`${API_BASE}/estimate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ description }),
});
return (await res.json()) as FoodEstimate;
```

Have that server prompt an LLM to return strict JSON matching `FoodEstimate`.
**Never ship a provider API key in the app** — always proxy through your server.

## Next steps

- Add a barcode / photo capture flow (`expo-camera`) to the Log screen.
- Persist to a backend so data syncs across devices.
- Add auth (`expo-auth-session`) and per-user goals.
- Replace the bar chart in Insights with `react-native-svg` for richer visuals.
