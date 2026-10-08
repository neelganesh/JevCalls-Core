"""
test_scalp_logic.py
Unit tests verifying +5% breakeven locking, +8% scalp target, and -8% stop loss.
"""

import pytest
from src.config import config
from src.risk_manager import RiskManager
from src.indicators import calculate_cpr, calculate_ema

def test_breakeven_lock_at_5_percent():
    rm = RiskManager()
    trade = {
        "id": 1,
        "entry_price": 100.0,
        "stop_loss": 92.0,  # -8% initial stop
        "target_1": 108.0,  # +8% target
        "max_price_reached": 100.0,
        "active": True,
        "quantity": 25,
        "status": "ACTIVE"
    }

    # Tick moves to 103 (only +3%, not enough for breakeven)
    trade = rm.update_trade_state(trade, 103.0)
    assert trade["active"] is True
    assert trade["stop_loss"] == 92.0

    # Tick moves to 105.5 (+5.5%, triggers breakeven!)
    trade = rm.update_trade_state(trade, 105.5)
    assert trade["active"] is True
    assert trade["stop_loss"] == 100.0  # Stop locked at entry!
    assert trade.get("breakeven_locked") is True

    # Price drops back to 99.0 -> Exits at breakeven stop (100.0), avoiding initial 92.0 loss!
    trade = rm.update_trade_state(trade, 99.0)
    assert trade["active"] is False
    assert trade["status"] == "SL_HIT"
    assert trade["exit_reason"] == "BREAKEVEN_STOP_HIT"

def test_target_1_scalp_hit():
    rm = RiskManager()
    trade = {
        "id": 2,
        "entry_price": 200.0,
        "stop_loss": 184.0,  # -8%
        "target_1": 216.0,  # +8%
        "max_price_reached": 200.0,
        "active": True,
        "quantity": 50,
        "status": "ACTIVE"
    }

    # Tick hits 217.0 (+8.5%)
    trade = rm.update_trade_state(trade, 217.0)
    assert trade["active"] is False
    assert trade["status"] == "TARGET_HIT"
    assert trade["exit_reason"] == "TARGET_1_SCALP_HIT"
    assert trade["pnl_points"] == 17.0
    assert trade["pnl_rupees"] > 0

def test_statutory_charges():
    rm = RiskManager()
    charges = rm.calculate_statutory_charges(buy_value=5000.0, sell_value=5400.0)
    assert charges["brokerage"] == 40.0
    assert charges["stt"] > 0
    assert charges["total_friction"] > 40.0

def test_daily_kill_switch():
    rm = RiskManager()
    rm.daily_realized_pnl_inr = -2600.0  # Exceeded Rs 2500 limit
    can_trade, reason = rm.check_kill_switches()
    assert can_trade is False
    assert "DAILY_KILL_SWITCH_TRIGGERED" in reason

def test_cpr_calculation():
    cpr = calculate_cpr(high=25000.0, low=24800.0, close=24900.0)
    assert cpr["pivot"] == 24900.0
    assert cpr["bc"] == 24900.0
    assert cpr["tc"] == 24900.0
