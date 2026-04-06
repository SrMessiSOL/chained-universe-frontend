# ER Cross-Device Architecture

This repo now supports the old same-browser delegated-session behavior again:

- delegated planets are detected from chain state
- the ER burner signer is restored from `sessionStorage`
- if the burner is missing, gameplay can still route to ER, but wallet signatures are required

## Current Auto-Commit Behavior

In this repo, the `commitFrequencyMs` argument passed to `createDelegateInstruction(...)` is real for the installed `@magicblock-labs/bolt-sdk` version.

Current value in the client:

- `ER_AUTO_COMMIT_FREQUENCY_MS = 1000`

What the frontend can honestly say today:

- delegated accounts are configured with a non-zero commit frequency
- the client polls ER logs looking for MagicBlock scheduled-commit markers after gameplay actions
- if those markers are found, the client can report an observed scheduled commit

Important nuance:

- this is still not the same as explicitly forcing a base-layer commit after each individual action
- if the client cannot find the expected ER log markers, it cannot prove that auto-commit happened
- true deterministic "save now" behavior would still need a dedicated commit-with-handler / commit-without-undelegate flow on the program side

That solves same-browser refreshes, but it does **not** solve true cross-device persistence of the ER signer.

## Why Registry Is Not Enough

`system-registry` is the right source for:

- wallet -> owned planets
- entity PDA
- planet PDA
- coordinates
- planet index

It is **not** enough to restore a delegated signer because it only stores public on-chain metadata. The ER signer requires private signing material.

## Cross-Device Options

### 1. Wallet Rebind

Flow:

- load planets from `system-registry`
- detect delegated planets from chain owner
- if this browser does not have the burner, ask the wallet to rebind delegation
- create a fresh burner for this browser/session
- continue gameplay on ER

Pros:

- fully client-side
- no custodial backend
- simplest secure upgrade path

Cons:

- at least one wallet popup when switching browser/device

### 2. Backend-Managed ER Signer

Flow:

- user authenticates with wallet
- backend stores or derives the ER signer for the account/session
- frontend sends gameplay actions to backend
- backend signs ER transactions
- backend can optionally commit state to base layer on a schedule or after each action

Pros:

- true web2-feeling experience
- works across devices
- no wallet popups for routine gameplay

Cons:

- custodial or semi-custodial trust model
- needs backend security, auth, and rate limiting

### 3. Commit-Without-Undelegate

If MagicBlock `commit_accounts` is adopted on the program side, the best UX target becomes:

- keep planets delegated
- play on ER
- commit state to base layer without undelegating
- optionally do this after each important action

That still does not restore a private signer across devices by itself, but it pairs well with the backend-managed signer model.

## Recommended Path

Short term:

- keep same-browser recovery with `sessionStorage`
- add wallet rebind flow when a delegated planet is found but no burner is present

Long term:

- move to backend-managed ER signing if the goal is truly seamless cross-device play
- combine that with commit-without-undelegate on the program side
