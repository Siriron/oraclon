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

      {error && <p className="ledger__error">{error}</p>}

      {disputes === null && !error && (
        <div className="ledger__loading">
          <span className="ledger__loading-spinner" />
          Reading the ledger…
        </div>
      )}

      {disputes && disputes.length === 0 && (
        <div className="ledger__empty">
          <p>No claims have been filed yet.</p>
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
