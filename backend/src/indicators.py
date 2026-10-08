"""
indicators.py
Lightweight, vectorized technical indicator engine for high-frequency market analysis.
Optimized for low-latency in-memory computation without heavy pandas overhead.
"""

from typing import List, Dict, Any, Tuple
import numpy as np

def calculate_cpr(high: float, low: float, close: float) -> Dict[str, float]:
    """
    Calculate Central Pivot Range (CPR):
    Pivot (P) = (High + Low + Close) / 3
    Bottom Central (BC) = (High + Low) / 2
    Top Central (TC) = (Pivot - BC) + Pivot = 2*Pivot - BC
    """
    pivot = (high + low + close) / 3.0
    bc = (high + low) / 2.0
    tc = (2.0 * pivot) - bc
    bottom_val = min(bc, tc)
    top_val = max(bc, tc)
    width = top_val - bottom_val
    width_pct = (width / pivot) * 100.0 if pivot > 0 else 0.0

    return {
        "pivot": round(pivot, 2),
        "tc": round(top_val, 2),
        "bc": round(bottom_val, 2),
        "width": round(width, 2),
        "is_narrow": width_pct < 0.25  # High-probability breakout condition
    }

def calculate_ema(prices: List[float], period: int) -> float:
    """Exponential Moving Average (EMA) for latest price."""
    if len(prices) < period:
        return prices[-1] if prices else 0.0
    
    alpha = 2.0 / (period + 1.0)
    ema = float(prices[0])
    for price in prices[1:]:
        ema = (price * alpha) + (ema * (1.0 - alpha))
    return round(ema, 2)

def calculate_vwap(candles: List[Dict[str, float]]) -> float:
    """Volume Weighted Average Price (VWAP) across intraday candles."""
    if not candles:
        return 0.0
    cum_pv = 0.0
    cum_vol = 0.0
    for c in candles:
        typical_price = (c["high"] + c["low"] + c["close"]) / 3.0
        vol = max(1.0, c.get("volume", 1.0))
        cum_pv += typical_price * vol
        cum_vol += vol
    return round(cum_pv / cum_vol, 2) if cum_vol > 0 else 0.0

def calculate_supertrend(candles: List[Dict[str, float]], period: int = 7, multiplier: float = 3.0) -> Tuple[float, str]:
    """Calculate Supertrend level and direction (BUY/SELL)."""
    if len(candles) < period + 1:
        return candles[-1]["close"] if candles else 0.0, "NEUTRAL"

    closes = np.array([c["close"] for c in candles])
    highs = np.array([c["high"] for c in candles])
    lows = np.array([c["low"] for c in candles])

    # Simple ATR approximation for speed
    tr = np.maximum(highs[1:] - lows[1:], np.maximum(np.abs(highs[1:] - closes[:-1]), np.abs(lows[1:] - closes[:-1])))
    atr = np.mean(tr[-period:])

    last_close = closes[-1]
    hl2 = (highs[-1] + lows[-1]) / 2.0
    upper_band = hl2 + (multiplier * atr)
    lower_band = hl2 - (multiplier * atr)

    if last_close > upper_band:
        return round(lower_band, 2), "BUY"
    elif last_close < lower_band:
        return round(upper_band, 2), "SELL"
    else:
        direction = "BUY" if last_close >= hl2 else "SELL"
        level = lower_band if direction == "BUY" else upper_band
        return round(level, 2), direction
