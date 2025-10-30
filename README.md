NeoBanka Monorepo
=================

pitch deck : https://neobanka-pitch.vercel.app/
certif

This repository contains three parts that work together:

- `orderbook`: FastAPI server implementing a cross-chain order book and settlement integration.
- `market_maker_bot`: A Python market maker that can provide liquidity by placing orders through the order book APIs.
- `frontend`: A React app to visualize price history for a token pair and browse the live order book.

What this project is about
--------------------------

NeoBanka is a prototype for cross-chain trading on Hedera and EVM chains. It includes:

- An in-memory matching engine (`orderbook/src`) with persistent trade tape for recent trade history
- Settlement integrations to smart contracts on Hedera (see `orderbook/smart_contract`)
- A reference market maker bot (`market_maker_bot`) to seed the book
- A React dashboard (`frontend`) that shows a price chart from the engine's trade tape and an order book snapshot by token pair

Quick start (under 10 minutes)
------------------------------

Prerequisites:

- Node.js 18+ and npm
- Python 3.10+

On Windows PowerShell, run the commands exactly as shown.

1) Start the Orderbook API
--------------------------

Open a terminal in `orderbook` and install/run:

```bash
cd orderbook
python -m venv .venv
. .venv/Scripts/Activate.ps1
pip install -r requirements.txt
# Start FastAPI server on http://localhost:8001
python app.py
```

Notes:
- Default settings allow CORS from the frontend.
- For read-only features (view order book, price chart), no on-chain keys are required.
- To place/settle orders, set env vars (see `orderbook/README.md`).

2) Start the React frontend
---------------------------

Open a second terminal at repo root and run:

```bash
cd frontend
npm install
# Optionally set a custom API URL or default symbol
# $env:VITE_API_BASE="http://localhost:8001"; $env:VITE_DEFAULT_SYMBOL="HBAR_USDT"
npm run dev
```

Visit http://localhost:5173 to view the dashboard.

You can change the token pair (e.g. `HBAR_USDT`) in the input and press Refresh. The chart will render price history from the engine, and the orderbook shows current bids and asks.

3) (Optional) Run the market maker bot
--------------------------------------

Open a third terminal:

```bash
cd market_maker_bot
python -m venv .venv
. .venv/Scripts/Activate.ps1
pip install -r requirements.txt
# See bot README for configuration and running instructions
python app.py
```

This will start placing demo orders against the orderbook API so you can see the chart and book fill up.

Frontend features
-----------------

- Price chart: Renders recent trade prices for a selected pair using `/api/trades`
- Orderbook snapshot: Displays current `asks` and `bids` via `/api/orderbook`
- Configurable API base: `VITE_API_BASE` (defaults to `http://localhost:8001`)
- Default symbol: `VITE_DEFAULT_SYMBOL` (defaults to `HBAR_USDT`)

If you want to persist config, create `frontend/.env`:

```bash
VITE_API_BASE=http://localhost:8001
VITE_DEFAULT_SYMBOL=HBAR_USDT
```

Orderbook API (used by the frontend)
------------------------------------

- POST `/api/orderbook` with `{ "symbol": "HBAR_USDT" }` → returns current book snapshot
- POST `/api/trades` with `{ "symbol": "HBAR_USDT", "limit": 200 }` → returns recent trades (time, price, quantity)
- GET `/api/get_settlement_address` → get current settlement contract address

Additional endpoints for registering/cancelling orders are documented in `orderbook/README.md` and the Postman collections in `orderbook/docs`.

Smart contracts (Hedera)
------------------------

All smart contract sources, deployment scripts, and docs are under `orderbook/smart_contract`:

- Overview and usage: `orderbook/smart_contract/README.md`
- Deployment scripts: `orderbook/smart_contract/scripts`
- Hardhat config: `orderbook/smart_contract/hardhat.config.ts`
- Latest testnet addresses: `orderbook/smart_contract/deployments.txt`

You can import the ABIs from:

- `orderbook/abis/settlement_abi.json`
- `orderbook/abis/ERC20_abi.json`

Repository layout
-----------------

```text
NeoBanka/
├─ frontend/                # React app (Vite + TS)
├─ orderbook/               # FastAPI orderbook + settlement client
│  ├─ app.py                # API entrypoint
│  ├─ helper/api_service.py # API logic (orderbook, trades, settlement health)
│  ├─ src/                  # Matching engine
│  └─ smart_contract/       # Hardhat project (contracts + scripts)
└─ market_maker_bot/        # Python market maker
```

Common issues
-------------

- Port in use: Change the frontend port in `frontend/vite.config.ts` or backend port via `PORT` env for FastAPI.
- CORS: FastAPI is configured to allow all origins. If you tighten it, add the frontend origin.
- No trades on chart: Place a few orders (or run the market maker) so the engine has trade tape to plot.

License
-------

MIT


