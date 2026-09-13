import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useOraclonGenLayer } from '../hooks/useOraclonGenLayer';
import { useOraclonRegistry } from '../hooks/useOraclonRegistry';
import { useWallet } from '../hooks/useWallet';
import { CLAIM_SCENARIOS } from '../data/claimScenarios';
import {
  GENLAYER_EXPLORER_TX_URL,
  BASE_SEPOLIA_EXPLORER_TX_URL,
} from '../config/chains';
import './NewDispute.css';

const STEPS = {
  FORM: 'form',
  GENLAYER_PENDING: 'genlayer_pending',
  BASE_PENDING: 'base_pending',
  DONE: 'done',
  FAILED: 'failed',
};

const EMPTY_FORM = {
  protocolSlug: '',
  targetDate: '',
  claimantAAddress: '',
  claimedTvlAE6: '',
  claimantBAddress: '',
  claimedTvlBE6: '',
};

function microsToApprox(micros) {
  const n = Number(micros) / 1_000_000;
  if (n >= 1_000_000_000) return `~$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `~$${(n / 1_000_000).toFixed(1)}M`;
  return `~$${n.toLocaleString()}`;
}

export default function NewDispute() {
  const navigate = useNavigate();
  const { account } = useWallet();
  const { createDispute: createOnGenLayer, listDisputes } = useOraclonGenLayer();
  const { fileClaim: fileOnBase } = useOraclonRegistry();

  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedScenarioId, setSelectedScenarioId] = useState(null);

  const [step, setStep] = useState(STEPS.FORM);
  const [errorMsg, setErrorMsg] = useState(null);
  const [genlayerResult, setGenlayerResult] = useState(null);
  const [baseResult, setBaseResult] = useState(null);
  const [disputeId, setDisputeId] = useState(null);

  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    // Any manual edit to a scenario-controlled field un-selects the
    // scenario, so the picker never silently claims credit for numbers
    // the person has since changed by hand.
    if (['protocolSlug', 'targetDate', 'claimedTvlAE6', 'claimedTvlBE6'].includes(key)) {
      setSelectedScenarioId(null);
    }
  };

  const applyScenario = (scenario) => {
    setForm((f) => ({
      ...f,
      protocolSlug: scenario.protocolSlug,
      targetDate: scenario.targetDate,
      claimedTvlAE6: scenario.agentAClaimedTvlE6,
      claimedTvlBE6: scenario.agentBClaimedTvlE6,
    }));
    setSelectedScenarioId(scenario.id);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!account) {
      setErrorMsg('Connect a wallet before filing a claim.');
      return;
    }
    setErrorMsg(null);

    try {
      setStep(STEPS.GENLAYER_PENDING);
      const glResult = await createOnGenLayer({
        protocolSlug: form.protocolSlug,
        targetDate: form.targetDate,
        agentAAddress: form.claimantAAddress,
        agentAClaimedTvlE6: form.claimedTvlAE6,
        agentBAddress: form.claimantBAddress,
        agentBClaimedTvlE6: form.claimedTvlBE6,
      });
      setGenlayerResult(glResult);

      try {
        const all = await listDisputes();
        if (all.length > 0) {
          const highest = all.reduce((max, d) => (Number(d.dispute_id) > Number(max.dispute_id) ? d : max), all[0]);
          setDisputeId(highest.dispute_id);
        }
      } catch {
        // non-fatal — the ledger view will show it regardless
      }

      setStep(STEPS.BASE_PENDING);
      try {
        const baseResultData = await fileOnBase({
          claimantA: form.claimantAAddress,
          claimantB: form.claimantBAddress,
          claimedTvlAE6: form.claimedTvlAE6,
          claimedTvlBE6: form.claimedTvlBE6,
          protocolSlug: form.protocolSlug,
          targetDate: form.targetDate,
        });
        setBaseResult(baseResultData);
        setStep(STEPS.DONE);
      } catch (baseErr) {
        setErrorMsg(
          `GenLayer recorded this claim (id ${disputeId ?? '— check the Ledger'}), but recording it on Base Sepolia failed: ${
            baseErr?.message || 'unknown error'
          }. Do not re-submit this form — instead, file the matching Base Sepolia record separately with identical protocol_slug and target_date, or contact support with the GenLayer claim id above.`
        );
        setStep(STEPS.FAILED);
        return;
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Something went wrong while filing the claim.');
      setStep(STEPS.FAILED);
    }
  };

  if (step === STEPS.DONE) {
    return (
      <div className="new-dispute new-dispute--done">
        <h2>Claim Filed</h2>
        <p className="new-dispute__done-copy">
          Both claims are now recorded on both chains, at no cost beyond gas.
          No funds were staked or moved. Either claim can now be verified
          against real DefiLlama data.
        </p>
        <div className="new-dispute__receipts">
          <a
            href={GENLAYER_EXPLORER_TX_URL(genlayerResult?.txHash)}
            target="_blank"
            rel="noreferrer"
            className="new-dispute__receipt-link"
          >
            View GenLayer transaction ↗
          </a>
          <a
            href={BASE_SEPOLIA_EXPLORER_TX_URL(baseResult?.hash)}
            target="_blank"
            rel="noreferrer"
            className="new-dispute__receipt-link"
          >
            View Base Sepolia transaction ↗
          </a>
        </div>
        <div className="new-dispute__done-actions">
          {disputeId != null && (
            <Link to={`/app/dispute/${disputeId}`} className="new-dispute__submit new-dispute__submit--link">
              View This Claim
            </Link>
          )}
          <button className="new-dispute__submit" onClick={() => navigate('/app')}>
            Return to the Ledger
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="new-dispute">
      <div className="new-dispute__heading">
        <h2>File a Claim</h2>
        <p>
          Two independent claims, checked against one true record. This
          writes to GenLayer first, then to Base Sepolia. No stake, no
          wager, no funds move at any point — filing and verifying a claim
          costs only network gas.
        </p>
      </div>

      <section className="scenario-picker">
        <div className="scenario-picker__heading">
          <h3>Preset Test Inputs</h3>
          <p>
            A fixed list of ten inputs written directly into this repo's
            source code (<code>src/data/claimScenarios.js</code>) by the
            developer. These are not live data, not generated by any agent,
            and not fetched from anywhere at runtime — they exist purely to
            save you from typing values by hand while testing. Every
            protocol slug is real and checkable on DefiLlama; the claim
            numbers are values chosen by hand to exercise specific outcomes.
            Selecting a row fills the protocol and claim fields below — you
            still enter both wallet addresses yourself.
          </p>
        </div>
        <div className="scenario-list">
          <div className="scenario-list__header">
            <span>Protocol</span>
            <span>As of</span>
            <span>Claim A / Claim B</span>
            <span>Purpose</span>
          </div>
          {CLAIM_SCENARIOS.map((s) => (
            <button
              type="button"
              key={s.id}
              className={`scenario-row ${selectedScenarioId === s.id ? 'scenario-row--selected' : ''}`}
              onClick={() => applyScenario(s)}
            >
              <span className="scenario-row__protocol">
                {s.protocolLabel}
                {s.liveConfirmed && <span className="scenario-row__live-badge">Live-tested</span>}
              </span>
              <span className="scenario-row__date">{s.targetDateLabel}</span>
              <span className="scenario-row__claims">
                {microsToApprox(s.agentAClaimedTvlE6)} / {microsToApprox(s.agentBClaimedTvlE6)}
              </span>
              <span className="scenario-row__purpose">{s.expectedOutcome}</span>
            </button>
          ))}
        </div>
        {selectedScenarioId && (
          <p className="scenario-picker__note">
            {CLAIM_SCENARIOS.find((s) => s.id === selectedScenarioId)?.note}
          </p>
        )}
      </section>

      <form onSubmit={handleSubmit} className="new-dispute__form">
        <fieldset className="new-dispute__fieldset">
          <legend>The Protocol</legend>
          <label>
            Protocol slug
            <input value={form.protocolSlug} onChange={update('protocolSlug')} placeholder="aave" required />
          </label>
          <label>
            Target date (unix seconds)
            <input value={form.targetDate} onChange={update('targetDate')} placeholder="1756684800" required />
          </label>
        </fieldset>

        <fieldset className="new-dispute__fieldset">
          <legend>Claimant A — claims current TVL</legend>
          <label>
            Address (Base Sepolia)
            <input value={form.claimantAAddress} onChange={update('claimantAAddress')} placeholder="0x…" required />
          </label>
          <label>
            Claimed TVL (micros, ×1e6)
            <input value={form.claimedTvlAE6} onChange={update('claimedTvlAE6')} required />
          </label>
        </fieldset>

        <fieldset className="new-dispute__fieldset">
          <legend>Claimant B — claims historical TVL</legend>
          <label>
            Address (Base Sepolia)
            <input value={form.claimantBAddress} onChange={update('claimantBAddress')} placeholder="0x…" required />
          </label>
          <label>
            Claimed TVL (micros, ×1e6)
            <input value={form.claimedTvlBE6} onChange={update('claimedTvlBE6')} required />
          </label>
        </fieldset>

        {errorMsg && <p className="new-dispute__error">{errorMsg}</p>}

        <button
          type="submit"
          className="new-dispute__submit"
          disabled={step === STEPS.GENLAYER_PENDING || step === STEPS.BASE_PENDING}
        >
          {step === STEPS.GENLAYER_PENDING && 'Writing to GenLayer… this can take a few minutes'}
          {step === STEPS.BASE_PENDING && 'Writing to Base Sepolia…'}
          {(step === STEPS.FORM || step === STEPS.FAILED) && 'File the Claim'}
        </button>
      </form>
    </div>
  );
}
