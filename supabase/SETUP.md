# Supabase setup (cloud sync + accounts + photo storage)

CalAI runs **local-only** until you add Supabase credentials. Once you do, all
food/weight data and compressed meal photos are stored per-account in the cloud,
and auth becomes real email/password.

## 1. Create the project
1. Go to https://supabase.com → sign in → **New project**.
2. Pick a name, a strong database password, and a region near you.
3. Wait ~2 minutes for it to provision.

## 2. Create the tables, security rules, and photo bucket
1. In the project, open **SQL Editor → New query**.
2. Paste the entire contents of [`schema.sql`](./schema.sql) and click **Run**.
   - This creates `profiles`, `food_entries`, `weight_entries`, turns on
     row-level security (each user only ever sees their own rows), and creates a
     **private** `meal-photos` storage bucket with per-user access policies.
   - It is safe to re-run.

## 3. Turn on email/password sign-up
1. **Authentication → Providers → Email**: make sure **Email** is enabled.
2. Recommended for quick testing: **Authentication → Sign In / Providers → Email**
   → turn **Confirm email** *off*. Then sign-up logs you straight in.
   - If you leave confirmation on, new users must click the emailed link before
     they can sign in (the app tells them to check their email).

## 4. Paste your keys into the app
1. **Project Settings → API**. Copy the **Project URL** and the **anon public** key.
2. Open `.env` in the project root and uncomment + fill the two lines:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
   ```
   The anon key is safe to ship — row-level security is what protects data.
3. **Restart** the dev server (`npx expo start`) so the new env vars load.

## 5. Try it
- Onboard a new user (email + password ≥ 6 chars) → you're signed in.
- Log a meal with a photo → the row appears in **Table editor → food_entries**
  and a compressed `.jpg` appears in **Storage → meal-photos → <your-user-id>/**.
- Log a weight → **weight_entries**. Sign out and back in on another device →
  everything (including photos) loads from the cloud.

## Notes
- Photos are compressed in-app (resized to ≤1024px, JPEG q0.6) before upload and
  are **never** written to the phone's gallery — they only go to Storage.
- Data is scoped by `auth.uid()` via RLS, so users can never read each other's
  rows or photos even though the anon key is public.
