// resolver.js
//
// Autonomous resolver agent for Oraclon.
//
// WHAT THIS DOES
// --------------
// Runs unattended, on a fixed poll interval. Each cycle:
//   1. Reads every dispute from GenLayer via list_disputes().
//   2. For every dispute still "submitted" (not yet resolved), checks
//      the MATCHING dispute on Base Sepolia's OraclonEscrow.sol.
//   3. If Base Sepolia confirms both agents have staked (status ==
//      BothStaked), calls resolve_dispute() on GenLayer — with no human
//      clicking a button.
//   4. If not both staked yet, skips it and checks again next cycle.
//
// WHY THIS IS DELIBERATELY DETERMINISTIC, NOT AN LLM CALL
// ---------------------------------------------------------
// The actual judgment in this system — is Agent A's claim accurate, is
// Agent B's — already happens through genuine multi-validator GenVM
// consensus inside resolve_dispute() itself. This watcher's only job is
// noticing "both stakes are in, conditions are met" and triggering that
// real judgment. Wrapping a pure state-check (bothStaked === true) in an
// LLM call would be decorative, not real autonomy — it would just be an
// if-statement wearing an AI costume. The genuinely autonomous property
// here is that this process runs unattended, monitors two separate
// chains, and takes a real on-chain action without a human noticing and
// clicking "Resolve" — that's true and interesting without needing an
// LLM in this specific loop.
//
// USAGE
// -----
//   npm install
//   cp .env.example .env      # fill in RESOLVER_PRIVATE_KEY
//   node resolver.js
//
// Runs until you stop it (Ctrl+C). Intended to run in a Codespace or
// any always-on shell during a demo window, since this project has no
// hosting budget for a persistent public backend.

import 'dotenv/config';
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { createPublicClient, http, defineChain } from 'viem';

const GENLAYER_CONTRACT_ADDRESS = '0x1078D2FF17616482aa115B1eE910269830270d62';
const ESCROW_CONTRACT_ADDRESS = '0xD3dDF66A0EefD3fb2f0D0DF4874Fbc9C1Fff702f';

const POLL_INTERVAL_MS = (Number(process.env.POLL_INTERVAL_SECONDS) || 30) * 1000;

const baseSepolia = defineChain({
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://sepolia.base.org'] } },
  blockExplorers: { default: { name: 'BaseScan', url: 'https://sepolia.basescan.org' } },
  testnet: true,
});

const ESCROW_ABI = [
  {
    type: 'function',
    name: 'getDisputeCore',
    stateMutability: 'view',
    inputs: [{ name: 'disputeId', type: 'uint256' }],
    outputs: [
      { name: 'id', type: 'uint256' },
      { name: 'agentA', type: 'address' },
      { name: 'agentB', type: 'address' },
      { name: 'stakeAmount', type: 'uint256' },
      { name: 'status', type: 'uint8' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'resolvedAt', type: 'uint256' },
    ],
  },
];

const ESCROW_STATUS = ['Created', 'AgentAStaked', 'BothStaked', 'Resolved'];
const BOTH_STAKED_INDEX = ESCROW_STATUS.indexOf('BothStaked');

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

async function main() {
  const resolverKey = process.env.RESOLVER_PRIVATE_KEY;
  if (!resolverKey) {
    console.error('Missing RESOLVER_PRIVATE_KEY in .env — see .env.example.');
    process.exit(1);
  }

  const genlayerRead = createClient({ chain: studionet });
  // Headless script, no browser wallet — this is exactly the case
  // createAccount() is for: it takes a private key directly and lets
  // the SDK sign transactions itself. (The plain-address `account:`
  // field elsewhere in this project's frontend hooks is for the
  // opposite case — a connected browser wallet — and would be wrong
  // here since there is no window.ethereum in a Node process.)
  const resolverAccount = createAccount(resolverKey);
  const genlayerWrite = createClient({
    chain: studionet,
    account: resolverAccount,
  });
  const basePublic = createPublicClient({ chain: baseSepolia, transport: http() });

  // In-memory set of dispute ids currently being resolved, so a slow
  // GenVM consensus round (which can take minutes) doesn't get triggered
  // twice by the next poll cycle before the first attempt finishes.
  const inFlight = new Set();

  log(`Resolver watcher started. Polling every ${POLL_INTERVAL_MS / 1000}s.`);
  log(`GenLayer contract: ${GENLAYER_CONTRACT_ADDRESS}`);
  log(`Base Sepolia contract: ${ESCROW_CONTRACT_ADDRESS}`);

  async function checkOnce() {
    let disputes;
    try {
      const raw = await genlayerRead.readContract({
        address: GENLAYER_CONTRACT_ADDRESS,
        functionName: 'list_disputes',
        args: [],
      });
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      disputes = parsed.disputes || [];
    } catch (err) {
      log(`ERROR reading GenLayer dispute list: ${err.message || err}`);
      return;
    }

    const pending = disputes.filter((d) => d.status === 'submitted');
    if (pending.length === 0) {
      log('No unresolved disputes. Nothing to check.');
      return;
    }

    log(`Checking ${pending.length} unresolved dispute(s): ${pending.map((d) => d.dispute_id).join(', ')}`);

    for (const d of pending) {
      const id = d.dispute_id;
      if (inFlight.has(id)) {
        log(`  #${id} — resolution already in flight, skipping this cycle.`);
        continue;
      }

      let escrowStatus;
      try {
        const core = await basePublic.readContract({
          address: ESCROW_CONTRACT_ADDRESS,
          abi: ESCROW_ABI,
          functionName: 'getDisputeCore',
          args: [BigInt(id)],
        });
        escrowStatus = Number(core[4]);
      } catch (err) {
        log(`  #${id} — could not read Base Sepolia state (${err.message || err}), skipping.`);
        continue;
      }

      if (escrowStatus !== BOTH_STAKED_INDEX) {
        log(`  #${id} — Base Sepolia status is "${ESCROW_STATUS[escrowStatus] ?? escrowStatus}", not yet BothStaked. Waiting.`);
        continue;
      }

      log(`  #${id} — both agents staked. Triggering resolve_dispute() on GenLayer...`);
      inFlight.add(id);

      genlayerWrite
        .writeContract({
          address: GENLAYER_CONTRACT_ADDRESS,
          functionName: 'resolve_dispute',
          args: [BigInt(id)],
          value: BigInt(0),
        })
        .then((txHash) => {
          log(`  #${id} — resolve_dispute() submitted: ${txHash}`);
          log(`  #${id} — waiting for consensus to finalize (this can take several minutes)...`);
          return genlayerWrite.waitForTransactionReceipt({
            hash: txHash,
            retries: 120,
            interval: 4000,
          });
        })
        .then(() => {
          log(`  #${id} — RESOLVED. Run the relayer to settle stakes on Base Sepolia: node relay.js ${id}`);
        })
        .catch((err) => {
          log(`  #${id} — resolution attempt failed: ${err.message || err}`);
        })
        .finally(() => {
          inFlight.delete(id);
        });
    }
  }

  await checkOnce();
  setInterval(checkOnce, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error('Resolver watcher crashed:', err.message || err);
  process.exit(1);
});
