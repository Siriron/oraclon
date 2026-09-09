import { useCallback, useMemo } from 'react';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { GENLAYER_CONTRACT_ADDRESS } from '../config/chains';
import { useWallet } from './useWallet';

// TransactionStatus import per confirmed SDK usage (project knowledge
// section 7) — wait for ACCEPTED before treating a write as durable.
import { TransactionStatus } from 'genlayer-js/types';

const RECEIPT_CONFIG = { retries: 120, interval: 4000 };

export class GenLayerTimeoutError extends Error {
  constructor(hash) {
    super(
      `Consensus is taking longer than expected. Your transaction was submitted — check its status directly on the explorer.`
    );
    this.txHash = hash;
    this.isTimeout = true;
  }
}

export function useOraclonGenLayer() {
  const { account, switchToStudioNet } = useWallet();

  const readClient = useMemo(() => createClient({ chain: studionet }), []);

  const getWriteClient = useCallback(async () => {
    if (!account) throw new Error('Connect a wallet first.');
    await switchToStudioNet();
    const client = createClient({
      chain: studionet,
      account,
      provider: window.ethereum,
    });
    if (typeof client.connect === 'function') {
      try {
        await client.connect('studionet');
      } catch {
        // defensive no-op — not all SDK versions expose this method
      }
    }
    return client;
  }, [account, switchToStudioNet]);

  const getDispute = useCallback(
    async (disputeId) => {
      const raw = await readClient.readContract({
        address: GENLAYER_CONTRACT_ADDRESS,
        functionName: 'get_dispute',
        args: [BigInt(disputeId)],
      });
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    },
    [readClient]
  );

  const listDisputes = useCallback(async () => {
    const raw = await readClient.readContract({
      address: GENLAYER_CONTRACT_ADDRESS,
      functionName: 'list_disputes',
      args: [],
    });
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed.disputes || [];
  }, [readClient]);

  const createDispute = useCallback(
    async ({ protocolSlug, targetDate, agentAAddress, agentAClaimedTvlE6, agentBAddress, agentBClaimedTvlE6 }) => {
      const client = await getWriteClient();
      const txHash = await client.writeContract({
        address: GENLAYER_CONTRACT_ADDRESS,
        functionName: 'create_dispute',
        args: [
          protocolSlug,
          BigInt(targetDate),
          agentAAddress,
          BigInt(agentAClaimedTvlE6),
          agentBAddress,
          BigInt(agentBClaimedTvlE6),
        ],
        value: BigInt(0),
      });
      try {
        const receipt = await client.waitForTransactionReceipt({
          hash: txHash,
          status: TransactionStatus.ACCEPTED,
          ...RECEIPT_CONFIG,
        });
        return { txHash, receipt };
      } catch (err) {
        throw new GenLayerTimeoutError(txHash);
      }
    },
    [getWriteClient]
  );

  const resolveDispute = useCallback(
    async (disputeId) => {
      const client = await getWriteClient();
      const txHash = await client.writeContract({
        address: GENLAYER_CONTRACT_ADDRESS,
        functionName: 'resolve_dispute',
        args: [BigInt(disputeId)],
        value: BigInt(0),
      });
      try {
        const receipt = await client.waitForTransactionReceipt({
          hash: txHash,
          status: TransactionStatus.ACCEPTED,
          ...RECEIPT_CONFIG,
        });
        return { txHash, receipt };
      } catch (err) {
        throw new GenLayerTimeoutError(txHash);
      }
    },
    [getWriteClient]
  );

  return { getDispute, listDisputes, createDispute, resolveDispute };
}
