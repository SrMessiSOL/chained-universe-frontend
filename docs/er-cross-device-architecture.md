# ER Cross-Device Architecture

This document describes the current state of delegated gameplay, burner persistence, and vault recovery in the frontend.

## Current Model

The current frontend combines three pieces:
- a connected wallet for identity, first-time setup, and recovery-required actions
- an ephemeral rollup burner signer for delegated gameplay paths
- a vault flow with encrypted recovery for routine gameplay signing in the app UI

These pieces solve different problems and should not be treated as interchangeable.

## What Exists Today

### 1. Browser-stored ER burner recovery

The ER burner is still restored from browser storage in the current client.

Current behavior in `src/game.ts`:
- the client first looks for `_er_burner` in `sessionStorage`
- it also migrates an older `localStorage` value into `sessionStorage` if needed
- if a stored burner is found, delegated gameplay can resume without creating a fresh burner immediately
- if no stored burner is found, delegated planets can still be detected on-chain, but the app falls back to wallet-signed or newly funded delegation flows until a new burner is created

What this means in practice:
- same-browser continuity works
- true cross-device burner restoration does not exist yet
- browser storage is convenience, not durable cross-device recovery

### 2. On-chain vault recovery flow

The UI now includes a stronger recovery model around the gameplay vault.

Current visible behavior in `src/App.tsx`:
- users can create a recovery password for the encrypted vault backup
- the app can report `wrong_password` and `backup_missing` states
- users can retry the password flow
- users can rotate to a fresh vault if recovery is no longer possible
- users can transfer all planets to a clean wallet from the vault manager

What this solves:
- recovery of the vault-backed gameplay path is no longer just a browser-session concern
- the app has a user-facing recovery story beyond raw burner persistence

What it does not solve by itself:
- automatic cross-device restoration of the ER burner signer
- a backend-managed, always-available signer model

### 3. Delegated gameplay through MagicBlock

The frontend still supports delegated account flows through MagicBlock.

Current behavior:
- delegated targets are discovered from on-chain state
- the client can create and fund a burner wallet when needed
- component delegation may be batched across multiple transactions
- undelegation also supports retries and batching
- the client polls for scheduled commit markers and compares state when needed

The current auto-commit setting in `src/game.ts` is:
- `ER_AUTO_COMMIT_FREQUENCY_MS = 1000`

That means the client is configured for scheduled commits, but it is still not identical to an explicit force-commit-after-every-action architecture.

## Why Registry Data Is Not Enough

`system-registry` is the right source for public ownership and coordinate metadata such as:
- wallet to owned planets
- entity PDA
- planet PDA
- coordinates
- planet index

It is not enough to restore private signing material. Neither the burner signer nor the vault secret can be reconstructed from registry metadata alone.

## Current Recovery Story

Today the practical recovery story looks like this:

1. Same browser or same session
- restore the ER burner from browser storage when available
- continue delegated gameplay without forcing a new burner immediately

2. New browser or new device
- the burner is usually not available
- the app can still detect owned or delegated planets from chain state
- wallet approval is required to re-establish the delegated path or rotate to a new usable signing setup

3. Vault issues
- if the encrypted backup exists but password entry fails, prompt for retry
- if no usable backup exists, rotate to a new vault and re-establish trusted gameplay signing
- if compromise is suspected, transfer all planets to a clean wallet

## Cross-Device Options Going Forward

### Option 1: Wallet rebind only

Flow:
- load owned planets from registry
- detect whether delegated state exists
- if no local burner is available, ask the wallet to create and fund a new burner for this browser
- continue gameplay with the new delegated path

Pros:
- fully client-side
- no custodial backend
- easiest path from the current codebase

Cons:
- still requires wallet interaction on new devices
- burner continuity is not portable by itself

### Option 2: Backend-managed signer

Flow:
- authenticate the user with wallet ownership
- backend manages or derives the gameplay signer
- frontend sends gameplay intents to the backend
- backend signs delegated actions and can coordinate commit behavior

Pros:
- best cross-device UX
- fewer wallet prompts for routine play
- easier centralized monitoring and recovery tooling

Cons:
- custodial or semi-custodial trust model
- backend auth, rate limiting, and key management become critical

### Option 3: Commit-without-undelegate plus managed signing

If the program side adopts a reliable commit-without-undelegate flow, the best long-term UX becomes:
- keep planets delegated
- use a stable signer model
- commit state when needed without tearing down delegation every time
- pair that with either wallet rebind or backend-managed signing depending on trust requirements

## Recommended Path

Short term:
- keep the current browser-stored burner recovery
- keep the current on-chain vault recovery UX
- add any missing wallet rebind UX for cases where delegated state exists but no local burner is recoverable

Medium term:
- make the cross-device rebind flow explicit in the UI so users understand why a wallet signature is required
- keep vault rotation and transfer-to-clean-wallet flows as the operational safety path

Long term:
- move to backend-managed signing if the product goal is truly seamless cross-device gameplay with minimal wallet friction
- pair that with a deterministic commit strategy on the program side
