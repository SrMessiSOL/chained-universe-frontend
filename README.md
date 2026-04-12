# Chained Universe Frontend

Frontend for an on-chain space strategy game on Solana built with React, TypeScript, BOLT ECS, and MagicBlock delegation.

The current app supports:
- wallet connection with Phantom and Solflare
- first-time homeworld creation
- multi-planet account loading and planet switching
- resource production, storage, and power tracking
- building and research queues
- shipyard production and fleet launch flows
- transport and colonize missions with on-chain resolution
- galaxy browsing with owned-vs-foreign planet visibility
- ANTIMATTER wallet balance display and market trading
- vault-backed gameplay signing and recovery flows
- desktop and mobile navigation

## Current Status

The frontend is wired for Solana devnet and assumes the deployed program IDs in `src/constants.ts` and `src/game.ts` are correct for the target environment.

Important current behavior:
- a connected wallet with no planets sees the homeworld initialization flow first
- the `Market` tab only appears after the connected wallet has at least one created world
- after initial setup, gameplay can be signed through the in-app vault instead of requiring a wallet popup for every action

## Programs Repository

This repository is only the frontend.

The on-chain programs, registry logic, and deployment flow live in the main Chained Universe repository:
- https://github.com/SrMessiSOL/chained-universe

If you are setting this project up from scratch, deploy and configure the on-chain programs there first, then point this frontend at the deployed addresses.

Recommended setup order:
1. Clone and set up the programs repo: `https://github.com/SrMessiSOL/chained-universe`
2. Deploy the on-chain programs and initialize the required world / registry accounts there
3. Copy the deployed program IDs, world PDA, registry addresses, RPC settings, and token mint values
4. Update this frontend's configuration in `src/constants.ts` and `src/game.ts`
5. Install dependencies in this frontend and run it locally

## Tech Stack

- React 18
- TypeScript 5
- Vite 8
- Anchor
- `@solana/web3.js`
- `@magicblock-labs/bolt-sdk`
- Solana wallet adapter

## Repository Layout

- `src/App.tsx`
  Main app shell, tab rendering, wallet lifecycle, vault UI, gameplay actions, and transaction state.
- `src/game.ts`
  Core game client, account derivation, transaction construction, delegation helpers, and on-chain state loading.
- `src/Markettab.tsx`
  Market UI for listing, browsing, buying, and cancelling offers.
- `src/market-client.ts`
  Market PDA derivation, market account decoding, and market transaction helpers.
- `src/GalaxyTab.tsx`
  Galaxy system browser and mission launch entry points.
- `src/GalaxyMap.tsx`
  Zoomable map rendering for owned and foreign planets.
- `src/constants.ts`
  Shared program IDs, RPC constants, building definitions, and ship definitions.
- `src/main.tsx`
  App bootstrap, wallet providers, Solana connection provider, and browser polyfills.
- `docs/er-cross-device-architecture.md`
  Notes on the current delegation, burner, vault recovery, and cross-device model.
- `scripts/init-shared-world.mjs`
  Helper script for shared world setup.

## Requirements

- Node.js 18 or newer
- npm
- A Solana wallet such as Phantom or Solflare

## Installation

```bash
npm install
```

## Local Development

```bash
npm run dev
```

Default Vite URL:

```text
http://localhost:5173
```

## Production Build

```bash
npm run build
```

## Preview Build

```bash
npm run preview
```

## Wallet, Vault, and Signing Model

The current frontend uses two related but separate ideas:

1. Wallet connection
- used for login, first-time setup, and privileged recovery flows
- Phantom and Solflare are configured in `src/main.tsx`

2. Vault-backed gameplay
- on first homeworld creation, the app prepares a vault flow for routine gameplay signing
- the vault UI shows readiness state, SOL balance, retry-password actions, and force-rotate actions
- the vault manager also supports transferring all planet ownership to a clean wallet if needed

Recovery behavior visible in the current UI:
- create a recovery password for the encrypted vault backup
- retry password if the backup exists but decryption fails
- rotate to a fresh vault when recovery is not possible

## Gameplay Overview

### Homeworld Initialization

When a wallet has no created world yet, the frontend shows the homeworld setup screen.

The current initialization flow prepares gameplay access by:
- preparing the vault flow
- creating the planet entity and required components
- applying the initialize system
- registering the planet in the registry program
- reloading the player's planets and selecting the newly created world

### Planet Management

- all owned planets are loaded from on-chain state
- the selected planet drives the visible economy, queue, fleet, and market context
- if a wallet owns multiple planets, both desktop and mobile UIs expose planet switching

### Research, Building, and Shipyard

The app currently supports:
- timed building upgrades
- timed research progression
- shipyard queues
- instant-finish actions where supported by the current token flow

### Missions

The app currently supports:
- transport missions
- colonize missions
- mission resolution from the Missions tab
- direct mission launch from the Galaxy tab

Attack flows are not part of the main playable UI yet.

### Market

The market is a player-to-player resource-for-ANTIMATTER trading flow.

Current behavior:
- the market is only shown once the connected wallet has at least one created planet
- the active selected planet is the source or destination context for market actions
- players can browse offers, create sell offers, buy offers, and cancel their own offers
- market configuration and escrow setup still expose admin-oriented controls when the market is not initialized on-chain

## Solana Configuration

Important IDs and RPC constants live in:
- `src/constants.ts`
- `src/game.ts`

Before deploying to another environment, verify:
- world and component program IDs
- system program IDs
- registry program ID
- shared world PDA
- MagicBlock router / ER endpoints
- ANTIMATTER mint configuration

## Browser and Build Notes

This project uses browser-safe polyfills for packages that expect Node globals:
- `Buffer`
- `process`

Those are configured in:
- `src/main.tsx`
- `vite.config.ts`

If local Vite development starts failing with cache issues, clear the Vite cache and retry:

```bash
rm -rf node_modules/.vite
npm run dev -- --force
```

On Windows PowerShell, `npm.ps1` can be blocked by execution policy. If that happens, use `npm.cmd` instead.

If Vite fails with a `Cannot find native binding` error from `rolldown`, reinstall dependencies so the optional native package is restored:

```bash
rm -rf node_modules package-lock.json
npm install
```

## Troubleshooting

### Wallet connects but no gameplay UI appears

Check whether the wallet owns any worlds yet. A wallet with no created planet will see the homeworld initialization flow instead of the gameplay tabs.

### Market tab is missing

This is expected when the connected wallet has not created a world yet. The market is hidden until at least one planet exists for that wallet.

### `process is not defined`

Verify:
- `src/main.tsx` sets `globalThis.process`
- `vite.config.ts` aliases `process/browser`

### `buffer` externalized for browser compatibility

Verify:
- `buffer` is installed as a dependency
- `vite.config.ts` aliases `buffer/`
- `src/main.tsx` sets `globalThis.Buffer`

### Wallet or transaction failures

Verify:
- the wallet is connected
- devnet is healthy
- the configured program IDs match the deployed programs
- the shared world and registry programs are initialized on the target cluster
- the vault recovery state is healthy if gameplay is expected to use vault signing

## Scripts

Available npm scripts:

```bash
npm run dev
npm run build
npm run preview
```

## Additional Docs

- [ER Cross-Device Architecture](docs/er-cross-device-architecture.md)

## License

No license file is currently included in this repository.
