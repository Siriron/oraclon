// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title OraclonRegistry
/// @notice Base Sepolia half of Oraclon (built for GenLayer Agent Tank,
///         "build on any chain, adjudicate on GenLayer").
///
/// WHAT THIS CONTRACT DOES
/// ------------------------
/// Records claims about a DeFi protocol's Total Value Locked, and later
/// records the independently-verified result once GenLayer's
/// resolve_dispute() (contracts/oraclon.py) has checked each claim
/// against DefiLlama's real data. This contract holds NO funds, moves
/// NO value, and has NO judgment logic of its own — it is a plain,
/// non-custodial record of what was claimed and what was verified.
///
/// THIS IS DELIBERATELY NOT A STAKING OR WAGERING CONTRACT.
/// -----------------------------------------------------------
/// An earlier version of this contract required both claimants to stake
/// ETH, with the accurate claimant receiving the inaccurate claimant's
/// stake on resolution. On reflection, that structure does not hold up:
/// stripped of its DeFi/oracle framing, it was two parties putting up
/// money on who was factually correct about a number neither of them
/// had any other stake in — money changing hands purely on the outcome
/// of a factual guess. That is the definition of maysir (gambling), not
/// a legitimate security deposit. A real security deposit secures
/// performance of an actual obligation (delivering goods, completing a
/// sale); nothing here involves either party undertaking to do anything
/// beyond stating a claim. Verifying the claim against real data does
/// not change that structure — it is still a bet on a fact, checked
/// more rigorously. This contract was rewritten to remove staking
/// entirely rather than try to make that structure more defensible.
///
/// WHAT REMAINS, AND WHY IT'S STILL WORTH BUILDING
/// ---------------------------------------------------
/// The genuinely interesting part of Oraclon was never the money — it
/// was GenVM's multi-validator AI adjudication independently fetching
/// live evidence and reaching consensus on a factual claim. That still
/// happens exactly as before. This contract's job is now purely to
/// record: what was claimed, and what GenLayer verified. No stake, no
/// forfeiture, no winner, no loser. Filing a claim costs only gas.
///
/// RELAYER MODEL — STATED HONESTLY, NOT HIDDEN
/// ---------------------------------------------
/// There is no live cross-chain bridge or oracle wired up for this
/// build. A single trusted relayer address (settable by the contract
/// owner) is the only account allowed to call recordVerdict(). The
/// relayer's job is entirely mechanical and auditable: read the GenVM
/// contract's get_dispute(dispute_id) view (independently readable by
/// anyone via GenLayer's own explorer) and call recordVerdict() here
/// with the exact same two verification results. A mismatched relayed
/// result is a checkable, provable discrepancy, not a silent trust
/// assumption, since GenLayer's verdict is public. A production version
/// of this pattern would use a real message-passing bridge or an
/// optimistic-oracle challenge window; this remains a named, deliberate
/// scope cut for the hackathon timeline.
///
/// DELIBERATE GAPS, STATED EXPLICITLY:
///   - No dispute/appeal window on the relayed result — once
///     recordVerdict() is called, the record is final. The underlying
///     GenLayer verdict is independently checkable, so an appeal round
///     was scoped out rather than half-built.
///   - Single relayer address, not a multisig or decentralized oracle
///     network — see RELAYER MODEL above.
contract OraclonRegistry {

    // ── Errors (cheaper than require-strings on repeated calls) ──────────

    error NotOwner();
    error NotRelayer();
    error ClaimNotFound();
    error AlreadyVerified();
    error InvalidResultValue();
    error ZeroAddress();

    // ── Roles ──────────────────────────────────────────────────────────────

    address public owner;
    address public relayer;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    // ── Claim storage ────────────────────────────────────────────────────

    enum Status { Filed, Verified }
    enum Result { Unset, Accurate, Inaccurate }

    struct Claim {
        uint256 id;
        address claimantA;
        address claimantB;
        uint256 claimedTvlAE6;   // for onchain reference/display only —
                                  // the actual judgment happens entirely
                                  // on the GenLayer side against this
                                  // same claimed value, passed there
                                  // separately when create_dispute is
                                  // called on contracts/oraclon.py
        uint256 claimedTvlBE6;
        string  protocolSlug;
        uint256 targetDate;       // unix seconds, locked at creation,
                                   // must match the value passed to the
                                   // paired GenVM claim exactly
        Status  status;
        Result  resultA;
        Result  resultB;
        string  reasoningSummary; // copied from the GenVM verdict at
                                   // relay time, for onchain transparency
        uint256 filedAt;
        uint256 verifiedAt;
    }

    mapping(uint256 => Claim) private claims;
    uint256 public nextClaimId = 1;

    // ── Events ─────────────────────────────────────────────────────────────

    event ClaimFiled(
        uint256 indexed claimId,
        address indexed claimantA,
        address indexed claimantB,
        string protocolSlug,
        uint256 targetDate
    );
    event VerdictRecorded(
        uint256 indexed claimId,
        Result resultA,
        Result resultB,
        string reasoningSummary
    );
    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);

    // ── Constructor ────────────────────────────────────────────────────────

    constructor(address _relayer) {
        if (_relayer == address(0)) revert ZeroAddress();
        owner = msg.sender;
        relayer = _relayer;
    }

    function setRelayer(address newRelayer) external onlyOwner {
        if (newRelayer == address(0)) revert ZeroAddress();
        emit RelayerUpdated(relayer, newRelayer);
        relayer = newRelayer;
    }

    // ── Filing (fully deterministic, no value transfer) ─────────────────────

    /// @notice Records a claim. Costs only gas — no stake, no value
    ///         attached, no funds held by this contract at any point.
    function fileClaim(
        address claimantA,
        address claimantB,
        uint256 claimedTvlAE6,
        uint256 claimedTvlBE6,
        string calldata protocolSlug,
        uint256 targetDate
    ) external returns (uint256 claimId) {
        if (claimantA == address(0) || claimantB == address(0)) revert ZeroAddress();

        claimId = nextClaimId++;
        Claim storage c = claims[claimId];
        c.id = claimId;
        c.claimantA = claimantA;
        c.claimantB = claimantB;
        c.claimedTvlAE6 = claimedTvlAE6;
        c.claimedTvlBE6 = claimedTvlBE6;
        c.protocolSlug = protocolSlug;
        c.targetDate = targetDate;
        c.status = Status.Filed;
        c.filedAt = block.timestamp;

        emit ClaimFiled(claimId, claimantA, claimantB, protocolSlug, targetDate);
    }

    // ── Verdict relay ─────────────────────────────────────────────────────

    /// @notice Called by the trusted relayer once contracts/oraclon.py's
    ///         resolve_dispute() has produced a verdict. Result values
    ///         (1=Accurate, 2=Inaccurate) must exactly mirror what the
    ///         GenVM contract's get_dispute() view reports — anyone can
    ///         independently verify this match via GenLayer's own
    ///         explorer (see this contract's own top-level RELAYER MODEL
    ///         note). No value moves as a result of this call.
    function recordVerdict(
        uint256 claimId,
        uint8 resultARaw,
        uint8 resultBRaw,
        string calldata reasoningSummary
    ) external onlyRelayer {
        Claim storage c = claims[claimId];
        if (c.id == 0) revert ClaimNotFound();
        if (c.status != Status.Filed) revert AlreadyVerified();
        if (resultARaw == 0 || resultARaw > 2) revert InvalidResultValue();
        if (resultBRaw == 0 || resultBRaw > 2) revert InvalidResultValue();

        Result resA = Result(resultARaw);
        Result resB = Result(resultBRaw);

        c.resultA = resA;
        c.resultB = resB;
        c.reasoningSummary = reasoningSummary;
        c.status = Status.Verified;
        c.verifiedAt = block.timestamp;

        emit VerdictRecorded(claimId, resA, resB, reasoningSummary);
    }

    // ── Views ──────────────────────────────────────────────────────────────
    //
    // Split into smaller views (rather than one function returning the
    // full struct) for the same reason the prior version of this
    // contract did: avoids Solidity's "stack too deep" limit on the
    // legacy codegen path without depending on a --via-ir compiler flag.

    function getClaimCore(uint256 claimId)
        external
        view
        returns (
            uint256 id,
            address claimantA,
            address claimantB,
            Status status,
            uint256 filedAt,
            uint256 verifiedAt
        )
    {
        Claim storage c = claims[claimId];
        if (c.id == 0) revert ClaimNotFound();
        return (c.id, c.claimantA, c.claimantB, c.status, c.filedAt, c.verifiedAt);
    }

    function getClaimValues(uint256 claimId)
        external
        view
        returns (
            uint256 claimedTvlAE6,
            uint256 claimedTvlBE6,
            string memory protocolSlug,
            uint256 targetDate
        )
    {
        Claim storage c = claims[claimId];
        if (c.id == 0) revert ClaimNotFound();
        return (c.claimedTvlAE6, c.claimedTvlBE6, c.protocolSlug, c.targetDate);
    }

    function getClaimVerdict(uint256 claimId)
        external
        view
        returns (
            Result resultA,
            Result resultB,
            string memory reasoningSummary
        )
    {
        Claim storage c = claims[claimId];
        if (c.id == 0) revert ClaimNotFound();
        return (c.resultA, c.resultB, c.reasoningSummary);
    }
}
