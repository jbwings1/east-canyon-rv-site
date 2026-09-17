# Holdem Coach

Teach and test Texas Hold’em skills — hand rankings, starting hands, pot odds, position, and street decisions.

## Use on your phone (no Mac needed)

Open the **web app**:

1. Start a simple local server from this folder, **or** open the hosted copy once it’s deployed.
2. On your phone, visit the URL in Safari/Chrome.
3. Optional: Add to Home Screen for an app-like icon (PWA).

### Run locally

```bash
cd holdem-coach/web
python3 -m http.server 8080 --bind 0.0.0.0
```

Then open `http://localhost:8080` on this machine, or `http://YOUR_LAN_IP:8080` from your phone on the same Wi‑Fi.

### What’s included

| Tab | Content |
|-----|---------|
| **Home** | Progress snapshot + shortcuts |
| **Learn** | Lessons on rankings, position, starting hands, pot odds, streets |
| **Practice** | Drills: identify hands, starting hands, pot odds, decisions |
| **Progress** | Scores and streak (saved in the browser) |

## Native iOS (Mac + Xcode only)

The SwiftUI project in the parent folder (`../HoldemCoach.xcodeproj`) is optional. Use the **web** app if you don’t have a Mac.
