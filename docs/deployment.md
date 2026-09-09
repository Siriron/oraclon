# Deployment & Testing Status

## Deployed addresses

| Contract | Network | Address |
|---|---|---|
| Oraclon (GenVM) | StudioNet | `0x1078D2FF17616482aa115B1eE910269830270d62` |
| OraclonEscrow (Solidity) | Base Sepolia | `0xD3dDF66A0EefD3fb2f0D0DF4874Fbc9C1Fff702f` |

## What's actually confirmed live, versus theoretically correct

This section exists to say plainly what's been tested and what hasn't —
not to round anything up.

### GenVM contract (`oraclon.py`) — fully live-tested, no known gaps

Confirmed across two separate Studio deployments:
- `create_dispute` — deterministic, no nondet. Confirmed `SUCCESS` both
  times.
- `resolve_dispute` — the full nondet path (fetch current TVL, fetch
  historical series, closest-point selection, independent judgment of
  both claims). Confirmed `SUCCESS` both times, zero problematic
  rotation, empty stderr, correct accurate/inaccurate split both runs.
- `list_disputes` — narrow index view, direct `TreeMap` iteration.
  Confirmed `SUCCESS`.
- Full ten-item mandatory nondet audit passed: positional
  `run_nondet_unsafe`, `isinstance(leaders_res, gl.vm.Return)` check, no
  `self.` in nested closures, no class-body typed constants,
  `copy_to_memory` correctly sequenced, no `DynArray` used at all (by
  design), no `.send(`, verdict-enum reachability traced and confirmed.

### Solidity contract (`OraclonEscrow.sol`) — deployed, **not yet
live-tested**

The full `createDispute → stakeAsAgentA → stakeAsAgentB →
submitVerdict → withdraw` lifecycle has **not** been run on Base
Sepolia. This is a known, named gap by explicit decision to prioritize
other work — not an oversight. What has been checked:
- Compiles cleanly on solc 0.8.20 without `--via-ir` (the original
  `getDispute()` "stack too deep" error was fixed by splitting into
  three smaller view functions, not by adding a compiler flag).
- Settlement math independently verified via exhaustive Python
  simulation across 7 stake amounts × 4 outcome branches (28 cases) —
  every case balances exactly to `totalPool`. This caught a real fee
  double-counting bug before deploy.

### Relayer script — written, syntax-checked, not yet run live

`relay.js` passed `node --check` syntax validation and was built
against the confirmed `genlayer-js` API patterns in this project's own
knowledge base. It has not yet been run against a real resolved dispute
end to end, because that requires the Base Sepolia lifecycle above to
happen first.

### Frontend — built, not yet tested against live contracts

Built using the confirmed-working `genlayer-js` + `viem` patterns
(explicit `ensureChain`, plain-address `account` field never
`createAccount()`, generous `waitForTransactionReceipt` retry config,
persistent wallet connection via `eth_accounts` + `accountsChanged`).
Has not yet been run against a real browser wallet or a live
transaction — this environment has no network access, so `npm install`
and a real dev-server run could not happen here. Run `npm install &&
npm run dev` locally and treat the first real click-through as the
actual first test.

## What "done" will look like

1. Run the full lifecycle on Base Sepolia (Remix or a script) with the
   proven test values (see `contracts/oraclon.py`'s own test notes).
2. Resolve on GenVM, run the relayer, confirm settlement.
3. Click through the same flow in the actual frontend against live
   contracts, fixing whatever the first real run surfaces — per this
   project's own standing lesson, a no-network sandbox build passing
   every available check is not the same claim as a real browser run
   passing.
