import { Link, Outlet } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import interiorImage from '../assets/interior.jpg';
import './AppShell.css';

function shortAddress(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function AppShell() {
  const { account, connecting, error, connect } = useWallet();

  return (
    <div className="shell">
      <div
        className="shell__backdrop"
        style={{ backgroundImage: `url(${interiorImage})` }}
        role="img"
        aria-label="Warm lantern-lit bookshelves in an archivist's study"
      />
      <div className="shell__scrim" />

      <header className="shell__header">
        <Link to="/" className="shell__brand">
          Oraclon
        </Link>
        <nav className="shell__nav">
          <Link to="/app">Ledger</Link>
          <Link to="/app/new">File a Claim</Link>
        </nav>
        <div className="shell__wallet">
          {account ? (
            <span className="shell__wallet-connected">{shortAddress(account)}</span>
          ) : (
            <button className="shell__wallet-btn" onClick={connect} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </header>

      {error && <div className="shell__error-banner">{error}</div>}

      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}
