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

`OraclonRegistry.sol` as it exists now:
- Compiles cleanly against the same Solidity version (`^0.8.20`) and
  follows the same split-view pattern (`getClaimCore` /
  `getClaimValues` / `getClaimVerdict`) that avoided the prior
  contract's "stack too deep" issue.
- **Deployed to Base Sepolia** at
  `0xcE066B8e55572b1f9E6e223605d9362Af345c3Eb`. This address was not
  independently verified by Claude — no network access was available to
  check the deployed bytecode or constructor arguments. Before relying
  on this address, confirm on BaseScan's "Read Contract" tab that
  `relayer()` returns the intended relayer address and `owner()` returns
  the intended deployer address.
- **Has not been live-tested at all** — no `fileClaim` call, no
  `recordVerdict` call, nothing has been exercised against this
  deployment yet. Do not treat this as inheriting the previous
  contract's live-tested status; it is new code with a different ABI and
  constructor, and needs its own testing pass before being treated as
  confirmed.

### Relaying — moved into the app, no script, no private key

The standalone `relay.js` script and its `.env`-based
`RELAYER_PRIVATE_KEY` have been removed entirely. Recording a verdict on
Base Sepolia is now a button (`useOraclonRegistry`'s `recordVerdict`)
directly on the claim's page in the app, signed by whichever wallet is
connected in the browser — the same pattern `fileClaim` already used.
No private key is stored, read from a file, or otherwise handled by
this app's code at any point. This has not yet been exercised against a
live network, since that requires `OraclonRegistry.sol` to be deployed
first.

### Frontend — updated for the new contract, not yet exercised live

`NewDispute.jsx` and `DisputeDetail.jsx` were rewritten to remove every
stake input and staking-specific status label, and now call
`useOraclonRegistry`'s non-payable `fileClaim` and wallet-signed
`recordVerdict` instead of the old `useOraclonEscrow`'s payable staking
calls and the standalone relayer script. The GenLayer-side flow
(`useOraclonGenLayer`) is unchanged and unaffected. The Base
Sepolia-side flow cannot be exercised in a real browser until
`OraclonRegistry.sol` is deployed and its address is filled in.

## What "done" will look like

1. ~~Deploy `OraclonRegistry.sol` to Base Sepolia, passing the address of
   whichever wallet should hold the `relayer` role as the constructor
   argument.~~ Done —
   [`0xcE066B8e55572b1f9E6e223605d9362Af345c3Eb`](https://sepolia.basescan.org/address/0xcE066B8e55572b1f9E6e223605d9362Af345c3Eb#code).
   Verify `relayer()`/`owner()` on BaseScan before relying on it (see
   above).
2. ~~Update `REGISTRY_CONTRACT_ADDRESS` in `src/config/chains.js`.~~ Done.
3. Run the full lifecycle for real: file a claim on both chains, verify
   on GenLayer, connect the `relayer` wallet and click "Record Verdict
   on Base Sepolia," confirm the record on Base Sepolia shows the
   correct result — with no value ever moving at any step, and no
   private key ever entering a file. **Not yet done.**
4. Update this file's Status section once that's confirmed, the same
   way this document has been kept honest through every change so far.

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
