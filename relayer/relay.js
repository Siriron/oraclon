// relay.js
//
// One-shot Oraclon relayer.
//
// WHAT THIS DOES
// --------------
// Run this AFTER you have already called resolve_dispute(disputeId) on the
// GenVM contract (oraclon.py) and it has finalized (status == "resolved").
// This script:
//   1. Reads the resolved dispute from GenLayer StudioNet (read-only).
//   2. Reads the matching dispute from OraclonEscrow.sol on Base Sepolia.
//   3. Cross-checks protocolSlug + targetDate match between the two chains
//      BEFORE relaying anything — this is the one integration point the
//      Solidity contract's own docstring names as "not automatically
//      guaranteed" (createDispute's NatSpec). This script is where that
//      check actually gets enforced, rather than left purely to whoever
//      created both halves being careful.
//   4. Calls submitVerdict() on Base Sepolia with the GenVM verdict,
//      mapped to the Accuracy enum (1 = Accurate, 2 = Inaccurate).
//   5. Prints explorer links on both chains so the relay itself is
//      independently checkable, per the contract's own stated design
//      ("a mismatched relayed verdict is a checkable, provable
//      discrepancy, not a silent trust assumption").
//
// This script deliberately does NOT poll or watch events (see the
// project's own decision: one-shot, run manually after resolve_dispute,
// not a background poller — simplest reliable shape for a two-week
// hackathon demo, not a production bridge).
//
// USAGE
// -----
//   npm install
//   cp .env.example .env      # fill in RELAYER_PRIVATE_KEY
//   node relay.js <disputeId>
//
// EXAMPLE
// -------
//   node relay.js 1

import 'dotenv/config';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import {
  createWalletClient,
  createPublicClient,
  http,
  defineChain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ---------------------------------------------------------------------------
// Config — plain constants, no indirection (matches this project's own
// confirmed frontend convention: contract addresses live as literals in one
// place, never scattered across .env entries — see project knowledge
// section 7). The relayer PRIVATE KEY is the one genuine secret here, so
// that alone comes from .env; everything else is a plain constant.
// ---------------------------------------------------------------------------

const GENLAYER_CONTRACT_ADDRESS =
  '0x1078D2FF17616482aa115B1eE910269830270d62';

const ESCROW_CONTRACT_ADDRESS =
  '0xD3dDF66A0EefD3fb2f0D0DF4874Fbc9C1Fff702f';

const GENLAYER_EXPLORER_TX = (addr) =>
  `https://explorer-studio.genlayer.com/address/${addr}`;

const BASE_SEPOLIA_EXPLORER_TX = (hash) =>
  `https://sepolia.basescan.org/tx/${hash}`;

const baseSepolia = defineChain({
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'] },
  },
  blockExplorers: {
    default: { name: 'BaseScan', url: 'https://sepolia.basescan.org' },
  },
  testnet: true,
});

// Minimal ABI — only the functions/views this script actually calls.
const ESCROW_ABI = [
  {
    type: 'function',
    name: 'getDisputeClaims',
    stateMutability: 'view',
    inputs: [{ name: 'disputeId', type: 'uint256' }],
    outputs: [
      { name: 'agentAClaimedTvlE6', type: 'uint256' },
      { name: 'agentBClaimedTvlE6', type: 'uint256' },
      { name: 'protocolSlug', type: 'string' },
      { name: 'targetDate', type: 'uint256' },
    ],
  },
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
  {
    type: 'function',
    name: 'submitVerdict',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'disputeId', type: 'uint256' },
      { name: 'agentAAccuracyRaw', type: 'uint8' },
      { name: 'agentBAccuracyRaw', type: 'uint8' },
      { name: 'reasoningSummary', type: 'string' },
    ],
    outputs: [],
  },
];

// Solidity Status enum: Created=0, AgentAStaked=1, BothStaked=2, Resolved=3
const ESCROW_STATUS = ['Created', 'AgentAStaked', 'BothStaked', 'Resolved'];

// Accuracy string (GenVM) -> Accuracy enum raw value (Solidity: Unset=0, Accurate=1, Inaccurate=2)
function accuracyToRaw(accuracyStr) {
  if (accuracyStr === 'accurate') return 1;
  if (accuracyStr === 'inaccurate') return 2;
  throw new Error(`Unrecognized accuracy value from GenVM: "${accuracyStr}"`);
}

async function main() {
  const disputeId = process.argv[2];
  if (!disputeId || !/^\d+$/.test(disputeId)) {
    console.error('Usage: node relay.js <disputeId>');
    console.error('Example: node relay.js 1');
    process.exit(1);
  }

  const relayerKey = process.env.RELAYER_PRIVATE_KEY;
  if (!relayerKey) {
    console.error('Missing RELAYER_PRIVATE_KEY in .env — see .env.example.');
    process.exit(1);
  }

  console.log(`\n=== Oraclon Relayer — dispute #${disputeId} ===\n`);

  // -------------------------------------------------------------------
  // Step 1 — read the GenVM verdict (read-only, no wallet needed)
  // -------------------------------------------------------------------
  console.log('[1/5] Reading GenVM dispute state (StudioNet)...');
  const genlayerClient = createClient({ chain: studionet });

  const genlayerRaw = await genlayerClient.readContract({
    address: GENLAYER_CONTRACT_ADDRESS,
    functionName: 'get_dispute',
    args: [disputeId],
  });

  // readContract on genlayer-js returns the view's raw JSON string —
  // always parse it (confirmed convention, project knowledge section 7).
  const genlayerDispute =
    typeof genlayerRaw === 'string' ? JSON.parse(genlayerRaw) : genlayerRaw;

  console.log('    GenVM dispute:', genlayerDispute);

  if (genlayerDispute.status !== 'resolved') {
    console.error(
      `\nABORTING: GenVM dispute #${disputeId} has status "${genlayerDispute.status}", not "resolved".`
    );
    console.error(
      'Call resolve_dispute() on the GenVM contract first (via Studio Run and Debug or your frontend), then re-run this script.'
    );
    process.exit(1);
  }

  // -------------------------------------------------------------------
  // Step 2 — read the matching escrow dispute on Base Sepolia
  // -------------------------------------------------------------------
  console.log('\n[2/5] Reading OraclonEscrow dispute state (Base Sepolia)...');
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  const [core, claims] = await Promise.all([
    publicClient.readContract({
      address: ESCROW_CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'getDisputeCore',
      args: [BigInt(disputeId)],
    }),
    publicClient.readContract({
      address: ESCROW_CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'getDisputeClaims',
      args: [BigInt(disputeId)],
    }),
  ]);

  const escrowStatusIndex = Number(core[4]);
  const escrowStatus = ESCROW_STATUS[escrowStatusIndex] ?? `unknown(${escrowStatusIndex})`;
  const escrowSlug = claims[2];
  const escrowTargetDate = claims[3].toString();

  console.log(`    Escrow status: ${escrowStatus}`);
  console.log(`    Escrow protocolSlug: "${escrowSlug}"`);
  console.log(`    Escrow targetDate: ${escrowTargetDate}`);

  if (escrowStatus !== 'BothStaked') {
    console.error(
      `\nABORTING: Escrow dispute #${disputeId} has status "${escrowStatus}", not "BothStaked".`
    );
    console.error(
      'Both agents must call stakeAsAgentA/stakeAsAgentB before a verdict can be submitted.'
    );
    process.exit(1);
  }

  // -------------------------------------------------------------------
  // Step 3 — cross-check the two halves actually describe the same
  // dispute before relaying anything. This is the check the Solidity
  // contract's own docstring says it CANNOT do itself (no way to read
  // GenLayer state on-chain) — this script is where it actually happens.
  // -------------------------------------------------------------------
  console.log('\n[3/5] Cross-checking GenVM and Base Sepolia dispute params...');

  const mismatches = [];
  if (genlayerDispute.protocol_slug !== escrowSlug) {
    mismatches.push(
      `protocol_slug mismatch: GenVM="${genlayerDispute.protocol_slug}" vs Escrow="${escrowSlug}"`
    );
  }
  if (String(genlayerDispute.target_date) !== escrowTargetDate) {
    mismatches.push(
      `target_date mismatch: GenVM="${genlayerDispute.target_date}" vs Escrow="${escrowTargetDate}"`
    );
  }

  if (mismatches.length > 0) {
    console.error('\nABORTING: the two chains do not describe the same dispute:');
    for (const m of mismatches) console.error(`  - ${m}`);
    console.error(
      '\nRefusing to relay a verdict across mismatched dispute parameters. Re-check how both halves were created.'
    );
    process.exit(1);
  }
  console.log('    OK — protocol_slug and target_date match on both chains.');

  // -------------------------------------------------------------------
  // Step 4 — relay the verdict
  // -------------------------------------------------------------------
  console.log('\n[4/5] Submitting verdict to Base Sepolia...');

  const account = privateKeyToAccount(relayerKey);
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(),
  });

  const agentAAccuracyRaw = accuracyToRaw(genlayerDispute.agent_a_accuracy);
  const agentBAccuracyRaw = accuracyToRaw(genlayerDispute.agent_b_accuracy);

  console.log(`    relayer address: ${account.address}`);
  console.log(
    `    agentA accuracy: ${genlayerDispute.agent_a_accuracy} (raw=${agentAAccuracyRaw})`
  );
  console.log(
    `    agentB accuracy: ${genlayerDispute.agent_b_accuracy} (raw=${agentBAccuracyRaw})`
  );

  const txHash = await walletClient.writeContract({
    address: ESCROW_CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'submitVerdict',
    args: [
      BigInt(disputeId),
      agentAAccuracyRaw,
      agentBAccuracyRaw,
      genlayerDispute.reasoning_summary || '',
    ],
  });

  console.log(`    tx submitted: ${txHash}`);

  // -------------------------------------------------------------------
  // Step 5 — wait for confirmation, print both explorer links
  // -------------------------------------------------------------------
  console.log('\n[5/5] Waiting for confirmation on Base Sepolia...');
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  console.log(`    status: ${receipt.status}`);
  console.log('\n=== Relay complete ===');
  console.log(`GenLayer dispute (source of truth):  ${GENLAYER_EXPLORER_TX(GENLAYER_CONTRACT_ADDRESS)}`);
  console.log(`Base Sepolia tx (relayed verdict):    ${BASE_SEPOLIA_EXPLORER_TX(txHash)}`);
  console.log(
    '\nAnyone can independently compare these two links to confirm the relay was honest — this is the "checkable discrepancy, not blind trust" property described in OraclonEscrow.sol\'s own docstring.\n'
  );

  if (receipt.status !== 'success') {
    console.error('WARNING: transaction reverted or failed — check the receipt above.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nRelayer failed:', err.message || err);
  process.exit(1);
});
