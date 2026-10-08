import React, { useState, useEffect } from 'react';
import { 
  Activity, ShieldAlert, TrendingUp, TrendingDown, CheckCircle2, 
  RefreshCw, AlertTriangle, Zap, Settings, X, ArrowUpRight, ArrowDownRight, Clock, ExternalLink
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
  exit_time?: string;
  exit_reason?: string;
  pnl_points?: number;
  pnl_percentage?: number;
  pnl_rupees?: number;
  statutory_charges?: { total_friction: number; brokerage?: number; stt?: number; gst?: number };
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
  const [brokerInfo, setBrokerInfo] = useState<{ is_live: boolean; has_token: boolean; last_error?: string }>({
    is_live: false,
    has_token: false
  });
  const [selectedIndex, setSelectedIndex] = useState<string>('NIFTY');
  const [istTime, setIstTime] = useState<string>('');
  
  // Upstox Token Modal
  const [showTokenModal, setShowTokenModal] = useState<boolean>(false);
  const [upstoxTokenInput, setUpstoxTokenInput] = useState<string>('');
  const [tokenStatusMsg, setTokenStatusMsg] = useState<string>('');

  // IST Clock
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setIstTime(now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // WebSocket Connection
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
            if (data.trade_history) setTradeHistory(data.trade_history);
            if (data.summary) setSummary(data.summary);
            if (data.broker) setBrokerInfo(data.broker);
          } catch (e) {
            console.error('WS parse error', e);
          }
        };
      } catch (err) {
        console.warn('WS Init failed, retrying...', err);
      }
    };
    connect();

    return () => {
      if (ws) ws.close();
    };
  }, []);

  const handleSaveToken = async () => {
    if (!upstoxTokenInput.trim()) return;
    setTokenStatusMsg('Connecting to Upstox API...');
    try {
      const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8000' : 'https://api.jevcall.cfd';
      const res = await fetch(`${baseUrl}/api/broker/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: upstoxTokenInput.trim() })
      });
      const data = await res.json();
      if (data.connected) {
        setTokenStatusMsg('✓ Connected to Upstox Live Market Feed!');
        setTimeout(() => setShowTokenModal(false), 1500);
      } else {
        setTokenStatusMsg(`Connection Failed: ${data.reason || 'Invalid Token'}`);
      }
    } catch (e) {
      setTokenStatusMsg(`Error connecting to backend: ${e}`);
    }
  };

  const activeTrade = activeTrades.find((t) => t.symbol === selectedIndex) || activeTrades[0];
  const snap = snapshots[selectedIndex] || { spot: 24850, cpr: {}, supertrend: { signal: 'NEUTRAL', level: 0 }, vwap: 24830, regime: 'NEUTRAL' };
  const lossBudgetPct = Math.min(100, Math.max(0, (Math.abs(summary.daily_realized_loss) / 2500.0) * 100));

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', padding: '24px 32px', maxWidth: '1480px', margin: '0 auto' }}>
      
      {/* Header Bar */}
      <header className="card-surface" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={22} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.4px' }}>JevCalls Core</h1>
              <span style={{ fontSize: '11px', background: 'var(--indigo-bg)', color: 'var(--indigo)', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                HFT SCALPER v2
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px' }}>
              Sub-Second 0DTE Options Scalping Engine & Live Simulator
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          
          {/* WebSocket Ping */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '8px', background: connected ? 'var(--green-bg)' : 'var(--red-bg)', border: `1px solid ${connected ? 'var(--green-border)' : 'var(--red-border)'}` }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: connected ? 'var(--green)' : 'var(--red)' }}></div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: connected ? 'var(--green)' : 'var(--red)' }}>
              {connected ? 'LIVE STREAM' : 'OFFLINE'}
            </span>
          </div>

          {/* Upstox Status & Config */}
          <button 
            onClick={() => setShowTokenModal(true)}
            className="btn-secondary"
            style={{ 
              borderColor: brokerInfo.is_live ? 'var(--green-border)' : 'var(--border-color)',
              backgroundColor: brokerInfo.is_live ? 'var(--green-bg)' : 'var(--bg-surface)'
            }}
          >
            <Activity size={15} color={brokerInfo.is_live ? 'var(--green)' : 'var(--indigo)'} />
            <span style={{ color: brokerInfo.is_live ? 'var(--green)' : 'var(--text-main)' }}>
              {brokerInfo.is_live ? 'Upstox Connected' : 'Simulator Mode'}
            </span>
            <Settings size={14} color="var(--text-muted)" style={{ marginLeft: '4px' }} />
          </button>

          {/* Clock */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-main)', background: 'var(--bg-subtle)', padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', fontWeight: 600 }}>
            <Clock size={14} color="var(--text-muted)" />
            <span>IST {istTime || '09:15:00'}</span>
          </div>
        </div>
      </header>

      {/* Index Selector Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {INDICES.map((idx) => {
          const s = snapshots[idx];
          const isSelected = selectedIndex === idx;
          const isBuy = s?.supertrend?.signal === 'BUY';
          const isSell = s?.supertrend?.signal === 'SELL';
          return (
            <div
              key={idx}
              onClick={() => setSelectedIndex(idx)}
              className="card-surface"
              style={{
                padding: '14px 16px',
                cursor: 'pointer',
                border: isSelected ? '2px solid var(--indigo)' : '1px solid var(--border-color)',
                backgroundColor: isSelected ? '#ffffff' : 'var(--bg-card)',
                boxShadow: isSelected ? '0 4px 12px rgba(79, 70, 229, 0.08)' : '0 1px 3px rgba(15, 23, 42, 0.04)',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: isSelected ? 'var(--indigo)' : 'var(--text-main)' }}>{idx}</span>
                <span style={{ 
                  fontSize: '11px', 
                  fontWeight: 700, 
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: isBuy ? 'var(--green-bg)' : (isSell ? 'var(--red-bg)' : 'var(--bg-subtle)'),
                  color: isBuy ? 'var(--green)' : (isSell ? 'var(--red)' : 'var(--text-muted)')
                }}>
                  {s?.supertrend?.signal || 'NEUTRAL'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'JetBrains Mono' }}>
                  {s?.spot ? s.spot.toFixed(1) : '---'}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>VWAP {s?.vwap ? s.vwap.toFixed(0) : '---'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid: Active Scalp Execution + Risk Budget Meter */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px', marginBottom: '24px' }}>
        
        {/* Active Scalp Ladder */}
        <div className="card-surface" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={18} color="var(--indigo)" />
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>
                Active Scalp Ladder: {selectedIndex}
              </h2>
            </div>
            <span style={{ 
              fontSize: '12px', 
              fontWeight: 700,
              padding: '4px 10px', 
              borderRadius: '6px',
              backgroundColor: activeTrade ? 'var(--indigo-bg)' : 'var(--bg-subtle)',
              color: activeTrade ? 'var(--indigo)' : 'var(--text-muted)'
            }}>
              {activeTrade ? 'TRADE IN PROGRESS' : 'MARKET SCANNING'}
            </span>
          </div>

          {activeTrade ? (
            <div style={{ backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)' }}>{activeTrade.contract}</h3>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Quantity: {activeTrade.quantity} • Entry Price: ₹{activeTrade.entry_price.toFixed(2)}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ 
                    fontSize: '12px', 
                    fontWeight: 800, 
                    padding: '4px 10px', 
                    borderRadius: '6px',
                    backgroundColor: activeTrade.breakeven_locked ? 'var(--green-bg)' : 'var(--indigo-bg)',
                    color: activeTrade.breakeven_locked ? 'var(--green)' : 'var(--indigo)'
                  }}>
                    {activeTrade.breakeven_locked ? 'BREAKEVEN LOCKED (+5%)' : 'SCALP ACTIVE'}
                  </span>
                  <div style={{ fontSize: '12px', color: 'var(--green)', fontWeight: 700, marginTop: '4px' }}>
                    Peak: ₹{activeTrade.max_price_reached.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* 4 Execution Levels */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginTop: '16px' }}>
                <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--red)', fontWeight: 700, textTransform: 'uppercase' }}>Hard Stop (-8%)</span>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--red)', fontFamily: 'JetBrains Mono', marginTop: '2px' }}>
                    ₹{activeTrade.stop_loss.toFixed(2)}
                  </div>
                </div>

                <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Entry Fill</span>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'JetBrains Mono', marginTop: '2px' }}>
                    ₹{activeTrade.entry_price.toFixed(2)}
                  </div>
                </div>

                <div style={{ 
                  background: activeTrade.breakeven_locked ? 'var(--green-bg)' : '#ffffff', 
                  border: `1px solid ${activeTrade.breakeven_locked ? 'var(--green-border)' : 'var(--border-color)'}`, 
                  padding: '12px', 
                  borderRadius: '8px', 
                  textAlign: 'center' 
                }}>
                  <span style={{ fontSize: '11px', color: activeTrade.breakeven_locked ? 'var(--green)' : 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    BE Lock (+5%)
                  </span>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--green)', fontFamily: 'JetBrains Mono', marginTop: '2px' }}>
                    ₹{(activeTrade.entry_price * 1.05).toFixed(2)}
                  </div>
                </div>

                <div style={{ background: 'var(--blue-bg)', border: '1px solid #bae6fd', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--blue)', fontWeight: 700, textTransform: 'uppercase' }}>Target 1 (+8%)</span>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--blue)', fontFamily: 'JetBrains Mono', marginTop: '2px' }}>
                    ₹{activeTrade.target_1.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '48px 24px', textAlign: 'center', backgroundColor: 'var(--bg-subtle)', borderRadius: '10px', border: '1px dashed var(--border-color)' }}>
              <RefreshCw size={28} color="var(--indigo)" style={{ margin: '0 auto 10px auto', animation: 'spin 4s linear infinite' }} />
              <p style={{ fontSize: '15px', color: 'var(--text-main)', fontWeight: 700 }}>Continuous Sub-Second Scanner Running</p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Scanning order book for narrow CPR breakout above TC (₹{snap?.cpr?.tc || '---'}) with Supertrend confirmation.
              </p>
            </div>
          )}

          {/* Rule Badges */}
          <div style={{ marginTop: '18px', display: 'flex', gap: '20px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
            <span>✓ Breakeven Lock at +5%</span>
            <span>✓ Target 1 Scalp at +8%</span>
            <span>✓ Hard Cut Stop at -8%</span>
            <span>✓ Max Daily Drawdown Breaker</span>
          </div>
        </div>

        {/* Right Column: Risk & Budget Meter */}
        <div className="card-surface" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
            <ShieldAlert size={18} color="var(--amber)" />
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>Risk & Budget Meter</h2>
          </div>

          <div style={{ backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Daily Realized PnL</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: summary.daily_realized_loss >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'JetBrains Mono' }}>
                {summary.daily_realized_loss >= 0 ? `+₹${summary.daily_realized_loss.toFixed(2)}` : `-₹${Math.abs(summary.daily_realized_loss).toFixed(2)}`}
              </span>
            </div>

            {/* Daily Drawdown Progress Bar */}
            <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', margin: '10px 0' }}>
              <div style={{ 
                width: `${lossBudgetPct}%`, 
                height: '100%', 
                backgroundColor: lossBudgetPct > 80 ? 'var(--red)' : (lossBudgetPct > 40 ? 'var(--amber)' : 'var(--indigo)'),
                transition: 'width 0.3s ease' 
              }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
              <span>₹0.00</span>
              <span>Max Loss Limit: ₹2,500</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <div style={{ backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Win Rate</span>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--indigo)', fontFamily: 'JetBrains Mono', marginTop: '2px' }}>
                {summary.win_rate}%
              </div>
            </div>
            <div style={{ backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Trades Closed</span>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'JetBrains Mono', marginTop: '2px' }}>
                {summary.total_trades}
              </div>
            </div>
          </div>

          <div style={{ 
            backgroundColor: summary.circuit_breaker_active ? 'var(--red-bg)' : 'var(--green-bg)',
            border: `1px solid ${summary.circuit_breaker_active ? 'var(--red-border)' : 'var(--green-border)'}`,
            borderRadius: '8px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            {summary.circuit_breaker_active ? <AlertTriangle size={18} color="var(--red)" /> : <CheckCircle2 size={18} color="var(--green)" />}
            <span style={{ fontSize: '12px', fontWeight: 700, color: summary.circuit_breaker_active ? 'var(--red)' : 'var(--green)' }}>
              {summary.circuit_breaker_active ? 'CIRCUIT BREAKER ACTIVE' : 'RISK ENGINE CLEAR'}
            </span>
          </div>
        </div>
      </div>

      {/* PROMINENT TRADE HISTORY LOG */}
      <div className="card-surface" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-main)' }}>Trade History & Execution Log</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Real-time audit log of executed trades with statutory charges and net realized returns
            </p>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, background: 'var(--bg-subtle)', padding: '4px 10px', borderRadius: '6px' }}>
            {tradeHistory.length} Recorded Trades
          </span>
        </div>

        {tradeHistory.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '10px 12px' }}>Time</th>
                  <th style={{ padding: '10px 12px' }}>Contract</th>
                  <th style={{ padding: '10px 12px' }}>Side</th>
                  <th style={{ padding: '10px 12px' }}>Qty</th>
                  <th style={{ padding: '10px 12px' }}>Entry</th>
                  <th style={{ padding: '10px 12px' }}>Exit</th>
                  <th style={{ padding: '10px 12px' }}>Peak</th>
                  <th style={{ padding: '10px 12px' }}>Pts</th>
                  <th style={{ padding: '10px 12px' }}>Friction</th>
                  <th style={{ padding: '10px 12px' }}>Net PnL (₹)</th>
                  <th style={{ padding: '10px 12px' }}>Exit Rationale</th>
                </tr>
              </thead>
              <tbody>
                {tradeHistory.map((t, idx) => {
                  const isWin = (t.pnl_rupees || 0) > 0;
                  const isBe = t.exit_reason === 'BREAKEVEN_STOP_HIT';
                  return (
                    <tr key={t.id || idx} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }}>
                      <td style={{ padding: '12px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', fontSize: '12px' }}>
                        {t.exit_time ? new Date(t.exit_time).toLocaleTimeString('en-IN', { hour12: false }) : '---'}
                      </td>
                      <td style={{ padding: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
                        {t.contract}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ 
                          fontSize: '11px', 
                          fontWeight: 700, 
                          padding: '2px 6px', 
                          borderRadius: '4px',
                          backgroundColor: t.option_type === 'CE' ? 'var(--green-bg)' : 'var(--red-bg)',
                          color: t.option_type === 'CE' ? 'var(--green)' : 'var(--red)'
                        }}>
                          {t.option_type === 'CE' ? 'CALL' : 'PUT'}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'JetBrains Mono' }}>{t.quantity}</td>
                      <td style={{ padding: '12px', fontFamily: 'JetBrains Mono' }}>₹{t.entry_price.toFixed(2)}</td>
                      <td style={{ padding: '12px', fontFamily: 'JetBrains Mono', fontWeight: 600 }}>₹{t.exit_price ? t.exit_price.toFixed(2) : '---'}</td>
                      <td style={{ padding: '12px', fontFamily: 'JetBrains Mono', color: 'var(--green)' }}>₹{t.max_price_reached.toFixed(2)}</td>
                      <td style={{ padding: '12px', fontFamily: 'JetBrains Mono', fontWeight: 700, color: isWin ? 'var(--green)' : 'var(--red)' }}>
                        {t.pnl_points ? (t.pnl_points > 0 ? `+${t.pnl_points.toFixed(1)}` : t.pnl_points.toFixed(1)) : '0.0'}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', fontSize: '12px' }}>
                        -₹{t.statutory_charges?.total_friction ? t.statutory_charges.total_friction.toFixed(2) : '40.00'}
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'JetBrains Mono', fontWeight: 800 }}>
                        <span style={{ 
                          padding: '3px 8px', 
                          borderRadius: '6px',
                          backgroundColor: isWin ? 'var(--green-bg)' : (isBe ? 'var(--bg-subtle)' : 'var(--red-bg)'),
                          color: isWin ? 'var(--green)' : (isBe ? 'var(--text-muted)' : 'var(--red)')
                        }}>
                          {t.pnl_rupees ? (t.pnl_rupees > 0 ? `+₹${t.pnl_rupees.toFixed(2)}` : `-₹${Math.abs(t.pnl_rupees).toFixed(2)}`) : '₹0.00'}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ 
                          fontSize: '11px', 
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: isWin ? 'var(--blue-bg)' : (isBe ? 'var(--green-bg)' : 'var(--red-bg)'),
                          color: isWin ? 'var(--blue)' : (isBe ? 'var(--green)' : 'var(--red)')
                        }}>
                          {t.exit_reason || 'COMPLETED'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '36px 16px', background: 'var(--bg-subtle)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
            <Activity size={24} color="var(--text-muted)" style={{ margin: '0 auto 8px auto' }} />
            <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>No Completed Trades In Current Session</p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Closed trades will appear here with points, brokerage, STT friction, and net rupee PnL.
            </p>
          </div>
        )}
      </div>

      {/* Upstox Token Configuration Modal */}
      {showTokenModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card-surface" style={{ width: '100%', maxWidth: '480px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={18} color="var(--indigo)" />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' }}>Configure Upstox Broker Feed</h3>
              </div>
              <button onClick={() => setShowTokenModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
              SEBI regulations require daily Upstox authentication. Paste your fresh daily access token below to switch from simulation mode to live NSE/BSE ticks.
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                Daily Access Token
              </label>
              <textarea
                value={upstoxTokenInput}
                onChange={(e) => setUpstoxTokenInput(e.target.value)}
                placeholder="Paste Upstox access token here..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-subtle)',
                  fontFamily: 'JetBrains Mono',
                  fontSize: '12px',
                  outline: 'none',
                  resize: 'none'
                }}
              />
            </div>

            {tokenStatusMsg && (
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '14px', color: tokenStatusMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>
                {tokenStatusMsg}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowTokenModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleSaveToken} className="btn-primary">
                Save & Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
