// Plain-constant chain config — no .env, no indirection. Contract
// addresses live here as literals and nowhere else, per this project's
// established convention: changing a deployed address means editing one
// line in one file.

export const GENLAYER_CONTRACT_ADDRESS =
  '0x1078D2FF17616482aa115B1eE910269830270d62';

// CONFIRMED DEPLOYED: OraclonRegistry.sol on Base Sepolia, deploy tx
// visible at https://sepolia.basescan.org/address/0xcE066B8e55572b1f9E6e223605d9362Af345c3Eb#code
// Before trusting this address for real use, verify on BaseScan's "Read
// Contract" tab that calling relayer() returns
// 0xB1d236988A76b3E978dE66B1c45278C6d17FA8BA — this was not
// independently verified by Claude (no network access in this
// environment to check bytecode or constructor args), so confirm it
// yourself once before relying on it.
export const REGISTRY_CONTRACT_ADDRESS =
  '0xcE066B8e55572b1f9E6e223605d9362Af345c3Eb';

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

// Minimal ABI for OraclonRegistry.sol — only what the frontend calls.
// No payable functions anywhere: this contract never holds value.
export const REGISTRY_ABI = [
  {
    type: 'function',
    name: 'fileClaim',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'claimantA', type: 'address' },
      { name: 'claimantB', type: 'address' },
      { name: 'claimedTvlAE6', type: 'uint256' },
      { name: 'claimedTvlBE6', type: 'uint256' },
      { name: 'protocolSlug', type: 'string' },
      { name: 'targetDate', type: 'uint256' },
    ],
    outputs: [{ name: 'claimId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getClaimCore',
    stateMutability: 'view',
    inputs: [{ name: 'claimId', type: 'uint256' }],
    outputs: [
      { name: 'id', type: 'uint256' },
      { name: 'claimantA', type: 'address' },
      { name: 'claimantB', type: 'address' },
      { name: 'status', type: 'uint8' },
      { name: 'filedAt', type: 'uint256' },
      { name: 'verifiedAt', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getClaimValues',
    stateMutability: 'view',
    inputs: [{ name: 'claimId', type: 'uint256' }],
    outputs: [
      { name: 'claimedTvlAE6', type: 'uint256' },
      { name: 'claimedTvlBE6', type: 'uint256' },
      { name: 'protocolSlug', type: 'string' },
      { name: 'targetDate', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getClaimVerdict',
    stateMutability: 'view',
    inputs: [{ name: 'claimId', type: 'uint256' }],
    outputs: [
      { name: 'resultA', type: 'uint8' },
      { name: 'resultB', type: 'uint8' },
      { name: 'reasoningSummary', type: 'string' },
    ],
  },
  {
    type: 'function',
    name: 'nextClaimId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

export const REGISTRY_STATUS_LABELS = ['Filed', 'Verified'];
export const RESULT_LABELS = ['Unset', 'Accurate', 'Inaccurate'];
