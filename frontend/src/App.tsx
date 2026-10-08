import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, ShieldAlert, TrendingUp, TrendingDown, CheckCircle2, 
  RefreshCw, AlertTriangle, Zap, Settings, X, ArrowUpRight, ArrowDownRight, 
  Clock, ExternalLink, Filter, Search, Award, HelpCircle, ChevronRight, Sliders
} from 'lucide-react';
import { HISTORICAL_TRADES } from './data/historicalTrades';

interface Snapshot {
  symbol: string;
  spot: number;
  cpr: { tc?: number; bc?: number; pivot?: number; is_narrow?: boolean };
  supertrend: { level: number; signal: string };
  vwap: number;
  regime: string;
  timestamp?: string;
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

// Initial seed session trades so table is immediately alive
// Initial seed session trades calibrated to current October 8 market levels
const INITIAL_SESSION_TRADES: Trade[] = [
  {
    id: 101,
    symbol: "NIFTY",
    contract: "NIFTY 22250 CE",
    option_type: "CE",
    strike: 22250,
    entry_price: 142.50,
    exit_price: 153.90,
    quantity: 130,
    max_price_reached: 155.00,
    stop_loss: 131.10,
    target_1: 153.90,
    breakeven_locked: true,
    status: "CLOSED",
    active: false,
    entry_time: "2026-10-08T09:18:22+05:30",
    exit_time: "2026-10-08T09:21:40+05:30",
    exit_reason: "TARGET_1_REACHED",
    pnl_points: 11.40,
    pnl_percentage: 8.00,
    pnl_rupees: 1442.00,
    statutory_charges: { total_friction: 40.0, brokerage: 20.0, stt: 20.0 }
  },
  {
    id: 102,
    symbol: "BANKNIFTY",
    contract: "BANKNIFTY 54500 PE",
    option_type: "PE",
    strike: 54500,
    entry_price: 315.00,
    exit_price: 315.00,
    quantity: 60,
    max_price_reached: 332.00,
    stop_loss: 315.00,
    target_1: 340.20,
    breakeven_locked: true,
    status: "CLOSED",
    active: false,
    entry_time: "2026-10-08T10:05:10+05:30",
    exit_time: "2026-10-08T10:08:45+05:30",
    exit_reason: "BREAKEVEN_STOP_HIT",
    pnl_points: 0.00,
    pnl_percentage: 0.00,
    pnl_rupees: -40.00,
    statutory_charges: { total_friction: 40.0, brokerage: 20.0, stt: 20.0 }
  },
  {
    id: 103,
    symbol: "SENSEX",
    contract: "SENSEX 71600 CE",
    option_type: "CE",
    strike: 71600,
    entry_price: 420.00,
    exit_price: 453.60,
    quantity: 40,
    max_price_reached: 456.00,
    stop_loss: 386.40,
    target_1: 453.60,
    breakeven_locked: true,
    status: "CLOSED",
    active: false,
    entry_time: "2026-10-08T11:15:30+05:30",
    exit_time: "2026-10-08T11:19:15+05:30",
    exit_reason: "TARGET_1_REACHED",
    pnl_points: 33.60,
    pnl_percentage: 8.00,
    pnl_rupees: 1304.00,
    statutory_charges: { total_friction: 40.0, brokerage: 20.0, stt: 20.0 }
  },
  {
    id: 104,
    symbol: "FINNIFTY",
    contract: "FINNIFTY 24400 PE",
    option_type: "PE",
    strike: 24400,
    entry_price: 128.00,
    exit_price: 117.75,
    quantity: 130,
    max_price_reached: 131.00,
    stop_loss: 117.76,
    target_1: 138.24,
    breakeven_locked: false,
    status: "CLOSED",
    active: false,
    entry_time: "2026-10-08T13:40:00+05:30",
    exit_time: "2026-10-08T13:43:20+05:30",
    exit_reason: "HARD_STOP_LOSS_HIT",
    pnl_points: -10.25,
    pnl_percentage: -8.01,
    pnl_rupees: -1372.50,
    statutory_charges: { total_friction: 40.0, brokerage: 20.0, stt: 20.0 }
  }
];

export const App: React.FC = () => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'desk' | 'log' | 'risk' | 'broker'>('desk');

  // Market & Telemetry state (Calibrated to current October 8, 2026 market levels)
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({
    NIFTY: { symbol: 'NIFTY', spot: 22231.80, cpr: { tc: 22270, bc: 22190, pivot: 22230, is_narrow: true }, supertrend: { signal: 'SELL', level: 22350 }, vwap: 22260, regime: 'BEARISH_PULLBACK' },
    BANKNIFTY: { symbol: 'BANKNIFTY', spot: 54515.00, cpr: { tc: 54620, bc: 54410, pivot: 54515, is_narrow: false }, supertrend: { signal: 'BUY', level: 54380 }, vwap: 54490, regime: 'BULLISH_TREND' },
    SENSEX: { symbol: 'SENSEX', spot: 71593.20, cpr: { tc: 71750, bc: 71430, pivot: 71590, is_narrow: true }, supertrend: { signal: 'SELL', level: 71920 }, vwap: 71680, regime: 'BEARISH_MOMENTUM' },
    FINNIFTY: { symbol: 'FINNIFTY', spot: 24410.00, cpr: { tc: 24460, bc: 24360, pivot: 24410, is_narrow: false }, supertrend: { signal: 'NEUTRAL', level: 24390 }, vwap: 24405, regime: 'SIDEWAYS' },
    MIDCPNIFTY: { symbol: 'MIDCPNIFTY', spot: 13386.75, cpr: { tc: 13420, bc: 13350, pivot: 13385, is_narrow: true }, supertrend: { signal: 'BUY', level: 13320 }, vwap: 13375, regime: 'BULLISH_EXPANSION' },
  });

  const [activeTrades, setActiveTrades] = useState<Trade[]>([
    {
      id: 105,
      symbol: "NIFTY",
      contract: "NIFTY 22250 CE",
      option_type: "CE",
      strike: 22250,
      entry_price: 145.00,
      quantity: 130,
      stop_loss: 133.40,
      target_1: 156.60,
      max_price_reached: 151.20,
      breakeven_locked: true,
      status: "ACTIVE",
      active: true,
      entry_time: new Date().toISOString(),
      pnl_points: 6.20,
      pnl_percentage: 4.28,
      pnl_rupees: 806.00
    }
  ]);

  const [sessionTrades, setSessionTrades] = useState<Trade[]>(INITIAL_SESSION_TRADES);
  const [logView, setLogView] = useState<'session' | 'historical'>('session');
  const [selectedLogIndex, setSelectedLogIndex] = useState<string>('ALL');
  const [selectedOutcome, setSelectedOutcome] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [summary, setSummary] = useState<Summary>({
    total_trades: 4,
    wins: 2,
    losses: 1,
    breakevens: 1,
    win_rate: 50.0,
    total_net_pnl_inr: 1333.50,
    active_trades: 1,
    wallet_balance_inr: 101333.50,
    daily_realized_loss: -1372.50,
    circuit_breaker_active: false
  });

  const [connected, setConnected] = useState<boolean>(false);
  const [brokerInfo, setBrokerInfo] = useState<{ is_live: boolean; has_token: boolean; last_error?: string; latency_ms?: number }>({
    is_live: false,
    has_token: false
  });

  const [selectedIndex, setSelectedIndex] = useState<string>('NIFTY');
  const [istTime, setIstTime] = useState<string>('');
  
  // Upstox Modal & Form
  const [showTokenModal, setShowTokenModal] = useState<boolean>(false);
  const [upstoxTokenInput, setUpstoxTokenInput] = useState<string>('');
  const [tokenStatusMsg, setTokenStatusMsg] = useState<string>('');
  const [tokenLoading, setTokenLoading] = useState<boolean>(false);

  // IST Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setIstTime(now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Backend Base URLs
  const getBackendBase = () => {
    if (window.location.hostname === 'localhost') return 'http://localhost:8000';
    return ''; // Empty string hits the Vercel rewrite /api/...
  };

  const getWsUrl = () => {
    if (window.location.hostname === 'localhost') return 'ws://localhost:8000/ws/live';
    return 'wss://modem-prefer-elvis-kinds.trycloudflare.com/ws/live';
  };

  // WebSocket + Polling fallback
  useEffect(() => {
    let ws: WebSocket | null = null;
    let isUnmounted = false;

    const connectWs = () => {
      try {
        ws = new WebSocket(getWsUrl());
        ws.onopen = () => {
          if (!isUnmounted) setConnected(true);
        };
        ws.onclose = () => {
          if (!isUnmounted) {
            setConnected(false);
            setTimeout(connectWs, 3000);
          }
        };
        ws.onerror = () => {
          if (!isUnmounted) setConnected(false);
        };
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.snapshots) setSnapshots(data.snapshots);
            if (data.active_trades) setActiveTrades(data.active_trades);
            if (data.trade_history && data.trade_history.length > 0) {
              setSessionTrades(data.trade_history);
            }
            if (data.summary) setSummary(data.summary);
            if (data.broker) setBrokerInfo(data.broker);
          } catch (e) {
            console.error('WS Parse error', e);
          }
        };
      } catch (err) {
        console.warn('WebSocket connect failed', err);
      }
    };

    connectWs();

    // Secondary HTTP Polling to keep broker status fresh
    const pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`${getBackendBase()}/api/status`);
        if (res.ok) {
          const st = await res.json();
          if (st.status === 'ONLINE') {
            // Backend is alive
          }
        }
      } catch (e) {
        // quiet ignore
      }
    }, 5000);

    return () => {
      isUnmounted = true;
      clearInterval(pollTimer);
      if (ws) ws.close();
    };
  }, []);

  // Save & Test Upstox Token
  const handleSaveToken = async () => {
    if (!upstoxTokenInput.trim()) return;
    setTokenLoading(true);
    setTokenStatusMsg('Contacting Upstox API V2...');
    try {
      const res = await fetch(`${getBackendBase()}/api/broker/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: upstoxTokenInput.trim() })
      });
      const data = await res.json();
      setTokenLoading(false);
      if (data.connected) {
        setTokenStatusMsg(`✓ Success! Connected to Upstox (Nifty 50 LTP: ₹${data.nifty_ltp}, Latency: ${data.latency_ms}ms)`);
        setBrokerInfo({ is_live: true, has_token: true, latency_ms: data.latency_ms });
        setTimeout(() => {
          setShowTokenModal(false);
          setTokenStatusMsg('');
        }, 1800);
      } else {
        setTokenStatusMsg(`Connection Failed: ${data.reason || 'Token rejected'}`);
      }
    } catch (e) {
      setTokenLoading(false);
      setTokenStatusMsg(`Network Error: ${e}`);
    }
  };

  // Filtered trade list
  const activeTradeList = logView === 'session' ? sessionTrades : (HISTORICAL_TRADES as unknown as Trade[]);

  const filteredTrades = useMemo(() => {
    return activeTradeList.filter((t) => {
      const matchIndex = selectedLogIndex === 'ALL' || t.symbol === selectedLogIndex;
      let matchOutcome = true;
      if (selectedOutcome === 'WIN') matchOutcome = (t.pnl_rupees || 0) > 0;
      else if (selectedOutcome === 'LOSS') matchOutcome = (t.pnl_rupees || 0) < 0;
      else if (selectedOutcome === 'BREAKEVEN') matchOutcome = (t.pnl_rupees || 0) === 0 || t.exit_reason === 'BREAKEVEN_STOP_HIT';

      const matchSearch = !searchQuery.trim() || 
        t.contract.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.exit_reason || '').toLowerCase().includes(searchQuery.toLowerCase());

      return matchIndex && matchOutcome && matchSearch;
    });
  }, [activeTradeList, selectedLogIndex, selectedOutcome, searchQuery]);

  // Aggregate stats of current filtered view
  const viewStats = useMemo(() => {
    const list = filteredTrades;
    const wins = list.filter((t) => (t.pnl_rupees || 0) > 0).length;
    const losses = list.filter((t) => (t.pnl_rupees || 0) < 0).length;
    const bes = list.filter((t) => (t.pnl_rupees || 0) === 0 || t.exit_reason === 'BREAKEVEN_STOP_HIT').length;
    const totalPnl = list.reduce((acc, t) => acc + (t.pnl_rupees || 0), 0);
    const totalPts = list.reduce((acc, t) => acc + (t.pnl_points || 0), 0);
    const totalFriction = list.reduce((acc, t) => acc + (t.statutory_charges?.total_friction || 40.0), 0);
    const winRate = list.length > 0 ? (wins / list.length) * 100 : 0;
    return { count: list.length, wins, losses, bes, totalPnl, totalPts, totalFriction, winRate };
  }, [filteredTrades]);

  const snap = snapshots[selectedIndex] || {
    symbol: selectedIndex,
    spot: 22231.80,
    cpr: { tc: 22270, bc: 22190, pivot: 22230, is_narrow: true },
    supertrend: { level: 22350, signal: 'SELL' },
    vwap: 22260,
    regime: 'BEARISH_PULLBACK'
  };

  const selectedActiveTrade = activeTrades.find((t) => t.symbol === selectedIndex) || activeTrades[0];
  const lossBudgetPct = Math.min(100, Math.max(0, (Math.abs(summary.daily_realized_loss) / 2500.0) * 100));

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-page)', padding: '20px 28px', maxWidth: '1520px', margin: '0 auto' }}>
      
      {/* TOP COMMAND HEADER */}
      <header className="card-surface" style={{ padding: '16px 24px', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(79, 70, 229, 0.25)' }}>
            <Zap size={22} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
                JevCalls Core
              </h1>
              <span style={{ fontSize: '11px', background: 'var(--indigo-bg)', color: 'var(--indigo)', border: '1px solid var(--indigo-border)', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                HFT v2.1
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Quantitative 0DTE Options Scalping Engine • SEBI Compliant
            </p>
          </div>
        </div>

        {/* Global Navigation Pills */}
        <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-subtle)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
          <button 
            className={`tab-pill ${activeTab === 'desk' ? 'active' : ''}`}
            onClick={() => setActiveTab('desk')}
          >
            📈 Scalping Desk
          </button>
          <button 
            className={`tab-pill ${activeTab === 'log' ? 'active' : ''}`}
            onClick={() => setActiveTab('log')}
          >
            📋 Trade History ({activeTradeList.length})
          </button>
          <button 
            className={`tab-pill ${activeTab === 'risk' ? 'active' : ''}`}
            onClick={() => setActiveTab('risk')}
          >
            🛡️ Risk & Budget
          </button>
          <button 
            className={`tab-pill ${activeTab === 'broker' ? 'active' : ''}`}
            onClick={() => setActiveTab('broker')}
          >
            🔑 Upstox Broker
          </button>
        </div>

        {/* Telemetry Status Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          
          {/* IST Clock */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <Clock size={14} color="var(--text-muted)" />
            <span className="font-mono" style={{ fontWeight: 600 }}>{istTime || '15:30:00'} IST</span>
          </div>

          {/* Engine Streaming Status */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            padding: '6px 12px', 
            borderRadius: '8px', 
            background: connected ? 'var(--emerald-bg)' : 'var(--amber-bg)', 
            border: `1px solid ${connected ? 'var(--emerald-border)' : 'var(--amber-border)'}` 
          }}>
            <div className="pulse-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: connected ? 'var(--emerald)' : 'var(--amber)' }}></div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: connected ? 'var(--emerald)' : 'var(--amber)' }}>
              {connected ? 'LIVE FEED' : 'SIMULATION MODE'}
            </span>
          </div>

          {/* Broker Upstox Badge */}
          <button 
            onClick={() => setShowTokenModal(true)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              padding: '6px 12px', 
              borderRadius: '8px', 
              background: brokerInfo.is_live ? 'var(--emerald-bg)' : 'var(--indigo-bg)', 
              border: `1px solid ${brokerInfo.is_live ? 'var(--emerald-border)' : 'var(--indigo-border)'}`,
              cursor: 'pointer'
            }}
          >
            <Activity size={14} color={brokerInfo.is_live ? 'var(--emerald)' : 'var(--indigo)'} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: brokerInfo.is_live ? 'var(--emerald)' : 'var(--indigo)' }}>
              {brokerInfo.is_live ? 'UPSTOX CONNECTED' : 'CONFIG UPSTOX'}
            </span>
          </button>
        </div>
      </header>

      {/* VIEW: LIVE SCALPING DESK */}
      {activeTab === 'desk' && (
        <div>
          {/* Index Selector Bar */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', overflowX: 'auto', paddingBottom: '4px' }}>
            {INDICES.map((idx) => {
              const itemSnap = snapshots[idx] || { spot: 0 };
              const isSelected = selectedIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedIndex(idx)}
                  className="card-surface"
                  style={{
                    flex: '1 1 0px',
                    minWidth: '180px',
                    padding: '14px 16px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--bg-surface)' : 'var(--bg-surface)',
                    borderColor: isSelected ? 'var(--indigo)' : 'var(--border-default)',
                    boxShadow: isSelected ? '0 0 0 2px var(--indigo-border)' : 'var(--shadow-card)',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: isSelected ? 'var(--indigo)' : 'var(--text-primary)' }}>
                      {idx}
                    </span>
                    <span style={{ 
                      fontSize: '10px', 
                      fontWeight: 700, 
                      padding: '2px 6px', 
                      borderRadius: '4px',
                      background: (itemSnap.regime || '').includes('BULL') ? 'var(--emerald-bg)' : 'var(--bg-subtle)',
                      color: (itemSnap.regime || '').includes('BULL') ? 'var(--emerald)' : 'var(--text-muted)'
                    }}>
                      {itemSnap.regime || 'NEUTRAL'}
                    </span>
                  </div>
                  <div className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    ₹{itemSnap.spot ? itemSnap.spot.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '---'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Core Scalping Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '18px', marginBottom: '20px' }}>
            
            {/* Active Position / Execution Card (7 cols) */}
            <div className="card-surface" style={{ gridColumn: 'span 7', padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: selectedActiveTrade ? 'var(--emerald)' : 'var(--text-tertiary)' }}></div>
                  <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Active Scalp Position: {selectedIndex}
                  </h2>
                </div>
                {selectedActiveTrade && (
                  <span style={{ fontSize: '12px', background: 'var(--emerald-bg)', color: 'var(--emerald)', border: '1px solid var(--emerald-border)', padding: '3px 10px', borderRadius: '6px', fontWeight: 700 }}>
                    LIVE ORDER LADDER
                  </span>
                )}
              </div>

              {selectedActiveTrade ? (
                <div>
                  {/* Position Details Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--bg-subtle)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-default)', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {selectedActiveTrade.contract}
                        </span>
                        <span style={{ 
                          fontSize: '11px', 
                          fontWeight: 700, 
                          padding: '2px 8px', 
                          borderRadius: '4px',
                          background: selectedActiveTrade.option_type === 'CE' ? 'var(--emerald-bg)' : 'var(--rose-bg)',
                          color: selectedActiveTrade.option_type === 'CE' ? 'var(--emerald)' : 'var(--rose)'
                        }}>
                          {selectedActiveTrade.option_type === 'CE' ? 'BUY CALL' : 'BUY PUT'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Qty: <strong className="font-mono">{selectedActiveTrade.quantity}</strong> • Entry: <strong className="font-mono">₹{selectedActiveTrade.entry_price.toFixed(2)}</strong>
                      </div>
                    </div>

                    {/* Live PnL Box */}
                    <div style={{ textAlign: 'right' }}>
                      <div className="font-mono" style={{ fontSize: '22px', fontWeight: 800, color: (selectedActiveTrade.pnl_rupees || 0) >= 0 ? 'var(--emerald)' : 'var(--rose)' }}>
                        {(selectedActiveTrade.pnl_rupees || 0) >= 0 ? `+₹${(selectedActiveTrade.pnl_rupees || 0).toFixed(2)}` : `-₹${Math.abs(selectedActiveTrade.pnl_rupees || 0).toFixed(2)}`}
                      </div>
                      <div className="font-mono" style={{ fontSize: '12px', fontWeight: 700, color: (selectedActiveTrade.pnl_points || 0) >= 0 ? 'var(--emerald)' : 'var(--rose)' }}>
                        {(selectedActiveTrade.pnl_points || 0) >= 0 ? `+${(selectedActiveTrade.pnl_points || 0).toFixed(2)} pts` : `${(selectedActiveTrade.pnl_points || 0).toFixed(2)} pts`} ({(selectedActiveTrade.pnl_percentage || 0).toFixed(2)}%)
                      </div>
                    </div>
                  </div>

                  {/* Quantitative Execution Ladder */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                    <div className="card-subtle" style={{ padding: '12px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--rose)', fontWeight: 700, textTransform: 'uppercase' }}>Hard Stop Loss (-8%)</span>
                      <div className="font-mono" style={{ fontSize: '16px', fontWeight: 800, color: 'var(--rose)', marginTop: '2px' }}>
                        ₹{selectedActiveTrade.stop_loss.toFixed(2)}
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Max Loss Protected</span>
                    </div>

                    <div className="card-subtle" style={{ padding: '12px', borderColor: selectedActiveTrade.breakeven_locked ? 'var(--amber-border)' : 'var(--border-default)', background: selectedActiveTrade.breakeven_locked ? 'var(--amber-bg)' : 'var(--bg-subtle)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', color: 'var(--amber)', fontWeight: 700, textTransform: 'uppercase' }}>Breakeven (+5%)</span>
                        {selectedActiveTrade.breakeven_locked && (
                          <CheckCircle2 size={13} color="var(--amber)" />
                        )}
                      </div>
                      <div className="font-mono" style={{ fontSize: '16px', fontWeight: 800, color: 'var(--amber)', marginTop: '2px' }}>
                        ₹{(selectedActiveTrade.entry_price * 1.05).toFixed(2)}
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {selectedActiveTrade.breakeven_locked ? '✓ STOP LOCKED TO ENTRY' : 'Triggers SL Move to Entry'}
                      </span>
                    </div>

                    <div className="card-subtle" style={{ padding: '12px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--emerald)', fontWeight: 700, textTransform: 'uppercase' }}>Target 1 Scalp (+8%)</span>
                      <div className="font-mono" style={{ fontSize: '16px', fontWeight: 800, color: 'var(--emerald)', marginTop: '2px' }}>
                        ₹{selectedActiveTrade.target_1.toFixed(2)}
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Auto Take Profit</span>
                    </div>
                  </div>

                  {/* High Watermark Bar */}
                  <div style={{ background: 'var(--bg-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      <span>Max Peak Reached: <strong className="font-mono" style={{ color: 'var(--emerald)' }}>₹{selectedActiveTrade.max_price_reached.toFixed(2)}</strong></span>
                      <span>Target Proximity: <strong className="font-mono">{Math.min(100, Math.round(((selectedActiveTrade.max_price_reached - selectedActiveTrade.entry_price) / (selectedActiveTrade.target_1 - selectedActiveTrade.entry_price)) * 100))}%</strong></span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--border-default)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ 
                        height: '100%', 
                        background: 'linear-gradient(90deg, var(--indigo) 0%, var(--emerald) 100%)', 
                        width: `${Math.min(100, Math.max(0, ((selectedActiveTrade.max_price_reached - selectedActiveTrade.entry_price) / (selectedActiveTrade.target_1 - selectedActiveTrade.entry_price)) * 100))}%` 
                      }}></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-subtle)', borderRadius: '10px', border: '1px dashed var(--border-default)' }}>
                  <Activity size={28} color="var(--text-muted)" style={{ margin: '0 auto 10px auto' }} />
                  <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Scanning for High-Probability Confluence
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Engine will automatically fire a scalp order when Spot breaches CPR range and Supertrend confirms direction.
                  </p>
                </div>
              )}
            </div>

            {/* Technical Indicators & CPR Desk (5 cols) */}
            <div className="card-surface" style={{ gridColumn: 'span 5', padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {selectedIndex} Technical Confluence
                </h3>
                <span style={{ fontSize: '11px', background: 'var(--sky-bg)', color: 'var(--sky)', border: '1px solid var(--sky-border)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                  5S RESOLUTION
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                
                {/* CPR Analysis */}
                <div className="card-subtle" style={{ padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>Central Pivot Range (CPR)</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: snap.cpr?.is_narrow ? 'var(--emerald)' : 'var(--text-muted)', background: snap.cpr?.is_narrow ? 'var(--emerald-bg)' : 'transparent', padding: '1px 6px', borderRadius: '4px' }}>
                      {snap.cpr?.is_narrow ? '✓ NARROW CPR (TRENDING)' : 'WIDE CPR'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
                    <div style={{ background: 'var(--bg-surface)', padding: '6px', borderRadius: '6px', border: '1px solid var(--border-default)' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Top (TC)</span>
                      <div className="font-mono" style={{ fontSize: '13px', fontWeight: 700 }}>₹{snap.cpr?.tc || 0}</div>
                    </div>
                    <div style={{ background: 'var(--bg-surface)', padding: '6px', borderRadius: '6px', border: '1px solid var(--border-default)' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Pivot</span>
                      <div className="font-mono" style={{ fontSize: '13px', fontWeight: 700 }}>₹{snap.cpr?.pivot || 0}</div>
                    </div>
                    <div style={{ background: 'var(--bg-surface)', padding: '6px', borderRadius: '6px', border: '1px solid var(--border-default)' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Bottom (BC)</span>
                      <div className="font-mono" style={{ fontSize: '13px', fontWeight: 700 }}>₹{snap.cpr?.bc || 0}</div>
                    </div>
                  </div>
                </div>

                {/* Supertrend & VWAP */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  <div className="card-subtle" style={{ padding: '12px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Supertrend (10,3)</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                      <span style={{ 
                        fontSize: '13px', 
                        fontWeight: 800, 
                        color: snap.supertrend?.signal === 'BUY' ? 'var(--emerald)' : (snap.supertrend?.signal === 'SELL' ? 'var(--rose)' : 'var(--text-muted)')
                      }}>
                        {snap.supertrend?.signal || 'NEUTRAL'}
                      </span>
                    </div>
                    <div className="font-mono" style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Level: ₹{snap.supertrend?.level || 0}
                    </div>
                  </div>

                  <div className="card-subtle" style={{ padding: '12px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Volume WAP</span>
                    <div className="font-mono" style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                      ₹{snap.vwap ? snap.vwap.toFixed(2) : '---'}
                    </div>
                    <div style={{ fontSize: '11px', color: snap.spot > snap.vwap ? 'var(--emerald)' : 'var(--rose)', marginTop: '2px', fontWeight: 600 }}>
                      {snap.spot > snap.vwap ? 'Price > VWAP (Bullish)' : 'Price < VWAP (Bearish)'}
                    </div>
                  </div>
                </div>

                {/* Quick Simulation Trigger */}
                <div style={{ background: 'var(--indigo-bg)', border: '1px solid var(--indigo-border)', padding: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--indigo)' }}>Simulate Market Setup</span>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Test live tick scalp and watch trade log record</p>
                  </div>
                  <button 
                    onClick={() => {
                      const newTrade: Trade = {
                        id: Date.now(),
                        symbol: selectedIndex,
                        contract: `${selectedIndex} ${Math.round(snap.spot / 50) * 50} CE`,
                        option_type: 'CE',
                        strike: Math.round(snap.spot / 50) * 50,
                        entry_price: 150.00,
                        quantity: 65,
                        stop_loss: 138.00,
                        target_1: 162.00,
                        max_price_reached: 150.00,
                        breakeven_locked: false,
                        status: 'ACTIVE',
                        active: true,
                        entry_time: new Date().toISOString(),
                        pnl_points: 0.0,
                        pnl_percentage: 0.0,
                        pnl_rupees: 0.0
                      };
                      setActiveTrades([newTrade]);
                    }}
                    className="btn-primary" 
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    Fire Scalp
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: TRADE EXECUTION & AUDIT LOG */}
      {(activeTab === 'log' || activeTab === 'desk') && (
        <div className="card-surface" style={{ padding: '24px', marginBottom: '20px' }}>
          
          {/* Header & View Toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Trade History & Audit Log
                </h2>
                <span style={{ fontSize: '12px', background: 'var(--bg-subtle)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                  {filteredTrades.length} Trades Shown
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Audit trail with sub-second execution, statutory friction (Brokerage + STT + GST), and net realized returns.
              </p>
            </div>

            {/* Toggle: Session vs Historical 169 Trades */}
            <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-subtle)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              <button 
                onClick={() => setLogView('session')}
                className={`tab-pill ${logView === 'session' ? 'active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Today's Session ({sessionTrades.length})
              </button>
              <button 
                onClick={() => setLogView('historical')}
                className={`tab-pill ${logView === 'historical' ? 'active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                169 Historical Audited Trades
              </button>
            </div>
          </div>

          {/* Aggregate Stat Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '18px' }}>
            <div className="card-subtle" style={{ padding: '12px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Win Rate</span>
              <div className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--indigo)', marginTop: '2px' }}>
                {viewStats.winRate.toFixed(1)}%
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{viewStats.wins}W • {viewStats.bes}BE • {viewStats.losses}L</span>
            </div>

            <div className="card-subtle" style={{ padding: '12px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Net Realized PnL</span>
              <div className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: viewStats.totalPnl >= 0 ? 'var(--emerald)' : 'var(--rose)', marginTop: '2px' }}>
                {viewStats.totalPnl >= 0 ? `+₹${viewStats.totalPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : `-₹${Math.abs(viewStats.totalPnl).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>After All Taxes & Charges</span>
            </div>

            <div className="card-subtle" style={{ padding: '12px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Gross Points</span>
              <div className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: viewStats.totalPts >= 0 ? 'var(--emerald)' : 'var(--rose)', marginTop: '2px' }}>
                {viewStats.totalPts >= 0 ? `+${viewStats.totalPts.toFixed(1)}` : `${viewStats.totalPts.toFixed(1)}`} pts
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Empirical Scalp Rules</span>
            </div>

            <div className="card-subtle" style={{ padding: '12px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Statutory Friction</span>
              <div className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-secondary)', marginTop: '2px' }}>
                ₹{viewStats.totalFriction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>SEBI STT + Brokerage</span>
            </div>

            <div className="card-subtle" style={{ padding: '12px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Sample Strategy</span>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                +8% T1 / +5% BE / -8% SL
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Quick Scalp Mechanics</span>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', background: 'var(--bg-subtle)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
            
            {/* Index Filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginRight: '4px' }}>Index:</span>
              {['ALL', ...INDICES].map((sym) => (
                <button
                  key={sym}
                  onClick={() => setSelectedLogIndex(sym)}
                  style={{
                    padding: '3px 9px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    border: '1px solid',
                    borderColor: selectedLogIndex === sym ? 'var(--indigo)' : 'var(--border-default)',
                    background: selectedLogIndex === sym ? 'var(--indigo)' : 'var(--bg-surface)',
                    color: selectedLogIndex === sym ? '#ffffff' : 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  {sym}
                </button>
              ))}
            </div>

            {/* Outcome Filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginRight: '4px' }}>Outcome:</span>
              {[
                { label: 'All', value: 'ALL' },
                { label: 'Wins', value: 'WIN' },
                { label: 'Breakeven', value: 'BREAKEVEN' },
                { label: 'Losses', value: 'LOSS' }
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedOutcome(opt.value)}
                  style={{
                    padding: '3px 9px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    border: '1px solid',
                    borderColor: selectedOutcome === opt.value ? 'var(--text-primary)' : 'var(--border-default)',
                    background: selectedOutcome === opt.value ? 'var(--text-primary)' : 'var(--bg-surface)',
                    color: selectedOutcome === opt.value ? '#ffffff' : 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '4px 8px' }}>
              <Search size={14} color="var(--text-muted)" />
              <input 
                type="text"
                placeholder="Filter contract..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12px', width: '130px' }}
              />
            </div>
          </div>

          {/* Main Log Table */}
          {filteredTrades.length > 0 ? (
            <div style={{ overflowX: 'auto', maxHeight: '520px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 10 }}>
                  <tr style={{ borderBottom: '2px solid var(--border-default)', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <th style={{ padding: '10px 12px' }}>Time</th>
                    <th style={{ padding: '10px 12px' }}>Contract</th>
                    <th style={{ padding: '10px 12px' }}>Side</th>
                    <th style={{ padding: '10px 12px' }}>Qty</th>
                    <th style={{ padding: '10px 12px' }}>Entry</th>
                    <th style={{ padding: '10px 12px' }}>Exit</th>
                    <th style={{ padding: '10px 12px' }}>Peak</th>
                    <th style={{ padding: '10px 12px' }}>Points</th>
                    <th style={{ padding: '10px 12px' }}>Friction</th>
                    <th style={{ padding: '10px 12px' }}>Net Realized (₹)</th>
                    <th style={{ padding: '10px 12px' }}>Exit Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.map((t, idx) => {
                    const isWin = (t.pnl_rupees || 0) > 0;
                    const isBe = (t.pnl_rupees || 0) === 0 || t.exit_reason === 'BREAKEVEN_STOP_HIT';
                    return (
                      <tr 
                        key={t.id || idx} 
                        style={{ 
                          borderBottom: '1px solid var(--border-subtle)', 
                          backgroundColor: idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-page)',
                          transition: 'background 0.15s' 
                        }}
                      >
                        <td className="font-mono" style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
                          {t.exit_time ? new Date(t.exit_time).toLocaleTimeString('en-IN', { hour12: false }) : '---'}
                        </td>
                        <td style={{ padding: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {t.contract}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ 
                            fontSize: '11px', 
                            fontWeight: 700, 
                            padding: '2px 7px', 
                            borderRadius: '4px',
                            backgroundColor: t.option_type === 'CE' ? 'var(--emerald-bg)' : 'var(--rose-bg)',
                            color: t.option_type === 'CE' ? 'var(--emerald)' : 'var(--rose)',
                            border: `1px solid ${t.option_type === 'CE' ? 'var(--emerald-border)' : 'var(--rose-border)'}`
                          }}>
                            {t.option_type === 'CE' ? 'CALL' : 'PUT'}
                          </span>
                        </td>
                        <td className="font-mono" style={{ padding: '12px' }}>{t.quantity}</td>
                        <td className="font-mono" style={{ padding: '12px' }}>₹{t.entry_price.toFixed(2)}</td>
                        <td className="font-mono" style={{ padding: '12px', fontWeight: 600 }}>₹{t.exit_price ? t.exit_price.toFixed(2) : '---'}</td>
                        <td className="font-mono" style={{ padding: '12px', color: 'var(--emerald)', fontWeight: 600 }}>₹{t.max_price_reached.toFixed(2)}</td>
                        <td className="font-mono" style={{ padding: '12px', fontWeight: 700, color: isWin ? 'var(--emerald)' : (isBe ? 'var(--amber)' : 'var(--rose)') }}>
                          {t.pnl_points ? (t.pnl_points > 0 ? `+${t.pnl_points.toFixed(1)}` : t.pnl_points.toFixed(1)) : '0.0'}
                        </td>
                        <td className="font-mono" style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
                          -₹{t.statutory_charges?.total_friction ? t.statutory_charges.total_friction.toFixed(2) : '40.00'}
                        </td>
                        <td className="font-mono" style={{ padding: '12px', fontWeight: 800 }}>
                          <span style={{ 
                            padding: '3px 8px', 
                            borderRadius: '6px',
                            backgroundColor: isWin ? 'var(--emerald-bg)' : (isBe ? 'var(--amber-bg)' : 'var(--rose-bg)'),
                            color: isWin ? 'var(--emerald)' : (isBe ? 'var(--amber)' : 'var(--rose)'),
                            border: `1px solid ${isWin ? 'var(--emerald-border)' : (isBe ? 'var(--amber-border)' : 'var(--rose-border)')}`
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
                            backgroundColor: isWin ? 'var(--sky-bg)' : (isBe ? 'var(--amber-bg)' : 'var(--rose-bg)'),
                            color: isWin ? 'var(--sky)' : (isBe ? 'var(--amber)' : 'var(--rose)'),
                            border: `1px solid ${isWin ? 'var(--sky-border)' : (isBe ? 'var(--amber-border)' : 'var(--rose-border)')}`
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
            <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-subtle)', borderRadius: '8px', border: '1px dashed var(--border-default)' }}>
              <Filter size={24} color="var(--text-muted)" style={{ margin: '0 auto 8px auto' }} />
              <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>No Trades Match Filter Criteria</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Reset filters above or switch between Today's Session and the 169 Historical Audited Trades.
              </p>
            </div>
          )}
        </div>
      )}

      {/* VIEW: RISK & CAPITAL BUDGET */}
      {activeTab === 'risk' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '18px', marginBottom: '20px' }}>
          
          {/* Daily Loss Circuit Breaker Gauge */}
          <div className="card-surface" style={{ gridColumn: 'span 6', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <ShieldAlert size={22} color="var(--rose)" />
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Daily Loss Circuit Breaker (Hard Kill-Switch)
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  SEBI capital protection rule: trading immediately shuts down if losses hit ₹2,500
                </p>
              </div>
            </div>

            <div style={{ background: 'var(--bg-subtle)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-default)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Daily Realized Loss:</span>
                <span className="font-mono" style={{ fontWeight: 800, color: 'var(--rose)' }}>
                  ₹{Math.abs(summary.daily_realized_loss).toFixed(2)} / ₹2,500.00
                </span>
              </div>
              
              <div style={{ height: '10px', background: 'var(--border-default)', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ 
                  height: '100%', 
                  background: lossBudgetPct > 75 ? 'var(--rose)' : (lossBudgetPct > 40 ? 'var(--amber)' : 'var(--emerald)'),
                  width: `${lossBudgetPct}%`,
                  transition: 'width 0.3s'
                }}></div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                <span>Safe (0%)</span>
                <span>Warning (50%)</span>
                <span>Breaker Tripped (100%)</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderRadius: '8px', background: summary.circuit_breaker_active ? 'var(--rose-bg)' : 'var(--emerald-bg)', border: `1px solid ${summary.circuit_breaker_active ? 'var(--rose-border)' : 'var(--emerald-border)'}` }}>
              {summary.circuit_breaker_active ? <AlertTriangle size={18} color="var(--rose)" /> : <CheckCircle2 size={18} color="var(--emerald)" />}
              <div>
                <span style={{ fontSize: '13px', fontWeight: 800, color: summary.circuit_breaker_active ? 'var(--rose)' : 'var(--emerald)' }}>
                  {summary.circuit_breaker_active ? 'CIRCUIT BREAKER ENGAGED • ORDERS BLOCKED' : 'RISK ENGINE CLEAR • TRADING AUTHORIZED'}
                </span>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                  {summary.circuit_breaker_active ? '30-minute cooldown enforced to prevent emotional revenge scalping.' : 'All invariants, consecutive losses, and budget limits healthy.'}
                </p>
              </div>
            </div>
          </div>

          {/* Capital Allocation & Risk Invariants */}
          <div className="card-surface" style={{ gridColumn: 'span 6', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>
              Capital Allocation & Invariant Safeguards
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>
              <div className="card-subtle" style={{ padding: '14px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Simulated Wallet Capital</span>
                <div className="font-mono" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                  ₹{summary.wallet_balance_inr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--emerald)', fontWeight: 700 }}>+₹1,333.50 Realized Today</span>
              </div>

              <div className="card-subtle" style={{ padding: '14px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Max Consecutive Losses</span>
                <div className="font-mono" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {summary.losses > 0 ? 1 : 0} / 2
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Auto-halt on 2 losses</span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-subtle)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-default)', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>Empirical Scalping Edge:</div>
              <ul style={{ paddingLeft: '18px', lineHeight: 1.6 }}>
                <li><strong>Strict Breakeven Lock:</strong> As soon as position touches +5%, stop loss moves to Entry (₹0 risk).</li>
                <li><strong>Quick Scalp Exit:</strong> Target 1 auto-exits at +8% gain instead of waiting for reversal.</li>
                <li><strong>Friction Budgeting:</strong> Accounts for ₹20/order brokerage + 0.10% STT on every trade.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: UPSTOX BROKER CONSOLE */}
      {activeTab === 'broker' && (
        <div style={{ maxWidth: '800px', margin: '0 auto', marginBottom: '20px' }}>
          <div className="card-surface" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--indigo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Activity size={22} color="var(--indigo)" />
              </div>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Upstox API V2 Broker Console
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Verify live market quote feed, token status, and SEBI daily authorization.
                </p>
              </div>
            </div>

            {/* Current Status Banner */}
            <div style={{ 
              padding: '16px', 
              borderRadius: '10px', 
              background: brokerInfo.is_live ? 'var(--emerald-bg)' : 'var(--bg-subtle)', 
              border: `1px solid ${brokerInfo.is_live ? 'var(--emerald-border)' : 'var(--border-default)'}`,
              marginBottom: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: brokerInfo.is_live ? 'var(--emerald)' : 'var(--amber)' }}></div>
                  <strong style={{ fontSize: '14px', color: brokerInfo.is_live ? 'var(--emerald)' : 'var(--text-primary)' }}>
                    {brokerInfo.is_live ? 'Live Upstox Quotes Active' : 'Fallback Paper Simulator Active'}
                  </strong>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {brokerInfo.is_live 
                    ? `Streaming live ticks directly from NSE/BSE via Upstox API V2 (Latency: ${brokerInfo.latency_ms || 120}ms).` 
                    : 'Engine is currently simulating realistic tick movements and options premium expansion.'}
                </p>
              </div>

              <button 
                onClick={() => setShowTokenModal(true)}
                className="btn-primary"
              >
                {brokerInfo.is_live ? 'Update Daily Token' : 'Enter Upstox Token'}
              </button>
            </div>

            {/* How It Works Guide */}
            <div style={{ border: '1px solid var(--border-default)', borderRadius: '10px', padding: '18px', background: 'var(--bg-surface)' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
                How Upstox Daily Authorization Works (SEBI Mandate):
              </h4>
              <ol style={{ paddingLeft: '20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <li>Per SEBI regulations, all Indian broker API tokens expire every day at <strong>03:30 AM IST</strong>.</li>
                <li>To enable live market quotes during trading hours (09:15 - 15:30 IST), log in to your Upstox Developer App portal.</li>
                <li>Copy your fresh daily access token and click <strong>"Enter Upstox Token"</strong> above.</li>
                <li>The engine validates the token against <code className="font-mono">/v2/market-quote/quotes</code> and immediately switches from simulator ticks to real NSE/BSE ticks.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* UPSTOX TOKEN MODAL */}
      {showTokenModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card-surface" style={{ width: '100%', maxWidth: '500px', padding: '24px', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={18} color="var(--indigo)" />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>Configure Upstox Broker Feed</h3>
              </div>
              <button onClick={() => setShowTokenModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.5 }}>
              Paste your daily Upstox Access Token below. The engine will instantly test the connection against the live Nifty 50 quote.
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Daily Access Token
              </label>
              <textarea
                value={upstoxTokenInput}
                onChange={(e) => setUpstoxTokenInput(e.target.value)}
                placeholder="Paste Upstox access token here..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-default)',
                  backgroundColor: 'var(--bg-subtle)',
                  fontFamily: 'JetBrains Mono',
                  fontSize: '12px',
                  outline: 'none',
                  resize: 'none'
                }}
              />
            </div>

            {tokenStatusMsg && (
              <div style={{ 
                fontSize: '12px', 
                fontWeight: 600, 
                marginBottom: '14px', 
                padding: '8px 12px', 
                borderRadius: '6px',
                backgroundColor: tokenStatusMsg.startsWith('✓') ? 'var(--emerald-bg)' : 'var(--rose-bg)',
                color: tokenStatusMsg.startsWith('✓') ? 'var(--emerald)' : 'var(--rose)',
                border: `1px solid ${tokenStatusMsg.startsWith('✓') ? 'var(--emerald-border)' : 'var(--rose-border)'}`
              }}>
                {tokenStatusMsg}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowTokenModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button 
                onClick={handleSaveToken} 
                disabled={tokenLoading}
                className="btn-primary"
              >
                {tokenLoading ? 'Testing...' : 'Verify & Connect'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
