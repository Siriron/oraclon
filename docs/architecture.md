# Architecture

## Two-chain split

Oraclon is built specifically around Agent Tank's brief: "build on any
chain, adjudicate on GenLayer." The verification logic lives on
GenLayer; the public record lives on Base Sepolia. Neither chain holds
any funds — this is a verification system, not a financial one.

```
┌─────────────────────┐         ┌──────────────────────┐
│   GenLayer StudioNet │         │    Base Sepolia       │
│                      │         │                        │
│   oraclon.py         │         │   OraclonRegistry.sol │
│   - holds no funds   │         │   - holds no funds    │
│   - fetches DefiLlama│         │   - has zero judgment │
│   - verifies 2 claims│         │   - records the       │
│   - produces verdict │         │     recorded verdict  │
└──────────┬───────────┘         └───────────▲────────────┘
           │                                  │
           │   a connected wallet reads the   │
           └── GenLayer verdict and submits ──┘
                 recordVerdict() itself
```

The link between the two chains is a value read and relayed by a
person, not a bridge or oracle: whoever's wallet is registered as
`relayer` on the contract opens the claim's page, clicks "Record
Verdict on Base Sepolia," and their own connected wallet reads
GenLayer's public, independently-checkable verdict and signs a
`recordVerdict()` transaction — the same wallet-signed pattern used for
filing a claim. There is no live bridge/oracle, and no private key is
ever stored, read from a file, or otherwise handled by this app's code
— every signature happens in the person's own wallet. This is a stated,
deliberate scope cut for the hackathon timeline, documented in the
contract's own docstring — not an oversight. Because GenLayer's verdict
is independently checkable by anyone via its own explorer, a mismatched
relay is a provable discrepancy, not a blind trust assumption.

Filing (`fileClaim`), verification (`resolve_dispute`), and recording
(`recordVerdict`) are all triggered manually by a person clicking a
button, once the relevant on-chain conditions are met. There is no
automated or scheduled process, and no backend of any kind, anywhere in
this system — every state transition happens because someone took a
real action from their own connected wallet.

## No staking, no wagering — stated plainly

An earlier version of `OraclonRegistry.sol` (then called
`OraclonEscrow.sol`) required both claimants to stake ETH, with the
accurate claimant receiving the inaccurate claimant's stake once
verified. That structure was removed. Stripped of its DeFi framing, it
amounted to two parties putting up money on who was factually correct
about a number neither of them had any other stake in — money changing
hands purely on the outcome of a factual claim, with no underlying
service or obligation being secured. That is not a legitimate basis for
either party to win the other's money. See
`contracts/OraclonRegistry.sol`'s own module docstring for the full
reasoning. Filing and verifying a claim now costs only network gas.

## No private key anywhere in this app

Every write in this system — `fileClaim`, `resolve_dispute`,
`recordVerdict` — is a transaction signed by a connected browser wallet
(`window.ethereum`), the same pattern for all three. An earlier design
used a standalone Node.js script (`relay.js`) to call `recordVerdict()`,
which required a `RELAYER_PRIVATE_KEY` sitting in a `.env` file for the
script to sign with. That script has been deleted. Recording a verdict
is now a button on the claim's own page in the app: whoever's wallet is
registered as `relayer` on the contract connects that wallet in their
browser and clicks it, exactly like staking or filing used to work.
Nothing in this repository reads, stores, or requires a private key at
any point — the contract's own `onlyRelayer` check is what enforces who
is allowed to succeed, the same access control a script would have had,
without the key ever leaving a wallet.

## Why the frontend talks to both chains

The frontend deliberately does not hide either chain behind the other.
A claim's page shows GenLayer's verification state and Base Sepolia's
record state side by side, because the two-chain split *is* the thing
being demonstrated — collapsing it into a single-chain view would hide
the actual submission.

## The verification mechanism

- Claimant A claims the protocol's **current** TVL.
- Claimant B claims the protocol's TVL as of a **locked historical
  target_date**, set at claim creation — before either claimant
  answers, so neither claim can be shaped after the fact.
- `resolve_dispute` fetches DefiLlama's current TVL and its full
  historical series, finds the point closest to `target_date`, and
  verifies each claim independently against its own fetch — never
  against the other claimant's claim.
- Both leader and validator nodes independently re-derive the same
  closest-point selection and tolerance-band judgment; a contract-
  enforced ceiling on tolerance (never LLM-overridable) keeps the
  arithmetic honest even if a model's stated reasoning drifts.

`resolve_dispute` is where the actual AI agent lives: each GenVM
validator independently fetches live evidence and runs its own LLM
judgment over it, with the on-chain result only finalizing once
independent nodes converge. "Agent A" and "Agent B" in the contract's
own field names (`agent_a_claimed_tvl_e6`, etc.) are the two claim
parties in the data model — they are not themselves AI agents; they're
whoever files a claim, currently always a person. The one AI agent in
this system is the verifier, not either claimant.

See `contracts/oraclon.py`'s own module docstring for the complete
design rationale and the full nondet safety audit trail.
