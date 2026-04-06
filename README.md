# Chained Universe Frontend

Frontend for an on-chain space strategy game built on Solana with BOLT ECS and MagicBlock session/delegation flows.

This app lets players:
- connect a Solana wallet
- create a homeworld
- build structures and ships
- research technologies
- launch transport and colonize missions
- resolve missions on-chain
- browse nearby systems in the galaxy view

## Stack

- React 18
- TypeScript
- Vite 8
- `@solana/web3.js`
- Anchor
- `@magicblock-labs/bolt-sdk`
- Solana wallet adapter

## Repository Layout

- [src/App.tsx](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/src/App.tsx)
  Main UI, tabs, wallet flow, transaction actions, loading states.
- [src/game.ts](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/src/game.ts)
  Core game client, PDA derivation, Solana transaction construction, serialization/deserialization, gameplay actions.
- [src/GalaxyTab.tsx](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/src/GalaxyTab.tsx)
  Galaxy/system UI.
- [src/GalaxyMap.tsx](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/src/GalaxyMap.tsx)
  Canvas-based system map.
- [src/constants.ts](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/src/constants.ts)
  Shared program IDs and static constants.
- [src/main.tsx](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/src/main.tsx)
  App bootstrap, wallet providers, browser polyfills for `Buffer` and `process`.
- [src/index.css](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/src/index.css)
  Global app styling.
- [scripts/init-shared-world.mjs](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/scripts/init-shared-world.mjs)
  Helper script for shared world setup.

## Requirements

- Node.js 18+ recommended
- npm
- A Solana wallet such as Phantom or Solflare

## Install

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

Default Vite URL:

```text
http://localhost:5173
```

## Build

```bash
npm run build
```

## Preview Production Build

```bash
npm run preview
```

## Environment and Browser Notes

This project uses browser-safe polyfills for packages that expect Node globals:

- `Buffer`
- `process`

Those are configured in:

- [src/main.tsx](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/src/main.tsx)
- [vite.config.ts](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/vite.config.ts)

If local Vite development starts failing with `Outdated Optimize Dep` or cache issues, clear the Vite cache and restart:

```bash
rm -rf node_modules/.vite
npm run dev -- --force
```

If you are developing from WSL on `/mnt/c/...`, Vite cache writes can be flaky. Running from native Windows or from the WSL filesystem is usually more reliable.

## Game Flow

### Homeworld creation

The frontend currently creates a homeworld by:

1. creating a BOLT entity
2. initializing the required components
3. applying `systemInitialize`
4. registering the planet in the registry program

### Colony creation

The frontend currently creates a colony by:

1. reading colonize mission data from the source fleet
2. creating a new entity
3. initializing colony components
4. applying `systemInitializeNewColony`
5. registering the new planet
6. resolving the colonize mission only after the colony succeeds

### Missions

- Transport launch expects target coordinates
- Colonize launch expects target coordinates plus colony name
- Colonize resolution uses mission data already stored on-chain

## Solana / Program Configuration

Important program IDs live in:

- [src/game.ts](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/src/game.ts)
- [src/constants.ts](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/src/constants.ts)

These include:

- component programs
- gameplay system programs
- registry program
- world PDA
- MagicBlock ER/router endpoints

Before deploying or testing against a different environment, verify these IDs and RPC endpoints match the currently deployed programs.

## Deployment

This project is intended to deploy as a static Vite frontend, including Vercel.

If Vercel install fails:

- check dependency peer-version conflicts in `package.json`
- make sure `package-lock.json` is committed
- redeploy after dependency updates

## ER Sessions

Notes about same-browser delegated recovery and the longer-term cross-device ER signer model live in [docs/er-cross-device-architecture.md](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/docs/er-cross-device-architecture.md).

## Git Notes

If this folder was started outside Git, you can attach it to an existing remote like this:

```bash
git init
git remote add origin <repo-url>
git fetch origin
git pull origin main --allow-unrelated-histories --no-rebase
```

Then commit and push your local changes.

## Troubleshooting

### `process is not defined`

Check:

- [src/main.tsx](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/src/main.tsx) sets `globalThis.process`
- [vite.config.ts](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/vite.config.ts) aliases `process/browser`

### `buffer` externalized for browser compatibility

Check:

- `buffer` is installed as a dependency
- [vite.config.ts](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/vite.config.ts) aliases `buffer/`
- [src/main.tsx](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/src/main.tsx) sets `globalThis.Buffer`

### App keeps reloading planet data

This was previously caused by a React dependency loop around the selected planet and planet loading callback. If it reappears, inspect:

- [src/App.tsx](/abs/path/c:/chained-universe-frontend-main/chained-universe-frontend-main/src/App.tsx)

### Wallet / transaction issues

Verify:

- wallet is connected
- the configured program IDs are correct
- the selected RPC endpoint is healthy
- the shared world and registry programs are initialized on the target cluster

## Scripts

Available npm scripts:

```bash
npm run dev
npm run build
npm run preview
```

## License

No license file is currently included in this repository.
