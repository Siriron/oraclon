import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useOraclonGenLayer } from '../hooks/useOraclonGenLayer';
import { useOraclonEscrow } from '../hooks/useOraclonEscrow';
import { useWallet } from '../hooks/useWallet';
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
  agentAAddress: '',
  agentAClaimedTvlE6: '',
  agentBAddress: '',
  agentBClaimedTvlE6: '',
  stakeEth: '0.01',
};

// The one already-proven combination from live testing (see project
// notes) — offered as an explicit, opt-in fill, never as the silent
// default, so nobody re-files the same proven dispute by accident
// without realizing the form was pre-populated.
const PROVEN_TEST_VALUES = {
  protocolSlug: 'aave',
  targetDate: '1756684800',
  agentAClaimedTvlE6: '18405000000000000',
  agentBClaimedTvlE6: '30250000000000000',
};

export default function NewDispute() {
  const navigate = useNavigate();
  const { account } = useWallet();
  const { createDispute: createOnGenLayer, listDisputes } = useOraclonGenLayer();
  const { createDispute: createOnBase } = useOraclonEscrow();

  const [form, setForm] = useState(EMPTY_FORM);

  const [step, setStep] = useState(STEPS.FORM);
  const [errorMsg, setErrorMsg] = useState(null);
  const [genlayerResult, setGenlayerResult] = useState(null);
  const [baseResult, setBaseResult] = useState(null);
  const [disputeId, setDisputeId] = useState(null);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const fillProvenTestValues = () => {
    setForm((f) => ({ ...f, ...PROVEN_TEST_VALUES }));
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
        agentAAddress: form.agentAAddress,
        agentAClaimedTvlE6: form.agentAClaimedTvlE6,
        agentBAddress: form.agentBAddress,
        agentBClaimedTvlE6: form.agentBClaimedTvlE6,
      });
      setGenlayerResult(glResult);

      // The write itself doesn't hand back a plain dispute_id from the
      // receipt — read it back via list_disputes(), taking the highest
      // id, which is safe here since we're the ones who just created it
      // and dispute ids are assigned strictly increasing on GenVM.
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
        const baseResultData = await createOnBase({
          agentA: form.agentAAddress,
          agentB: form.agentBAddress,
          stakeEth: form.stakeEth,
          agentAClaimedTvlE6: form.agentAClaimedTvlE6,
          agentBClaimedTvlE6: form.agentBClaimedTvlE6,
          protocolSlug: form.protocolSlug,
          targetDate: form.targetDate,
        });
        setBaseResult(baseResultData);
        setStep(STEPS.DONE);
      } catch (baseErr) {
        // GenLayer's half already exists at this point — don't let the
        // person think nothing happened and re-submit, which would
        // create a second, disconnected GenLayer dispute.
        setErrorMsg(
          `GenLayer recorded this dispute (id ${disputeId ?? '— check the Ledger'}), but writing to Base Sepolia failed: ${
            baseErr?.message || 'unknown error'
          }. Do not re-submit this form — instead, create the matching Base Sepolia dispute separately with identical protocol_slug and target_date, or contact support with the GenLayer dispute id above.`
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
          Both halves of this dispute now exist. Each agent must stake before
          it can be resolved.
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
              View This Dispute
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
          Two agents, one true record. This writes to GenLayer first, then to
          Base Sepolia — both halves must exist before either agent can stake.
        </p>
        <button type="button" className="new-dispute__fill-test" onClick={fillProvenTestValues}>
          Fill known-good test values (Aave)
        </button>
      </div>

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
          <label>
            Stake per agent (ETH)
            <input value={form.stakeEth} onChange={update('stakeEth')} placeholder="0.01" required />
          </label>
        </fieldset>

        <fieldset className="new-dispute__fieldset">
          <legend>Agent A — claims current TVL</legend>
          <label>
            Address (Base Sepolia)
            <input value={form.agentAAddress} onChange={update('agentAAddress')} placeholder="0x…" required />
          </label>
          <label>
            Claimed TVL (micros, ×1e6)
            <input value={form.agentAClaimedTvlE6} onChange={update('agentAClaimedTvlE6')} required />
          </label>
        </fieldset>

        <fieldset className="new-dispute__fieldset">
          <legend>Agent B — claims historical TVL</legend>
          <label>
            Address (Base Sepolia)
            <input value={form.agentBAddress} onChange={update('agentBAddress')} placeholder="0x…" required />
          </label>
          <label>
            Claimed TVL (micros, ×1e6)
            <input value={form.agentBClaimedTvlE6} onChange={update('agentBClaimedTvlE6')} required />
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
