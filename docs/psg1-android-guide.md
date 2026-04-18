# PSG1 Controls And Android APK

This frontend is a Vite + React web app, so there are two separate pieces to make it work well on a Play Solana PSG1:

1. Add controller-friendly input logic in the web UI.
2. Wrap the built web app in an Android container so it can be shipped as an APK.

## PSG1 Control Model

The current app is menu-driven rather than character-driven, so the controller layer should be mapped like this:

- `D-Pad / Left Stick`: move focus between interactive controls.
- `A`: activate the focused button or menu item.
- `B`: close the current modal or go back to the previous shell state.
- `L / R`: cycle tabs.
- `Start / Select`: open the main menu on mobile, or toggle the vault menu on desktop layouts.

Implementation added in this repo:

- `src/usePsg1Controls.ts`
  Polls the browser Gamepad API and maps PSG1-style controls onto DOM focus and click behavior.
- `src/App.tsx`
  Wires controller back/menu/tab cycling into the app shell and marks custom nav items as focusable.
- `src/GalaxyTab.tsx`
  Makes galaxy rows controller-focusable so transport and colonize flows can be reached without touch.

## Why This Works On PSG1

Play Solana documents the PSG1 buttons as:

- `A`: confirm / interact
- `B`: cancel / back
- `D-Pad`: directional navigation
- `Left Analog Stick`: primary movement / directional control
- `Start`: menus
- `L / R`: quick actions or modifiers

That matches a standard web `Gamepad API` style adapter well enough for menu navigation.

## APK Build Path

This repo does not currently include a native Android wrapper. The recommended path is Capacitor:

1. Install Capacitor packages:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
```

2. Initialize Capacitor from the repo root:

```bash
npx cap init chained-universe com.chaineduniverse.app --web-dir=dist
```

3. Build the web app:

```bash
npm run build
```

4. Add Android:

```bash
npx cap add android
```

5. Sync the built web assets into Android:

```bash
npx cap sync android
```

6. Open Android Studio:

```bash
npx cap open android
```

7. In Android Studio, build either:

- `Build > Build Bundle(s) / APK(s) > Build APK(s)` for a debug or release APK, or
- use Capacitor CLI for release builds once signing is configured.

Example CLI release build:

```bash
npx cap build android --androidreleasetype APK
```

## Android Notes For This Project

- Wallet adapters that depend on browser extension wallets usually need an in-app wallet or deep-link/mobile wallet strategy for production Android builds.
- The current frontend is optimized for desktop/mobile browser layouts, so test modal sizing and wallet flows on the PSG1 device itself.
- If you package the app with Capacitor, set the Android WebView to point at the locally bundled assets instead of a remote URL for the most reliable offline startup.
