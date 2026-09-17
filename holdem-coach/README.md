# Holdem Coach

Teach and test Texas Hold’em skills — hand rankings, starting hands, pot odds, position, and street decisions.

## Play on your phone (GitHub Pages)

**Live URL (after this PR is merged to `main`):**

**https://jbwings1.github.io/east-canyon-rv-site/holdem-coach/web/**

Open that link in Safari on your iPhone.  
Optional: Share → **Add to Home Screen** for an app-like icon.

## What’s included

| Tab | Content |
|-----|---------|
| **Home** | Progress snapshot + shortcuts |
| **Learn** | Lessons on rankings, position, starting hands, pot odds, streets |
| **Practice** | Drills: identify hands, starting hands, pot odds, decisions |
| **Progress** | Scores and streak (saved in the browser) |

## Run locally (optional)

```bash
cd holdem-coach/web
python3 -m http.server 8080 --bind 0.0.0.0
```

Open `http://localhost:8080`.

## Native iOS (Mac + Xcode only)

The SwiftUI project (`../HoldemCoach.xcodeproj`) is optional. Use the web app if you don’t have a Mac.
