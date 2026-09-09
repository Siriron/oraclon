<div align="center">

# Oraclon

### Two claims arrive. One record already knows the truth.

<br />

![Status](https://img.shields.io/badge/status-building-yellow?style=flat-square)
![Networks](https://img.shields.io/badge/networks-GenLayer%20StudioNet%20%2B%20Base%20Sepolia-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square)
![Stack](https://img.shields.io/badge/stack-React%20%2B%20Vite%20%2B%20GenVM%20%2B%20Solidity-E8A94C?style=flat-square)

<br />

**[Smart Contract (GenVM)](./contracts/oraclon.py)** &nbsp;·&nbsp; **[Smart Contract (Solidity)](./contracts/OraclonEscrow.sol)** &nbsp;·&nbsp; **[Relayer](./relayer/)**

</div>

<br />

---

## What this is

Two autonomous agents each stake a claim about a DeFi protocol's Total
Value Locked — one claims the current figure, the other claims a
historical figure as of a locked target date. Oraclon never trusts
either agent's word: it independently re-fetches the real data from
DefiLlama itself and judges both claims against that fetch, never
against each other.

Built for GenLayer's Agent Tank hackathon — "build on any chain,
adjudicate on GenLayer." The judgment happens on GenLayer; the stakes
and settlement live on Base Sepolia.

<br />

<div align="center">

| | |
|---|---|
| **Concept** | Dual-agent claim verification against live DeFi TVL data |
| **Consensus need** | An agent whose claim is wrong benefits from a false "accurate" verdict — genuinely adversarial |
| **Evidence source** | DefiLlama's public TVL API, fetched independently by the contract itself |
| **Chains** | GenLayer StudioNet (adjudication) + Base Sepolia (stakes/settlement) |

</div>

<br />

---

## How it works

1. A dispute is filed on both chains: GenLayer records the two claims,
   Base Sepolia locks the stake.
2. Both agents stake ETH on Base Sepolia.
3. `resolve_dispute` on GenLayer fetches DefiLlama's current TVL and its
   full historical series, finds the point nearest the target date, and
   judges each claim independently via multi-validator consensus.
4. A relayer (manual, one-shot — see `/relayer`) reads the finalized
   verdict and submits it to Base Sepolia, which settles the stakes.

<br />

---

## Deployed contracts

<div align="center">

| Contract | Network | Address |
|---|---|---|
| Oraclon (GenVM) | StudioNet | `0x1078D2FF17616482aa115B1eE910269830270d62` |
| OraclonEscrow (Solidity) | Base Sepolia | `0xD3dDF66A0EefD3fb2f0D0DF4874Fbc9C1Fff702f` |

</div>

<br />

---

## Quick start

```bash
npm install
npm run dev
```

To relay a resolved verdict from GenLayer to Base Sepolia, see
[`/relayer/README.md`](./relayer/README.md).

<br />

---

## Project structure

```
src/                  React + Vite frontend
contracts/            oraclon.py (GenVM) and OraclonEscrow.sol
relayer/              One-shot relay script (GenLayer verdict → Base Sepolia)
docs/                 architecture.md, deployment.md
LICENSE               MIT
```

<br />

---

## Status

<div align="center">

![Tested](https://img.shields.io/badge/GenVM%20contract-live%20tested-brightgreen?style=flat-square)
![Untested](https://img.shields.io/badge/Base%20Sepolia%20lifecycle-not%20yet%20tested-yellow?style=flat-square)

</div>

The GenVM contract (`oraclon.py`) is fully live-tested end to end on
StudioNet across two separate deployments — `create_dispute`,
`resolve_dispute`, and `list_disputes` all confirmed working, including
the full ten-item nondet safety audit. `OraclonEscrow.sol` is deployed
to Base Sepolia and has passed compilation and simulation checks, but
the live staking/settlement lifecycle has not yet been exercised
on-chain — this is a known, stated gap, not an oversight. The relayer
script is written and syntax-checked but has not yet been run against a
live resolved dispute.

<br />

---

<div align="center">

Built on [GenLayer](https://genlayer.com) for Agent Tank

</div>
