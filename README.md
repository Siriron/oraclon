<div align="center">

# Oraclon

### Two claims arrive. One record already knows the truth.

<br />

![Status](https://img.shields.io/badge/status-live-brightgreen?style=flat-square)
![Networks](https://img.shields.io/badge/networks-GenLayer%20StudioNet%20%2B%20Base%20Sepolia-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square)
![Stack](https://img.shields.io/badge/stack-React%20%2B%20Vite%20%2B%20GenVM%20%2B%20Solidity-E8A94C?style=flat-square)
![No Wagering](https://img.shields.io/badge/no%20stake-no%20wager-A47C1B?style=flat-square)

<br />

**[Smart Contract (GenVM)](./contracts/oraclon.py)** &nbsp;·&nbsp; **[Smart Contract (Solidity)](./contracts/OraclonRegistry.sol)**

</div>

<br />

---

## What this is

A GenLayer contract that verifies two independently-filed claims about
a DeFi protocol's Total Value Locked — one claim about the current
figure, one about a historical figure as of a locked target date —
against DefiLlama's real data, fetched by the contract itself. Oraclon
never trusts either claim's word: it independently re-fetches the real
record and verifies both claims against that fetch, never against each
other.

**This is a verification tool, not a staking or wagering contract.**
Filing and verifying a claim costs only network gas — no funds are ever
staked, held, or redistributed anywhere in this system. See
[`contracts/OraclonRegistry.sol`](./contracts/OraclonRegistry.sol)'s own
docstring for why an earlier staked version of this contract was
rewritten to remove that structure entirely.

**No private key is ever used by this app.** Every transaction — filing
a claim, verifying on GenLayer, recording a verdict on Base Sepolia —
is signed by whichever wallet is connected in the browser (MetaMask or
similar). There is no script, `.env` file, or backend process anywhere
in this repository that holds or uses a private key.

Built for GenLayer's Agent Tank hackathon — "build on any chain,
adjudicate on GenLayer." The verification happens on GenLayer; the
record lives on Base Sepolia.

<br />

---

## Where the AI agent actually is

`resolve_dispute` is the AI agent in this system. When it runs, GenVM
independently spins up multiple validator nodes, each of which fetches
DefiLlama's live data itself and runs an LLM judgment over it — the
same evidence, judged independently, with no single model's answer
treated as authoritative until the validators reach consensus. If they
disagree, GenVM rotates to a new leader and tries again. That is
genuine autonomous reasoning over live external evidence, arriving at a
binding on-chain verification — not a single API call wrapped in a
contract.

What is not agentic, stated plainly: the two claims being verified are
filed by a person, not by a second autonomous system. There is no
"claimant agent" in this build — every claim exists because someone
clicked "File a Claim," whether they typed the values by hand or
selected one of the ten preset test inputs in
`src/data/claimScenarios.js` first. The agent in Oraclon is the
verifier, not the claimant — consistent with Agent Tank's own brief,
which is about adjudication happening on GenLayer, not about every
party in the system being autonomous.

<br />

<div align="center">

| | |
|---|---|
| **Concept** | Verification of two independently-filed claims about a protocol's TVL against DefiLlama's real data |
| **Consensus need** | Whoever files a wrong claim is publicly shown to be wrong — the incentive is reputational, not financial |
| **Evidence source** | DefiLlama's public TVL API, fetched independently by the contract itself |
| **Chains** | GenLayer StudioNet (verification) + Base Sepolia (public record) |

</div>

<br />

---

## How it works

1. A claim is filed on both chains: GenLayer records the two claimed
   TVL figures, Base Sepolia records the same claim as a public entry.
   The "File a Claim" page includes a fixed reference table of ten
   preset test inputs (real DefiLlama protocols, real past dates,
   hand-written claim values — see `src/data/claimScenarios.js`) to
   speed up manual testing; selecting one fills the protocol and claim
   fields only. Both wallet addresses are always entered by the person
   filing, never pre-filled. No value is attached to this step.
2. `resolve_dispute` on GenLayer fetches DefiLlama's current TVL and its
   full historical series, finds the point nearest the target date, and
   verifies each claim independently via multi-validator consensus.
   This step is triggered manually from the claim page once both halves
   exist.
3. A person whose connected wallet is the contract's registered
   `relayer` clicks "Record Verdict on Base Sepolia" on the claim page.
   This reads the finalized verdict from GenLayer, cross-checks it
   against the Base Sepolia record, and submits `recordVerdict()` —
   signed by their own connected wallet, exactly like filing a claim.
   No private key is ever stored, read from a file, or handled by this
   app anywhere; every transaction is signed in the browser.

<br />

---

## Deployed contracts

<div align="center">

| Contract | Network | Address |
|---|---|---|
| Oraclon (GenVM) | StudioNet | `0x1078D2FF17616482aa115B1eE910269830270d62` |
| OraclonRegistry (Solidity) | Base Sepolia | `0xcE066B8e55572b1f9E6e223605d9362Af345c3Eb` |

</div>

<br />

---

## Quick start

```bash
npm install
npm run dev
```

Recording a verdict on Base Sepolia happens directly in the app — see
"How it works" above. No separate script or setup is required.

<br />

---

## Project structure

```
src/                  React + Vite frontend
src/data/             Preset test inputs for the claim form (see file header for what's real vs. authored)
contracts/            oraclon.py (GenVM) and OraclonRegistry.sol
docs/                 architecture.md, deployment.md
LICENSE               MIT
```

<br />

---

## Status

<div align="center">

![Tested](https://img.shields.io/badge/GenVM%20contract-live%20tested-brightgreen?style=flat-square)
![Tested](https://img.shields.io/badge/OraclonRegistry.sol-live%20tested%20end%20to%20end-brightgreen?style=flat-square)

</div>

The GenVM contract (`oraclon.py`) is fully live-tested end to end on
StudioNet across two separate deployments — `create_dispute`,
`resolve_dispute`, and `list_disputes` all confirmed working, including
the full ten-item nondet safety audit. This contract's judgment logic
is unaffected by the removal of staking on the Solidity side — it never
handled funds in the first place.

**`OraclonRegistry.sol` is deployed to Base Sepolia and fully
live-tested end to end** at
[`0xcE066B8e55572b1f9E6e223605d9362Af345c3Eb`](https://sepolia.basescan.org/address/0xcE066B8e55572b1f9E6e223605d9362Af345c3Eb#code),
replacing a previous contract, `OraclonEscrow.sol`, which required both
claimants to stake ETH and redistributed the stakes based on the
verdict. That version's full lifecycle (stake, resolve, relay, settle)
was live-tested and confirmed working — but on reflection, that
structure amounted to two parties wagering money on who was factually
correct, which is not a legitimate basis for either party to win the
other's money. It has been removed. `fileClaim` and `recordVerdict` are
both confirmed live — a real claim filed on both chains, verified on
GenLayer, and its verdict recorded on Base Sepolia by the correct
`relayer` wallet, with `onlyRelayer`'s access control genuinely
exercised (not just present in the source). `relayer()` and `owner()`
were independently confirmed on BaseScan to return the intended
addresses. Full details, including transaction hashes, are in
`docs/deployment.md`.

<br />

---

<div align="center">

Built on [GenLayer](https://genlayer.com) for Agent Tank

</div>
