"""
market_feed.py
Direct Upstox Market Feed & Live Quote Integration.
Fetches live spot quotes, option chains, and intraday candles with seamless fallback to simulator.
"""

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

    def set_token(self, token: str):
        self.token = token.strip()
        config.UPSTOX_TOKEN = self.token

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

        import time
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

    async def get_multi_quotes(self) -> Dict[str, float]:
        """Fetch live spot prices for all 5 indices from Upstox."""
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
                    quotes = {}
                    for sym, cfg in INDEX_CONFIG.items():
                        token = cfg["instrument_token"]
                        for k, v in data.items():
                            if token in k or sym.lower() in k.lower():
                                quotes[sym] = float(v.get("last_price", 0.0))
                    return quotes
        except Exception as e:
            logger.warning(f"Error fetching Upstox quotes: {e}")

        return {}

market_feed = UpstoxMarketFeed()
