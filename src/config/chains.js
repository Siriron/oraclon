// Plain-constant chain config — no .env, no indirection. Contract
// addresses live here as literals and nowhere else, per this project's
// established convention: changing a deployed address means editing one
// line in one file.

export const GENLAYER_CONTRACT_ADDRESS =
  '0x1078D2FF17616482aa115B1eE910269830270d62';

export const ESCROW_CONTRACT_ADDRESS =
  '0xD3dDF66A0EefD3fb2f0D0DF4874Fbc9C1Fff702f';

export const GENLAYER_EXPLORER_ADDRESS_URL = (addr) =>
  `https://explorer-studio.genlayer.com/address/${addr}`;

export const GENLAYER_EXPLORER_TX_URL = (hash) =>
  `https://explorer-studio.genlayer.com/tx/${hash}`;

export const BASE_SEPOLIA_EXPLORER_ADDRESS_URL = (addr) =>
  `https://sepolia.basescan.org/address/${addr}`;

export const BASE_SEPOLIA_EXPLORER_TX_URL = (hash) =>
  `https://sepolia.basescan.org/tx/${hash}`;

export const STUDIONET_CONFIG = {
  chainId: '0xF22F', // 61999
  chainName: 'GenLayer StudioNet',
  rpcUrls: ['https://studio.genlayer.com/api'],
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  blockExplorerUrls: ['https://explorer-studio.genlayer.com'],
};

export const BASE_SEPOLIA_CONFIG = {
  chainId: '0x14A34', // 84532
  chainName: 'Base Sepolia',
  rpcUrls: ['https://sepolia.base.org'],
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  blockExplorerUrls: ['https://sepolia.basescan.org'],
};

// Minimal ABI for OraclonEscrow.sol — only what the frontend calls.
export const ESCROW_ABI = [
  {
    type: 'function',
    name: 'createDispute',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentA', type: 'address' },
      { name: 'agentB', type: 'address' },
      { name: 'stakeAmount', type: 'uint256' },
      { name: 'agentAClaimedTvlE6', type: 'uint256' },
      { name: 'agentBClaimedTvlE6', type: 'uint256' },
      { name: 'protocolSlug', type: 'string' },
      { name: 'targetDate', type: 'uint256' },
    ],
    outputs: [{ name: 'disputeId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'stakeAsAgentA',
    stateMutability: 'payable',
    inputs: [{ name: 'disputeId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'stakeAsAgentB',
    stateMutability: 'payable',
    inputs: [{ name: 'disputeId', type: 'uint256' }],
    outputs: [],
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
    name: 'getDisputeVerdict',
    stateMutability: 'view',
    inputs: [{ name: 'disputeId', type: 'uint256' }],
    outputs: [
      { name: 'agentAAccuracy', type: 'uint8' },
      { name: 'agentBAccuracy', type: 'uint8' },
      { name: 'reasoningSummary', type: 'string' },
    ],
  },
  {
    type: 'function',
    name: 'getPendingBalance',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'nextDisputeId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

export const ESCROW_STATUS_LABELS = ['Created', 'AgentAStaked', 'BothStaked', 'Resolved'];
export const ACCURACY_LABELS = ['Unset', 'Accurate', 'Inaccurate'];
