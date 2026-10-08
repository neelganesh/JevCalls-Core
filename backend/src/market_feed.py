"""
market_feed.py
Direct Upstox Market Feed, Live Option Chain & Native VWAP Integration.
Fetches live spot quotes, exchange-native VWAP (average_price), official OHLC,
and real-time Option Chain with Greeks (Delta, Theta, IV, PCR) directly from Upstox API v2.
"""

import time
import logging
from typing import Dict, Any, List, Optional
import httpx
from src.config import config, INDEX_CONFIG

logger = logging.getLogger("market_feed")

UPSTOX_BASE_URL = "https://api.upstox.com/v2"

class UpstoxMarketFeed:
    def __init__(self, token: Optional[str] = None):
        self.token = token or config.UPSTOX_TOKEN
        self.is_connected = False
        self.last_error: Optional[str] = None
        self._chain_cache: Dict[str, Dict[str, Any]] = {}
        self._cache_ttl_sec: float = 3.0  # Cache option chain for 3 seconds to avoid rate-limiting

    def set_token(self, token: str):
        self.token = token.strip()
        config.UPSTOX_TOKEN = self.token
        self._chain_cache.clear()

    async def test_connection(self) -> Dict[str, Any]:
        """Verify if current Upstox token is valid and active."""
        if not self.token:
            self.is_connected = False
            self.last_error = "UPSTOX_TOKEN is not configured"
            return {"connected": False, "reason": self.last_error}

        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.token}"
        }

        start_t = time.time()
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                res = await client.get(
                    f"{UPSTOX_BASE_URL}/market-quote/quotes",
                    params={"instrument_key": "NSE_INDEX|Nifty 50"},
                    headers=headers
                )
                latency_ms = round((time.time() - start_t) * 1000, 1)
                if res.status_code == 200:
                    self.is_connected = True
                    self.last_error = None
                    data = res.json().get("data", {})
                    quote = list(data.values())[0] if data else {}
                    return {
                        "connected": True,
                        "nifty_ltp": quote.get("last_price", 0.0),
                        "timestamp": quote.get("timestamp"),
                        "latency_ms": latency_ms
                    }
                elif res.status_code == 401:
                    self.is_connected = False
                    self.last_error = "Token expired or unauthorized (SEBI daily re-auth required)"
                    return {"connected": False, "reason": self.last_error, "status_code": 401}
                else:
                    self.is_connected = False
                    self.last_error = f"Upstox API returned status {res.status_code}"
                    return {"connected": False, "reason": self.last_error, "status_code": res.status_code}

        except Exception as e:
            self.is_connected = False
            self.last_error = str(e)
            return {"connected": False, "reason": str(e)}

    async def get_multi_quotes(self) -> Dict[str, Dict[str, Any]]:
        """
        Fetch live spot quotes, native exchange VWAP (average_price), and OHLC
        for all 5 indices directly from Upstox.
        """
        if not self.token:
            return {}

        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.token}"
        }

        keys = ",".join(cfg["instrument_token"] for cfg in INDEX_CONFIG.values())
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(
                    f"{UPSTOX_BASE_URL}/market-quote/quotes",
                    params={"instrument_key": keys},
                    headers=headers
                )
                if res.status_code == 200:
                    data = res.json().get("data", {})
                    results = {}
                    for sym, cfg in INDEX_CONFIG.items():
                        token = cfg["instrument_token"]
                        for k, v in data.items():
                            if token in k or sym.lower() in k.lower():
                                ltp = float(v.get("last_price", 0.0))
                                vwap = float(v.get("average_price", 0.0)) or ltp
                                ohlc = v.get("ohlc", {})
                                results[sym] = {
                                    "spot": ltp,
                                    "vwap": vwap,
                                    "ohlc": {
                                        "open": float(ohlc.get("open", 0.0)),
                                        "high": float(ohlc.get("high", 0.0)),
                                        "low": float(ohlc.get("low", 0.0)),
                                        "close": float(ohlc.get("close", 0.0))
                                    },
                                    "volume": int(v.get("volume", 0)),
                                    "oi": int(v.get("oi", 0)),
                                    "timestamp": v.get("timestamp")
                                }
                    return results
        except Exception as e:
            logger.warning(f"Error fetching Upstox quotes: {e}")

        return {}

    async def get_option_chain(self, index_symbol: str, expiry_date: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetch real-time Option Chain directly from Upstox API v2:
        GET /v2/option/chain?instrument_key=...&expiry_date=...
        Cached for 3 seconds per symbol to prevent rate limits.
        """
        if not self.token or index_symbol not in INDEX_CONFIG:
            return []

        now = time.time()
        cached = self._chain_cache.get(index_symbol)
        if cached and (now - cached["timestamp"] < self._cache_ttl_sec):
            return cached["data"]

        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.token}"
        }

        inst_token = INDEX_CONFIG[index_symbol]["instrument_token"]
        params: Dict[str, str] = {"instrument_key": inst_token}
        if expiry_date:
            params["expiry_date"] = expiry_date

        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                res = await client.get(
                    f"{UPSTOX_BASE_URL}/option/chain",
                    params=params,
                    headers=headers
                )
                if res.status_code == 200:
                    payload = res.json()
                    chain_data = payload.get("data", [])
                    if chain_data:
                        self._chain_cache[index_symbol] = {
                            "timestamp": now,
                            "data": chain_data
                        }
                    return chain_data
                elif res.status_code == 401:
                    self.is_connected = False
                    self.last_error = "Upstox token expired"
        except Exception as e:
            logger.warning(f"Error fetching Upstox Option Chain for {index_symbol}: {e}")

        return []

    async def get_atm_option_premiums(self, index_symbol: str, spot_price: float) -> Optional[Dict[str, Any]]:
        """
        Extract live ATM Call and Put options with premiums and Greeks directly from Upstox Option Chain.
        Applies minimum premium filter to reject decaying penny options.
        """
        chain = await self.get_option_chain(index_symbol)
        if not chain:
            return None

        # Find strike closest to current spot price
        best_strike_record = None
        min_dist = float("inf")

        for item in chain:
            strike = float(item.get("strike_price", 0.0))
            dist = abs(strike - spot_price)
            if dist < min_dist:
                min_dist = dist
                best_strike_record = item

        if not best_strike_record:
            return None

        call_data = best_strike_record.get("call_options") or {}
        put_data = best_strike_record.get("put_options") or {}

        call_market = call_data.get("market_data") or {}
        put_market = put_data.get("market_data") or {}

        call_greeks = call_data.get("option_greeks") or {}
        put_greeks = put_data.get("option_greeks") or {}

        call_ltp = float(call_market.get("ltp", 0.0))
        put_ltp = float(put_market.get("ltp", 0.0))

        # Check Option Premium Filter against config threshold
        call_valid = call_ltp >= config.MIN_OPTION_PREMIUM_INR
        put_valid = put_ltp >= config.MIN_OPTION_PREMIUM_INR

        return {
            "strike": best_strike_record.get("strike_price"),
            "pcr": best_strike_record.get("pcr"),
            "expiry": best_strike_record.get("expiry"),
            "call": {
                "ltp": call_ltp,
                "bid": float(call_market.get("bid_price", 0.0)),
                "ask": float(call_market.get("ask_price", 0.0)),
                "oi": int(call_market.get("oi", 0)),
                "volume": int(call_market.get("volume", 0)),
                "instrument_key": call_data.get("instrument_key", ""),
                "greeks": {
                    "delta": float(call_greeks.get("delta", 0.0)),
                    "theta": float(call_greeks.get("theta", 0.0)),
                    "iv": float(call_greeks.get("iv", 0.0))
                },
                "passes_premium_filter": call_valid
            },
            "put": {
                "ltp": put_ltp,
                "bid": float(put_market.get("bid_price", 0.0)),
                "ask": float(put_market.get("ask_price", 0.0)),
                "oi": int(put_market.get("oi", 0)),
                "volume": int(put_market.get("volume", 0)),
                "instrument_key": put_data.get("instrument_key", ""),
                "greeks": {
                    "delta": float(put_greeks.get("delta", 0.0)),
                    "theta": float(put_greeks.get("theta", 0.0)),
                    "iv": float(put_greeks.get("iv", 0.0))
                },
                "passes_premium_filter": put_valid
            }
        }

market_feed = UpstoxMarketFeed()
