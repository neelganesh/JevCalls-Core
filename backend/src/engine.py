"""
engine.py
Core quantitative engine for JevCalls-Core.
Orchestrates market feed ingestion, technical setup detection, sub-second execution,
and WebSocket state broadcasting.
"""

import asyncio
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from src.config import config, INDEX_CONFIG, IST
from src.indicators import calculate_cpr, calculate_ema, calculate_vwap, calculate_supertrend
from src.risk_manager import RiskManager
from src.simulator import MarketSimulator

logger = logging.getLogger("engine")

class JevCoreEngine:
    def __init__(self):
        self.risk_manager = RiskManager()
        self.simulator = MarketSimulator(risk_manager=self.risk_manager)
        self.market_snapshots: Dict[str, Dict[str, Any]] = {}
        self.is_running: bool = False

        # Initialize default snapshots
        for index in INDEX_CONFIG.keys():
            self.market_snapshots[index] = {
                "symbol": index,
                "spot": 0.0,
                "cpr": {},
                "supertrend": {"level": 0.0, "signal": "NEUTRAL"},
                "vwap": 0.0,
                "regime": "NEUTRAL",
                "timestamp": datetime.now(IST).isoformat()
            }

    def evaluate_setup(
        self, 
        index: str, 
        spot: float, 
        candles: List[Dict[str, float]], 
        atm_call_prem: float, 
        atm_put_prem: float,
        live_vwap: Optional[float] = None,
        live_cpr: Optional[Dict[str, Any]] = None,
        greeks: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Evaluate high-probability intraday scalping setup using Upstox native data when available:
        - Price > TC and Supertrend == BUY and Price > VWAP -> Scalp BUY CE
        - Price < BC and Supertrend == SELL and Price < VWAP -> Scalp BUY PE
        """
        if not candles or len(candles) < 5:
            return None

        # 1. CPR: use official Upstox daily OHLC if provided, else compute from candle
        if live_cpr and live_cpr.get("tc"):
            cpr = live_cpr
        else:
            prev_day = candles[-1]
            cpr = calculate_cpr(prev_day["high"], prev_day["low"], prev_day["close"])

        # 2. VWAP: use native Upstox exchange ATP if provided, else compute
        vwap = live_vwap if (live_vwap and live_vwap > 0) else calculate_vwap(candles)
        st_level, st_direction = calculate_supertrend(candles)

        step = INDEX_CONFIG[index]["strike_step"]
        atm_strike = round(spot / step) * step

        signal = None
        option_type = None
        premium = 0.0

        # Bullish Scalp Setup
        if spot > cpr["tc"] and st_direction == "BUY" and spot > vwap:
            signal = "BUY_CE"
            option_type = "CE"
            premium = atm_call_prem

        # Bearish Scalp Setup
        elif spot < cpr["bc"] and st_direction == "SELL" and spot < vwap:
            signal = "BUY_PE"
            option_type = "PE"
            premium = atm_put_prem

        # Update snapshot
        self.market_snapshots[index] = {
            "symbol": index,
            "spot": spot,
            "cpr": cpr,
            "supertrend": {"level": st_level, "signal": st_direction},
            "vwap": round(vwap, 2),
            "regime": "BULLISH_EXPANSION" if signal == "BUY_CE" else ("BEARISH_EXPANSION" if signal == "BUY_PE" else "SIDEWAYS"),
            "greeks": greeks or {},
            "timestamp": datetime.now(IST).isoformat()
        }

        if signal and premium >= config.MIN_OPTION_PREMIUM_INR:
            # Check if we already have an active trade in this index
            has_active = any(t["symbol"] == index for t in self.simulator.active_trades)
            if not has_active:
                return self.simulator.create_scalp_order(
                    index=index,
                    option_type=option_type,
                    strike=atm_strike,
                    spot_price=spot,
                    premium=premium
                )

        return None

    def ingest_tick(self, index: str, spot: float, option_premium: float) -> Dict[str, Any]:
        """Sub-second tick intake from WebSocket feed."""
        closed_trades = self.simulator.process_tick(index, spot, option_premium)
        return {
            "symbol": index,
            "spot": spot,
            "closed_trades": closed_trades,
            "active_trades": self.simulator.active_trades,
            "summary": self.simulator.get_simulation_summary()
        }
