import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOraclonGenLayer } from '../hooks/useOraclonGenLayer';
import './Ledger.css';

export default function Ledger() {
  const { listDisputes } = useOraclonGenLayer();
  const [disputes, setDisputes] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listDisputes()
      .then((d) => {
        if (!cancelled) setDisputes(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Could not read the ledger.');
      });
    return () => {
      cancelled = true;
    };
  }, [listDisputes]);

  return (
    <div className="ledger">
      <div className="ledger__heading">
        <h2>The Ledger</h2>
        <p>Every claim ever filed, and what became of it.</p>
      </div>

      <div className="ledger__how-it-works">
        <div className="how-step">
          <span className="how-step__num">1</span>
          <span className="how-step__text">A person files a claim about a protocol's TVL — current for one side, historical for the other.</span>
        </div>
        <div className="how-step">
          <span className="how-step__num">2</span>
          <span className="how-step__text">The claim is recorded on both chains. No funds are staked — filing costs only gas.</span>
        </div>
        <div className="how-step">
          <span className="how-step__num">3</span>
          <span className="how-step__text">GenLayer's AI validators independently fetch the real data and verify both claims — this is the only autonomous step in the system.</span>
        </div>
      </div>

      {error && <p className="ledger__error">{error}</p>}

      {disputes === null && !error && (
        <div className="ledger__loading">
          <span className="ledger__loading-spinner" />
          Reading the ledger…
        </div>
      )}

      {disputes && disputes.length === 0 && (
        <div className="ledger__empty">
          <p className="ledger__empty-headline">No claims filed yet — this is a real, empty ledger.</p>
          <p className="ledger__empty-body">
            Nothing here is simulated. When a claim is filed, it will appear
            as a real row below with its own dispute number, protocol, and
            live status read directly from GenLayer.
          </p>
          <Link to="/app/new" className="ledger__empty-cta">
            File the first one →
          </Link>
        </div>
      )}

      {disputes && disputes.length > 0 && (
        <div className="ledger__entries">
          {disputes.map((d) => (
            <Link to={`/app/dispute/${d.dispute_id}`} key={d.dispute_id} className="ledger-entry">
              <span className="ledger-entry__id">№ {d.dispute_id}</span>
              <span className="ledger-entry__slug">{d.protocol_slug}</span>
              <span className={`ledger-entry__status ledger-entry__status--${d.status}`}>
                {d.status === 'resolved' ? 'Resolved' : 'Awaiting Judgment'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
