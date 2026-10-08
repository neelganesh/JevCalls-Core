"""
config.py
Configuration module for JevCalls-Core HFT & Scalping Engine.
Includes SEBI specifications, strict risk parameters, and statutory transaction cost constants.
"""

import os
from dataclasses import dataclass
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

# SEBI-compliant Lot Sizes and Strike Steps
INDEX_CONFIG = {
    "NIFTY": {"lot_size": 65, "strike_step": 50, "instrument_token": "NSE_INDEX|Nifty 50"},
    "BANKNIFTY": {"lot_size": 30, "strike_step": 100, "instrument_token": "NSE_INDEX|Nifty Bank"},
    "FINNIFTY": {"lot_size": 65, "strike_step": 50, "instrument_token": "NSE_INDEX|Nifty Fin Service"},
    "MIDCPNIFTY": {"lot_size": 120, "strike_step": 25, "instrument_token": "NSE_INDEX|NIFTY MID SELECT"},
    "SENSEX": {"lot_size": 20, "strike_step": 100, "instrument_token": "BSE_INDEX|SENSEX"},
}

@dataclass
class EngineConfig:
    # Broker & External Keys
    UPSTOX_TOKEN: str = os.getenv("UPSTOX_TOKEN", "")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "https://aszznuucbkoqziowrlyw.supabase.co")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

    # Quantitative Scalping Thresholds (Empirical from 169 historical trades)
    SCALP_TARGET_1_PCT: float = 8.0          # Target 1 scalp exit (50% position)
    BREAKEVEN_TRIGGER_PCT: float = 5.0       # At +5%, move stop loss to Entry price (breakeven)
    MAX_STOP_LOSS_PCT: float = 8.0           # Maximum hard stop loss
    TRAILING_STEP_PCT: float = 4.0           # Trailing step for remaining 50%
    MIN_OPTION_PREMIUM_INR: float = 25.0     # Reject decaying penny contracts (< Rs 25)
    
    # Risk Management & Budget Kill-Switches
    MAX_DAILY_LOSS_INR: float = float(os.getenv("MAX_DAILY_LOSS_INR", "2500.0"))
    MAX_CONSECUTIVE_LOSSES: int = int(os.getenv("MAX_CONSECUTIVE_LOSSES", "2"))
    COOLDOWN_MINUTES_AFTER_BREAKER: int = 30
    DEFAULT_TRADE_BUDGET_INR: float = float(os.getenv("DEFAULT_TRADE_BUDGET_INR", "10000.0"))

    # Statutory Charges & Friction Model
    BROKERAGE_PER_ORDER_INR: float = 20.0    # Flat broker charge per order
    STT_SELL_PCT: float = 0.10               # Securities Transaction Tax on options sell turnover
    EXCHANGE_TURNOVER_PCT: float = 0.053     # NSE exchange turnover fee
    GST_PCT: float = 18.0                    # 18% GST on (brokerage + turnover fee)
    SLIPPAGE_PCT: float = 0.50               # Realistic fill slippage estimate (0.5%)

    # Trading Window (IST)
    MARKET_OPEN_TIME: str = "09:15:00"
    ENTRY_START_TIME: str = "09:16:30"
    ENTRY_CUTOFF_TIME: str = "15:15:00"
    AUTO_SQUAREOFF_TIME: str = "15:20:00"
    MARKET_CLOSE_TIME: str = "15:30:00"

    # Server Settings
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

config = EngineConfig()
