# Oraclon Relayer

One-shot script that reads a resolved dispute verdict from the Oraclon
GenVM contract (StudioNet) and relays it to `OraclonEscrow.sol` on Base
Sepolia. This is the manual bridge described in `OraclonEscrow.sol`'s own
docstring — a deliberate, honestly-documented scope cut for the Agent Tank
hackathon timeline, not a production bridge.

## What it does, in order

1. Reads `get_dispute(disputeId)` from the GenVM contract. Aborts if the
   dispute isn't `"resolved"` yet.
2. Reads `getDisputeCore` / `getDisputeClaims` from `OraclonEscrow.sol`.
   Aborts if both agents haven't staked yet (`BothStaked` state).
3. **Cross-checks `protocol_slug` and `target_date` match on both
   chains** before relaying anything. This is the one check
   `OraclonEscrow.sol`'s own `createDispute()` docstring says the
   contract *cannot* do itself (no way to read GenLayer state
   on-chain) — this script is where it's actually enforced.
4. Calls `submitVerdict()` on Base Sepolia with the GenVM verdict,
   mapped to the `Accuracy` enum (1 = Accurate, 2 = Inaccurate).
5. Waits for confirmation and prints explorer links on both chains, so
   the relay is independently checkable by anyone.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` and set `RELAYER_PRIVATE_KEY` to the private key of whichever
address is currently set as `relayer` on `OraclonEscrow.sol` (the
`_relayer` constructor arg, or whatever `setRelayer()` last set it to).
That address needs a small amount of Base Sepolia ETH to pay gas —
get some from a Base Sepolia faucet if needed.

## Full test walkthrough (using the already-proven test values)

These values are confirmed twice on live GenVM deployments — see project
notes. Agent A comes back accurate, Agent B comes back inaccurate.

**1. Create the dispute on GenVM** (Studio Run and Debug, or your
frontend), calling `create_dispute` with:

```
protocol_slug:          aave
target_date:             1756684800
agent_a_address:         <Base Sepolia address you'll use for Agent A>
agent_a_claimed_tvl_e6:  18405000000000000
agent_b_address:         <Base Sepolia address you'll use for Agent B>
agent_b_claimed_tvl_e6:  30250000000000000
```

Note the `dispute_id` returned.

**2. Create the matching dispute on Base Sepolia**, calling
`createDispute` on `OraclonEscrow.sol` with the exact same
`protocolSlug` and `targetDate`, plus a `stakeAmount` (e.g.
`0.01 ether`) and the same two agent addresses / claimed values.

**3. Stake both sides** — call `stakeAsAgentA(disputeId)` from Agent A's
wallet and `stakeAsAgentB(disputeId)` from Agent B's wallet, each
sending exactly `stakeAmount` in msg.value.

**4. Resolve on GenVM** — call `resolve_dispute(dispute_id)` on the
GenVM contract. Wait for consensus to finalize (`status: "resolved"`).

**5. Run the relayer:**

```bash
node relay.js <disputeId>
```

**6. Verify** — the script prints a GenLayer explorer link and a
BaseScan tx link. Confirm the accuracy values match on both. Then call
`withdraw()` from whichever address(es) were credited a `pendingBalance`
to pull the actual ETH.

## Notes

- This script is intentionally **one-shot**, not a polling daemon or
  event watcher — you control exactly when `resolve_dispute` fires, so
  there's no need for background infrastructure for a hackathon demo.
  A production version of this pattern would replace this script with a
  real bridge or optimistic-oracle challenge window (see
  `OraclonEscrow.sol`'s own RELAYER MODEL docstring).
- If the script aborts on a parameter mismatch (step 3 above), that
  means the two dispute halves were created with different
  `protocol_slug`/`target_date` values — double check whatever created
  both sides passed identical parameters.
- Contract addresses are hardcoded constants at the top of `relay.js`,
  matching this project's own established convention (see project
  knowledge, frontend SDK section) — update them there if either
  contract is redeployed.
