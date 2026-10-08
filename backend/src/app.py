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

# Background live simulation loop
sim_running = True

async def live_market_loop():
    logger.info("Initializing live market loop...")
    import random
    
    # Base prices
    spots = {"NIFTY": 24850.0, "BANKNIFTY": 52100.0, "SENSEX": 81400.0, "FINNIFTY": 23900.0, "MIDCPNIFTY": 12800.0}
    prems = {"NIFTY": 145.0, "BANKNIFTY": 320.0, "SENSEX": 450.0, "FINNIFTY": 130.0, "MIDCPNIFTY": 85.0}

    while sim_running:
        try:
            # Simulate micro-ticks across indices
            for sym in INDEX_CONFIG.keys():
                delta = random.uniform(-2.5, 3.0)
                spots[sym] = round(spots.get(sym, 20000.0) + delta, 2)
                prem_delta = round(delta * 0.52 + random.uniform(-0.4, 0.4), 2)
                prems[sym] = round(max(15.0, prems.get(sym, 100.0) + prem_delta), 2)

                # Process tick through engine & simulator
                result = engine.ingest_tick(sym, spots[sym], prems[sym])

                # Check for synthetic setup triggering
                if random.random() < 0.05 and not engine.simulator.active_trades:
                    candles = [
                        {"high": spots[sym] + 30, "low": spots[sym] - 25, "close": spots[sym] - 5, "volume": 1000},
                        {"high": spots[sym] + 40, "low": spots[sym] - 20, "close": spots[sym] + 15, "volume": 1200},
                    ]
                    engine.evaluate_setup(sym, spots[sym], candles, prems[sym], prems[sym])

            # Broadcast real-time telemetry every 500ms
            telemetry = {
                "type": "TICK_UPDATE",
                "snapshots": engine.market_snapshots,
                "active_trades": engine.simulator.active_trades,
                "summary": engine.simulator.get_simulation_summary(),
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
        # Send immediate initial state
        await websocket.send_json({
            "type": "INIT_STATE",
            "snapshots": engine.market_snapshots,
            "active_trades": engine.simulator.active_trades,
            "summary": engine.simulator.get_simulation_summary(),
        })
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

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
