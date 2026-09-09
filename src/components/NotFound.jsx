import { Link } from 'react-router-dom';
import './NotFound.css';

export default function NotFound() {
  return (
    <div className="not-found">
      <p className="not-found__eyebrow">№ ???</p>
      <h1>This page isn't in the ledger.</h1>
      <p className="not-found__body">
        Whatever you were looking for hasn't been recorded here — or never
        existed at all.
      </p>
      <Link to="/" className="not-found__link">
        Return to the Archive
      </Link>
    </div>
  );
}
