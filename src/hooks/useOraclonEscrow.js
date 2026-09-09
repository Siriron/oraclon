import { useCallback, useMemo } from 'react';
import { createPublicClient, createWalletClient, custom, http, defineChain, parseEther } from 'viem';
import { ESCROW_CONTRACT_ADDRESS, ESCROW_ABI } from '../config/chains';
import { useWallet } from './useWallet';

const baseSepolia = defineChain({
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://sepolia.base.org'] } },
  blockExplorers: { default: { name: 'BaseScan', url: 'https://sepolia.basescan.org' } },
  testnet: true,
});

export function useOraclonEscrow() {
  const { account, switchToBaseSepolia } = useWallet();

  const publicClient = useMemo(
    () => createPublicClient({ chain: baseSepolia, transport: http() }),
    []
  );

  const getWalletClient = useCallback(async () => {
    if (!account) throw new Error('Connect a wallet first.');
    await switchToBaseSepolia();
    return createWalletClient({
      account,
      chain: baseSepolia,
      transport: custom(window.ethereum),
    });
  }, [account, switchToBaseSepolia]);

  const getDisputeCore = useCallback(
    async (disputeId) => {
      const result = await publicClient.readContract({
        address: ESCROW_CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'getDisputeCore',
        args: [BigInt(disputeId)],
      });
      const [id, agentA, agentB, stakeAmount, status, createdAt, resolvedAt] = result;
      return { id, agentA, agentB, stakeAmount, status: Number(status), createdAt, resolvedAt };
    },
    [publicClient]
  );

  const getDisputeClaims = useCallback(
    async (disputeId) => {
      const result = await publicClient.readContract({
        address: ESCROW_CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'getDisputeClaims',
        args: [BigInt(disputeId)],
      });
      const [agentAClaimedTvlE6, agentBClaimedTvlE6, protocolSlug, targetDate] = result;
      return { agentAClaimedTvlE6, agentBClaimedTvlE6, protocolSlug, targetDate };
    },
    [publicClient]
  );

  const getDisputeVerdict = useCallback(
    async (disputeId) => {
      const result = await publicClient.readContract({
        address: ESCROW_CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'getDisputeVerdict',
        args: [BigInt(disputeId)],
      });
      const [agentAAccuracy, agentBAccuracy, reasoningSummary] = result;
      return { agentAAccuracy: Number(agentAAccuracy), agentBAccuracy: Number(agentBAccuracy), reasoningSummary };
    },
    [publicClient]
  );

  const getPendingBalance = useCallback(
    async (address) => {
      const result = await publicClient.readContract({
        address: ESCROW_CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'getPendingBalance',
        args: [address],
      });
      return result;
    },
    [publicClient]
  );

  const createDispute = useCallback(
    async ({ agentA, agentB, stakeEth, agentAClaimedTvlE6, agentBClaimedTvlE6, protocolSlug, targetDate }) => {
      const client = await getWalletClient();
      const hash = await client.writeContract({
        address: ESCROW_CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'createDispute',
        args: [
          agentA,
          agentB,
          parseEther(stakeEth),
          BigInt(agentAClaimedTvlE6),
          BigInt(agentBClaimedTvlE6),
          protocolSlug,
          BigInt(targetDate),
        ],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, receipt };
    },
    [getWalletClient, publicClient]
  );

  const stakeAsAgentA = useCallback(
    async (disputeId, stakeEth) => {
      const client = await getWalletClient();
      const hash = await client.writeContract({
        address: ESCROW_CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'stakeAsAgentA',
        args: [BigInt(disputeId)],
        value: parseEther(stakeEth),
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, receipt };
    },
    [getWalletClient, publicClient]
  );

  const stakeAsAgentB = useCallback(
    async (disputeId, stakeEth) => {
      const client = await getWalletClient();
      const hash = await client.writeContract({
        address: ESCROW_CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'stakeAsAgentB',
        args: [BigInt(disputeId)],
        value: parseEther(stakeEth),
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, receipt };
    },
    [getWalletClient, publicClient]
  );

  const withdraw = useCallback(async () => {
    const client = await getWalletClient();
    const hash = await client.writeContract({
      address: ESCROW_CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'withdraw',
      args: [],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return { hash, receipt };
  }, [getWalletClient, publicClient]);

  return {
    getDisputeCore,
    getDisputeClaims,
    getDisputeVerdict,
    getPendingBalance,
    createDispute,
    stakeAsAgentA,
    stakeAsAgentB,
    withdraw,
  };
}
