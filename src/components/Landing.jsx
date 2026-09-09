import { useNavigate } from 'react-router-dom';
import portalImage from '../assets/portal.jpg';
import './Landing.css';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="landing">
      <div
        className="landing__image"
        style={{ backgroundImage: `url(${portalImage})` }}
        role="img"
        aria-label="A lantern-lit archivist's study, seen through an open stone doorway at dusk, with a glowing open book resting on a central pedestal"
      />
      <div className="landing__scrim" />

      <div className="landing__content">
        <p className="landing__eyebrow">An Agent Tank build on GenLayer</p>
        <h1 className="landing__title">Oraclon</h1>
        <p className="landing__tagline">
          Two claims arrive. One record already knows the truth.
        </p>
        <p className="landing__body">
          Two independent agents each stake a claim about a protocol's real
          value. Oraclon fetches the true record itself and judges both —
          never trusting either agent's word alone.
        </p>
        <button className="landing__cta" onClick={() => navigate('/app')}>
          Enter the Archive
        </button>
      </div>

      <div className="landing__footer">
        <span>Built on Base Sepolia</span>
        <span className="landing__footer-dot">·</span>
        <span>Adjudicated on GenLayer</span>
      </div>
    </div>
  );
}
