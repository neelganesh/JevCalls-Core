# Oracle Cloud VM Access & Operations Guide

> **Target Audience:** Autonomous AI Agents, Subagents, and Developers.  
> **Purpose:** Connect to, inspect, edit, and operate the live `JevCalls-Core` backend hosted on Oracle Cloud Infrastructure (OCI).

---

## 1. Connection Credentials & Architecture

| Parameter | Value | Details |
| :--- | :--- | :--- |
| **Host / Public IP** | `129.225.71.177` | Oracle Cloud Compute (ARM/Ampere Ubuntu 24.04) |
| **SSH User** | `ubuntu` | Passwordless `sudo` privileges enabled |
| **SSH Private Key Path** | `C:\Users\kailu\.oci\jevcall_vm_key` | **CRITICAL: NEVER use `.ssh\id_rsa` (will fail)** |
| **Remote Project Path** | `/opt/JevCalls-Core` | Root git checkout and docker project directory |
| **Backend Internal Port** | `8000` | FastAPI running in Docker container |
| **Reverse Proxy / SSL** | Traefik v3.1 | Binding ports `80` & `443` |
| **Public Gateway Tunnel** | Cloudflare Tunnel (`cloudflared`) | Tunnel daemon forwarding to `http://localhost:8000` |
| **Production Domain** | `https://jevcall.cfd` | Vercel frontend proxying `/api/*` to the VM |

---

## 2. Terminal SSH Access

### From Windows (PowerShell)
```powershell
ssh -i $env:USERPROFILE\.oci\jevcall_vm_key -o StrictHostKeyChecking=no ubuntu@129.225.71.177
```

### From Linux / macOS / Bash / WSL
```bash
ssh -i ~/.oci/jevcall_vm_key -o StrictHostKeyChecking=no ubuntu@129.225.71.177
```

---

## 3. How to Edit Code and Deploy Changes

### Method A: Git Sync (Recommended Standard)
Make edits locally in `c:\Code\Opencode\IndianTradingTools\JevCalls-Core`, commit, push to GitHub, and pull on the VM:

```powershell
# 1. On Local Machine:
git add .
git commit -m "your descriptive change"
git push origin main

# 2. Trigger pull and reload on the VM via SSH:
ssh -i $env:USERPROFILE\.oci\jevcall_vm_key -o StrictHostKeyChecking=no ubuntu@129.225.71.177 "cd /opt/JevCalls-Core && sudo git pull origin main && sudo docker compose restart jevcalls-backend"
```

### Method B: Single File Hot-Patching (Fastest for Python Edits)
To update a file without going through git or full docker image rebuilds:

```powershell
# 1. SCP modified file to /tmp on the VM:
scp -i $env:USERPROFILE\.oci\jevcall_vm_key .\backend\src\app.py ubuntu@129.225.71.177:/tmp/app.py

# 2. Copy into the running container and restart:
ssh -i $env:USERPROFILE\.oci\jevcall_vm_key ubuntu@129.225.71.177 "sudo cp /tmp/app.py /opt/JevCalls-Core/backend/src/app.py && sudo docker cp /tmp/app.py \$(sudo docker ps -qf name=jevcalls-backend):/app/src/app.py && sudo docker restart \$(sudo docker ps -qf name=jevcalls-backend)"
```

### Method C: Rebuilding Docker with New Dependencies
If `requirements.txt` or `Dockerfile` changed:

```powershell
ssh -i $env:USERPROFILE\.oci\jevcall_vm_key ubuntu@129.225.71.177 "cd /opt/JevCalls-Core && sudo git pull origin main && sudo docker compose up -d --build jevcalls-backend"
```

---

## 4. Operational & Diagnostic Commands

Run these on the VM or prepend with `ssh -i $env:USERPROFILE\.oci\jevcall_vm_key ubuntu@129.225.71.177 "..."`:

| Action | Command |
| :--- | :--- |
| **List Running Containers** | `sudo docker ps` |
| **Stream Live Backend Logs** | `sudo docker logs -f --tail 50 $(sudo docker ps -qf name=jevcalls-backend)` |
| **Check Local Port 8000 Health** | `curl -s http://localhost:8000/api/status` |
| **Check Hard Risk Gates** | `curl -s http://localhost:8000/api/risk/gates` |
| **Check Jev Decision Gate** | `curl -s http://localhost:8000/api/jev/decisions` |
| **Inspect Cloudflare Tunnel** | `ps aux \| grep cloudflared` |
| **Restart Cloudflare Tunnel** | `sudo systemctl restart cloudflared 2>/dev/null \|\| nohup cloudflared tunnel --url http://localhost:8000 > /tmp/tunnel.log 2>&1 &` |

---

## 5. Live Public Verification (from Local Machine)

Run from your local workstation terminal to confirm end-to-end functionality:

```powershell
# Test System Status:
curl.exe -s https://jevcall.cfd/api/status

# Test Authoritative Code Gates:
curl.exe -s https://jevcall.cfd/api/risk/gates

# Test TypeSafe System One (Jev 1.13) Decision Stream:
curl.exe -s https://jevcall.cfd/api/jev/decisions
```

---

## 6. Directory Structure on VM (`/opt/JevCalls-Core`)

```text
/opt/JevCalls-Core/
├── docker-compose.yml          # Services: jevcalls-backend & traefik
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── src/
│       ├── app.py              # FastAPI WebSocket gateway & endpoints
│       ├── config.py           # Pinned JEV_MODEL="jev-1.13.0" & risk gate params
│       ├── jev_decision_gate.py# TypeSafe System One typed scoring (Noul, Choice, Score)
│       ├── risk_manager.py     # Hard authoritative code gates & sizing (1% risk)
│       ├── engine.py           # Arithmetic facts calculation in Python
│       ├── simulator.py        # Order fills, structure stops, T1=1.5R BE+costs lock
│       ├── market_feed.py      # Upstox live feed integration
│       └── indicators.py       # CPR, Supertrend, VWAP, EMA math
```
