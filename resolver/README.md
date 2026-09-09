# Oraclon Resolver Watcher

An autonomous agent that watches open disputes across both chains and
triggers GenLayer resolution the moment both agents have staked on Base
Sepolia — no human has to notice and click "Resolve."

## Why this is deterministic, not an LLM call

The real judgment in Oraclon — is Agent A's claim accurate, is Agent B's
— already happens through genuine multi-validator consensus inside
`resolve_dispute()` on GenLayer. This watcher's only job is noticing
"both stakes are in" and firing that real judgment. That's a plain state
check (`status === BothStaked`), not a decision that benefits from an
LLM — wrapping it in one would be decorative, not real autonomy. What
makes this genuinely autonomous is that it runs unattended, monitors two
separate chains, and takes a real on-chain action without a person
watching for it.

## What it does, each cycle

1. Reads every dispute from GenLayer via `list_disputes()`.
2. For each dispute still `"submitted"` (unresolved), reads the matching
   dispute on `OraclonEscrow.sol` (Base Sepolia).
3. If Base Sepolia confirms `BothStaked`, calls `resolve_dispute()` on
   GenLayer.
4. If not, waits and checks again next cycle.

Tracks disputes currently being resolved in memory so a slow consensus
round (which can take several minutes) doesn't get triggered twice.

## Setup

```bash
npm install
cp .env.example .env
```

Set `RESOLVER_PRIVATE_KEY` to any funded GenLayer StudioNet account —
this does not need to be either agent's key or the relayer's key, since
`resolve_dispute()` has no caller restriction on GenVM.

## Run

```bash
node resolver.js
```

Runs continuously until stopped (Ctrl+C). Intended to run in a
Codespace, or any always-on terminal, during a demo window — this
project has no hosting budget for a persistent public backend, so this
is operator-run rather than triggered by public app traffic.

## What you'll see

```
[2026-09-10T14:02:00.000Z] Resolver watcher started. Polling every 30s.
[2026-09-10T14:02:00.500Z] Checking 1 unresolved dispute(s): 1
[2026-09-10T14:02:01.200Z]   #1 — both agents staked. Triggering resolve_dispute() on GenLayer...
[2026-09-10T14:02:01.800Z]   #1 — resolve_dispute() submitted: 0x...
[2026-09-10T14:02:01.800Z]   #1 — waiting for consensus to finalize (this can take several minutes)...
[2026-09-10T14:04:32.100Z]   #1 — RESOLVED. Run the relayer to settle stakes on Base Sepolia: node relay.js 1
```

## Relationship to the rest of the system

```
File a Claim (human, via app)
        │
Stake as Agent A / Agent B (human, via app — real money commitment)
        │
        ▼
┌───────────────────────┐
│  resolver.js (this)    │  ← autonomous, no human click
│  watches both chains   │
│  triggers resolution   │
└───────────────────────┘
        │
        ▼
relay.js (manual, one-shot — see /relayer)
        │
        ▼
Stakes settle on Base Sepolia
```
