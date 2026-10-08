"""
simulator.py
Quantitative Paper Scalping Execution & Order Lifecycle Simulator.
Integrates structure-based underlying stops converted via Delta,
T1 >= 1.5R targets, breakeven + costs locks, and full Jev audit trail.
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from src.config import config, INDEX_CONFIG, IST
from src.risk_manager import RiskManager

logger = logging.getLogger("simulator")

class MarketSimulator:
    def __init__(self, risk_manager: Optional[RiskManager] = None):
        self.risk_manager = risk_manager or RiskManager()
        self.active_trades: List[Dict[str, Any]] = []
        self.trade_history: List[Dict[str, Any]] = []
        self.simulated_wallet_inr: float = config.DEFAULT_WALLET_INR
        self.total_simulated_ticks: int = 0

    def is_within_market_window(self) -> bool:
        """Verify whether current IST time is within NSE market trading hours."""
        now = datetime.now(IST)
        time_str = now.strftime("%H:%M:%S")
        return config.SESSION_ENTRY_START <= time_str <= config.MARKET_CLOSE_TIME

    def create_scalp_order(
        self,
        index: str,
        option_type: str,
        strike: float,
        spot_price: float,
        premium: float,
        delta: float = 0.52,
        stop_distance_underlying_pts: float = 25.0,
        bid_price: float = 0.0,
        ask_price: float = 0.0,
        contract_volume: int = 50000,
        jev_audit: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Create a new scalp order enforcing structure-based underlying stop converted via Delta,
        contract gates (spread, cost-reward, liquidity), and position sizing (risk <= 1% wallet).
        """
        cfg = INDEX_CONFIG.get(index, {"lot_size": 25})
        lot_size = cfg["lot_size"]

        # 1. Structure-based underlying stop converted to option premium via Delta
        effective_delta = min(config.MAX_CONTRACT_DELTA, max(config.MIN_CONTRACT_DELTA, abs(delta)))
        option_stop_dist = max(4.0, round(stop_distance_underlying_pts * effective_delta, 2))

        # Slippage adjustment (e.g. 0.5% adverse fill)
        fill_premium = round(premium * (1.0 + (config.SLIPPAGE_PCT / 100.0)), 2)
        if fill_premium < config.MIN_OPTION_PREMIUM_INR:
            return None

        # 2. Position Sizing: Risk <= 1% wallet
        qty = self.risk_manager.calculate_position_size(
            premium=fill_premium,
            delta=effective_delta,
            stop_distance_pts=stop_distance_underlying_pts,
            lot_size=lot_size
        )
        if qty <= 0:
            logger.info("Position sizing returned 0 quantity; trade rejected.")
            return None

        # 3. Contract & Friction Gates (Pre-entry validation)
        passed_contract_gates, gate_reason, metrics = self.risk_manager.evaluate_contract_gates(
            premium=fill_premium,
            bid_price=bid_price,
            ask_price=ask_price,
            delta=effective_delta,
            quantity=qty,
            stop_distance_pts=stop_distance_underlying_pts,
            contract_volume=contract_volume
        )
        if not passed_contract_gates:
            logger.info(f"Contract gates rejected order: {gate_reason}")
            return None

        # 4. Strict Structure: T1 >= 1.5R and Stop Loss
        stop_loss = round(max(2.0, fill_premium - option_stop_dist), 2)
        target_1 = round(fill_premium + (option_stop_dist * config.TARGET_1_R_MULTIPLE), 2)

        trade_id = len(self.trade_history) + len(self.active_trades) + 1

        confluence_list = [
            f"Quantity: {qty} ({qty // lot_size} lots)",
            f"Underlying Stop: {stop_distance_underlying_pts:.1f} pts (Delta: {effective_delta:.2f})",
            f"Option Risk R: Rs {option_stop_dist:.2f}",
            f"Target 1 (1.5R): Rs {target_1:.2f} (50% book + BE lock)",
            f"Structure Stop: Rs {stop_loss:.2f}",
            f"Cost Friction: Rs {metrics.get('cost_friction_inr', 40.0)} ({metrics.get('cost_to_reward_ratio', 0.05)*100:.1f}% of T1)"
        ]

        if jev_audit:
            score = jev_audit.get("composite_score", 0.0)
            confluence_list.append(f"Jev 1.13 Confirmed (Composite Score: {score:.2f})")

        trade = {
            "id": trade_id,
            "symbol": index,
            "contract": f"{index} {int(strike)} {option_type}",
            "option_type": option_type,
            "strike": strike,
            "delta": effective_delta,
            "spot_at_entry": spot_price,
            "entry_price": fill_premium,
            "quantity": qty,
            "stop_loss": stop_loss,
            "target_1": target_1,
            "r_distance_pts": option_stop_dist,
            "max_price_reached": fill_premium,
            "breakeven_locked": False,
            "t1_booked": False,
            "elapsed_candles_5m": 0,
            "status": "ACTIVE",
            "active": True,
            "entry_time": datetime.now(IST).isoformat(),
            "exit_price": None,
            "exit_time": None,
            "exit_reason": None,
            "pnl_points": 0.0,
            "pnl_percentage": 0.0,
            "pnl_rupees": 0.0,
            "jev_audit": jev_audit or {},
            "confluence": confluence_list
        }

        self.active_trades.append(trade)
        logger.info(f"New scalp order opened: {trade['contract']} at Rs {fill_premium} (Qty: {qty})")
        return trade

    def process_tick(
        self,
        index: str,
        current_spot: float,
        current_premium: float,
        elapsed_5m_candles: int = 1
    ) -> List[Dict[str, Any]]:
        """
        Process a real-time market tick across all active scalp trades.
        """
        self.total_simulated_ticks += 1
        closed_in_tick = []

        for trade in list(self.active_trades):
            if trade["symbol"] == index:
                updated_trade = self.risk_manager.update_trade_state(
                    trade=trade,
                    current_ltp=current_premium,
                    elapsed_5m_candles=elapsed_5m_candles
                )
                if not updated_trade["active"]:
                    self.active_trades.remove(trade)
                    self.trade_history.append(updated_trade)
                    self.simulated_wallet_inr += updated_trade["pnl_rupees"]
                    closed_in_tick.append(updated_trade)

        return closed_in_tick

    def force_exit_trade(self, trade_id: int, exit_reason: str, current_ltp: float) -> Optional[Dict[str, Any]]:
        """Manual or Jev-veto forced exit of active position."""
        for trade in list(self.active_trades):
            if trade["id"] == trade_id:
                trade["status"] = "FORCE_EXIT"
                trade["active"] = False
                trade["exit_price"] = current_ltp
                trade["exit_reason"] = exit_reason
                trade["exit_time"] = datetime.now(IST).isoformat()

                pnl_pts = current_ltp - trade["entry_price"]
                qty = trade.get("quantity", 1)
                gross_pnl = pnl_pts * qty
                charges = self.risk_manager.calculate_statutory_charges(trade["entry_price"] * qty, current_ltp * qty)
                net_pnl = gross_pnl - charges["total_friction"]

                trade["pnl_points"] = round(pnl_pts, 2)
                trade["pnl_percentage"] = round((pnl_pts / trade["entry_price"]) * 100.0, 2)
                trade["pnl_rupees"] = round(net_pnl, 2)
                trade["statutory_charges"] = charges

                self.active_trades.remove(trade)
                self.trade_history.append(trade)
                self.simulated_wallet_inr += net_pnl
                return trade
        return None

    def get_simulation_summary(self) -> Dict[str, Any]:
        """Generate high-level quantitative summary of simulated trading performance."""
        trades = self.trade_history
        total = len(trades)
        wins = sum(1 for t in trades if (t.get("pnl_rupees") or 0) > 0)
        losses = sum(1 for t in trades if (t.get("pnl_rupees") or 0) < 0 and t.get("exit_reason") != "BREAKEVEN_COSTS_HIT")
        breakevens = sum(1 for t in trades if t.get("exit_reason") == "BREAKEVEN_COSTS_HIT" or t.get("pnl_rupees") == 0)
        
        win_rate = (wins / total * 100.0) if total > 0 else 0.0
        net_pnl = sum(t.get("pnl_rupees", 0.0) for t in trades)

        return {
            "total_trades": total,
            "wins": wins,
            "losses": losses,
            "breakevens": breakevens,
            "win_rate": round(win_rate, 1),
            "total_net_pnl_inr": round(net_pnl, 2),
            "active_trades": len(self.active_trades),
            "wallet_balance_inr": round(self.simulated_wallet_inr, 2),
            "daily_realized_loss": round(self.risk_manager.daily_realized_pnl_inr, 2),
            "circuit_breaker_active": self.risk_manager.circuit_breaker_active
        }
