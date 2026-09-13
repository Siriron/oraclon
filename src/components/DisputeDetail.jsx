import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useOraclonGenLayer } from '../hooks/useOraclonGenLayer';
import { useOraclonRegistry } from '../hooks/useOraclonRegistry';
import {
  GENLAYER_CONTRACT_ADDRESS,
  GENLAYER_EXPLORER_ADDRESS_URL,
  REGISTRY_STATUS_LABELS,
} from '../config/chains';
import './DisputeDetail.css';

function microsToDisplay(micros) {
  if (micros === undefined || micros === null) return '—';
  const n = typeof micros === 'bigint' ? micros : BigInt(micros);
  const whole = n / 1_000_000n;
  return `$${whole.toLocaleString()}`;
}

function AccuracyBadge({ accuracy }) {
  if (accuracy === 'accurate' || accuracy === 1) {
    return <span className="accuracy-badge accuracy-badge--accurate">Verified Accurate</span>;
  }
  if (accuracy === 'inaccurate' || accuracy === 2) {
    return <span className="accuracy-badge accuracy-badge--inaccurate">Verified Inaccurate</span>;
  }
  return <span className="accuracy-badge accuracy-badge--pending">Awaiting Verification</span>;
}

export default function DisputeDetail() {
  const { id } = useParams();
  const { getDispute, resolveDispute } = useOraclonGenLayer();
  const { getClaimCore, getClaimValues, recordVerdict } = useOraclonRegistry();

  const [glDispute, setGlDispute] = useState(null);
  const [baseCore, setBaseCore] = useState(null);
  const [baseClaims, setBaseClaims] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [actionState, setActionState] = useState({ busy: false, error: null });
  const [recordResult, setRecordResult] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [gl, core, claims] = await Promise.all([
        getDispute(id),
        getClaimCore(id).catch(() => null),
        getClaimValues(id).catch(() => null),
      ]);
      setGlDispute(gl);
      setBaseCore(core);
      setBaseClaims(claims);
    } catch (err) {
      setLoadError(err?.message || 'Could not load this claim.');
    }
  }, [id, getDispute, getClaimCore, getClaimValues]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleResolve = async () => {
    setActionState({ busy: true, error: null });
    try {
      await resolveDispute(id);
      await refresh();
      setActionState({ busy: false, error: null });
    } catch (err) {
      setActionState({ busy: false, error: err?.message || 'Verification failed.' });
    }
  };

  const handleRecordVerdict = async () => {
    setActionState({ busy: true, error: null });
    try {
      const result = await recordVerdict(id, glDispute);
      setRecordResult(result);
      await refresh();
      setActionState({ busy: false, error: null });
    } catch (err) {
      const message = err?.message || '';
      const looksLikeAuthFailure =
        message.includes('NotRelayer') || message.includes('reverted');
      setActionState({
        busy: false,
        error: looksLikeAuthFailure
          ? 'This transaction was rejected by the contract. Only the wallet registered as the relayer on OraclonRegistry.sol can record a verdict — check that the connected wallet matches that address.'
          : message || 'Recording the verdict failed.',
      });
    }
  };

  if (loadError) {
    return <p className="dispute-detail__error">{loadError}</p>;
  }

  if (!glDispute) {
    return (
      <div className="dispute-detail__loading">
        <span className="ledger__loading-spinner" />
        Reading the record…
      </div>
    );
  }

  const registryStatus = baseCore ? REGISTRY_STATUS_LABELS[baseCore.status] : null;
  const isResolved = glDispute.status === 'resolved';

  return (
    <div className="dispute-detail">
      <div className="dispute-detail__heading">
        <span className="dispute-detail__id">№ {id}</span>
        <h2>{glDispute.protocol_slug}</h2>
        <p className="dispute-detail__target-date">
          Target date: {new Date(Number(glDispute.target_date) * 1000).toUTCString()}
        </p>
      </div>

      <div className="dispute-detail__claims">
        <div className="claim-card">
          <h3>Claimant A</h3>
          <p className="claim-card__label">Claims current TVL</p>
          <p className="claim-card__value">{microsToDisplay(glDispute.agent_a_claimed_tvl_e6)}</p>
          <AccuracyBadge accuracy={glDispute.agent_a_accuracy} />
        </div>
        <div className="claim-card__vs">vs.</div>
        <div className="claim-card">
          <h3>Claimant B</h3>
          <p className="claim-card__label">Claims historical TVL</p>
          <p className="claim-card__value">{microsToDisplay(glDispute.agent_b_claimed_tvl_e6)}</p>
          <AccuracyBadge accuracy={glDispute.agent_b_accuracy} />
        </div>
      </div>

      {isResolved && glDispute.reasoning_summary && (
        <div className="dispute-detail__reasoning">
          <h3>The Record's Judgment</h3>
          <p>{glDispute.reasoning_summary}</p>
        </div>
      )}

      <div className="dispute-detail__chain-status">
        <div className="chain-status-row">
          <span className="chain-status-row__label">GenLayer</span>
          <span className={`chain-status-row__value chain-status-row__value--${glDispute.status}`}>
            {glDispute.status === 'resolved' ? 'Verified' : 'Awaiting Verification'}
          </span>
          <a
            href={GENLAYER_EXPLORER_ADDRESS_URL(GENLAYER_CONTRACT_ADDRESS)}
            target="_blank"
            rel="noreferrer"
            className="chain-status-row__link"
          >
            Explorer ↗
          </a>
        </div>
        {registryStatus && (
          <div className="chain-status-row">
            <span className="chain-status-row__label">Base Sepolia</span>
            <span className="chain-status-row__value">{registryStatus}</span>
          </div>
        )}
        {baseClaims && (
          <div className="chain-status-row chain-status-row--fine-print">
            <span className="chain-status-row__label">Params match</span>
            <span className="chain-status-row__value">
              {baseClaims.protocolSlug === glDispute.protocol_slug &&
              String(baseClaims.targetDate) === String(glDispute.target_date)
                ? 'Confirmed — both chains agree'
                : 'Mismatch detected — do not verify'}
            </span>
          </div>
        )}
      </div>

      {actionState.error && <p className="dispute-detail__error">{actionState.error}</p>}

      <div className="dispute-detail__actions">
        {!isResolved && glDispute.status === 'submitted' && (
          <button className="dispute-detail__action-btn dispute-detail__action-btn--primary" onClick={handleResolve} disabled={actionState.busy}>
            {actionState.busy ? 'Verifying… this can take several minutes' : 'Verify on GenLayer'}
          </button>
        )}
        {isResolved && baseCore && baseCore.status === 0 && (
          <button className="dispute-detail__action-btn dispute-detail__action-btn--primary" onClick={handleRecordVerdict} disabled={actionState.busy}>
            {actionState.busy ? 'Recording on Base Sepolia…' : 'Record Verdict on Base Sepolia'}
          </button>
        )}
      </div>

      <p className="dispute-detail__no-stake-note">
        No funds are staked or held anywhere in this system. This is a
        factual verification record, not a wager — filing and verifying a
        claim costs only network gas. No private key is ever used by this
        app: every transaction, including recording a verdict, is signed
        by whichever wallet is connected in your browser.
      </p>

      {isResolved && baseCore && baseCore.status === 0 && (
        <div className="dispute-detail__relay-note">
          <p>
            This claim has been verified on GenLayer. Recording the result
            on Base Sepolia only works if your connected wallet is the
            address registered as <code>relayer</code> on
            <code> OraclonRegistry.sol</code> — anyone else's wallet will
            have this transaction rejected by the contract itself.
          </p>
        </div>
      )}

      {recordResult && (
        <div className="dispute-detail__relay-note">
          <p>
            Verdict recorded on Base Sepolia — transaction{' '}
            <code>{recordResult.hash}</code>. Anyone can independently
            compare this against the GenLayer verdict above to confirm the
            two chains agree.
          </p>
        </div>
      )}
    </div>
  );
}
