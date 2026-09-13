import { useCallback, useMemo } from 'react';
import { createPublicClient, createWalletClient, custom, http, defineChain } from 'viem';
import { REGISTRY_CONTRACT_ADDRESS, REGISTRY_ABI } from '../config/chains';
import { useWallet } from './useWallet';

const baseSepolia = defineChain({
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://sepolia.base.org'] } },
  blockExplorers: { default: { name: 'BaseScan', url: 'https://sepolia.basescan.org' } },
  testnet: true,
});

// No stake, no payable calls anywhere in this hook — filing a claim
// costs only gas. See contracts/OraclonRegistry.sol's own module
// docstring for why this contract was rewritten to remove staking.
export function useOraclonRegistry() {
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

  const getClaimCore = useCallback(
    async (claimId) => {
      const result = await publicClient.readContract({
        address: REGISTRY_CONTRACT_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: 'getClaimCore',
        args: [BigInt(claimId)],
      });
      const [id, claimantA, claimantB, status, filedAt, verifiedAt] = result;
      return { id, claimantA, claimantB, status: Number(status), filedAt, verifiedAt };
    },
    [publicClient]
  );

  const getClaimValues = useCallback(
    async (claimId) => {
      const result = await publicClient.readContract({
        address: REGISTRY_CONTRACT_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: 'getClaimValues',
        args: [BigInt(claimId)],
      });
      const [claimedTvlAE6, claimedTvlBE6, protocolSlug, targetDate] = result;
      return { claimedTvlAE6, claimedTvlBE6, protocolSlug, targetDate };
    },
    [publicClient]
  );

  const getClaimVerdict = useCallback(
    async (claimId) => {
      const result = await publicClient.readContract({
        address: REGISTRY_CONTRACT_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: 'getClaimVerdict',
        args: [BigInt(claimId)],
      });
      const [resultA, resultB, reasoningSummary] = result;
      return { resultA: Number(resultA), resultB: Number(resultB), reasoningSummary };
    },
    [publicClient]
  );

  // No stakeEth parameter anywhere — filing costs only gas, no value
  // attached to this call at all.
  const fileClaim = useCallback(
    async ({ claimantA, claimantB, claimedTvlAE6, claimedTvlBE6, protocolSlug, targetDate }) => {
      const client = await getWalletClient();
      const hash = await client.writeContract({
        address: REGISTRY_CONTRACT_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: 'fileClaim',
        args: [
          claimantA,
          claimantB,
          BigInt(claimedTvlAE6),
          BigInt(claimedTvlBE6),
          protocolSlug,
          BigInt(targetDate),
        ],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, receipt };
    },
    [getWalletClient, publicClient]
  );

  // Accuracy string (GenVM) -> Result enum raw value (Solidity: Unset=0,
  // Accurate=1, Inaccurate=2). Kept in this hook, not a standalone
  // script, so the mapping only ever lives in one place.
  function resultToRaw(accuracyStr) {
    if (accuracyStr === 'accurate') return 1;
    if (accuracyStr === 'inaccurate') return 2;
    throw new Error(`Unrecognized accuracy value from GenVM: "${accuracyStr}"`);
  }

  // Wallet-signed recording of a GenLayer verdict onto Base Sepolia.
  // Replaces the old standalone relay.js script, which required a
  // private key in a .env file. This does the exact same three things
  // relay.js did — read the GenLayer verdict (the caller passes it in,
  // already fetched), cross-check protocol_slug/target_date against
  // this chain's own record, then call recordVerdict() — except the
  // transaction is signed by whichever wallet is currently connected in
  // the browser, exactly like fileClaim() above. No private key ever
  // enters this app's code or files. Whoever's connected wallet is the
  // registered `relayer` on the contract is the only one who can
  // actually succeed here — the contract's own onlyRelayer check
  // enforces that, same as it would for a script.
  const recordVerdict = useCallback(
    async (claimId, genlayerDispute) => {
      if (genlayerDispute.status !== 'resolved') {
        throw new Error(
          `GenLayer claim #${claimId} has status "${genlayerDispute.status}", not "resolved" — verify it on GenLayer first.`
        );
      }

      const registryClaim = await getClaimValues(claimId);
      const core = await getClaimCore(claimId);

      if (core.status !== 0) {
        throw new Error(
          `Base Sepolia claim #${claimId} is not in the "Filed" state — it may already have a recorded verdict.`
        );
      }

      const mismatches = [];
      if (genlayerDispute.protocol_slug !== registryClaim.protocolSlug) {
        mismatches.push(
          `protocol_slug mismatch: GenLayer="${genlayerDispute.protocol_slug}" vs Base Sepolia="${registryClaim.protocolSlug}"`
        );
      }
      if (String(genlayerDispute.target_date) !== String(registryClaim.targetDate)) {
        mismatches.push(
          `target_date mismatch: GenLayer="${genlayerDispute.target_date}" vs Base Sepolia="${registryClaim.targetDate}"`
        );
      }
      if (mismatches.length > 0) {
        throw new Error(
          `Refusing to record a verdict across mismatched claim parameters:\n${mismatches.join('\n')}`
        );
      }

      const resultARaw = resultToRaw(genlayerDispute.agent_a_accuracy);
      const resultBRaw = resultToRaw(genlayerDispute.agent_b_accuracy);

      const client = await getWalletClient();
      const hash = await client.writeContract({
        address: REGISTRY_CONTRACT_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: 'recordVerdict',
        args: [BigInt(claimId), resultARaw, resultBRaw, genlayerDispute.reasoning_summary || ''],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, receipt };
    },
    [getWalletClient, publicClient, getClaimValues, getClaimCore]
  );

  return {
    getClaimCore,
    getClaimValues,
    getClaimVerdict,
    fileClaim,
    recordVerdict,
  };
}
