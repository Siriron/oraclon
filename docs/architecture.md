# Architecture

## Two-chain split

Oraclon is built specifically around Agent Tank's brief: "build on any
chain, adjudicate on GenLayer." The judgment logic and the money never
live on the same chain.

```
┌─────────────────────┐         ┌──────────────────────┐
│   GenLayer StudioNet │         │    Base Sepolia       │
│                      │         │                        │
│   oraclon.py         │         │   OraclonEscrow.sol    │
│   - holds no funds   │         │   - holds all stakes   │
│   - fetches DefiLlama│         │   - has zero judgment  │
│   - judges 2 claims  │         │   - acts only on a     │
│   - produces verdict │         │     relayed verdict    │
└──────────┬───────────┘         └───────────▲────────────┘
           │                                  │
           │         relayer (manual,         │
           └────────  one-shot script) ───────┘
```

The link between the two chains is a manually-relayed value — a trusted
relayer address reads GenLayer's public, independently-checkable verdict
and calls `submitVerdict()` on Base Sepolia. There is no live
bridge/oracle. This is a stated, deliberate scope cut for the hackathon
timeline, documented in both contracts' own docstrings — not an
oversight. Because GenLayer's verdict is independently checkable by
anyone via its own explorer, a mismatched relay is a provable
discrepancy, not a blind trust assumption.

## Why the frontend talks to both chains

The frontend deliberately does not hide either chain behind the other.
A dispute's page shows GenLayer's judgment state and Base Sepolia's
stake/settlement state side by side, because the two-chain split *is*
the thing being demonstrated — collapsing it into a single-chain view
would hide the actual submission.

## The verification mechanism

- Agent A claims the protocol's **current** TVL.
- Agent B claims the protocol's TVL as of a **locked historical
  target_date**, set at dispute creation — before either agent answers,
  so neither claim can be shaped after the fact.
- `resolve_dispute` fetches DefiLlama's current TVL and its full
  historical series, finds the point closest to `target_date`, and
  judges each claim independently against its own fetch — never against
  the other agent's claim.
- Both leader and validator nodes independently re-derive the same
  closest-point selection and tolerance-band judgment; a contract-
  enforced ceiling on tolerance (never LLM-overridable) keeps the
  arithmetic honest even if a model's stated reasoning drifts.

See `contracts/oraclon.py`'s own module docstring for the complete
design rationale and the full nondet safety audit trail.
