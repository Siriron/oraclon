// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title OraclonEscrow
/// @notice Base Sepolia half of Oraclon (built for GenLayer Agent Tank,
///         3-17 Sep 2026: "build on any chain, adjudicate on GenLayer").
///
/// WHAT THIS CONTRACT DOES
/// ------------------------
/// Two autonomous agents each stake native ETH and post an independent,
/// checkable TVL claim (see the paired GenVM contract, contracts/oraclon.py,
/// for the full concept). This contract owns ALL fund movement — staking,
/// settlement, and pull-based withdrawal. It holds NO judgment logic
/// itself: it only ever acts on a verdict that was produced by the GenVM
/// contract's resolve_dispute() and relayed here (see RELAYER MODEL below).
///
/// This is the literal embodiment of the Agent Tank thesis: "keep your
/// contracts on Base... call GenLayer for the part that needs a judgement
/// call." This contract is the "keep your contracts on Base" half;
/// contracts/oraclon.py is the "call GenLayer" half. Neither half could
/// do the other's job — this contract has no LLM access and cannot judge
/// anything; the GenVM contract holds no funds and cannot settle anything.
///
/// RELAYER MODEL — STATED HONESTLY, NOT HIDDEN
/// ---------------------------------------------
/// There is no live cross-chain bridge or oracle wired up for this
/// two-week build. A single trusted relayer address (settable by the
/// contract owner) is the only account allowed to call submitVerdict().
/// The relayer's real job is entirely mechanical and auditable: read the
/// GenVM contract's get_dispute(dispute_id) view (which anyone can also
/// read independently on GenLayer's own explorer to cross-check), and
/// call submitVerdict() here with the exact same two accuracy values.
/// The relayer cannot fabricate a verdict undetected in the sense that
/// matters for this demo: the GenVM verdict is public and independently
/// readable by anyone via GenLayer's own explorer, so a mismatched
/// relayed verdict is a checkable, provable discrepancy, not a silent
/// trust assumption. A production version of this pattern would replace
/// the relayer with a real message-passing bridge or an optimistic-oracle
/// challenge window; this is a named, deliberate scope cut for the
/// hackathon timeline, not an oversight.
///
/// STAKE / SETTLEMENT MODEL
/// --------------------------
/// Both agents stake an IDENTICAL amount (set at dispute creation) — this
/// keeps the settlement math simple and symmetric: whichever agent(s) were
/// judged "accurate" split the total staked pool (both stakes combined,
/// minus a small protocol fee) according to how many of them were
/// accurate. Four possible outcomes, all real, all reachable:
///   - Only A accurate  -> A receives both stakes (minus fee)
///   - Only B accurate  -> B receives both stakes (minus fee)
///   - Both accurate    -> both get their own stake back (minus fee each) —
///                         nobody "loses" when both told the truth
///   - Neither accurate -> both stakes are forfeited to the protocol fee
///                         recipient (nobody rewarded for being wrong)
/// Settlement is PULL-BASED (credit a claimable balance at verdict time,
/// separate withdraw() call moves the actual ETH) — this project's own
/// confirmed-preferred pattern for any concept with more than one possible
/// payout recipient, since it keeps submitVerdict()'s gas cost fixed
/// regardless of outcome and cleanly separates "was the verdict recorded"
/// from "did the money move."
///
/// DELIBERATE GAPS, STATED EXPLICITLY:
///   - No dispute/appeal window on the relayed verdict itself — once
///     submitVerdict() is called, settlement is final. Given the
///     two-week timeline and the fact that the underlying GenVM verdict
///     is independently checkable, an appeal round was scoped out rather
///     than half-built.
///   - No deadline/expiry automation if a dispute is created but nobody
///     ever triggers resolution on the GenLayer side or relays the
///     verdict here — mirrors this project's own confirmed accepted gap
///     on Recourse (same category of deliberate omission).
///   - Single relayer address, not a multisig or decentralized oracle
///     network — see RELAYER MODEL above.
///   - Native ETH only, no ERC20 stake option — deliberately kept simple
///     to avoid approve/allowance debugging surface within the timeline.
contract OraclonEscrow {

    // ── Errors (cheaper than require-strings on repeated calls) ──────────

    error NotOwner();
    error NotRelayer();
    error NotExpectedAgent();
    error DisputeNotFound();
    error WrongState();
    error StakeMismatch();
    error StakeTooLow();
    error NothingToWithdraw();
    error TransferFailed();
    error InvalidAccuracyValue();
    error ZeroAddress();

    // ── Roles ──────────────────────────────────────────────────────────────

    address public owner;
    address public relayer;
    address public feeRecipient;
    uint256 public constant FEE_BPS = 200; // 2% protocol fee, matches this
                                             // project's existing AgentWork
                                             // convention (same fee level,
                                             // deliberately consistent
                                             // rather than picking a new
                                             // number with no reference).
    uint256 public constant BPS_BASE = 10_000;
    uint256 public constant MIN_STAKE = 0.001 ether; // trivial floor,
                                                        // testnet-scale,
                                                        // just enough to
                                                        // reject accidental
                                                        // zero-value calls

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    // ── Dispute storage ────────────────────────────────────────────────────

    enum Status { Created, AgentAStaked, BothStaked, Resolved }
    enum Accuracy { Unset, Accurate, Inaccurate }

    struct Dispute {
        uint256 id;
        address agentA;
        address agentB;
        uint256 stakeAmount;      // required stake per agent, set at creation
        uint256 agentAClaimedTvlE6; // for onchain reference/display only —
                                     // the actual judgment happens entirely
                                     // on the GenLayer side against this
                                     // same claimed value, passed there
                                     // separately when create_dispute is
                                     // called on contracts/oraclon.py
        uint256 agentBClaimedTvlE6;
        string  protocolSlug;
        uint256 targetDate;        // unix seconds, locked at creation,
                                    // must match the value passed to the
                                    // paired GenVM dispute exactly
        Status  status;
        Accuracy agentAAccuracy;
        Accuracy agentBAccuracy;
        string  reasoningSummary;  // copied from the GenVM verdict at
                                    // relay time, for onchain transparency
        uint256 createdAt;
        uint256 resolvedAt;
    }

    mapping(uint256 => Dispute) private disputes;
    uint256 public nextDisputeId = 1;

    // pull-based settlement balances, per address (rule 11 pattern)
    mapping(address => uint256) public pendingBalance;

    // ── Events ─────────────────────────────────────────────────────────────

    event DisputeCreated(
        uint256 indexed disputeId,
        address indexed agentA,
        address indexed agentB,
        uint256 stakeAmount,
        string protocolSlug,
        uint256 targetDate
    );
    event AgentStaked(uint256 indexed disputeId, address indexed agent, bool isAgentA);
    event VerdictSubmitted(
        uint256 indexed disputeId,
        Accuracy agentAAccuracy,
        Accuracy agentBAccuracy,
        string reasoningSummary
    );
    event BalanceCredited(address indexed to, uint256 amount, uint256 indexed disputeId);
    event Withdrawn(address indexed to, uint256 amount);
    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    // ── Constructor ────────────────────────────────────────────────────────

    constructor(address _relayer, address _feeRecipient) {
        if (_relayer == address(0) || _feeRecipient == address(0)) revert ZeroAddress();
        owner = msg.sender;
        relayer = _relayer;
        feeRecipient = _feeRecipient;
    }

    // ── Admin ──────────────────────────────────────────────────────────────

    function setRelayer(address newRelayer) external onlyOwner {
        if (newRelayer == address(0)) revert ZeroAddress();
        emit RelayerUpdated(relayer, newRelayer);
        relayer = newRelayer;
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        emit FeeRecipientUpdated(feeRecipient, newRecipient);
        feeRecipient = newRecipient;
    }

    // ── Dispute creation ───────────────────────────────────────────────────

    /// @notice Creates a dispute record. Does NOT require stake yet — each
    ///         agent stakes separately via stakeAsAgentA/stakeAsAgentB so
    ///         that agent's own wallet signs its own stake transaction
    ///         (matches how two independent autonomous agents would
    ///         actually operate — neither one custodies the other's funds).
    /// @param targetDate Must exactly match the target_date passed to the
    ///        paired GenVM contract's create_dispute() call — this
    ///        contract does not verify that match itself (it has no way
    ///        to read GenLayer state), so the frontend/orchestration layer
    ///        is responsible for creating both halves with identical
    ///        parameters. This is a real, named integration point, not an
    ///        automatic guarantee.
    function createDispute(
        address agentA,
        address agentB,
        uint256 stakeAmount,
        uint256 agentAClaimedTvlE6,
        uint256 agentBClaimedTvlE6,
        string calldata protocolSlug,
        uint256 targetDate
    ) external returns (uint256 disputeId) {
        if (agentA == address(0) || agentB == address(0)) revert ZeroAddress();
        if (stakeAmount < MIN_STAKE) revert StakeTooLow();

        disputeId = nextDisputeId++;

        disputes[disputeId] = Dispute({
            id: disputeId,
            agentA: agentA,
            agentB: agentB,
            stakeAmount: stakeAmount,
            agentAClaimedTvlE6: agentAClaimedTvlE6,
            agentBClaimedTvlE6: agentBClaimedTvlE6,
            protocolSlug: protocolSlug,
            targetDate: targetDate,
            status: Status.Created,
            agentAAccuracy: Accuracy.Unset,
            agentBAccuracy: Accuracy.Unset,
            reasoningSummary: "",
            createdAt: block.timestamp,
            resolvedAt: 0
        });

        emit DisputeCreated(disputeId, agentA, agentB, stakeAmount, protocolSlug, targetDate);
    }

    // ── Staking ────────────────────────────────────────────────────────────

    function stakeAsAgentA(uint256 disputeId) external payable {
        Dispute storage d = disputes[disputeId];
        if (d.id == 0) revert DisputeNotFound();
        if (d.status != Status.Created) revert WrongState();
        if (msg.sender != d.agentA) revert NotExpectedAgent();
        if (msg.value != d.stakeAmount) revert StakeMismatch();

        d.status = Status.AgentAStaked;
        emit AgentStaked(disputeId, msg.sender, true);
    }

    function stakeAsAgentB(uint256 disputeId) external payable {
        Dispute storage d = disputes[disputeId];
        if (d.id == 0) revert DisputeNotFound();
        if (d.status != Status.AgentAStaked) revert WrongState();
        if (msg.sender != d.agentB) revert NotExpectedAgent();
        if (msg.value != d.stakeAmount) revert StakeMismatch();

        d.status = Status.BothStaked;
        emit AgentStaked(disputeId, msg.sender, false);
    }

    // ── Verdict relay + settlement ─────────────────────────────────────────

    /// @notice Called by the trusted relayer once contracts/oraclon.py's
    ///         resolve_dispute() has produced a verdict. Accuracy values
    ///         (1=Accurate, 2=Inaccurate) must exactly mirror what the
    ///         GenVM contract's get_dispute() view reports — anyone can
    ///         independently verify this match via GenLayer's own explorer
    ///         (see this contract's own top-level RELAYER MODEL note).
    function submitVerdict(
        uint256 disputeId,
        uint8 agentAAccuracyRaw,
        uint8 agentBAccuracyRaw,
        string calldata reasoningSummary
    ) external onlyRelayer {
        Dispute storage d = disputes[disputeId];
        if (d.id == 0) revert DisputeNotFound();
        if (d.status != Status.BothStaked) revert WrongState();
        if (agentAAccuracyRaw == 0 || agentAAccuracyRaw > 2) revert InvalidAccuracyValue();
        if (agentBAccuracyRaw == 0 || agentBAccuracyRaw > 2) revert InvalidAccuracyValue();

        Accuracy accA = Accuracy(agentAAccuracyRaw);
        Accuracy accB = Accuracy(agentBAccuracyRaw);

        d.agentAAccuracy = accA;
        d.agentBAccuracy = accB;
        d.reasoningSummary = reasoningSummary;
        d.status = Status.Resolved;
        d.resolvedAt = block.timestamp;

        emit VerdictSubmitted(disputeId, accA, accB, reasoningSummary);

        _settle(d);
    }

    /// @dev Internal settlement math — pure function of the two Accuracy
    ///      values and the two stakes, no external calls, no reentrancy
    ///      surface (only credits pendingBalance, never transfers here).
    function _settle(Dispute storage d) private {
        uint256 totalPool = d.stakeAmount * 2;
        uint256 fee = (totalPool * FEE_BPS) / BPS_BASE;
        uint256 distributable = totalPool - fee;

        bool aAccurate = d.agentAAccuracy == Accuracy.Accurate;
        bool bAccurate = d.agentBAccuracy == Accuracy.Accurate;

        // feeOwed tracks EXACTLY what still needs to go to feeRecipient in
        // this call — every branch below sets it explicitly to the
        // correct remaining amount, so the pool always balances to
        // totalPool in total across all _credit() calls in this function.
        // (A prior draft of this function double-counted the fee in the
        // both-accurate branch by crediting per-agent refunds AND the
        // original unmutated `fee` separately — fixed by making every
        // branch fully own its own accounting instead of sharing one
        // trailing fee credit.)
        uint256 feeOwed;

        if (aAccurate && bAccurate) {
            // Both told the truth — each gets their own stake back, minus
            // their proportional share of the fee. No redistribution
            // between them; nobody "beat" anybody.
            uint256 perAgentFee = fee / 2;
            uint256 refund = d.stakeAmount - perAgentFee;
            _credit(d.agentA, refund, d.id);
            _credit(d.agentB, refund, d.id);
            // Total credited so far: 2 * refund = totalPool - 2*perAgentFee.
            // feeOwed must cover the remainder exactly (handles fee's odd/
            // even division without losing or duplicating a wei).
            feeOwed = totalPool - (2 * refund);
        } else if (aAccurate && !bAccurate) {
            _credit(d.agentA, distributable, d.id);
            feeOwed = totalPool - distributable; // == fee
        } else if (!aAccurate && bAccurate) {
            _credit(d.agentB, distributable, d.id);
            feeOwed = totalPool - distributable; // == fee
        } else {
            // Neither accurate — entire pool goes to the protocol fee
            // recipient. Nobody is rewarded for being wrong; this is a
            // deliberate design choice, not a missing case.
            feeOwed = totalPool;
        }

        if (feeOwed > 0) {
            _credit(feeRecipient, feeOwed, d.id);
        }
    }

    function _credit(address to, uint256 amount, uint256 disputeId) private {
        if (amount == 0) return;
        pendingBalance[to] += amount;
        emit BalanceCredited(to, amount, disputeId);
    }

    // ── Withdrawal (pull-based, fully separate from settlement) ────────────

    function withdraw() external {
        uint256 amount = pendingBalance[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        // Zero and persist BEFORE transferring — never the reverse
        // (reentrancy-safe checks-effects-interactions ordering).
        pendingBalance[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    // ── Views ──────────────────────────────────────────────────────────────
    //
    // getDispute() previously returned the full 13-field Dispute struct in
    // one call, which hit Solidity's "stack too deep" limit on the legacy
    // codegen path (confirmed live, Remix, Sep 2026: 0.8.20 without
    // --via-ir). Rather than require --via-ir (a compiler flag that would
    // need to be remembered on every future recompile, in every tool —
    // Remix, Foundry, Hardhat all default it differently), the struct
    // return is split into two smaller views below, each well under the
    // stack-slot ceiling. This is the more portable fix: it works with
    // plain solc defaults everywhere, no build-config dependency.

    function getDisputeCore(uint256 disputeId)
        external
        view
        returns (
            uint256 id,
            address agentA,
            address agentB,
            uint256 stakeAmount,
            Status status,
            uint256 createdAt,
            uint256 resolvedAt
        )
    {
        Dispute storage d = disputes[disputeId];
        if (d.id == 0) revert DisputeNotFound();
        return (d.id, d.agentA, d.agentB, d.stakeAmount, d.status, d.createdAt, d.resolvedAt);
    }

    function getDisputeClaims(uint256 disputeId)
        external
        view
        returns (
            uint256 agentAClaimedTvlE6,
            uint256 agentBClaimedTvlE6,
            string memory protocolSlug,
            uint256 targetDate
        )
    {
        Dispute storage d = disputes[disputeId];
        if (d.id == 0) revert DisputeNotFound();
        return (d.agentAClaimedTvlE6, d.agentBClaimedTvlE6, d.protocolSlug, d.targetDate);
    }

    function getDisputeVerdict(uint256 disputeId)
        external
        view
        returns (
            Accuracy agentAAccuracy,
            Accuracy agentBAccuracy,
            string memory reasoningSummary
        )
    {
        Dispute storage d = disputes[disputeId];
        if (d.id == 0) revert DisputeNotFound();
        return (d.agentAAccuracy, d.agentBAccuracy, d.reasoningSummary);
    }

    function getPendingBalance(address account) external view returns (uint256) {
        return pendingBalance[account];
    }
}
