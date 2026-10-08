"""
app.py
FastAPI High-Frequency WebSocket & REST Gateway for JevCalls-Core.
Streams real-time market snapshots, active scalp trades, and risk meter telemetry.
"""

import asyncio
import logging
from typing import Dict, Any, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.config import config, INDEX_CONFIG
from src.engine import JevCoreEngine
from src.market_feed import market_feed

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("app")

app = FastAPI(title="JevCalls-Core", description="High-Frequency Quantitative Options Scalping Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = JevCoreEngine()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        for conn in list(self.active_connections):
            try:
                await conn.send_json(message)
            except Exception:
                self.disconnect(conn)

manager = ConnectionManager()

# Background live market tick loop
sim_running = True

async def live_market_loop():
    logger.info("Initializing live market loop with Upstox / Simulation routing...")
    import random
    
    spots = {"NIFTY": 24850.0, "BANKNIFTY": 52100.0, "SENSEX": 81400.0, "FINNIFTY": 23900.0, "MIDCPNIFTY": 12800.0}
    prems = {"NIFTY": 145.0, "BANKNIFTY": 320.0, "SENSEX": 450.0, "FINNIFTY": 130.0, "MIDCPNIFTY": 85.0}

    while sim_running:
        try:
            # 1. Check if live Upstox feed is active
            live_quotes = await market_feed.get_multi_quotes() if market_feed.token else {}

            for sym in INDEX_CONFIG.keys():
                if live_quotes.get(sym):
                    spots[sym] = live_quotes[sym]
                else:
                    delta = random.uniform(-2.5, 3.0)
                    spots[sym] = round(spots.get(sym, 20000.0) + delta, 2)

                prem_delta = random.uniform(-1.5, 1.8)
                prems[sym] = round(max(15.0, prems.get(sym, 100.0) + prem_delta), 2)

                # Process tick
                engine.ingest_tick(sym, spots[sym], prems[sym])

                # Synthetic setup trigger for simulation testing
                if random.random() < 0.04 and not engine.simulator.active_trades:
                    candles = [
                        {"high": spots[sym] + 30, "low": spots[sym] - 25, "close": spots[sym] - 5, "volume": 1000},
                        {"high": spots[sym] + 40, "low": spots[sym] - 20, "close": spots[sym] + 15, "volume": 1200},
                    ]
                    engine.evaluate_setup(sym, spots[sym], candles, prems[sym], prems[sym])

            # Broadcast real-time telemetry including Trade History Log
            telemetry = {
                "type": "TICK_UPDATE",
                "snapshots": engine.market_snapshots,
                "active_trades": engine.simulator.active_trades,
                "trade_history": list(reversed(engine.simulator.trade_history[-20:])),
                "summary": engine.simulator.get_simulation_summary(),
                "broker": {
                    "is_live": market_feed.is_connected,
                    "has_token": bool(market_feed.token),
                    "last_error": market_feed.last_error
                }
            }
            await manager.broadcast(telemetry)

        except Exception as e:
            logger.error(f"Error in market loop: {e}")

        await asyncio.sleep(0.5)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(live_market_loop())

@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        await websocket.send_json({
            "type": "INIT_STATE",
            "snapshots": engine.market_snapshots,
            "active_trades": engine.simulator.active_trades,
            "trade_history": list(reversed(engine.simulator.trade_history[-20:])),
            "summary": engine.simulator.get_simulation_summary(),
            "broker": {
                "is_live": market_feed.is_connected,
                "has_token": bool(market_feed.token),
                "last_error": market_feed.last_error
            }
        })
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

class TokenRequest(BaseModel):
    token: str

@app.post("/api/broker/token")
async def update_broker_token(req: TokenRequest):
    market_feed.set_token(req.token)
    res = await market_feed.test_connection()
    return res

@app.get("/api/broker/status")
async def get_broker_status():
    res = await market_feed.test_connection()
    return {
        "is_connected": market_feed.is_connected,
        "has_token": bool(market_feed.token),
        "details": res
    }

@app.get("/api/status")
async def get_status():
    can_trade, reason = engine.risk_manager.check_kill_switches()
    return {
        "status": "ONLINE",
        "market_open": engine.simulator.is_within_market_window(),
        "can_trade": can_trade,
        "risk_reason": reason,
        "daily_realized_pnl": engine.risk_manager.daily_realized_pnl_inr,
        "consecutive_losses": engine.risk_manager.consecutive_losses,
        "active_connections": len(manager.active_connections)
    }

@app.get("/api/trades/active")
async def get_active_trades():
    return {"active_trades": engine.simulator.active_trades}

@app.get("/api/trades/history")
async def get_trade_history():
    return {"history": list(reversed(engine.simulator.trade_history))}

@app.get("/api/performance")
async def get_performance():
    return engine.simulator.get_simulation_summary()
