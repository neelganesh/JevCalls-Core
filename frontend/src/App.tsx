import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, ShieldAlert, TrendingUp, TrendingDown, CheckCircle2, 
  Lock, RefreshCw, AlertTriangle, Zap, User, LogIn, ChevronRight
} from 'lucide-react';

interface Snapshot {
  symbol: string;
  spot: number;
  cpr: { tc?: number; bc?: number; is_narrow?: boolean };
  supertrend: { level: number; signal: string };
  vwap: number;
  regime: string;
}

interface Trade {
  id: number;
  symbol: string;
  contract: string;
  option_type: string;
  strike: number;
  entry_price: number;
  quantity: number;
  stop_loss: number;
  target_1: number;
  max_price_reached: number;
  breakeven_locked: boolean;
  status: string;
  active: boolean;
  entry_time: string;
  exit_price?: number;
  exit_reason?: string;
  pnl_points?: number;
  pnl_percentage?: number;
  pnl_rupees?: number;
  statutory_charges?: { total_friction: number };
}

interface Summary {
  total_trades: number;
  wins: number;
  losses: number;
  breakevens: number;
  win_rate: number;
  total_net_pnl_inr: number;
  active_trades: number;
  wallet_balance_inr: number;
  daily_realized_loss: number;
  circuit_breaker_active: boolean;
}

const INDICES = ['NIFTY', 'BANKNIFTY', 'SENSEX', 'FINNIFTY', 'MIDCPNIFTY'];

export const App: React.FC = () => {
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [activeTrades, setActiveTrades] = useState<Trade[]>([]);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total_trades: 0,
    wins: 0,
    losses: 0,
    breakevens: 0,
    win_rate: 0,
    total_net_pnl_inr: 0,
    active_trades: 0,
    wallet_balance_inr: 100000,
    daily_realized_loss: 0,
    circuit_breaker_active: false
  });
  const [connected, setConnected] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<string>('NIFTY');
  const [istTime, setIstTime] = useState<string>('');
  const [testUser, setTestUser] = useState<string | null>('tester@indiantradingtools.com (Authorized)');

  // Live IST Clock
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setIstTime(now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // WebSocket Connection to Backend
  useEffect(() => {
    const wsUrl = window.location.hostname === 'localhost' 
      ? 'ws://localhost:8000/ws/live' 
      : 'wss://api.jevcall.cfd/ws/live';

    let ws: WebSocket;
    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => setConnected(true);
        ws.onclose = () => {
          setConnected(false);
          setTimeout(connect, 2000);
        };
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.snapshots) setSnapshots(data.snapshots);
            if (data.active_trades) setActiveTrades(data.active_trades);
            if (data.summary) setSummary(data.summary);
          } catch (e) {
            console.error('WS Parse error', e);
          }
        };
      } catch (err) {
        console.warn('WS Init failed, will retry', err);
      }
    };
    connect();

    return () => {
      if (ws) ws.close();
    };
  }, []);

  const activeTrade = activeTrades.find((t) => t.symbol === selectedIndex) || activeTrades[0];
  const snap = snapshots[selectedIndex] || { spot: 24850, cpr: {}, supertrend: { signal: 'NEUTRAL', level: 0 }, vwap: 24830, regime: 'NEUTRAL' };

  // Calculate Daily Budget Loss Percentage (Max Rs 2,500)
  const lossBudgetPct = Math.min(100, Math.max(0, (Math.abs(summary.daily_realized_loss) / 2500.0) * 100));

  return (
    <div style={{ minHeight: '100vh', padding: '16px 24px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Top Header */}
      <header className="glass-panel" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'linear-gradient(135deg, #6366f1, #38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={20} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px' }}>JevCalls <span style={{ color: '#38bdf8' }}>Core</span></h1>
              <span style={{ fontSize: '10px', background: '#1e293b', color: '#38bdf8', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>HFT SCALPER v2</span>
            </div>
            <p style={{ fontSize: '11px', color: '#64748b' }}>Empirical 0DTE Index Options Scalping Engine</p>
          </div>
        </div>

        {/* Status Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', background: '#0f172a', padding: '6px 12px', borderRadius: '6px', border: '1px solid #1e293b' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: connected ? '#10b981' : '#f43f5e' }}></div>
            <span style={{ color: connected ? '#10b981' : '#f43f5e', fontWeight: 600 }}>{connected ? 'SUB-SECOND STREAM' : 'RECONNECTING'}</span>
          </div>

          <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#94a3b8', background: '#0f172a', padding: '6px 12px', borderRadius: '6px', border: '1px solid #1e293b' }}>
            IST: <strong style={{ color: '#f1f5f9' }}>{istTime || '09:15:00'}</strong>
          </div>

          {/* Test User Badge / Sign In */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)', padding: '6px 12px', borderRadius: '6px' }}>
            <User size={14} color="#818cf8" />
            <span style={{ color: '#c7d2fe', fontWeight: 500 }}>{testUser}</span>
          </div>
        </div>
      </header>

      {/* Index Selector Bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        {INDICES.map((idx) => {
          const s = snapshots[idx];
          const isSelected = selectedIndex === idx;
          return (
            <button
              key={idx}
              onClick={() => setSelectedIndex(idx)}
              className="glass-panel"
              style={{
                flex: '1',
                minWidth: '180px',
                padding: '12px 14px',
                cursor: 'pointer',
                border: isSelected ? '1px solid #38bdf8' : '1px solid #1e293b',
                background: isSelected ? 'rgba(56, 189, 248, 0.08)' : 'rgba(15, 19, 28, 0.6)',
                textAlign: 'left',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? '#38bdf8' : '#e2e8f0' }}>{idx}</span>
                <span style={{ fontSize: '10px', color: s?.supertrend?.signal === 'BUY' ? '#10b981' : (s?.supertrend?.signal === 'SELL' ? '#f43f5e' : '#94a3b8'), fontWeight: 600 }}>
                  {s?.supertrend?.signal || 'ST NEUTRAL'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'monospace' }}>
                  {s?.spot?.toFixed(1) || '---'}
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>VWAP: {s?.vwap?.toFixed(0) || '---'}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Grid: Risk Dashboard + Active Scalp Execution */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '16px', marginBottom: '16px' }}>
        
        {/* Left Column: Active Trade Card & Execution Ladder */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={18} color="#38bdf8" />
              <h2 style={{ fontSize: '15px', fontWeight: 700 }}>Real-Time Scalping Ladder: {selectedIndex}</h2>
            </div>
            <span style={{ fontSize: '12px', background: '#1e293b', color: '#94a3b8', padding: '4px 8px', borderRadius: '4px' }}>
              {activeTrade ? 'TRADE IN PROGRESS' : 'SCANNING TICKS FOR BREAKOUT'}
            </span>
          </div>

          {activeTrade ? (
            <div style={{ background: '#0a0d14', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9' }}>{activeTrade.contract}</h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Qty: {activeTrade.quantity} • Entry: ₹{activeTrade.entry_price.toFixed(2)}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: activeTrade.breakeven_locked ? '#10b981' : '#38bdf8' }}>
                    {activeTrade.breakeven_locked ? 'BREAKEVEN LOCKED' : 'TRAILED'}
                  </div>
                  <span style={{ fontSize: '11px', color: '#10b981' }}>Peak: ₹{activeTrade.max_price_reached.toFixed(2)}</span>
                </div>
              </div>

              {/* Empirical Execution Levels Meter */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '16px' }}>
                <div style={{ background: '#1e1b4b', border: '1px solid #4338ca', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', color: '#a5b4fc', textTransform: 'uppercase' }}>Hard Stop (-8%)</span>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#f43f5e' }}>₹{activeTrade.stop_loss.toFixed(2)}</div>
                </div>
                <div style={{ background: '#0f172a', border: '1px solid #334155', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Entry Fill</span>
                  <div style={{ fontSize: '14px', fontWeight: 800 }}>₹{activeTrade.entry_price.toFixed(2)}</div>
                </div>
                <div style={{ background: activeTrade.breakeven_locked ? 'rgba(16, 185, 129, 0.15)' : '#0f172a', border: activeTrade.breakeven_locked ? '1px solid #10b981' : '1px solid #334155', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', color: activeTrade.breakeven_locked ? '#10b981' : '#94a3b8', textTransform: 'uppercase' }}>BE Lock (+5%)</span>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#10b981' }}>₹{(activeTrade.entry_price * 1.05).toFixed(2)}</div>
                </div>
                <div style={{ background: 'rgba(56, 189, 248, 0.15)', border: '1px solid #38bdf8', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', color: '#38bdf8', textTransform: 'uppercase' }}>Target 1 (+8%)</span>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#38bdf8' }}>₹{activeTrade.target_1.toFixed(2)}</div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '36px 20px', textAlign: 'center', background: '#0a0d14', borderRadius: '8px', border: '1px dashed #1e293b' }}>
              <RefreshCw size={24} color="#64748b" style={{ margin: '0 auto 8px auto', animation: 'spin 4s linear infinite' }} />
              <p style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600 }}>Active Market Scanner Running</p>
              <p style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
                Waiting for CPR narrow expansion breakout above TC (₹{snap?.cpr?.tc || '---'}) with Supertrend confirmation.
              </p>
            </div>
          )}

          {/* Setup Rules Summary */}
          <div style={{ marginTop: '16px', display: 'flex', gap: '16px', fontSize: '11px', color: '#64748b' }}>
            <span>✓ Auto Breakeven at +5%</span>
            <span>✓ Target 1 Scalp at +8%</span>
            <span>✓ Statutory Fee Deduction Modeling</span>
            <span>✓ Max Daily Loss Circuit Breaker</span>
          </div>
        </div>

        {/* Right Column: Risk & Money Management Meter */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <ShieldAlert size={18} color="#f59e0b" />
            <h2 style={{ fontSize: '15px', fontWeight: 700 }}>Risk & Budget Meter</h2>
          </div>

          <div style={{ background: '#0a0d14', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', color: '#64748b' }}>Daily Realized PnL</span>
              <span style={{ fontSize: '14px', fontWeight: 800, color: summary.daily_realized_loss >= 0 ? '#10b981' : '#f43f5e' }}>
                ₹{summary.daily_realized_loss.toFixed(2)}
              </span>
            </div>
            
            {/* Daily Drawdown Bar */}
            <div style={{ height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden', margin: '8px 0' }}>
              <div style={{ width: `${lossBudgetPct}%`, height: '100%', background: lossBudgetPct > 80 ? '#f43f5e' : '#f59e0b', transition: 'width 0.3s ease' }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#475569' }}>
              <span>₹0</span>
              <span>Max Loss Limit: ₹2,500</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            <div style={{ background: '#0a0d14', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px' }}>
              <span style={{ fontSize: '10px', color: '#64748b' }}>Win Rate</span>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#38bdf8' }}>{summary.win_rate}%</div>
            </div>
            <div style={{ background: '#0a0d14', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px' }}>
              <span style={{ fontSize: '10px', color: '#64748b' }}>Trades Closed</span>
              <div style={{ fontSize: '16px', fontWeight: 800 }}>{summary.total_trades}</div>
            </div>
          </div>

          <div style={{ background: summary.circuit_breaker_active ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.1)', border: summary.circuit_breaker_active ? '1px solid #f43f5e' : '1px solid #10b981', borderRadius: '6px', padding: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {summary.circuit_breaker_active ? <AlertTriangle size={16} color="#f43f5e" /> : <CheckCircle2 size={16} color="#10b981" />}
            <span style={{ fontSize: '11px', color: summary.circuit_breaker_active ? '#f43f5e' : '#10b981', fontWeight: 600 }}>
              {summary.circuit_breaker_active ? 'CIRCUIT BREAKER ACTIVE' : 'RISK ENGINE CLEAR'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
