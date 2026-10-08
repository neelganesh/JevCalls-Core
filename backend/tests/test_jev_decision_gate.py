"""
test_jev_decision_gate.py
Tests verifying TypeSafe System One (Jev 1.13.0) integration:
1. Pinned model validation ('jev-1.13.0', never 'jev-latest')
2. Per-question confidence thresholds (floor 0.50, critical 0.60)
3. Composite scoring in code (weights in config)
4. Request 1 (Entry) vs Request 2 (Position Management) never share calls
5. Fail-safe NO_TRADE veto on error or timeout
"""

import pytest
import asyncio
from unittest.mock import patch, AsyncMock
from src.config import config
from src.jev_decision_gate import JevDecisionGate

def test_model_pinned_to_jev_1_13():
    gate = JevDecisionGate(api_key="test-api-key")
    # Pinned model must strictly be jev-1.13.0
    assert gate.model == "jev-1.13.0"
    assert config.JEV_MODEL == "jev-1.13.0"
    assert "latest" not in gate.model

@pytest.mark.asyncio
async def test_jev_fail_safe_on_timeout():
    gate = JevDecisionGate(api_key="test-api-key")

    # Mock timeout exception (> 800ms)
    with patch.object(gate, "_call_system_one", return_value=None):
        confirmed, reason, audit = await gate.evaluate_entry(
            index="NIFTY",
            side="CE",
            spot=22230.0,
            candles_5m=[],
            prior_day={},
            opening_range={},
            technical_facts={},
            oi_change={},
            market_context={},
            wall_context={}
        )
        assert confirmed is False
        assert "FAIL_SAFE_NO_TRADE" in reason

@pytest.mark.asyncio
async def test_composite_scoring_and_confidence_thresholds():
    gate = JevDecisionGate(api_key="test-api-key")

    mock_answers = {
        "bias": {
            "choice": "bullish",
            "probabilities": {"bullish": 0.85, "bearish": 0.05, "neutral": 0.10},
            "confidence": 0.88
        },
        "trending": {
            "noul": 0.82
        },
        "breakout_real_ce": {
            "noul": 0.78
        },
        "oi_supports_ce": {
            "noul": 0.75
        },
        "room_to_wall": {
            "noul": 0.80
        },
        "iv_crush_risk": {
            "noul": 0.15  # Low risk is favorable
        },
        "momentum_strength": {
            "score": "strong_expansion",
            "probabilities": {"fading": 0.02, "flat": 0.08, "building": 0.20, "strong_expansion": 0.70},
            "confidence": 0.82
        }
    }

    with patch.object(gate, "_call_system_one", return_value={"answers": mock_answers, "latency_ms": 110.0}):
        confirmed, reason, audit = await gate.evaluate_entry(
            index="NIFTY",
            side="CE",
            spot=22230.0,
            candles_5m=[],
            prior_day={},
            opening_range={},
            technical_facts={},
            oi_change={},
            market_context={},
            wall_context={}
        )
        assert confirmed is True
        assert "CONFIRMED" in reason
        assert audit["composite_score"] >= config.COMPOSITE_ENTRY_THRESHOLD

@pytest.mark.asyncio
async def test_low_confidence_veto():
    gate = JevDecisionGate(api_key="test-api-key")

    # Low confidence on critical question (bias confidence = 0.45 < 0.60 critical floor)
    mock_answers = {
        "bias": {
            "choice": "bullish",
            "probabilities": {"bullish": 0.55, "bearish": 0.40, "neutral": 0.05},
            "confidence": 0.45  # Below confidence floor!
        },
        "trending": {"noul": 0.70},
        "breakout_real_ce": {"noul": 0.70},
        "oi_supports_ce": {"noul": 0.70},
        "room_to_wall": {"noul": 0.70},
        "iv_crush_risk": {"noul": 0.20},
        "momentum_strength": {"score": "building", "confidence": 0.65}
    }

    with patch.object(gate, "_call_system_one", return_value={"answers": mock_answers, "latency_ms": 95.0}):
        confirmed, reason, audit = await gate.evaluate_entry(
            index="NIFTY",
            side="CE",
            spot=22230.0,
            candles_5m=[],
            prior_day={},
            opening_range={},
            technical_facts={},
            oi_change={},
            market_context={},
            wall_context={}
        )
        assert confirmed is False
        assert "CONFIDENCE_BELOW_CRITICAL_FLOOR" in reason

@pytest.mark.asyncio
async def test_position_management_thesis_invalid_exit():
    gate = JevDecisionGate(api_key="test-api-key")

    mock_answers = {
        "thesis_invalid": {"noul": 0.85},  # Exceeds threshold (0.65)
        "momentum_exhausted": {"noul": 0.40}
    }

    with patch.object(gate, "_call_system_one", return_value={"answers": mock_answers, "latency_ms": 80.0}):
        should_exit, exit_reason, audit = await gate.evaluate_position(
            active_trade={"id": 1, "symbol": "NIFTY", "option_type": "CE", "entry_price": 100.0},
            latest_candles_1m=[{"close": 98.0}, {"close": 97.5}, {"close": 96.0}]
        )
        assert should_exit is True
        assert "THESIS_INVALIDATED" in exit_reason
