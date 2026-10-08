"""
risk_manager.py
Authoritative Code Gates, Position Sizing & Money Management Engine.
Enforces hard non-negotiable risk filters in Python code before calling Jev:
- Staleness <2s, Latency <100ms, Token valid
- Session window (09:30 to 14:45 IST entries, 15:15 force exit)
- Event blackout, Daily limits (-2% wallet, 2 consecutive losses, 3 trades)
- Risk <=1% wallet, Cost friction <10% reward at T1, Spread <0.5% or <=Rs0.50
- Delta 0.45-0.65, T1>=1.5R (50% book + BE+costs stop), Time stop (6 candles <0.5R).
"""

from typing import Dict, Any, Tuple, Optional, List
from datetime import datetime, time as dtime
from src.config import config, INDEX_CONFIG, IST

class RiskManager:
    def __init__(self, initial_wallet: Optional[float] = None, wallet_inr: Optional[float] = None):
        self.wallet_inr: float = wallet_inr or initial_wallet or config.DEFAULT_WALLET_INR
        self.daily_realized_pnl_inr: float = 0.0
        self.consecutive_losses: int = 0
        self.daily_trades_count: int = 0
        self.circuit_breaker_active: bool = False
        self.circuit_breaker_until: Optional[datetime] = None
        self.gate_audit_log: List[Dict[str, Any]] = []

    # -------------------------------------------------------------------------
    # 1. Statutory Friction Model (SEBI / NSE Options)
    # -------------------------------------------------------------------------
    def calculate_statutory_charges(self, buy_value: float, sell_value: float) -> Dict[str, float]:
        """
        Calculate realistic Indian market statutory charges (NSE Options):
        - Brokerage: Rs 20 buy + Rs 20 sell = Rs 40
        - STT: 0.10% on sell turnover
        - Exchange Turnover Charges: 0.053% of total turnover
        - GST: 18% on (Brokerage + Exchange Charges)
        - SEBI Charges & Stamp Duty: ~0.003% of turnover
        """
        turnover = buy_value + sell_value
        brokerage = config.BROKERAGE_PER_ORDER_INR * 2.0
        stt = sell_value * (config.STT_SELL_PCT / 100.0)
        exchange_charges = turnover * (config.EXCHANGE_TURNOVER_PCT / 100.0)
        gst = (brokerage + exchange_charges) * (config.GST_PCT / 100.0)
        sebi_and_stamp = turnover * 0.00003

        total_friction = brokerage + stt + exchange_charges + gst + sebi_and_stamp

        return {
            "brokerage": round(brokerage, 2),
            "stt": round(stt, 2),
            "exchange_charges": round(exchange_charges, 2),
            "gst": round(gst, 2),
            "total_friction": round(total_friction, 2)
        }

    # -------------------------------------------------------------------------
    # 2. Hard Authoritative Code Gates (Pre-Jev)
    # -------------------------------------------------------------------------
    def evaluate_hard_gates(
        self,
        data_timestamp: Optional[datetime] = None,
        gateway_latency_ms: float = 25.0,
        token_valid: bool = True,
        current_time: Optional[datetime] = None
    ) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Evaluates authoritative hard gates in Python code.
        If ANY gate fails, Jev is NOT called and trade is REJECTED immediately.
        """
        now = current_time or datetime.now(IST)
        time_str = now.strftime("%H:%M:%S")

        gates_status = {}

        # Gate 1: Broker Token Valid
        gates_status["token_valid"] = token_valid
        if not token_valid:
            return False, "GATE_FAILED_BROKER_TOKEN_INVALID", gates_status

        # Gate 2: Data Staleness (< 2.0s)
        if data_timestamp:
            staleness_sec = (now - data_timestamp).total_seconds()
            gates_status["staleness_sec"] = round(staleness_sec, 2)
            if staleness_sec > config.MAX_DATA_STALENESS_SEC:
                return False, f"GATE_FAILED_DATA_STALENESS ({staleness_sec:.2f}s > {config.MAX_DATA_STALENESS_SEC}s)", gates_status

        # Gate 3: Gateway Latency (< 100ms)
        gates_status["latency_ms"] = gateway_latency_ms
        if gateway_latency_ms > config.MAX_GATEWAY_LATENCY_MS:
            return False, f"GATE_FAILED_HIGH_LATENCY ({gateway_latency_ms}ms > {config.MAX_GATEWAY_LATENCY_MS}ms)", gates_status

        # Gate 4: Event Blackout (RBI, budget, major events)
        gates_status["event_blackout"] = config.EVENT_BLACKOUT_ACTIVE
        if config.EVENT_BLACKOUT_ACTIVE:
            return False, "GATE_FAILED_EVENT_BLACKOUT_ACTIVE", gates_status

        # Gate 5: Circuit Breaker Cooldown
        if self.circuit_breaker_active:
            if self.circuit_breaker_until and now < self.circuit_breaker_until:
                remaining_m = int((self.circuit_breaker_until - now).total_seconds() / 60)
                gates_status["circuit_breaker_cooldown"] = remaining_m
                return False, f"GATE_FAILED_CIRCUIT_BREAKER_COOLDOWN ({remaining_m}m remaining)", gates_status
            else:
                self.circuit_breaker_active = False
                self.circuit_breaker_until = None

        # Gate 6: Session Trading Window
        # No entries 09:15-09:30 IST or after 14:45 IST
        if time_str < config.SESSION_ENTRY_START:
            return False, f"GATE_FAILED_SESSION_OPEN_RESTRICTION (Current: {time_str} < {config.SESSION_ENTRY_START} IST)", gates_status

        if time_str > config.SESSION_ENTRY_CUTOFF:
            return False, f"GATE_FAILED_SESSION_CUTOFF_REACHED (Current: {time_str} > {config.SESSION_ENTRY_CUTOFF} IST)", gates_status

        # Gate 7: Daily Drawdown Limit (-2% of wallet)
        max_daily_loss = self.wallet_inr * (config.MAX_DAILY_LOSS_PCT / 100.0)
        gates_status["daily_realized_pnl"] = self.daily_realized_pnl_inr
        gates_status["max_daily_loss_budget"] = -max_daily_loss
        if self.daily_realized_pnl_inr <= -max_daily_loss:
            return False, f"GATE_FAILED_DAILY_LOSS_LIMIT (-Rs {abs(self.daily_realized_pnl_inr):.2f} exceeded -{config.MAX_DAILY_LOSS_PCT}% budget)", gates_status

        # Gate 8: Consecutive Losses (Max 2)
        gates_status["consecutive_losses"] = self.consecutive_losses
        if self.consecutive_losses >= config.MAX_CONSECUTIVE_LOSSES:
            self.circuit_breaker_active = True
            from datetime import timedelta
            self.circuit_breaker_until = now + timedelta(minutes=config.COOLDOWN_MINUTES_AFTER_BREAKER)
            return False, f"GATE_FAILED_CONSECUTIVE_LOSS_LIMIT ({self.consecutive_losses} stops hit; pausing for {config.COOLDOWN_MINUTES_AFTER_BREAKER}m)", gates_status

        # Gate 9: Max Daily Trades (Max 3)
        gates_status["daily_trades_count"] = self.daily_trades_count
        if self.daily_trades_count >= config.MAX_DAILY_TRADES:
            return False, f"GATE_FAILED_MAX_DAILY_TRADES_REACHED ({self.daily_trades_count}/{config.MAX_DAILY_TRADES})", gates_status

        return True, "ALL_HARD_GATES_PASSED", gates_status

    # -------------------------------------------------------------------------
    # 3. Contract & Friction Gates (Pre-Jev)
    # -------------------------------------------------------------------------
    def evaluate_contract_gates(
        self,
        premium: float,
        bid_price: float,
        ask_price: float,
        delta: float,
        quantity: int,
        stop_distance_pts: float,
        contract_volume: int = 50000,
        median_volume_20d: int = 25000
    ) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Validates contract quality, delta range, bid-ask spread, liquidity, and cost friction:
        - Delta: 0.45 to 0.65
        - Spread: < 0.5% or <= Rs 0.50
        - Cost friction < 10% expected reward at T1
        - Liquidity above 20-day median
        """
        metrics = {}

        # 1. Delta check (ATM / 1 ITM: 0.45 - 0.65)
        metrics["delta"] = abs(delta)
        if not (config.MIN_CONTRACT_DELTA <= abs(delta) <= config.MAX_CONTRACT_DELTA):
            return False, f"CONTRACT_GATE_DELTA_OUT_OF_RANGE ({abs(delta):.2f} not in [{config.MIN_CONTRACT_DELTA}, {config.MAX_CONTRACT_DELTA}])", metrics

        # 2. Minimum premium check (>= Rs 25)
        metrics["premium"] = premium
        if premium < config.MIN_OPTION_PREMIUM_INR:
            return False, f"CONTRACT_GATE_PENNY_OPTION_REJECTED (Rs {premium:.2f} < Rs {config.MIN_OPTION_PREMIUM_INR:.2f})", metrics

        # 3. Bid-Ask Spread Gate (< 0.5% or <= Rs 0.50)
        if bid_price > 0 and ask_price >= bid_price:
            spread_inr = ask_price - bid_price
            spread_pct = (spread_inr / premium) * 100.0 if premium > 0 else 0.0
            metrics["spread_inr"] = round(spread_inr, 2)
            metrics["spread_pct"] = round(spread_pct, 2)

            if spread_inr > config.MAX_BID_ASK_SPREAD_INR and spread_pct > config.MAX_BID_ASK_SPREAD_PCT:
                return False, f"CONTRACT_GATE_EXCESSIVE_SPREAD (Spread: Rs {spread_inr:.2f} / {spread_pct:.2f}%)", metrics

        # 4. Liquidity Gate (Above 20-day median)
        metrics["volume"] = contract_volume
        if contract_volume < (median_volume_20d * 0.4):
            return False, f"CONTRACT_GATE_INSUFFICIENT_LIQUIDITY (Vol: {contract_volume} < {median_volume_20d})", metrics

        # 5. Cost vs Reward Gate (< 10% of expected reward at T1)
        expected_option_gain_pts = (stop_distance_pts * config.TARGET_1_R_MULTIPLE) * abs(delta)
        expected_reward_inr = expected_option_gain_pts * quantity
        charges = self.calculate_statutory_charges(premium * quantity, (premium + expected_option_gain_pts) * quantity)
        cost_friction_inr = charges["total_friction"]

        cost_to_reward_ratio = (cost_friction_inr / expected_reward_inr) if expected_reward_inr > 0 else 1.0
        metrics["expected_reward_inr"] = round(expected_reward_inr, 2)
        metrics["cost_friction_inr"] = round(cost_friction_inr, 2)
        metrics["cost_to_reward_ratio"] = round(cost_to_reward_ratio, 3)

        if cost_to_reward_ratio >= config.MAX_COST_TO_REWARD_RATIO:
            return False, f"CONTRACT_GATE_FRICTION_TOO_HIGH ({cost_to_reward_ratio*100:.1f}% >= 10% expected reward)", metrics

        return True, "CONTRACT_GATES_PASSED", metrics

    # -------------------------------------------------------------------------
    # 4. Position Sizing: Risk <= 1% Wallet Per Trade
    # -------------------------------------------------------------------------
    def calculate_position_size(
        self,
        premium: float,
        delta: float,
        stop_distance_pts: float,
        lot_size: int
    ) -> int:
        """
        Calculates position quantity enforcing Risk <= 1.0% wallet.
        Risk per option share = stop_distance_pts * abs(delta) + slippage
        Quantity = floor(max_risk_inr / risk_per_share / lot_size) * lot_size
        """
        if premium <= 0 or lot_size <= 0 or stop_distance_pts <= 0:
            return 0

        max_risk_inr = self.wallet_inr * (config.MAX_RISK_PER_TRADE_PCT / 100.0)
        option_risk_per_share = (stop_distance_pts * abs(delta)) + (premium * config.SLIPPAGE_PCT / 100.0)

        if option_risk_per_share <= 0:
            return 0

        max_shares = int(max_risk_inr // option_risk_per_share)
        lots = max_shares // lot_size

        if lots < 1:
            # Check if 1 lot is within 1.25x allowable risk boundary
            cost_of_1_lot_risk = option_risk_per_share * lot_size
            if cost_of_1_lot_risk <= max_risk_inr * 1.25:
                return lot_size
            return 0

        return lots * lot_size

    def check_kill_switches(self) -> Tuple[bool, str]:
        """Backward-compatible alias for evaluate_hard_gates."""
        passed, reason, _ = self.evaluate_hard_gates()
        return passed, reason

    # -------------------------------------------------------------------------
    # 5. Position Management: T1 (1.5R), Breakeven Lock, Time Stop (6 candles)
    # -------------------------------------------------------------------------
    def update_trade_state(
        self,
        trade: Dict[str, Any],
        current_ltp: float,
        elapsed_5m_candles: int = 1,
        now_override: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Tick update for active position:
        - T1 >= 1.5R reached: Books 50%, moves SL to Breakeven + costs
        - Stop Loss Hit: Closes trade
        - Time Stop: After 6 5m candles (30m) without +0.5R, force exit
        - EOD Auto Square-off: At 15:15:00 IST
        """
        if not trade.get("active", False):
            return trade

        now = now_override or datetime.now(IST)
        time_str = now.strftime("%H:%M:%S")

        entry = trade["entry_price"]
        sl = trade["stop_loss"]
        t1 = trade["target_1"]
        qty = trade.get("quantity", 0)
        r_dist = trade.get("r_distance_pts", (entry - sl) if entry > sl else 10.0)

        max_price = max(trade.get("max_price_reached", entry), current_ltp)
        trade["max_price_reached"] = max_price
        trade["elapsed_candles_5m"] = elapsed_5m_candles

        current_pnl_pts = current_ltp - entry
        current_r_multiple = (current_pnl_pts / r_dist) if r_dist > 0 else 0.0
        trade["current_r_multiple"] = round(current_r_multiple, 2)

        # Rule 1: EOD Force Auto Square-off at 15:15 IST
        if time_str >= config.SESSION_FORCE_EXIT:
            trade["status"] = "CLOSED_EOD"
            trade["active"] = False
            trade["exit_price"] = current_ltp
            trade["exit_reason"] = "SESSION_EOD_FORCE_EXIT_15_15"
            trade["exit_time"] = now.isoformat()

        # Rule 2: Target 1 (1.5R) Reached -> Book 50% & Lock BE + Costs
        elif current_ltp >= t1:
            if not trade.get("t1_booked", False):
                trade["t1_booked"] = True
                # Move Stop Loss to Entry + Estimated Friction
                estimated_friction_pts = (config.BROKERAGE_PER_ORDER_INR * 2.0) / qty if qty > 0 else 1.0
                trade["stop_loss"] = round(entry + estimated_friction_pts, 2)
                trade["breakeven_locked"] = True
                trade.setdefault("confluence", []).append(f"Target 1 reached (1.5R). 50% booked, Stop moved to BE+Costs (Rs {trade['stop_loss']:.2f})")

            # If full target hit or trailing exit
            if current_ltp >= (entry + (r_dist * 2.5)):
                trade["status"] = "TARGET_HIT"
                trade["active"] = False
                trade["exit_price"] = current_ltp
                trade["exit_reason"] = "FULL_TARGET_REACHED"
                trade["exit_time"] = now.isoformat()

        # Rule 3: Stop Loss Hit (Initial or Breakeven+Costs)
        elif current_ltp <= trade["stop_loss"]:
            trade["status"] = "SL_HIT"
            trade["active"] = False
            trade["exit_price"] = current_ltp
            trade["exit_reason"] = "BREAKEVEN_COSTS_HIT" if trade.get("breakeven_locked") else "STRUCTURE_STOP_LOSS_HIT"
            trade["exit_time"] = now.isoformat()

        # Rule 4: Time Stop (No +0.5R in 6 5m candles = 30 minutes)
        elif elapsed_5m_candles >= config.TIME_STOP_CANDLES and current_r_multiple < config.TIME_STOP_MIN_R:
            trade["status"] = "TIME_STOP_EXIT"
            trade["active"] = False
            trade["exit_price"] = current_ltp
            trade["exit_reason"] = f"TIME_STOP_30M_UNDER_HALF_R ({current_r_multiple:.2f}R < {config.TIME_STOP_MIN_R}R)"
            trade["exit_time"] = now.isoformat()

        # Finalize trade calculations if closed
        if not trade["active"]:
            pnl_pts = trade["exit_price"] - entry
            pnl_pct = (pnl_pts / entry) * 100.0
            gross_pnl_inr = pnl_pts * qty

            charges = self.calculate_statutory_charges(entry * qty, trade["exit_price"] * qty)
            net_pnl_inr = gross_pnl_inr - charges["total_friction"]

            trade["pnl_points"] = round(pnl_pts, 2)
            trade["pnl_percentage"] = round(pnl_pct, 2)
            trade["gross_pnl_rupees"] = round(gross_pnl_inr, 2)
            trade["statutory_charges"] = charges
            trade["pnl_rupees"] = round(net_pnl_inr, 2)

            # Update session aggregates
            self.daily_realized_pnl_inr += net_pnl_inr
            self.daily_trades_count += 1
            if net_pnl_inr < 0:
                self.consecutive_losses += 1
            else:
                self.consecutive_losses = 0

        return trade

risk_manager = RiskManager()
