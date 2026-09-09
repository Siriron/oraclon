import { useState, useEffect, useCallback } from 'react';
import { STUDIONET_CONFIG, BASE_SEPOLIA_CONFIG } from '../config/chains';

// Confirmed-working ensureChain pattern (project knowledge, section 7):
// never rely on a client's internal chain config alone to put the wallet
// on the right network — call this explicitly before every write.
async function ensureChain(chainConfig) {
  const eth = window.ethereum;
  if (!eth) return;
  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainConfig.chainId }],
    });
  } catch (err) {
    if (err && err.code === 4902) {
      await eth.request({ method: 'wallet_addEthereumChain', params: [chainConfig] });
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainConfig.chainId }],
      });
    } else if (err && err.code === -32002) {
      await new Promise((r) => setTimeout(r, 3000));
    } else {
      throw err;
    }
  }
}

export function useWallet() {
  const [account, setAccount] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  // On mount, silently check for an already-authorized account (never
  // eth_requestAccounts here, which would prompt unprompted) and stay in
  // sync if the person switches wallets — confirmed pattern, project
  // knowledge section 7.
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;
    eth
      .request({ method: 'eth_accounts' })
      .then((accounts) => {
        if (accounts[0]) setAccount(accounts[0]);
      })
      .catch(() => {});
    const handleAccountsChanged = (accounts) => setAccount(accounts[0] || null);
    if (eth.on) eth.on('accountsChanged', handleAccountsChanged);
    return () => {
      if (eth.removeListener) eth.removeListener('accountsChanged', handleAccountsChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) {
      setError('No wallet found. Install MetaMask or another browser wallet to continue.');
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      setAccount(accounts[0] || null);
    } catch (err) {
      setError(err?.message || 'Connection was declined.');
    } finally {
      setConnecting(false);
    }
  }, []);

  const switchToStudioNet = useCallback(() => ensureChain(STUDIONET_CONFIG), []);
  const switchToBaseSepolia = useCallback(() => ensureChain(BASE_SEPOLIA_CONFIG), []);

  return { account, connecting, error, connect, switchToStudioNet, switchToBaseSepolia };
}
