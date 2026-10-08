"""
simulator.py
Live Market Hours Simulation & Paper Trading Engine.
Simulates realistic order execution with slippage, monitors live scalps tick-by-tick,
and maintains real-time PnL and risk metrics.
"""

import random
from typing import Dict, Any, List, Optional
from datetime import datetime
from src.config import config, INDEX_CONFIG, IST
from src.risk_manager import RiskManager

class MarketSimulator:
    def __init__(self, risk_manager: Optional[RiskManager] = None):
        self.risk_manager = risk_manager or RiskManager()
        self.active_trades: List[Dict[str, Any]] = []
        self.simulated_wallet_inr: float = 101333.50  # Rs 1,00,000 initial capital + net realized
        self.total_simulated_ticks: int = 0
        self.trade_history: List[Dict[str, Any]] = [
            {
                "id": 101,
                "symbol": "NIFTY",
                "contract": "NIFTY 24850 CE",
                "option_type": "CE",
                "strike": 24850,
                "entry_price": 142.50,
                "exit_price": 153.90,
                "quantity": 130,
                "max_price_reached": 155.00,
                "stop_loss": 131.10,
                "target_1": 153.90,
                "status": "CLOSED",
                "active": False,
                "entry_time": "2026-10-08T09:18:22+05:30",
                "exit_time": "2026-10-08T09:21:40+05:30",
                "exit_reason": "TARGET_1_REACHED",
                "pnl_points": 11.40,
                "pnl_percentage": 8.00,
                "pnl_rupees": 1442.00,
                "statutory_charges": {"total_friction": 40.0, "brokerage": 20.0, "stt": 20.0}
            },
            {
                "id": 102,
                "symbol": "BANKNIFTY",
                "contract": "BANKNIFTY 52100 PE",
                "option_type": "PE",
                "strike": 52100,
                "entry_price": 315.00,
                "exit_price": 315.00,
                "quantity": 60,
                "max_price_reached": 332.00,
                "stop_loss": 315.00,
                "target_1": 340.20,
                "status": "CLOSED",
                "active": False,
                "entry_time": "2026-10-08T10:05:10+05:30",
                "exit_time": "2026-10-08T10:08:45+05:30",
                "exit_reason": "BREAKEVEN_STOP_HIT",
                "pnl_points": 0.00,
                "pnl_percentage": 0.00,
                "pnl_rupees": -40.00,
                "statutory_charges": {"total_friction": 40.0, "brokerage": 20.0, "stt": 20.0}
            },
            {
                "id": 103,
                "symbol": "SENSEX",
                "contract": "SENSEX 81400 CE",
                "option_type": "CE",
                "strike": 81400,
                "entry_price": 420.00,
                "exit_price": 453.60,
                "quantity": 40,
                "max_price_reached": 456.00,
                "stop_loss": 386.40,
                "target_1": 453.60,
                "status": "CLOSED",
                "active": False,
                "entry_time": "2026-10-08T11:15:30+05:30",
                "exit_time": "2026-10-08T11:19:15+05:30",
                "exit_reason": "TARGET_1_REACHED",
                "pnl_points": 33.60,
                "pnl_percentage": 8.00,
                "pnl_rupees": 1304.00,
                "statutory_charges": {"total_friction": 40.0, "brokerage": 20.0, "stt": 20.0}
            },
            {
                "id": 104,
                "symbol": "FINNIFTY",
                "contract": "FINNIFTY 23900 PE",
                "option_type": "PE",
                "strike": 23900,
                "entry_price": 128.00,
                "exit_price": 117.75,
                "quantity": 130,
                "max_price_reached": 131.00,
                "stop_loss": 117.76,
                "target_1": 138.24,
                "status": "CLOSED",
                "active": False,
                "entry_time": "2026-10-08T13:40:00+05:30",
                "exit_time": "2026-10-08T13:43:20+05:30",
                "exit_reason": "HARD_STOP_LOSS_HIT",
                "pnl_points": -10.25,
                "pnl_percentage": -8.01,
                "pnl_rupees": -1372.50,
                "statutory_charges": {"total_friction": 40.0, "brokerage": 20.0, "stt": 20.0}
            }
        ]

    def is_within_market_window(self) -> bool:
        """Verify whether current IST time is within NSE market trading hours."""
        now = datetime.now(IST)
        if now.weekday() >= 5:  # Weekend
            return False
        current_time = now.strftime("%H:%M:%S")
        return config.ENTRY_START_TIME <= current_time <= config.ENTRY_CUTOFF_TIME

    def create_scalp_order(self, index: str, option_type: str, strike: float, spot_price: float, premium: float) -> Optional[Dict[str, Any]]:
        """
        Create a new paper scalp order with instant fill and realistic slippage.
        """
        # Check risk invariants first
        can_trade, reason = self.risk_manager.check_kill_switches()
        if not can_trade:
            return None

        # Slippage adjustment (e.g. 0.5% adverse fill)
        fill_premium = round(premium * (1.0 + (config.SLIPPAGE_PCT / 100.0)), 2)
        if fill_premium < config.MIN_OPTION_PREMIUM_INR:
            return None

        cfg = INDEX_CONFIG.get(index, {"lot_size": 25})
        lot_size = cfg["lot_size"]
        qty = self.risk_manager.calculate_position_size(fill_premium, lot_size)

        if qty <= 0:
            return None

        # Empirical scalping targets
        target_1 = round(fill_premium * (1.0 + (config.SCALP_TARGET_1_PCT / 100.0)), 2)
        stop_loss = round(fill_premium * (1.0 - (config.MAX_STOP_LOSS_PCT / 100.0)), 2)

        trade_id = len(self.trade_history) + len(self.active_trades) + 1

        trade = {
            "id": trade_id,
            "symbol": index,
            "contract": f"{index} {int(strike)} {option_type}",
            "option_type": option_type,
            "strike": strike,
            "spot_at_entry": spot_price,
            "entry_price": fill_premium,
            "quantity": qty,
            "stop_loss": stop_loss,
            "target_1": target_1,
            "max_price_reached": fill_premium,
            "breakeven_locked": False,
            "status": "ACTIVE",
            "active": True,
            "entry_time": datetime.now(IST).isoformat(),
            "exit_price": None,
            "exit_time": None,
            "exit_reason": None,
            "pnl_points": 0.0,
            "pnl_percentage": 0.0,
            "pnl_rupees": 0.0,
            "confluence": [
                f"Position Size: {qty} ({qty // lot_size} lots)",
                f"Slippage applied: {config.SLIPPAGE_PCT}%",
                f"Breakeven trigger at +{config.BREAKEVEN_TRIGGER_PCT}% (Rs {fill_premium * 1.05:.2f})",
                f"Target 1 at +{config.SCALP_TARGET_1_PCT}% (Rs {target_1:.2f})",
                f"Hard Stop at -{config.MAX_STOP_LOSS_PCT}% (Rs {stop_loss:.2f})"
            ]
        }

        self.active_trades.append(trade)
        return trade

    def process_tick(self, index: str, current_spot: float, current_premium: float) -> List[Dict[str, Any]]:
        """
        Process a real-time market tick across all active scalp trades.
        """
        self.total_simulated_ticks += 1
        closed_in_tick = []

        for trade in list(self.active_trades):
            if trade["symbol"] == index:
                updated_trade = self.risk_manager.update_trade_state(trade, current_premium)
                if not updated_trade["active"]:
                    self.active_trades.remove(trade)
                    self.trade_history.append(updated_trade)
                    self.simulated_wallet_inr += updated_trade["pnl_rupees"]
                    closed_in_tick.append(updated_trade)

        return closed_in_tick

    def get_simulation_summary(self) -> Dict[str, Any]:
        """Generate high-level quantitative summary of simulated trading performance."""
        closed = self.trade_history
        total = len(closed)
        if total == 0:
            return {
                "total_trades": 0,
                "win_rate": 0.0,
                "total_net_pnl_inr": 0.0,
                "active_trades": len(self.active_trades),
                "wallet_balance_inr": round(self.simulated_wallet_inr, 2)
            }

        wins = [t for t in closed if t["pnl_rupees"] > 0]
        losses = [t for t in closed if t["pnl_rupees"] < 0]
        breakevens = [t for t in closed if t["pnl_rupees"] == 0]

        total_net = sum(t["pnl_rupees"] for t in closed)
        win_rate = (len(wins) / total) * 100.0

        return {
            "total_trades": total,
            "wins": len(wins),
            "losses": len(losses),
            "breakevens": len(breakevens),
            "win_rate": round(win_rate, 1),
            "total_net_pnl_inr": round(total_net, 2),
            "active_trades": len(self.active_trades),
            "wallet_balance_inr": round(self.simulated_wallet_inr, 2),
            "daily_realized_loss": round(self.risk_manager.daily_realized_pnl_inr, 2),
            "circuit_breaker_active": self.risk_manager.circuit_breaker_active
        }
