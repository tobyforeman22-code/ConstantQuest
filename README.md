# ConstantQuest

An interactive site for learning and drilling the famous constants of mathematics — π, e, √2, φ, γ, and more — up to 100 decimal places.

## Features

- **14 constants**: Pi, Tau, e, √2, √3, √5, Golden Ratio, Silver Ratio, Euler–Mascheroni, ln 2, ln 10, Catalan's constant, Apéry's constant, and the Plastic number.
- **Learn mode**: chunked, progressive digit reveal (5 digits at a time) with a "cover and recall" self-test toggle.
- **Quiz mode**: type each constant from memory — including the leading digit(s) and decimal point (e.g. Pi's "3.") — with live green/red feedback, a streak score, accuracy %, and timing.
- **4 difficulty levels**: Easy (25 digits), Medium (50), Hard (75), Master (100).
- **Speed Run mode**: a third mode alongside Learn/Quiz — race a 30/60/120-second countdown typing as many correct characters as possible; tracks your longest streak and correct-characters-per-minute.
- **Accounts**: sign up with a username, email, and password (via Supabase Auth).
- **Friends**: search by username, send/accept friend requests.
- **Leaderboards**: Global and Friends-only, per constant and difficulty.
- **Daily practice streak**: a 🔥 counter (current + longest) that increments once per calendar day you complete any Quiz or Speed Run attempt.
- **Achievements**: 11 badges (computed live from your progress/streak/friends data, so they can't drift out of sync) shown on the My Progress page — from "First Steps" up to "Constant Master" for mastering every constant at every difficulty.
- **Progress tracking**: best streaks and mastery badges. Signed-in users get them saved to the cloud (and synced across devices); signed-out visitors get a local, this-device-only version via `localStorage`, so the game is fully usable without an account too.

All 100-digit values were generated with [mpmath](https://mpmath.org/) at high working precision, not hand-typed, to guarantee accuracy.

## Setting up accounts, friends & leaderboards (Supabase)

Accounts/friends/leaderboards run on [Supabase](https://supabase.com) (free tier), a hosted Postgres + auth backend. The site is still 100% static — Supabase is called directly from the browser, so deployment doesn't change.

1. **Create a project** at [supabase.com](https://supabase.com) (sign in with GitHub is fine).
2. **Run the schema.** Open your project's **SQL Editor**, paste in the contents of `supabase-schema.sql` from this repo, and run it. This creates the `profiles` (including daily-streak columns), `progress`, `speedruns`, and `friendships` tables with Row Level Security policies, plus a `leaderboard_entries` view.
   - Already ran an older version of `supabase-schema.sql` before streaks/Speed Run were added? Run `supabase-migration-2-streaks-speedrun.sql` instead — it just adds the new columns/table without touching your existing data.
3. **(Recommended) Turn off email confirmation** for a simpler signup flow: **Authentication → Providers → Email → uncheck "Confirm email"**. With it off, signing up logs you in immediately. If you leave it on, ConstantQuest still handles it — new users see "check your email," and the app finishes creating their profile the next time they log in after confirming.
4. **Copy your API credentials.** Go to **Project Settings → API** and copy the **Project URL** and the **anon / public key**.
5. **Fill in `config.js`** in this repo with those two values:
   ```js
   const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJ...';
   ```
   The anon key is a public key by design — it's safe to ship in frontend code. It can't bypass the Row Level Security policies from step 2. Never put your project's `service_role` key in this file or anywhere else that ships to the browser.
6. Deploy/reload the site. If `config.js` still has the placeholder values, the app runs fine in guest-only mode (no accounts) and shows a small notice on the Sign In and Leaderboard pages.

## Running locally

This is a static site with no build step. Any static file server works, e.g.:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploying

Since it's plain HTML/CSS/JS, it deploys as-is to GitHub Pages, Netlify, Vercel, Hostinger, or any static host — just point them at this directory (`index.html` is the entry point). Remember to fill in `config.js` with your real Supabase credentials before or after deploying (it's just a static file — edit it in place on the host, or push the change and redeploy).
