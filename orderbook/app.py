from fastapi import FastAPI, Form, Request
from fastapi.concurrency import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from typing import Optional

from dotenv import load_dotenv

# import asyncio
import logging
from helper.api_service import APIService

# Import the TradeSettlementClient
from src.trade_settlement_client import (
    SettlementClient,
    # AllowanceChecker,
    # AllowanceManager,
)
from helper.api_helper import APIHelper
import httpx
from collections import deque
import json

# Configure logging
root = logging.getLogger()
if root.handlers:
    root.handlers.clear()

LOG_FORMAT = (
    "%(asctime)s %(levelname)s " "[%(filename)s:%(lineno)d %(funcName)s] " "%(message)s"
)

logging.basicConfig(level=logging.INFO, format=LOG_FORMAT, datefmt="%Y-%m-%d %H:%M:%S")
logger = logging.getLogger(__name__)
load_dotenv()

order_books = {}  # Dictionary to store multiple order books, keyed by symbol
activity_log = deque(maxlen=1000)
ACTIVITY_LOG_PATH = os.getenv("ACTIVITY_LOG_PATH", "orderbook_activity.jsonl")
order_signatures = {}

def append_activity_file(entry: dict):
    try:
        with open(ACTIVITY_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:
        logger.error(f"Failed to write activity file: {e}")

# Configuration - you should move these to environment variables
# WEB3_PROVIDER = os.getenv("WEB3_PROVIDER", "https://your-ethereum-node.com")
TRADE_SETTLEMENT_CONTRACT_ADDRESS = os.getenv(
    "TRADE_SETTLE_CONTRACT_ADDRESS_HEDERA", "0x237458E2cF7593084Ae397a50166A275A3928bA7"
)

# Supported networks mapping. Each entry contains the RPC URL, the numeric
# chain id (used when building the CrossChainTradeData struct) and an optional
# per-network settlement contract address. Values can be overridden with
# environment variables for deployment.
SUPPORTED_NETWORKS = {
    "hedera": {
        "rpc": os.getenv("WEB3_PROVIDER_HEDERA", "https://testnet.hashio.io/api"),
        "chain_id": int(os.getenv("WEB3_CHAIN_ID_HEDERA", "296")),
        "contract_address": os.getenv(
            "TRADE_SETTLE_CONTRACT_ADDRESS_HEDERA", TRADE_SETTLEMENT_CONTRACT_ADDRESS
        ),
        "tokens": {
            "HBAR": os.getenv(
                "HEDERA_HBAR_TOKEN_ADDRESS", os.getenv("HBAR_TOKEN_ADDRESS", "0x66B8244b08be8F4Cec1A23C5c57A1d7b8A27189D")
            ),
            "USDT": os.getenv(
                "HEDERA_USDT_TOKEN_ADDRESS", os.getenv("USDT_TOKEN_ADDRESS", "0x62bcF51859E23cc47ddc6C3144B045619476Be92")
            ),
        },
    },
    "ethereum": {
        "rpc": os.getenv("WEB3_PROVIDER_ETHEREUM", "https://mainnet.infura.io/v3/YOUR_KEY"),
        "chain_id": int(os.getenv("WEB3_CHAIN_ID_ETHEREUM", "1")),
        "contract_address": os.getenv(
            "TRADE_SETTLE_CONTRACT_ADDRESS_ETHEREUM", TRADE_SETTLEMENT_CONTRACT_ADDRESS
        ),
    },
    "polygon": {
        "rpc": os.getenv("WEB3_PROVIDER_POLYGON", "https://polygon-rpc.com"),
        "chain_id": int(os.getenv("WEB3_CHAIN_ID_POLYGON", "137")),
        "contract_address": os.getenv(
            "TRADE_SETTLE_CONTRACT_ADDRESS_POLYGON", TRADE_SETTLEMENT_CONTRACT_ADDRESS
        ),
        "tokens": {
            # Defaults can be Amoy or your own deployments; override in env for mainnet/testnet
            "HBAR": os.getenv("POLYGON_HBAR_TOKEN_ADDRESS", "0x41086d277f8A183A351310eC89d1AA9Dc1e67B7B"),
            "USDT": os.getenv("POLYGON_USDT_TOKEN_ADDRESS", "0x750702AA1dE631277576602b780A38790c36E19e"),
        },
    },
    "bsc": {
        "rpc": os.getenv("WEB3_PROVIDER_BSC", "https://bsc-dataseed.binance.org"),
        "chain_id": int(os.getenv("WEB3_CHAIN_ID_BSC", "56")),
        "contract_address": os.getenv(
            "TRADE_SETTLE_CONTRACT_ADDRESS_BSC", TRADE_SETTLEMENT_CONTRACT_ADDRESS
        ),
    },
    "celo": {
        "rpc": os.getenv("WEB3_PROVIDER_CELO", "https://forno.celo.org"),
        "chain_id": int(os.getenv("WEB3_CHAIN_ID_CELO", "42220")),
        "contract_address": os.getenv(
            "TRADE_SETTLE_CONTRACT_ADDRESS_CELO", TRADE_SETTLEMENT_CONTRACT_ADDRESS
        ),
    },
    "base": {
        "rpc": os.getenv("WEB3_PROVIDER_BASE", "https://mainnet.base.org"),
        "chain_id": int(os.getenv("WEB3_CHAIN_ID_BASE", "8453")),
        "contract_address": os.getenv(
            "TRADE_SETTLE_CONTRACT_ADDRESS_BASE", TRADE_SETTLEMENT_CONTRACT_ADDRESS
        ),
    },
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.error("SHOULD RUN ON STARTUP!")
    api_service.register_startup_event(
        WEB3_PROVIDER=SUPPORTED_NETWORKS["hedera"]["rpc"],
        TRADE_SETTLEMENT_CONTRACT_ADDRESS=TRADE_SETTLEMENT_CONTRACT_ADDRESS,
        PRIVATE_KEY=PRIVATE_KEY,
    )
    yield


app = FastAPI(lifespan=lifespan)


api_service = APIService()
# Add CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Global settlement client - initialize on startup
settlement_client: Optional[SettlementClient] = None
# allowance_checker: Optional[AllowanceChecker] = None
# allowance_manager: Optional[AllowanceManager] = None


PRIVATE_KEY = os.getenv("PRIVATE_KEY")  # Should be loaded securely
try:
    CONTRACT_ABI = APIHelper.load_abi("orderbook/settlement_abi.json")
except Exception:
    CONTRACT_ABI = []  # fallback

# Legacy token mapping (kept for compatibility); prefer SUPPORTED_NETWORKS[net]["tokens"]
TOKEN_ADDRESSES = {
    "HBAR": os.getenv("HBAR_TOKEN_ADDRESS", SUPPORTED_NETWORKS["hedera"]["tokens"]["HBAR"]),
    "USDT": os.getenv("USDT_TOKEN_ADDRESS", SUPPORTED_NETWORKS["hedera"]["tokens"]["USDT"]),
}


print(SUPPORTED_NETWORKS, "SUPPORTED NETWORKS IN APP.PY")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global settlement_client
    logger.error("SHOULD RUN ON STARTUP!")
    settlement_client = api_service.register_startup_event(
        WEB3_PROVIDER=SUPPORTED_NETWORKS["hedera"]["rpc"],
        TRADE_SETTLEMENT_CONTRACT_ADDRESS=TRADE_SETTLEMENT_CONTRACT_ADDRESS,
        PRIVATE_KEY=PRIVATE_KEY,
    )
    yield


@app.post("/api/register_order")
async def register_order(request: Request):
    logger.info("Got here")
 
    settlement_client = SettlementClient(
        web3_provider=SUPPORTED_NETWORKS["hedera"]["rpc"],
        contract_address=TRADE_SETTLEMENT_CONTRACT_ADDRESS,
        private_key=PRIVATE_KEY,
    )
    return await api_service.register_order(
        request=request,
        order_books=order_books,
        WEB3PROVIDER=SUPPORTED_NETWORKS["hedera"]["rpc"],
        TOKEN_ADDRESSES=TOKEN_ADDRESSES,
        SUPPORTED_NETWORKS=SUPPORTED_NETWORKS,
        TRADE_SETTLEMENT_CONTRACT_ADDRESS=TRADE_SETTLEMENT_CONTRACT_ADDRESS,
        CONTRACT_ABI=CONTRACT_ABI,
        PRIVATE_KEY=PRIVATE_KEY,
        settlement_client=settlement_client,
        activity_log=activity_log,
        activity_file_path=ACTIVITY_LOG_PATH,
        append_file=append_activity_file,
        order_signatures=order_signatures,
    )


@app.post("/api/cancel_order")
async def cancel_order(request: Request):
    return await api_service.cancel_order(
        request,
        order_books=order_books,
        activity_log=activity_log,
        activity_file_path=ACTIVITY_LOG_PATH,
        append_file=append_activity_file,
    )


@app.post("/api/order")
async def get_order(payload: str = Form(...)):
    return await api_service.get_order(payload=payload, order_books=order_books)


@app.post("/api/orderbook")
async def get_orderbook(request: Request):
    return await api_service.get_orderbook(request=request, order_books=order_books)


@app.post("/api/trades")
async def get_trades(request: Request):
    return await api_service.get_trades(request=request, order_books=order_books)


@app.get("/api/get_settlement_address")
async def get_settlement_address():
    return api_service.get_settlement_address(
        TRADE_SETTLEMENT_CONTRACT_ADDRESS=TRADE_SETTLEMENT_CONTRACT_ADDRESS
    )


@app.get("/api/networks")
async def get_networks():
    try:
        # Return a JSON-serializable view of supported networks (safe subset)
        def _filter(net: dict):
            if not isinstance(net, dict):
                return {}
            return {
                "rpc": net.get("rpc"),
                "chain_id": net.get("chain_id"),
                "contract_address": net.get("contract_address"),
                "tokens": net.get("tokens", {}),
            }

        data = {k: _filter(v) for k, v in SUPPORTED_NETWORKS.items()}
        return {
            "status_code": 200,
            "message": "Supported networks",
            "networks": data,
        }
    except Exception as e:
        logger.error(f"Failed to get networks: {e}")
        return {"status_code": 0, "message": str(e)}


@app.post("/api/check_available_funds")
async def check_available_funds(payload: str = Form(...)):
    return api_service.check_available_funds(
        order_books=order_books, payload=payload
    )


# Price proxy to avoid CORS from frontend
@app.get("/api/price")
async def get_price(currency_pair: str):
    url = f"https://api.gateio.ws/api/v4/spot/tickers?currency_pair={currency_pair}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url, headers={"Accept": "application/json"})
            r.raise_for_status()
            # Pass-through JSON
            return r.json()
    except httpx.HTTPError as e:
        logger.error(f"Price proxy error: {e}")
        return {"error": "failed_to_fetch_price", "details": str(e)}

# Candlestick proxy (Gate.io)
@app.get("/api/kline")
async def get_kline(currency_pair: str, interval: str = "1h", limit: int = 200):
    url = (
        "https://api.gateio.ws/api/v4/spot/candlesticks"
        f"?currency_pair={currency_pair}&interval={interval}&limit={limit}"
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url, headers={"Accept": "application/json"})
            r.raise_for_status()
            return r.json()
    except httpx.HTTPError as e:
        logger.error(f"Kline proxy error: {e}")
        return {"error": "failed_to_fetch_kline", "details": str(e)}

@app.get("/api/order_history")
async def order_history(symbol: str | None = None, limit: int = 200):
    try:
        if not os.path.exists(ACTIVITY_LOG_PATH):
            return {"status_code": 1, "history": []}
        items = []
        with open(ACTIVITY_LOG_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                t = obj.get("type")
                if t not in ("order_placed", "order_cancelled", "trade_executed"):
                    continue
                if symbol and obj.get("symbol") != symbol:
                    continue
                items.append(obj)
        if limit > 0:
            items = items[-limit:]
        return {"status_code": 1, "count": len(items), "history": items}
    except Exception as e:
        logger.error(f"order_history error: {e}")
        return {"status_code": 0, "message": str(e)}

# Add a health check endpoint for the settlement system
@app.get("/api/settlement_health")
async def settlement_health():
    return await api_service.settlement_health(
        settlement_client=settlement_client,
        TRADE_SETTLEMENT_CONTRACT_ADDRESS=TRADE_SETTLEMENT_CONTRACT_ADDRESS,
    )


@app.post("/api/settle_trades")
async def settle_trades(request: Request):
    return await api_service.settle_trades(
        request=request,
        SUPPORTED_NETWORKS=SUPPORTED_NETWORKS,
        TRADE_SETTLEMENT_CONTRACT_ADDRESS=TRADE_SETTLEMENT_CONTRACT_ADDRESS,
        CONTRACT_ABI=CONTRACT_ABI,
        PRIVATE_KEY=PRIVATE_KEY,
        TOKEN_ADDRESSES=TOKEN_ADDRESSES,
        settlement_client=settlement_client,
    )


@app.post("/api/faucet")
async def faucet(request: Request):
    try:
        payload = await APIHelper.handlePayloadJson(request)
        to = payload.get("to")
        asset = (payload.get("asset") or "HBAR").upper()
        network = (payload.get("network") or "hedera").lower()
        amount = float(payload.get("amount") or 100)
        if not to:
            return {"status_code": 0, "message": "missing 'to'"}
        net = SUPPORTED_NETWORKS.get(network)
        if not net:
            return {"status_code": 0, "message": f"unknown network {network}"}
        token_addr = (net.get("tokens") or {}).get(asset)
        if not token_addr:
            return {"status_code": 0, "message": f"token not configured for {asset} on {network}"}

        client = SettlementClient(net.get("rpc"), net.get("contract_address"), PRIVATE_KEY)
        # Default decimals: HBAR 18, USDT 6 in our setup
        decimals = 18 if asset == "HBAR" else 6
        res = client.mint_token(token_addr, to, amount, token_decimals=decimals)
        return {"status_code": 1 if res.get("success") else 0, "result": res}
    except Exception as e:
        return {"status_code": 0, "message": str(e)}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
