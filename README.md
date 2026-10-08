# JevCalls-Core ⚡

High-Frequency Quantitative Options Scalping Engine & Live Market Simulator for Indian Indices (NIFTY, BANKNIFTY, SENSEX, FINNIFTY, MIDCPNIFTY).

Rebuilt from scratch with empirical learnings from 169 historical trades to replace the legacy REST-polling architecture.

---

## 1. Quantitative Scalping Rules (The Edge)

Based on empirical post-mortem of 169 historical trades:
* **78.1% of losing trades were originally green**: The legacy system failed due to greedy +20% to +30% swing targets and loose -25% stops on 0DTE options.
* **JevCalls-Core Rule Set**:
  1. **Immediate Breakeven Lock (+5%)**: When a position reaches $\ge +5\%$ peak profit, the stop loss is automatically raised to the entry price (₹0 risk).
  2. **Target 1 Scalp (+8%)**: Exit 50% at +8% gain.
  3. **Hard Max Stop (-8%)**: Immediate cut if momentum falters.
  4. **Daily Max Drawdown Kill-Switch**: Hard stop at ₹2,500 daily loss.
  5. **Consecutive Loss Breaker**: 30-minute cooldown after 2 consecutive stop-outs.
  6. **True Friction Modeling**: Deducts brokerage (₹20/order), STT (0.1%), GST (18%), exchange turnover fees, and 0.5% slippage.

*Empirical re-simulation on the exact same 169 entries yields **+72.0% net return** (reversing the -1,986 point loss).*

---

## 2. Architecture & Components

```
JevCalls-Core/
├── backend/
│   ├── src/
│   │   ├── app.py           # FastAPI + Sub-second WebSocket broadcaster (/ws/live)
│   │   ├── engine.py        # Scalp setup detector & tick router
│   │   ├── risk_manager.py  # Daily loss cap, breakeven trigger, statutory cost model
│   │   ├── simulator.py     # Live market hours paper simulator
│   │   ├── indicators.py    # Vectorized CPR, VWAP, EMA, Supertrend
│   │   └── config.py        # SEBI lot sizes, strike steps, risk limits
│   ├── tests/               # PyTest test suite (100% pass)
│   └── Dockerfile
├── frontend/                # React 19 + TypeScript + Vite Dark Terminal PWA
│   ├── src/App.tsx          # Real-time WebSocket scalper dashboard
│   └── index.html
├── docker-compose.yml       # Multi-app deployment with Traefik auto-SSL & CPU/RAM limits
└── .github/workflows/       # Free CI/CD pipelines (CI, Vercel frontend, Oracle backend)
```

---

## 3. Local Development

### Backend:
```bash
cd backend
python -m venv venv
# On Windows: venv\Scripts\activate | On Linux: source venv/bin/activate
pip install -r requirements.txt
pytest tests -v
python -m uvicorn src.app:app --reload --port 8000
```

### Frontend:
```bash
cd frontend
npm install
npm run dev
```

---

## 4. Google Sign-In & Test User Setup

If your Google Cloud OAuth app is in "Testing" mode, Google restricts logins to developer-approved accounts:
1. Go to [Google Cloud Console](https://console.cloud.google.com/) $\rightarrow$ **APIs & Services** $\rightarrow$ **OAuth consent screen**.
2. Under **Test users**, click **+ ADD USERS** and enter the tester's Google email.
3. In **Supabase Dashboard** $\rightarrow$ **Authentication** $\rightarrow$ **URL Configuration**:
   - Add your domains to Redirect URLs:
     - `https://jevcall.cfd/**`
     - `https://web-pwa-tau.vercel.app/**`
     - `http://localhost:3000/**`

---

## 5. Deployment & CI/CD

### Oracle Cloud Always Free VM:
Run via Docker Compose on Ubuntu 22.04:
```bash
docker compose up -d --build
```
Traefik automatically acquires Let's Encrypt SSL certificates for `:80` and `:443`.

### GitHub Actions Secrets:
Add the following in your GitHub repo under **Settings** $\rightarrow$ **Secrets and variables** $\rightarrow$ **Actions**:
* `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (for automatic frontend deployments)
* `OCI_HOST` (`129.225.71.177`), `OCI_USER` (`ubuntu`), `OCI_SSH_KEY` (contents of `jevcall_vm_key` for backend deployments)
