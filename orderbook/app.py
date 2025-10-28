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

def append_activity_file(entry: dict):
    try:
        with open(ACTIVITY_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:
        logger.error(f"Failed to write activity file: {e}")

# Configuration - you should move these to environment variables
# WEB3_PROVIDER = os.getenv("WEB3_PROVIDER", "https://your-ethereum-node.com")
TRADE_SETTLEMENT_CONTRACT_ADDRESS = os.getenv(
    "TRADE_SETTLE_CONTRACT_ADDRESS", "0x237458E2cF7593084Ae397a50166A275A3928bA7"
)

# Supported networks mapping. Each entry contains the RPC URL, the numeric
# chain id (used when building the CrossChainTradeData struct) and an optional
# per-network settlement contract address. Values can be overridden with
# environment variables for deployment.
SUPPORTED_NETWORKS = {
    "hedera": {
        # Hedera Hashio Testnet RPC
        "rpc": os.getenv("WEB3_PROVIDER_HEDERA", "https://testnet.hashio.io/api"),
        # Hedera Testnet chain id
        "chain_id": int(os.getenv("WEB3_CHAIN_ID_HEDERA", "296")),
        "contract_address": os.getenv(
            "TRADE_SETTLE_CONTRACT_ADDRESS_HEDERA", TRADE_SETTLEMENT_CONTRACT_ADDRESS
        ),
    },
    "polygon": {
        "rpc": os.getenv("WEB3_PROVIDER_POLYGON", "https://your-ethereum-node.com"),
        "chain_id": int(os.getenv("WEB3_CHAIN_ID_POLYGON", "0")),
        "contract_address": os.getenv(
            "TRADE_SETTLE_CONTRACT_ADDRESS_POLYGON", TRADE_SETTLEMENT_CONTRACT_ADDRESS
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

# Token address mapping - you should expand this
TOKEN_ADDRESSES = {
    # Align defaults with frontend/contracts.ts (Hedera Testnet deploys)
    "HBAR": os.getenv(
        "HBAR_TOKEN_ADDRESS", "0xA219e375D1F84A50273c93FaaF5EACD285bD9990"
    ),
    "USDT": os.getenv(
        "USDT_TOKEN_ADDRESS", "0x62bcF51859E23cc47ddc6C3144B045619476Be92"
    ),
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


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
