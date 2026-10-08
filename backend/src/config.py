"""
config.py
Configuration module for JevCalls-Core HFT & Scalping Engine.
Integrates strict TypeSafe System One Jev specifications (pinned to jev-1.13.0),
authoritative code gates, SEBI specifications, and statutory transaction cost constants.
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
    # -------------------------------------------------------------
    # 1. TypeSafe System One (Jev) Configuration
    # -------------------------------------------------------------
    # Model PINNED to jev-1.13.0 - NEVER jev-latest
    JEV_MODEL: str = "jev-1.13.0"
    TYPESAFE_API_KEY: str = os.getenv("TYPESAFE_API_KEY", "")
    TYPESAFE_BASE_URL: str = "https://api.typesafe.ai/v1"
    MAX_JEV_TIMEOUT_MS: float = 800.0  # Fail-fast timeout (>800ms => NO_TRADE)

    # -------------------------------------------------------------
    # 2. Broker & External Keys
    # -------------------------------------------------------------
    UPSTOX_TOKEN: str = os.getenv("UPSTOX_TOKEN", "")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "https://aszznuucbkoqziowrlyw.supabase.co")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

    # -------------------------------------------------------------
    # 3. Authoritative Code Gates (Enforced strictly in code)
    # -------------------------------------------------------------
    MAX_DATA_STALENESS_SEC: float = 2.0         # Data staleness < 2s
    MAX_GATEWAY_LATENCY_MS: float = 100.0       # Upstox/network latency < 100ms
    EVENT_BLACKOUT_ACTIVE: bool = False         # RBI policy, election, budget blackout
    
    # Session Trading Window (IST)
    SESSION_ENTRY_START: str = "09:30:00"       # No entries 09:15-09:30 IST
    SESSION_ENTRY_CUTOFF: str = "14:45:00"      # No entries after 14:45 IST
    SESSION_FORCE_EXIT: str = "15:15:00"        # Force auto-exit at 15:15 IST
    MARKET_CLOSE_TIME: str = "15:30:00"

    # Daily Account Limits (relative to total wallet capital)
    DEFAULT_WALLET_INR: float = float(os.getenv("DEFAULT_WALLET_INR", "100000.0"))
    MAX_DAILY_LOSS_PCT: float = 2.0             # Daily limit: -2% wallet
    MAX_CONSECUTIVE_LOSSES: int = 2             # Daily limit: 2 consecutive losses
    MAX_DAILY_TRADES: int = 3                   # Daily limit: 3 trades max per day
    COOLDOWN_MINUTES_AFTER_BREAKER: int = 30

    # Per-Trade Risk & Sizing Gates
    MAX_RISK_PER_TRADE_PCT: float = 1.0         # Risk <= 1% wallet per trade
    MAX_COST_TO_REWARD_RATIO: float = 0.10      # Cost friction < 10% expected reward at T1
    MAX_BID_ASK_SPREAD_PCT: float = 0.50        # Bid-ask spread < 0.5%
    MAX_BID_ASK_SPREAD_INR: float = 0.50        # Or spread <= Rs 0.50
    MIN_OPTION_PREMIUM_INR: float = 25.0        # Reject decaying penny contracts (< Rs 25)

    # -------------------------------------------------------------
    # 4. Contract Selection & Structure-Based Trade Mechanics
    # -------------------------------------------------------------
    MIN_CONTRACT_DELTA: float = 0.45            # ATM / 1 ITM delta range: 0.45 to 0.65
    MAX_CONTRACT_DELTA: float = 0.65
    TARGET_1_R_MULTIPLE: float = 1.5            # T1 >= 1.5R (booked 50%, stop moved to BE + costs)
    BOOK_PERCENT_AT_T1: float = 50.0
    TIME_STOP_CANDLES: int = 6                  # Time stop: no +0.5R in 6 5m candles (30m) -> exit
    TIME_STOP_MIN_R: float = 0.5

    # -------------------------------------------------------------
    # 5. Composite Scoring Weights & Decision Thresholds (In Config, NOT Prompts)
    # -------------------------------------------------------------
    JEV_CONFIDENCE_FLOOR: float = 0.50          # Gated on confidence >= 0.50
    JEV_CONFIDENCE_CRITICAL: float = 0.60       # Higher for entry-critical (bias)

    # Per-question weights (sum = 1.0)
    WEIGHT_TRENDING: float = 0.25
    WEIGHT_BREAKOUT: float = 0.25
    WEIGHT_OI_FLOW: float = 0.20
    WEIGHT_ROOM_TO_WALL: float = 0.15
    WEIGHT_MOMENTUM: float = 0.15

    # Per-question passing thresholds
    THRESHOLD_NOUL_TRENDING: float = 0.65
    THRESHOLD_NOUL_BREAKOUT: float = 0.60
    THRESHOLD_NOUL_OI: float = 0.60
    THRESHOLD_NOUL_ROOM: float = 0.60
    THRESHOLD_MAX_IV_CRUSH: float = 0.40        # If iv_crush_risk > 0.40, veto trade
    THRESHOLD_MOMENTUM_MIN_SCORE: float = 2.0   # Score out of 4.0
    COMPOSITE_ENTRY_THRESHOLD: float = 0.65     # Weighted composite score >= 0.65 to enter

    # Position Management Veto Thresholds
    THRESHOLD_THESIS_INVALID: float = 0.65      # Exit if thesis_invalid > 0.65
    THRESHOLD_MOMENTUM_EXHAUSTED: float = 0.70  # Exit if momentum_exhausted > 0.70

    # -------------------------------------------------------------
    # 6. Statutory Charges & Friction Model
    # -------------------------------------------------------------
    BROKERAGE_PER_ORDER_INR: float = 20.0       # Flat broker charge per order (Buy + Sell = 40)
    STT_SELL_PCT: float = 0.10                  # Securities Transaction Tax on options sell turnover
    EXCHANGE_TURNOVER_PCT: float = 0.053        # NSE exchange turnover fee
    GST_PCT: float = 18.0                       # 18% GST on (brokerage + turnover fee)
    SLIPPAGE_PCT: float = 0.50                  # Realistic fill slippage estimate (0.5%)

    # Server Settings
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

config = EngineConfig()
