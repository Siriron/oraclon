import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useOraclonGenLayer } from '../hooks/useOraclonGenLayer';
import { useOraclonEscrow } from '../hooks/useOraclonEscrow';
import { useWallet } from '../hooks/useWallet';
import {
  GENLAYER_CONTRACT_ADDRESS,
  GENLAYER_EXPLORER_ADDRESS_URL,
  ESCROW_STATUS_LABELS,
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
    return <span className="accuracy-badge accuracy-badge--accurate">Accurate</span>;
  }
  if (accuracy === 'inaccurate' || accuracy === 2) {
    return <span className="accuracy-badge accuracy-badge--inaccurate">Inaccurate</span>;
  }
  return <span className="accuracy-badge accuracy-badge--pending">Awaiting Judgment</span>;
}

export default function DisputeDetail() {
  const { id } = useParams();
  const { account } = useWallet();
  const { getDispute, resolveDispute } = useOraclonGenLayer();
  const { getDisputeCore, getDisputeClaims, stakeAsAgentA, stakeAsAgentB } = useOraclonEscrow();

  const [glDispute, setGlDispute] = useState(null);
  const [baseCore, setBaseCore] = useState(null);
  const [baseClaims, setBaseClaims] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [actionState, setActionState] = useState({ busy: false, error: null });

  const refresh = useCallback(async () => {
    try {
      const [gl, core, claims] = await Promise.all([
        getDispute(id),
        getDisputeCore(id).catch(() => null),
        getDisputeClaims(id).catch(() => null),
      ]);
      setGlDispute(gl);
      setBaseCore(core);
      setBaseClaims(claims);
    } catch (err) {
      setLoadError(err?.message || 'Could not load this dispute.');
    }
  }, [id, getDispute, getDisputeCore, getDisputeClaims]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleStake = async (side) => {
    if (!account) {
      setActionState({ busy: false, error: 'Connect a wallet first.' });
      return;
    }
    setActionState({ busy: true, error: null });
    try {
      const stakeEth = baseCore ? (Number(baseCore.stakeAmount) / 1e18).toString() : '0.01';
      if (side === 'A') await stakeAsAgentA(id, stakeEth);
      else await stakeAsAgentB(id, stakeEth);
      await refresh();
      setActionState({ busy: false, error: null });
    } catch (err) {
      setActionState({ busy: false, error: err?.message || 'Stake failed.' });
    }
  };

  const handleResolve = async () => {
    setActionState({ busy: true, error: null });
    try {
      await resolveDispute(id);
      await refresh();
      setActionState({ busy: false, error: null });
    } catch (err) {
      setActionState({ busy: false, error: err?.message || 'Resolution failed.' });
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

  const escrowStatus = baseCore ? ESCROW_STATUS_LABELS[baseCore.status] : null;
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
          <h3>Agent A</h3>
          <p className="claim-card__label">Claims current TVL</p>
          <p className="claim-card__value">{microsToDisplay(glDispute.agent_a_claimed_tvl_e6)}</p>
          <AccuracyBadge accuracy={glDispute.agent_a_accuracy} />
        </div>
        <div className="claim-card__vs">vs.</div>
        <div className="claim-card">
          <h3>Agent B</h3>
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
            {glDispute.status === 'resolved' ? 'Resolved' : 'Awaiting Resolution'}
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
        {escrowStatus && (
          <div className="chain-status-row">
            <span className="chain-status-row__label">Base Sepolia</span>
            <span className="chain-status-row__value">{escrowStatus}</span>
          </div>
        )}
        {baseClaims && (
          <div className="chain-status-row chain-status-row--fine-print">
            <span className="chain-status-row__label">Params match</span>
            <span className="chain-status-row__value">
              {baseClaims.protocolSlug === glDispute.protocol_slug &&
              String(baseClaims.targetDate) === String(glDispute.target_date)
                ? 'Confirmed — both chains agree'
                : 'Mismatch detected — do not resolve'}
            </span>
          </div>
        )}
      </div>

      {actionState.error && <p className="dispute-detail__error">{actionState.error}</p>}

      <div className="dispute-detail__actions">
        {baseCore && baseCore.status < 2 && (
          <>
            <button className="dispute-detail__action-btn" onClick={() => handleStake('A')} disabled={actionState.busy}>
              Stake as Agent A
            </button>
            <button className="dispute-detail__action-btn" onClick={() => handleStake('B')} disabled={actionState.busy}>
              Stake as Agent B
            </button>
          </>
        )}
        {!isResolved && glDispute.status === 'submitted' && (
          <button className="dispute-detail__action-btn dispute-detail__action-btn--primary" onClick={handleResolve} disabled={actionState.busy}>
            {actionState.busy ? 'Resolving… this can take several minutes' : 'Resolve on GenLayer'}
          </button>
        )}
      </div>

      {isResolved && (
        <div className="dispute-detail__relay-note">
          <p>
            This dispute has been judged on GenLayer. To settle stakes on Base
            Sepolia, the verdict must be relayed — run{' '}
            <code>node relay.js {id}</code> from the relayer package.
          </p>
        </div>
      )}
    </div>
  );
}
