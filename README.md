# ConstantQuest

An interactive site for learning and drilling the famous constants of mathematics — π, e, √2, φ, γ, and more — up to 100 decimal places.

## Features

- **14 constants**: Pi, Tau, e, √2, √3, √5, Golden Ratio, Silver Ratio, Euler–Mascheroni, ln 2, ln 10, Catalan's constant, Apéry's constant, and the Plastic number.
- **Learn mode**: chunked, progressive digit reveal (5 digits at a time) with a "cover and recall" self-test toggle.
- **Quiz mode**: type the digits from memory with live green/red feedback, a streak score, accuracy %, and timing.
- **4 difficulty levels**: Easy (25 digits), Medium (50), Hard (75), Master (100).
- **Progress tracking**: best streaks and mastery badges are saved in the browser (`localStorage`) per constant and difficulty, visible on the home grid and the "My Progress" page.

All 100-digit values were generated with [mpmath](https://mpmath.org/) at high working precision, not hand-typed, to guarantee accuracy.

## Running locally

This is a static site with no build step. Any static file server works, e.g.:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploying

Since it's plain HTML/CSS/JS, it deploys as-is to GitHub Pages, Netlify, Vercel, or any static host — just point them at this directory (`index.html` is the entry point).
