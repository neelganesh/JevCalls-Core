"""
risk_manager.py
Quantitative Risk & Money Management Engine for HFT Options Scalping.
Includes dynamic breakeven locks (+5%), scalp targets (+8%), hard stop limits (-8%),
statutory fee modeling, and circuit breaker kill-switches.
"""

from typing import Dict, Any, Tuple
from datetime import datetime
from src.config import config, IST

class RiskManager:
    def __init__(self):
        self.daily_realized_pnl_inr: float = 0.0
        self.consecutive_losses: int = 0
        self.circuit_breaker_active: bool = False
        self.circuit_breaker_until: datetime = None

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

    def check_kill_switches(self) -> Tuple[bool, str]:
        """Verify whether daily loss limit or consecutive loss breaker has triggered."""
        now = datetime.now(IST)

        # 1. Cooldown circuit breaker check
        if self.circuit_breaker_active:
            if self.circuit_breaker_until and now < self.circuit_breaker_until:
                remaining_mins = int((self.circuit_breaker_until - now).total_seconds() / 60)
                return False, f"CIRCUIT_BREAKER_ACTIVE: Cooling down ({remaining_mins}m remaining)"
            else:
                self.circuit_breaker_active = False
                self.circuit_breaker_until = None

        # 2. Daily Max Drawdown Kill-switch
        if self.daily_realized_pnl_inr <= -config.MAX_DAILY_LOSS_INR:
            return False, f"DAILY_KILL_SWITCH_TRIGGERED: Loss of Rs {abs(self.daily_realized_pnl_inr):.2f} exceeded budget limit"

        # 3. Consecutive Loss Breaker
        if self.consecutive_losses >= config.MAX_CONSECUTIVE_LOSSES:
            self.circuit_breaker_active = True
            from datetime import timedelta
            self.circuit_breaker_until = now + timedelta(minutes=config.COOLDOWN_MINUTES_AFTER_BREAKER)
            return False, f"CONSECUTIVE_LOSS_BREAKER: {self.consecutive_losses} stops hit in a row. Paused for {config.COOLDOWN_MINUTES_AFTER_BREAKER}m"

        return True, "RISK_CLEAR"

    def calculate_position_size(self, premium: float, lot_size: int, budget: float = None) -> int:
        """Calculate optimal quantity respecting lot size and budget limit."""
        if premium <= 0 or lot_size <= 0:
            return 0
        allocated_budget = budget or config.DEFAULT_TRADE_BUDGET_INR
        cost_per_lot = premium * lot_size
        if cost_per_lot > allocated_budget:
            # At least 1 lot if within 1.2x budget, else 0
            return lot_size if cost_per_lot <= allocated_budget * 1.25 else 0
        lots = int(allocated_budget // cost_per_lot)
        return max(1, lots) * lot_size

    def update_trade_state(self, trade: Dict[str, Any], current_ltp: float) -> Dict[str, Any]:
        """
        Sub-second tick update for an open trade.
        Implements empirical scalping logic:
        - Updates peak price
        - +5% gain -> Move Stop Loss to Entry (₹0 Risk Breakeven)
        - +8% gain -> Target 1 Scalp Hit
        - Stop Loss Hit detection
        """
        if not trade.get("active", False):
            return trade

        entry = trade["entry_price"]
        sl = trade["stop_loss"]
        max_price = max(trade.get("max_price_reached", entry), current_ltp)
        trade["max_price_reached"] = max_price

        gain_pct = ((current_ltp - entry) / entry) * 100.0
        peak_gain_pct = ((max_price - entry) / entry) * 100.0

        # Rule 1: Breakeven lock when peak gain exceeds +5%
        if peak_gain_pct >= config.BREAKEVEN_TRIGGER_PCT:
            if sl < entry:
                trade["stop_loss"] = entry
                trade["breakeven_locked"] = True
                trade.setdefault("confluence", []).append(f"Breakeven locked at Rs {entry:.2f} (+5% peak reached)")

        # Rule 2: Target 1 Scalp exit at +8%
        if gain_pct >= config.SCALP_TARGET_1_PCT:
            trade["status"] = "TARGET_HIT"
            trade["active"] = False
            trade["exit_price"] = current_ltp
            trade["exit_reason"] = "TARGET_1_SCALP_HIT"
            trade["exit_time"] = datetime.now(IST).isoformat()

        # Rule 3: Stop Loss exit (Initial or Trailed)
        elif current_ltp <= trade["stop_loss"]:
            trade["status"] = "SL_HIT"
            trade["active"] = False
            trade["exit_price"] = current_ltp
            trade["exit_reason"] = "BREAKEVEN_STOP_HIT" if trade.get("breakeven_locked") else "STOP_LOSS_HIT"
            trade["exit_time"] = datetime.now(IST).isoformat()

        # Update PnL if closed
        if not trade["active"]:
            pnl_pts = trade["exit_price"] - entry
            pnl_pct = (pnl_pts / entry) * 100.0
            qty = trade.get("quantity", 1)
            gross_pnl_inr = pnl_pts * qty

            charges = self.calculate_statutory_charges(entry * qty, trade["exit_price"] * qty)
            net_pnl_inr = gross_pnl_inr - charges["total_friction"]

            trade["pnl_points"] = round(pnl_pts, 2)
            trade["pnl_percentage"] = round(pnl_pct, 2)
            trade["gross_pnl_rupees"] = round(gross_pnl_inr, 2)
            trade["statutory_charges"] = charges
            trade["pnl_rupees"] = round(net_pnl_inr, 2)

            # Update engine risk state
            self.daily_realized_pnl_inr += net_pnl_inr
            if net_pnl_inr < 0:
                self.consecutive_losses += 1
            else:
                self.consecutive_losses = 0

        return trade
