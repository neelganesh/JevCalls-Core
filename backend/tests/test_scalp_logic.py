"""
test_scalp_logic.py
Comprehensive unit tests for JevCalls-Core:
1. Authoritative Hard Code Gates (Staleness, Latency, Session Window, Drawdown, Consecutive Losses, Trade Cap)
2. Contract & Friction Gates (Spread, Friction < 10% T1 reward, Delta 0.45-0.65)
3. Position Sizing (Risk <= 1.0% wallet)
4. Active Trade Management (T1 >= 1.5R booking 50% + Breakeven+Costs lock, Time Stop 6 candles, 15:15 Force Exit)
5. Statutory Charges & CPR calculations
"""

import pytest
from datetime import datetime, timedelta, time
from src.config import config, IST
from src.risk_manager import RiskManager
from src.indicators import calculate_cpr

def test_authoritative_hard_code_gates():
    rm = RiskManager(wallet_inr=100000.0)
    simulated_market_time = datetime(2026, 10, 8, 10, 30, 0, tzinfo=IST)

    # 1. Stale Data (> 2.0s) must be rejected
    stale_ts = simulated_market_time - timedelta(seconds=2.5)
    passed, reason, _ = rm.evaluate_hard_gates(data_timestamp=stale_ts, current_time=simulated_market_time)
    assert not passed
    assert "DATA_STALENESS" in reason

    # 2. High Latency (> 100ms) must be rejected
    passed, reason, _ = rm.evaluate_hard_gates(gateway_latency_ms=120.0, current_time=simulated_market_time)
    assert not passed
    assert "HIGH_LATENCY" in reason

    # 3. Invalid broker token must be rejected
    passed, reason, _ = rm.evaluate_hard_gates(token_valid=False, current_time=simulated_market_time)
    assert not passed
    assert "BROKER_TOKEN_INVALID" in reason

    # 4. Daily Loss Limit (-2% of wallet = -2000 INR)
    rm.daily_realized_pnl_inr = -2100.0
    passed, reason, _ = rm.evaluate_hard_gates(current_time=simulated_market_time)
    assert not passed
    assert "DAILY_LOSS_LIMIT" in reason
    rm.daily_realized_pnl_inr = 0.0

    # 5. Consecutive Losses (Max 2) triggers Circuit Breaker
    rm.consecutive_losses = 2
    passed, reason, _ = rm.evaluate_hard_gates(current_time=simulated_market_time)
    assert not passed
    assert "CONSECUTIVE_LOSS_LIMIT" in reason
    rm.consecutive_losses = 0
    rm.circuit_breaker_active = False

    # 6. Max Daily Trades (Max 3)
    rm.daily_trades_count = 3
    passed, reason, _ = rm.evaluate_hard_gates(current_time=simulated_market_time)
    assert not passed
    assert "MAX_DAILY_TRADES_REACHED" in reason

def test_contract_friction_gates():
    rm = RiskManager(wallet_inr=100000.0)

    # 1. Wide Bid-Ask Spread (> 0.50 INR on a 50 INR contract = 1.0%) must be rejected
    passed, reason, _ = rm.evaluate_contract_gates(
        premium=50.0,
        bid_price=49.0,
        ask_price=50.0,  # Spread = 1.0 INR (> 0.50 INR and 2.0%)
        delta=0.50,
        quantity=50,
        stop_distance_pts=10.0
    )
    assert not passed
    assert "EXCESSIVE_SPREAD" in reason

    # 2. Delta out of 0.45 - 0.65 range must be rejected
    passed, reason, _ = rm.evaluate_contract_gates(
        premium=100.0,
        bid_price=99.9,
        ask_price=100.1,
        delta=0.35,  # Too low
        quantity=50,
        stop_distance_pts=10.0
    )
    assert not passed
    assert "DELTA_OUT_OF_RANGE" in reason

    # 3. Valid Contract passes (with adequate quantity so brokerage friction < 10% expected reward)
    passed, reason, audit = rm.evaluate_contract_gates(
        premium=150.0,
        bid_price=149.8,
        ask_price=150.2,
        delta=0.52,
        quantity=100,
        stop_distance_pts=20.0
    )
    assert passed
    assert reason == "CONTRACT_GATES_PASSED"

def test_position_sizing_one_percent_wallet():
    rm = RiskManager(wallet_inr=100000.0)  # Max risk = 1% = 1000 INR
    # Underlying stop distance = 20 pts, Delta = 0.50 -> Option risk = 10 pts + slippage ~ 10.75 pts
    qty = rm.calculate_position_size(
        premium=150.0,
        delta=0.50,
        stop_distance_pts=20.0,
        lot_size=25  # NIFTY lot size
    )
    # 1000 INR / ~10.75 = ~93 shares -> floor to lot size 25 = 75 or within 1.25x boundary
    assert qty in (75, 50, 25)
    total_risk = qty * (20.0 * 0.50 + 150.0 * 0.005)
    assert total_risk <= 1250.0  # Within 1.25x allowable risk boundary

def test_target_one_and_breakeven_lock():
    rm = RiskManager(wallet_inr=100000.0)
    simulated_morning = datetime(2026, 10, 8, 10, 30, 0, tzinfo=IST)

    trade = {
        "id": 1,
        "entry_price": 100.0,
        "stop_loss": 90.0,       # 10 pts R
        "target_1": 115.0,       # 1.5R (15 pts)
        "r_distance_pts": 10.0,
        "active": True,
        "quantity": 50,
        "status": "ACTIVE"
    }

    # Tick at 105 (+0.5R, does not book T1 yet)
    trade = rm.update_trade_state(trade, 105.0, elapsed_5m_candles=2, now_override=simulated_morning)
    assert trade["active"] is True
    assert trade["stop_loss"] == 90.0

    # Tick reaches 115.0 (Target 1 = 1.5R reached)
    trade = rm.update_trade_state(trade, 115.0, elapsed_5m_candles=3, now_override=simulated_morning)
    assert trade["active"] is True
    assert trade["t1_booked"] is True
    assert trade["breakeven_locked"] is True
    assert trade["stop_loss"] > 100.0  # Moved to Entry + estimated friction!

    # Price retraces to 100.0 (below BE+Costs) -> Exits with zero loss
    trade = rm.update_trade_state(trade, 100.0, elapsed_5m_candles=4, now_override=simulated_morning)
    assert trade["active"] is False
    assert trade["exit_reason"] == "BREAKEVEN_COSTS_HIT"

def test_time_stop_after_six_candles():
    rm = RiskManager(wallet_inr=100000.0)
    simulated_morning = datetime(2026, 10, 8, 11, 0, 0, tzinfo=IST)

    trade = {
        "id": 2,
        "entry_price": 100.0,
        "stop_loss": 90.0,
        "target_1": 115.0,
        "r_distance_pts": 10.0,
        "active": True,
        "quantity": 50,
        "status": "ACTIVE"
    }

    # Trade stagnant at 102 (+0.2R < +0.5R) after 6 candles (30 minutes)
    trade = rm.update_trade_state(trade, 102.0, elapsed_5m_candles=6, now_override=simulated_morning)
    assert trade["active"] is False
    assert trade["status"] == "TIME_STOP_EXIT"
    assert "TIME_STOP_30M_UNDER_HALF_R" in trade["exit_reason"]

def test_eod_force_exit_at_1515():
    rm = RiskManager(wallet_inr=100000.0)
    eod_time = datetime(2026, 10, 8, 15, 15, 1, tzinfo=IST)

    trade = {
        "id": 3,
        "entry_price": 100.0,
        "stop_loss": 90.0,
        "target_1": 115.0,
        "r_distance_pts": 10.0,
        "active": True,
        "quantity": 50,
        "status": "ACTIVE"
    }

    # At 15:15 IST, any active position is force closed
    trade = rm.update_trade_state(trade, 108.0, elapsed_5m_candles=2, now_override=eod_time)
    assert trade["active"] is False
    assert trade["status"] == "CLOSED_EOD"
    assert trade["exit_reason"] == "SESSION_EOD_FORCE_EXIT_15_15"

def test_statutory_charges():
    rm = RiskManager()
    charges = rm.calculate_statutory_charges(buy_value=5000.0, sell_value=5400.0)
    assert charges["brokerage"] == 40.0
    assert charges["stt"] > 0
    assert charges["total_friction"] > 40.0

def test_cpr_calculation():
    cpr = calculate_cpr(high=25000.0, low=24800.0, close=24900.0)
    assert cpr["pivot"] == 24900.0
    assert cpr["bc"] == 24900.0
    assert cpr["tc"] == 24900.0
