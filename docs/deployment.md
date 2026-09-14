# Deployment & Testing Status

## Deployed addresses

| Contract | Network | Address |
|---|---|---|
| Oraclon (GenVM) | StudioNet | `0x1078D2FF17616482aa115B1eE910269830270d62` |
| OraclonRegistry (Solidity) | Base Sepolia | `0xcE066B8e55572b1f9E6e223605d9362Af345c3Eb` |

## What's actually confirmed live

This section exists to say plainly what's been tested — not to round
anything up, and not to leave a stale claim in place after the contract
underneath it changed.

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
- None of this is affected by the Solidity-side rewrite below — this
  contract never handled funds and its judgment logic is unchanged.

### Solidity contract — deployed, not yet live-tested

**Important status change:** the Solidity contract in this repo,
`OraclonRegistry.sol`, is a full rewrite of a previous contract,
`OraclonEscrow.sol`. The previous version required both claimants to
stake ETH and redistributed stakes based on the verdict — its complete
lifecycle (stake, resolve, relay, settle) was live-tested and confirmed
working on Base Sepolia. That structure has since been removed for
reasons of principle, not because of a technical defect — see
`contracts/OraclonRegistry.sol`'s own docstring and
`docs/architecture.md` for the full reasoning.

`OraclonRegistry.sol` as it exists now — **fully live-tested end to
end**:
- Compiles cleanly against the same Solidity version (`^0.8.20`) and
  follows the same split-view pattern (`getClaimCore` /
  `getClaimValues` / `getClaimVerdict`) that avoided the prior
  contract's "stack too deep" issue.
- **Deployed to Base Sepolia** at
  `0xcE066B8e55572b1f9E6e223605d9362Af345c3Eb`, confirmed via BaseScan's
  "Read Contract" tab: `relayer()` returns
  `0xB1d236988A76b3E978dE66B1c45278C6d17FA8BA` and `owner()` returns
  `0x40edE296E01e1D57b25697b07D0f1c69077843D0`, matching the intended
  addresses exactly.
- **`fileClaim` confirmed live** — two real transactions on Base Sepolia
  (blocks 46754921 and 46793507), both from `0x40edE296...`, both
  `Success`. `fileClaim` has no access restriction by design (any
  address can file a claim), so both succeeding is expected and
  correctly demonstrates that half of the contract.
- **`recordVerdict` confirmed live** — real transaction
  `0xb6b528f816f0840aa8cf7ef6c462f3ef0c53a456907ed5b8c7c41b56f6357c42`
  (block 46794234), called by `0xB1d236988...` (the registered
  `relayer`), `Success`. This is genuine positive proof that
  `onlyRelayer`'s access control works as written on this deployment —
  the transaction only succeeds because the caller matched `relayer`
  exactly; it is not merely "no error was thrown," it's a real state
  transition from `Filed` to `Verified` confirmed both in the
  transaction receipt and by the app's own UI showing "Base Sepolia:
  Verified" and the matching transaction hash immediately after.
- The one bug found along the way — `recordVerdict` missing from
  `REGISTRY_ABI` in `src/config/chains.js`, a frontend wiring gap, not
  a contract defect — was fixed before this successful call, and the
  fix is what's reflected in the current repo.

### Full lifecycle: complete and confirmed

`fileClaim` → `resolve_dispute` (GenLayer) → `recordVerdict`, with the
app's own cross-chain parameter check confirming agreement at every
step, has now been run for real, on live Base Sepolia and GenLayer
StudioNet deployments, with no funds moving at any point and no private
key ever touching a file. This is the first point at which the
Solidity-side rewrite (removing staking, replacing the standalone
relayer script with a wallet-signed action) can be called fully proven
rather than just written and reviewed.

### Relaying — moved into the app, no script, no private key

The standalone `relay.js` script and its `.env`-based
`RELAYER_PRIVATE_KEY` have been removed entirely. Recording a verdict on
Base Sepolia is a button (`useOraclonRegistry`'s `recordVerdict`)
directly on the claim's page in the app, signed by whichever wallet is
connected in the browser — the same pattern `fileClaim` already used.
No private key is stored, read from a file, or otherwise handled by
this app's code at any point. **Confirmed live**: transaction
`0xb6b528f816f0840aa8cf7ef6c462f3ef0c53a456907ed5b8c7c41b56f6357c42`,
called from the `relayer` wallet's browser session, succeeded.

### Frontend — confirmed live end to end

`NewDispute.jsx` and `DisputeDetail.jsx` were rewritten to remove every
stake input and staking-specific status label, and now call
`useOraclonRegistry`'s non-payable `fileClaim` and wallet-signed
`recordVerdict` instead of the old `useOraclonEscrow`'s payable staking
calls and the standalone relayer script. The GenLayer-side flow
(`useOraclonGenLayer`) is unchanged and unaffected. Both the GenLayer
and Base Sepolia sides have now been exercised together in a real
browser: a claim filed on both chains, verified on GenLayer, and its
verdict recorded on Base Sepolia by the correct relayer wallet — the
app's own UI confirmed "Base Sepolia: Verified" with the exact matching
transaction hash immediately after.

## Full lifecycle: confirmed, this checklist is complete

1. ~~Deploy `OraclonRegistry.sol` to Base Sepolia, passing the address of
   whichever wallet should hold the `relayer` role as the constructor
   argument.~~ Done —
   [`0xcE066B8e55572b1f9E6e223605d9362Af345c3Eb`](https://sepolia.basescan.org/address/0xcE066B8e55572b1f9E6e223605d9362Af345c3Eb#code).
   Confirmed on BaseScan: `relayer()` returns
   `0xB1d236988A76b3E978dE66B1c45278C6d17FA8BA`, `owner()` returns
   `0x40edE296E01e1D57b25697b07D0f1c69077843D0`.
2. ~~Update `REGISTRY_CONTRACT_ADDRESS` in `src/config/chains.js`.~~ Done.
3. ~~File a claim on both chains.~~ Done — two confirmed `fileClaim`
   transactions on Base Sepolia, both `Success`.
4. ~~Verify on GenLayer.~~ Done — GenLayer side confirmed resolving
   correctly.
5. ~~Connect the `relayer` wallet and click "Record Verdict on Base
   Sepolia."~~ Done — transaction
   `0xb6b528f816f0840aa8cf7ef6c462f3ef0c53a456907ed5b8c7c41b56f6357c42`,
   `Success`, called by the correct `relayer` address. The first
   attempt at this step surfaced a real frontend bug (`recordVerdict`
   missing from `REGISTRY_ABI`), which was fixed before this successful
   run.
6. ~~Update this file's Status section once that's confirmed.~~ Done —
   this is that update.

## Everything that runs in this system is triggered by a person, from their own wallet

There is no autonomous claim generation, no scheduled verification, and
no background process or script of any kind in this repository. Filing
a claim, verifying, and recording a verdict are each a distinct,
manual action taken by a person through the app, signed by their own
connected wallet — none of them involve staking, wagering, any transfer
of value, or a private key stored anywhere outside that wallet. The ten
preset test inputs on the "File a Claim" page
(`src/data/claimScenarios.js`) are fixed values written into the repo by
the developer — selecting one only fills in the protocol and claim
fields; the person filing the claim still supplies both wallet
addresses themselves, and still submits the transaction themselves.
