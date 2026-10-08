"""
jev_decision_gate.py
TypeSafe System One (Jev 1.13) Decision Gate & Composite Scoring Engine.
Enforces typed judgments (Noul, Choice, Score) with model pinned strictly to 'jev-1.13.0'.
Arithmetic stays 100% in code; Jev confirms or vetoes with per-question confidence thresholds.
"""

import time
import logging
from typing import Dict, Any, List, Optional, Tuple
import httpx

from src.config import config, IST

logger = logging.getLogger("jev_decision_gate")

class JevDecisionGate:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or config.TYPESAFE_API_KEY
        # Pinned model - NEVER use jev-latest per architecture specification
        self.model = config.JEV_MODEL  # "jev-1.13.0"
        self.timeout_sec = config.MAX_JEV_TIMEOUT_MS / 1000.0  # 0.8s fail-fast
        self.decision_log: List[Dict[str, Any]] = []

    def is_configured(self) -> bool:
        return bool(self.api_key and len(self.api_key.strip()) > 5)

    async def _call_system_one(self, state: Dict[str, Any], questions: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Execute raw HTTP POST to TypeSafe System One API:
        POST https://api.typesafe.ai/v1/systemone
        Enforces 800ms strict timeout and returns raw typed answers or None on failure.
        """
        if not self.is_configured():
            logger.warning("TypeSafe API Key not configured; skipping Jev System One call.")
            return None

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key.strip()}"
        }

        body = {
            "model": self.model,
            "state": state,
            "questions": questions
        }

        start_time = time.time()
        try:
            async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
                res = await client.post(
                    f"{config.TYPESAFE_BASE_URL}/systemone",
                    json=body,
                    headers=headers
                )
                elapsed_ms = round((time.time() - start_time) * 1000, 1)

                if res.status_code == 200:
                    payload = res.json()
                    payload["latency_ms"] = elapsed_ms
                    return payload
                else:
                    logger.warning(f"Jev API returned error status {res.status_code}: {res.text[:200]}")
                    return None

        except httpx.TimeoutException:
            elapsed_ms = round((time.time() - start_time) * 1000, 1)
            logger.warning(f"Jev API call timed out after {elapsed_ms}ms (> {config.MAX_JEV_TIMEOUT_MS}ms limit). Triggering NO_TRADE veto.")
            return None
        except Exception as e:
            logger.error(f"Error calling TypeSafe Jev API: {e}")
            return None

    # =========================================================================
    # REQUEST 1: ENTRY EVALUATION (Evaluated on 5m candle close)
    # =========================================================================
    async def evaluate_entry(
        self,
        index: str,
        side: str,  # "CE" or "PE"
        spot: float,
        candles_5m: List[Dict[str, Any]],
        prior_day: Dict[str, Any],
        opening_range: Dict[str, Any],
        technical_facts: Dict[str, Any],
        oi_change: Dict[str, Any],
        market_context: Dict[str, Any],
        wall_context: Dict[str, Any]
    ) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Request 1: Evaluates entry confluence on candle close.
        Constructs typed state and questions, queries Jev 1.13, and computes composite score.
        Returns: (passes_confirmation: bool, reason: str, full_audit: Dict)
        """
        # Build self-contained State object with named fields
        state = {
            "symbol": index,
            "side": side,
            "spot": spot,
            "candles_5m": candles_5m[-6:],  # Last 6 5-minute candles
            "prior_day": prior_day,
            "opening_range": opening_range,
            "technical_facts": technical_facts,
            "oi_change": oi_change,
            "market_context": market_context,
            "wall_context": wall_context
        }

        # Questions (self-contained instructions referencing state by path)
        breakout_q_key = "breakout_real_ce" if side == "CE" else "breakout_real_pe"
        breakout_instruction = (
            "Is the latest breakout above `opening_range.high` backed by `technical_facts.volume_ratio` and not a likely fakeout?"
            if side == "CE" else
            "Is the latest breakout below `opening_range.low` backed by `technical_facts.volume_ratio` and not a likely fakeout?"
        )

        oi_q_key = "oi_supports_ce" if side == "CE" else "oi_supports_pe"
        oi_instruction = (
            "Does `oi_change` show put writing or call unwinding supporting an upward directional move?"
            if side == "CE" else
            "Does `oi_change` show call writing or put unwinding supporting a downward directional move?"
        )

        questions = {
            "bias": {
                "type": "choice",
                "instructions": "Given `candles_5m`, `prior_day`, and `technical_facts.spot_vs_vwap`, what is the primary intraday directional bias?",
                "criteria": {
                    "bullish": "Price sustaining above TC/VWAP with buyers in control",
                    "bearish": "Price sustaining below BC/VWAP with sellers in control",
                    "neutral": "Choppy, rangebound oscillation around pivots with no clear direction"
                }
            },
            "trending": {
                "type": "noul",
                "instructions": "Do `candles_5m` show a directional trending expansion rather than sideways chop?"
            },
            breakout_q_key: {
                "type": "noul",
                "instructions": breakout_instruction
            },
            oi_q_key: {
                "type": "noul",
                "instructions": oi_instruction
            },
            "room_to_wall": {
                "type": "noul",
                "instructions": "Does `wall_context.nearest_opposing_wall` leave at least 1.5x the stop distance in `wall_context.stop_distance_pts`?"
            },
            "iv_crush_risk": {
                "type": "noul",
                "instructions": "Is `market_context.iv_percentile` and `market_context.vix_trend` unfavorable for buying options due to impending IV crush?"
            },
            "momentum_strength": {
                "type": "score",
                "instructions": "Which situation describes the current price action and momentum in `candles_5m`?",
                "criteria": [
                    "Fading momentum with decelerating volume inside prior range",
                    "Flat sideways drift testing no significant structural levels",
                    "Building momentum with directional closes toward extremes",
                    "Strong impulsive expansion with robust volume backing"
                ]
            }
        }

        # If API not configured, fail-safe veto (or pass in local simulation mode)
        if not self.is_configured():
            logger.info("Jev API key not configured; failing safe in production mode.")
            return False, "JEV_API_KEY_NOT_CONFIGURED", {"error": "API key absent"}

        raw_res = await self._call_system_one(state, questions)
        if not raw_res or "answers" not in raw_res:
            return False, "JEV_FAIL_SAFE_NO_TRADE_TIMEOUT", {"state": state}

        answers = raw_res["answers"]

        # Parse Typed Answers
        # 1. Bias Choice
        bias_ans = answers.get("bias", {})
        bias_selected = bias_ans.get("choice", "neutral")
        bias_conf = bias_ans.get("confidence", 0.0)
        expected_bias = "bullish" if side == "CE" else "bearish"

        # Gate on critical confidence
        if bias_conf < config.JEV_CONFIDENCE_CRITICAL:
            audit = {"state": state, "answers": answers, "reason": f"Bias confidence below critical floor ({bias_conf:.2f} < {config.JEV_CONFIDENCE_CRITICAL})"}
            self._log_decision("ENTRY_REJECTED", audit)
            return False, f"JEV_CONFIDENCE_BELOW_CRITICAL_FLOOR (bias {bias_conf:.2f})", audit

        if bias_selected != expected_bias:
            audit = {"state": state, "answers": answers, "reason": f"Bias mismatch ({bias_selected} != {expected_bias})"}
            self._log_decision("ENTRY_REJECTED", audit)
            return False, f"JEV_BIAS_MISMATCH_{bias_selected.upper()}", audit

        # 2. IV Crush Risk Veto (Hard probability threshold)
        iv_crush_ans = answers.get("iv_crush_risk", {})
        iv_crush_prob = iv_crush_ans.get("noul", 0.5)
        if iv_crush_prob > config.THRESHOLD_MAX_IV_CRUSH:
            audit = {"state": state, "answers": answers, "reason": f"IV crush risk too high: {iv_crush_prob:.2f}"}
            self._log_decision("ENTRY_REJECTED", audit)
            return False, "JEV_IV_CRUSH_RISK_HIGH", audit

        # 3. Noul Question Probabilities
        trending_prob = answers.get("trending", {}).get("noul", 0.0)
        breakout_prob = answers.get(breakout_q_key, {}).get("noul", 0.0)
        oi_prob = answers.get(oi_q_key, {}).get("noul", 0.0)
        room_prob = answers.get("room_to_wall", {}).get("noul", 0.0)

        # 4. Score Question (Normalized 0.0 to 1.0; 4 levels)
        momentum_ans = answers.get("momentum_strength", {})
        momentum_score_raw = momentum_ans.get("score", 0.0)
        momentum_conf = momentum_ans.get("confidence", 0.0)

        if isinstance(momentum_score_raw, (int, float)):
            momentum_normalized = min(1.0, max(0.0, float(momentum_score_raw) / 3.0))
        elif isinstance(momentum_score_raw, str):
            score_map = {
                "fading": 0.0,
                "flat": 0.33,
                "building": 0.67,
                "strong_expansion": 1.0,
                "strong": 1.0
            }
            momentum_normalized = score_map.get(momentum_score_raw.lower().replace(" ", "_"), 0.5)
        else:
            momentum_normalized = 0.5

        # Check Per-Question Thresholds
        if trending_prob < config.THRESHOLD_NOUL_TRENDING:
            return False, f"JEV_INSUFFICIENT_TRENDING_SIGNAL ({trending_prob:.2f} < {config.THRESHOLD_NOUL_TRENDING})", answers

        if breakout_prob < config.THRESHOLD_NOUL_BREAKOUT:
            return False, f"JEV_SUSPECTED_FAKEOUT ({breakout_prob:.2f} < {config.THRESHOLD_NOUL_BREAKOUT})", answers

        if oi_prob < config.THRESHOLD_NOUL_OI:
            return False, f"JEV_OI_UNFAVORABLE ({oi_prob:.2f} < {config.THRESHOLD_NOUL_OI})", answers

        if room_prob < config.THRESHOLD_NOUL_ROOM:
            return False, f"JEV_OI_WALL_TOO_CLOSE ({room_prob:.2f} < {config.THRESHOLD_NOUL_ROOM})", answers

        if momentum_conf < config.JEV_CONFIDENCE_FLOOR:
            return False, f"JEV_MOMENTUM_CONFIDENCE_LOW ({momentum_conf:.2f} < {config.JEV_CONFIDENCE_FLOOR})", answers

        # 5. Composite Scoring (Weighted sum in code, weights from config)
        composite_score = (
            (config.WEIGHT_TRENDING * trending_prob) +
            (config.WEIGHT_BREAKOUT * breakout_prob) +
            (config.WEIGHT_OI_FLOW * oi_prob) +
            (config.WEIGHT_ROOM_TO_WALL * room_prob) +
            (config.WEIGHT_MOMENTUM * momentum_normalized)
        )

        audit = {
            "timestamp": time.time(),
            "model": self.model,
            "latency_ms": raw_res.get("latency_ms", 0),
            "state": state,
            "answers": answers,
            "composite_score": round(composite_score, 3),
            "threshold": config.COMPOSITE_ENTRY_THRESHOLD
        }

        if composite_score >= config.COMPOSITE_ENTRY_THRESHOLD:
            self._log_decision("ENTRY_CONFIRMED", audit)
            return True, f"JEV_CONFIRMED (Score: {composite_score:.2f})", audit
        else:
            self._log_decision("ENTRY_REJECTED", audit)
            return False, f"JEV_COMPOSITE_BELOW_THRESHOLD ({composite_score:.2f} < {config.COMPOSITE_ENTRY_THRESHOLD})", audit

    # =========================================================================
    # REQUEST 2: POSITION MANAGEMENT (Evaluated while in trade, separate state)
    # =========================================================================
    async def evaluate_position(
        self,
        active_trade: Dict[str, Any],
        latest_candles_1m: List[Dict[str, Any]]
    ) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Request 2: Position Management (Request 1 and 2 NEVER share a call).
        Evaluates whether original trade thesis is invalidated or momentum exhausted.
        Returns: (should_exit: bool, exit_reason: str, audit: Dict)
        """
        # Separate state: strictly active trade parameters + recent candles
        state = {
            "active_trade": {
                "contract": active_trade.get("contract"),
                "side": active_trade.get("option_type"),
                "entry_price": active_trade.get("entry_price"),
                "current_price": active_trade.get("current_price"),
                "stop_loss": active_trade.get("stop_loss"),
                "target_1": active_trade.get("target_1"),
                "pnl_percentage": active_trade.get("pnl_percentage", 0.0),
                "breakeven_locked": active_trade.get("breakeven_locked", False),
                "elapsed_candles_5m": active_trade.get("elapsed_candles_5m", 0)
            },
            "latest_candles_1m": latest_candles_1m[-5:]  # Last 5 1-minute bars
        }

        questions = {
            "thesis_invalid": {
                "type": "noul",
                "instructions": "Is the long options scalping thesis invalidated by `latest_candles_1m` relative to `active_trade` structure?"
            },
            "momentum_exhausted": {
                "type": "noul",
                "instructions": "Has directional momentum exhausted with volume dry-up or opposing rejection in `latest_candles_1m`?"
            }
        }

        if not self.is_configured():
            return False, "JEV_NOT_CONFIGURED", {}

        raw_res = await self._call_system_one(state, questions)
        if not raw_res or "answers" not in raw_res:
            return False, "JEV_TIMEOUT_KEEP_POSITION", {}

        answers = raw_res["answers"]
        thesis_invalid_prob = answers.get("thesis_invalid", {}).get("noul", 0.0)
        momentum_exhausted_prob = answers.get("momentum_exhausted", {}).get("noul", 0.0)

        audit = {
            "trade_id": active_trade.get("id"),
            "state": state,
            "answers": answers,
            "thesis_invalid_prob": thesis_invalid_prob,
            "momentum_exhausted_prob": momentum_exhausted_prob
        }

        if thesis_invalid_prob >= config.THRESHOLD_THESIS_INVALID:
            self._log_decision("POSITION_FORCE_EXIT_THESIS_INVALID", audit)
            return True, f"JEV_THESIS_INVALIDATED ({thesis_invalid_prob:.2f})", audit

        if momentum_exhausted_prob >= config.THRESHOLD_MOMENTUM_EXHAUSTED:
            self._log_decision("POSITION_FORCE_EXIT_MOMENTUM_EXHAUSTED", audit)
            return True, f"JEV_MOMENTUM_EXHAUSTED ({momentum_exhausted_prob:.2f})", audit

        return False, "POSITION_HEALTHY", audit

    def _log_decision(self, outcome: str, audit_data: Dict[str, Any]):
        entry = {
            "timestamp": time.time(),
            "outcome": outcome,
            "data": audit_data
        }
        self.decision_log.append(entry)
        if len(self.decision_log) > 200:
            self.decision_log.pop(0)

    def get_recent_logs(self, limit: int = 20) -> List[Dict[str, Any]]:
        return list(reversed(self.decision_log[-limit:]))

jev_gate = JevDecisionGate()
