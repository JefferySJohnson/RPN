# RPN Scientific Calculator (PWA)

A reverse Polish notation (RPN) scientific calculator. No build step, no dependencies — plain HTML/CSS/JS, installable as a Progressive Web App.

## Files

- `index.html` — UI
- `styles.css` — styling
- `app.js` — RPN stack engine + UI wiring + service worker registration
- `manifest.json` — PWA manifest
- `sw.js` — service worker (offline caching)
- `icon-192.png`, `icon-512.png` — app icons
- `netlify.toml` — Netlify headers config

## How RPN entry works

Type a number, press **Enter** to push it onto the stack, then press an operator to apply it to the last two values. Example: `3 Enter 4 +` → `7`. Scientific functions (`sin`, `ln`, `√x`, etc.) apply to the top of the stack. `DEG`/`RAD` toggles the angle mode for trig functions.

## Deploy to Netlify

**Option A — drag and drop (fastest):**
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag this whole folder onto the page.
3. Done — you'll get a live URL immediately.

**Option B — Netlify CLI:**
```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod --dir .
```

**Option C — Git-based:**
Push this folder to a GitHub repo, then in Netlify: *Add new site → Import an existing project*, pick the repo, leave build command empty, set publish directory to `.`.

## Installing as a PWA

Once deployed on Netlify (HTTPS is required for service workers), open the site on:
- **Desktop Chrome/Edge:** click the install icon in the address bar, or use the in-app "Install" button.
- **Android Chrome:** menu → "Add to Home screen" / an automatic install prompt.
- **iOS Safari:** Share → "Add to Home Screen" (iOS doesn't support `beforeinstallprompt`, so use this manual step).

## Local testing

Service workers require HTTPS or `localhost`. Serve the folder locally before testing install/offline behavior:
```bash
npx serve .
# or
python3 -m http.server 8080
```
