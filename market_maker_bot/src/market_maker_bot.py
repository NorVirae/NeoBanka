import asyncio
import logging
import aiohttp
import json

from pydantic import BaseModel
from typing import Optional
import os
from datetime import datetime
from web3 import Web3
from eth_account import Account
from lib.web3_client import Web3Client
from lib.web3_client import TRADE_SETTLEMENT_ABI as SETTLEMENT_ABI
from lib.web3_client import ERC20_ABI as ERC20_ABI

# Clear any existing handlers (useful if module reloaded)
root = logging.getLogger()
if root.handlers:
    root.handlers.clear()

LOG_FORMAT = (
    "%(asctime)s %(levelname)s " "[%(filename)s:%(lineno)d %(funcName)s] " "%(message)s"
)
# Use %(pathname)s instead of %(filename)s if you want full path
# e.g. "[%(pathname)s:%(lineno)d %(funcName)s]"

logging.basicConfig(level=logging.INFO, format=LOG_FORMAT, datefmt="%Y-%m-%d %H:%M:%S")
logger = logging.getLogger(__name__)


# Pydantic models for API requests
class BotCommand(BaseModel):
    action: str  # "start", "stop", "register", "cancel", "modify", "status"
    account: str
    base_asset: str
    quote_asset: str
    private_key: str
    side: str
    type: str
    bid_price: Optional[float] = None
    ask_price: Optional[float] = None
    quantity: Optional[float] = None
    order_id: Optional[int] = None
    spread_percentage: Optional[float] = 0.5  # Default 0.5% spread
    reference_price: Optional[float] = None  # Manual price override
    from_network: Optional[str] = None
    to_network: Optional[str] = None


class MarketMakerBot:
    def __init__(
        self,
        private_key,
        base_token_address=os.getenv(
            "BASE_TOKEN_ADDRESS", "0x8eFcF5c2DDDA6C1A63D8395965Ca6c0609CE32D5"
        ),
        quote_token_address=os.getenv(
            "QUOTE_TOKEN_ADDRESS", "0x54099052D0e04a5CF24e4c7c82eA693Fb25E0Bed"
        ),
        orderbook_api_url: str = os.getenv("MARKET_MAKER_API", "http://localhost:8001"),
        rpc_url: str = os.getenv("RPC_URL", "https://testnet.hashio.io/api"),
    ):

        # fetch settler contract address
        # ... existing code ...
        self.rpc_url = rpc_url
        self.api_url = orderbook_api_url
        self.running = False
        self.current_orders = {}  # Track active orders
        self.config = {}  # Bot configuration
        self.session = None
        self.update_task = None
        self.private_key = private_key
        self.base_token_address = base_token_address
        self.quote_token_address = quote_token_address
        self.networks_config = {}

    async def create(self):
        """Async constructor"""
        self.settler_contract_address = await self.fetch_settlement_address()
        await self.fetch_networks_config()
        return self

    async def approve_token_allowance(
        self, token_address: str, amount: float, spender: str
    ) -> bool:
        """
        Approve token allowance for the settler contract

        Args:
            token_address: The token contract address to approve
            amount: Amount to approve (will be converted to wei/token decimals)

        Returns:
            bool: True if approval successful, False otherwise
        """
        try:
            # Initialize Web3 (you may need to adjust RPC URL)
            w3 = Web3(Web3.HTTPProvider(self.rpc_url))  # Replace with your RPC

            if not w3.is_connected():
                logger.error("Failed to connect to Web3 provider")
                return False

            # Load account from private key
            account = Account.from_key(self.private_key)

            # Standard ERC20 ABI for approve function
            erc20_abi = [
                {
                    "constant": False,
                    "inputs": [
                        {"name": "_spender", "type": "address"},
                        {"name": "_value", "type": "uint256"},
                    ],
                    "name": "approve",
                    "outputs": [{"name": "", "type": "bool"}],
                    "type": "function",
                },
                {
                    "constant": True,
                    "inputs": [],
                    "name": "decimals",
                    "outputs": [{"name": "", "type": "uint8"}],
                    "type": "function",
                },
            ]

            # Create contract instance
            token_contract = w3.eth.contract(
                address=Web3.to_checksum_address(token_address), abi=erc20_abi
            )

            # Get token decimals
            try:
                decimals = token_contract.functions.decimals().call()
            except:
                decimals = 18  # Default to 18 if decimals call fails

            # Convert amount to token units (considering decimals)
            amount_in_units = int(amount * (10**decimals))

            # Build approve transaction
            approve_txn = token_contract.functions.approve(
                Web3.to_checksum_address(spender), amount_in_units
            ).build_transaction(
                {
                    "from": account.address,
                    "nonce": w3.eth.get_transaction_count(account.address),
                    "gas": 100000,  # Standard gas limit for approve
                    "gasPrice": w3.eth.gas_price,
                }
            )

            # Sign transaction
            signed_txn = w3.eth.account.sign_transaction(approve_txn, self.private_key)

            # Send transaction
            tx_hash = w3.eth.send_raw_transaction(signed_txn.raw_transaction)

            # Wait for confirmation
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=300)

            if receipt.status == 1:
                logger.info(
                    f"Token allowance approved: {amount} tokens for {token_address}"
                )
                logger.info(f"Transaction hash: {tx_hash.hex()}")
                return True
            else:
                logger.error(
                    f"Allowance approval failed. Transaction hash: {tx_hash.hex()}"
                )
                return False

        except Exception as e:
            logger.error(f"Error approving token allowance: {e}")
            return False
        
    async def stop_bot(self):
        """Stop the market making bot"""
        logger.info("Stopping bot...")
        self.running = False

        # Cancel bot background task
        if self.update_task:
            self.update_task.cancel()
            try:
                await self.update_task
            except asyncio.CancelledError:
                logger.info("update_task cancelled cleanly")
            except RuntimeError:
                # event loop closed while awaiting: ignore or log
                logger.warning("Event loop closed while awaiting update_task")

        # Clear and cancel existing orders
        for side, order in list(self.current_orders.items()):
            try:
                await self.cancel_order(order["orderId"], side)
            except Exception:
                logger.exception("Error canceling %s order during shutdown", side)

        self.current_orders = {}

        # Close aiohttp session
        try:
            await self.close_session()
        except Exception:
            logger.exception("Error while closing HTTP session")

        logger.info("Bot stopped")


    async def ensure_token_allowances(self):
        """
        Deprecated pre-approval. We now approve exact-needed amounts on the
        correct chain during ensure_escrow_balance_before_order.
        """
        logger.info("Skipping upfront token allowances; handled during escrow deposit")
        return True

    async def start_session(self):
        """Initialize HTTP session"""
        if not self.session:
            self.session = aiohttp.ClientSession()

    async def close_session(self):
        """Close HTTP session"""
        if self.session:
            await self.session.close()
            self.session = None

    async def send_request(
        self, endpoint: str, payload: dict = None, request_type: str = "post"
    ) -> dict:
        """Send request to orderbook API as JSON (application/json)."""
        if not self.session:
            await self.start_session()

        url = f"{self.api_url}/api/{endpoint}"

        try:
            if request_type.lower() == "post":
                # aiohttp will set Content-Type: application/json for us when using json=payload
                # Simple retry/backoff for 429/5xx
                for attempt in range(3):
                    async with self.session.post(url, json=payload) as response:
                        text = await response.text()
                        try:
                            result = json.loads(text) if text else {}
                        except Exception:
                            logger.warning("API returned non-JSON response", exc_info=True)
                            result = {"status_code": response.status, "message": text}

                        if response.status in (429, 500, 502, 503, 504):
                            wait = 1 * (2 ** attempt)
                            logger.warning("Orderbook %s error %s; retrying in %ss", endpoint, response.status, wait)
                            await asyncio.sleep(wait)
                            continue
                        return result
                # Final fallback
                return result

            elif request_type.lower() == "get":
                # For GET, send payload as query params if provided
                async with self.session.get(url, params=payload) as response:
                    text = await response.text()
                    try:
                        result = json.loads(text) if text else {}
                    except Exception:
                        logger.warning("API returned non-JSON response", exc_info=True)
                        result = {"status_code": response.status, "message": text}
                    return result

            else:
                logger.error("Unsupported request_type: %s", request_type)
                return {
                    "status_code": 0,
                    "message": f"Unsupported request_type: {request_type}",
                }

        except RuntimeError as re:
            # event loop closed / shutting down
            logger.warning("Event loop closed while sending API request: %s", re)
            return {"status_code": 0, "message": "Event loop closed"}
        except Exception:
            logger.exception("API request failed")
            return {"status_code": 0, "message": "API request failed"}

    async def fetch_networks_config(self) -> None:
        """Fetch networks configuration (rpc, chain_id, contract_address, tokens) from orderbook."""
        try:
            resp = await self.send_request("networks", request_type="get")
            if isinstance(resp, dict) and resp.get("status_code") == 200:
                nets = resp.get("networks") or {}
                if isinstance(nets, dict):
                    self.networks_config = nets
                    logger.info("Loaded networks config: %s", list(nets.keys()))
        except Exception:
            logger.exception("Failed to fetch networks config")

    def _resolve_token_address(self, symbol: str, network_key: str, fallback: str) -> str:
        try:
            symbol_up = (symbol or "").upper()
            net = (self.networks_config or {}).get(network_key or "") or {}
            tokens = net.get("tokens") or {}
            addr = tokens.get(symbol_up)
            return addr or fallback
        except Exception:
            return fallback

    def calculate_market_prices(self, reference_price: float, spread_percentage: float):
        """Calculate bid and ask prices based on reference price and spread"""
        spread = reference_price * (spread_percentage / 100)
        bid_price = reference_price - (spread / 2)
        ask_price = reference_price + (spread / 2)
        return round(bid_price, 6), round(ask_price, 6)

    async def get_market_reference_price(
        self, base_asset: str, quote_asset: str
    ) -> Optional[float]:
        """Get reference price from existing orderbook or use configured price"""
        try:
            bid_response = None
            if self.config["side"] == "bid":
                # Try to get best bid and ask to calculate mid price
                bid_response = await self.send_request(
                    "get_best_order",
                    {"baseAsset": base_asset, "quoteAsset": quote_asset, "side": "bid"},
                )
            else:
                ask_response = await self.send_request(
                    "get_best_order",
                    {"baseAsset": base_asset, "quoteAsset": quote_asset, "side": "ask"},
                )

            bid_price = None
            ask_price = None

            if bid_response.get("order") and bid_response["order"]["isValid"]:
                bid_price = bid_response["order"]["price"]

            if ask_response.get("order") and ask_response["order"]["isValid"]:
                ask_price = ask_response["order"]["price"]

            # Calculate mid price if both exist
            if bid_price and ask_price and bid_price > 0 and ask_price > 0:
                return (bid_price + ask_price) / 2
            elif bid_price and bid_price > 0:
                return bid_price * 1.001  # Slightly above best bid
            elif ask_price and ask_price > 0:
                return ask_price * 0.999  # Slightly below best ask

        except Exception as e:
            logger.error(f"Error getting market reference price: {e}")

        return None

    # approve order books settlement address spending
    # async def approve_settlement_address(self) -> Optional[bool]:

    async def place_order(
        self, side: str, price: float, quantity: float
    ) -> Optional[dict]:
        """Place a new order"""
        config = self.config
        # Ensure escrow has sufficient balance before hitting the orderbook
        try:
            ok = await self.ensure_escrow_balance_before_order(side, price, quantity)
            if not ok:
                logger.error("Escrow deposit failed or insufficient; aborting order placement")
                return None
        except Exception:
            logger.exception("Failed ensuring escrow before order placement")
            return None
        payload = {
            "account": config["account"],
            "baseAsset": config["base_asset"],
            "quoteAsset": config["quote_asset"],
            "privateKey": config["private_key"],
            "price": str(price),
            "quantity": str(quantity),
            "side": side,
            "type": config.get("type", "limit"),
            # Chains: include both camelCase and snake_case variants to match backend
            "fromNetwork": config.get("from_network", "hedera"),
            "toNetwork": config.get("to_network", "polygon"),
            "from_network": config.get("from_network", "hedera"),
            "to_network": config.get("to_network", "polygon"),
            # Receive wallet defaults to the same account
            "receive_wallet": config.get("receive_wallet", config["account"]),
            "receiveWallet": config.get("receive_wallet", config["account"]),
        }

        # await self.ensure_token_allowances()

        response = await self.send_request("register_order", payload)
        logger.info(response, payload)

        if response.get("status_code") == 1:
            order = response.get("order")
            if order:
                logger.info(
                    f"Placed {side} order: ID {order['orderId']}, Price {price}, Quantity {quantity}"
                )
                return order
        else:
            logger.error(
                f"Failed to place {side} order: {response.get('message', 'Unknown error')}"
            )

        return None

    async def ensure_escrow_balance_before_order(self, side: str, price: float, quantity: float) -> bool:
        """Ensure the bot has enough escrow for the order; deposit if needed.

        - For 'bid': needs quote asset amount = quantity * price
        - For 'ask': needs base asset amount = quantity
        """
        try:
            # Select correct chain by side
            from_net = (self.config.get("from_network") or "hedera").lower()
            to_net = (self.config.get("to_network") or "polygon").lower()
            if side == "ask":
                network_key = from_net
                symbol = self.config.get("base_asset")
            else:
                network_key = to_net
                symbol = self.config.get("quote_asset")

            # Resolve RPC and contract address for this network
            net_cfg = (self.networks_config or {}).get(network_key) or {}
            rpc_url = net_cfg.get("rpc") or self.rpc_url
            settlement_address = net_cfg.get("contract_address") or self.settler_contract_address

            w3 = Web3(Web3.HTTPProvider(rpc_url))
            if not w3.is_connected():
                logger.error("Web3 not connected for escrow checks")
                return False

            acct = Account.from_key(self.private_key)
            settlement = w3.eth.contract(address=Web3.to_checksum_address(settlement_address), abi=SETTLEMENT_ABI)

            # Determine token and required amount (resolve per-network token address)
            if side == "ask":
                token_addr_raw = self._resolve_token_address(symbol, network_key, self.base_token_address)
                required_amount_float = float(quantity)
            else:
                token_addr_raw = self._resolve_token_address(symbol, network_key, self.quote_token_address)
                required_amount_float = float(quantity) * float(price)

            token_address = Web3.to_checksum_address(token_addr_raw)

            # ERC20 instance
            token = w3.eth.contract(address=token_address, abi=ERC20_ABI)
            try:
                decimals = token.functions.decimals().call()
            except Exception:
                decimals = 18

            required_wei = int(required_amount_float * (10 ** decimals))

            # Read escrow balance
            total, available, locked = settlement.functions.checkEscrowBalance(acct.address, token_address).call()

            if int(available) >= required_wei:
                return True

            needed = required_wei - int(available)

            # Ensure allowance for needed
            try:
                allowance = token.functions.allowance(acct.address, settlement_address).call()
            except Exception:
                allowance = 0

            if int(allowance) < needed:
                # Approve exact needed (avoid MaxUint issues on some RPCs)
                approve_tx = token.functions.approve(settlement_address, needed).build_transaction({
                    "from": acct.address,
                    "nonce": w3.eth.get_transaction_count(acct.address),
                    "gas": 150000,
                    "gasPrice": w3.eth.gas_price,
                })
                signed = w3.eth.account.sign_transaction(approve_tx, self.private_key)
                txh = w3.eth.send_raw_transaction(signed.raw_transaction)
                w3.eth.wait_for_transaction_receipt(txh)

            # Deposit
            deposit_tx = settlement.functions.depositToEscrow(token_address, needed).build_transaction({
                "from": acct.address,
                "nonce": w3.eth.get_transaction_count(acct.address),
                "gas": 300000,
                "gasPrice": w3.eth.gas_price,
            })
            signed_dep = w3.eth.account.sign_transaction(deposit_tx, self.private_key)
            txh_dep = w3.eth.send_raw_transaction(signed_dep.raw_transaction)
            receipt = w3.eth.wait_for_transaction_receipt(txh_dep)
            if receipt.status != 1:
                logger.error("Escrow deposit transaction failed")
                return False

            # Optional: confirm updated escrow
            _, available2, _ = settlement.functions.checkEscrowBalance(acct.address, token_address).call()
            return int(available2) >= required_wei
        except Exception as e:
            logger.error(f"Error ensuring escrow balance: {e}")
            return False

    async def fetch_settlement_address(self) -> Optional[str]:
        """Fetch the settlement address from the API."""
        try:
            response = await self.send_request(
                "get_settlement_address", request_type="get"
            )

            # Make sure response is valid and contains the expected keys
            if not response or not isinstance(response, dict):
                print("Invalid response format:", response)
                return None

            # Check if the request failed
            if response.get("status_code", 0) != 200:
                print(
                    f"API request failed with status {response.get('status_code')}: {response.get('message')}"
                )
                return None

            # Extract settlement address safely
            data = response.get("data")
            if data and "settlement_address" in data:
                return data["settlement_address"]

            print("No settlement address found in response.")
            return None

        except Exception as e:
            print(f"Error fetching settlement address: {e}")
            return None

    async def get_gateio_price(
        self, base_asset: str, quote_asset: str
    ) -> Optional[float]:
        """Get current price from Gate.io API

        Args:
            base_asset: Base asset symbol (e.g., 'BTC')
            quote_asset: Quote asset symbol (e.g., 'USDT')

        Returns:
            Current price from Gate.io or None if failed
        """
        try:
            # Format symbol for Gate.io (they use underscore format)
            symbol = f"{base_asset.upper()}_{quote_asset.upper()}"

            # Gate.io API endpoint for ticker
            url = "https://api.gateio.ws/api/v4/spot/tickers"

            async with aiohttp.ClientSession() as session:
                # Get all tickers or specific ticker
                params = {"currency_pair": symbol}

                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()

                        if data and len(data) > 0:
                            ticker = data[0]

                            # Gate.io returns 'last' as the last traded price
                            last_price = float(ticker.get("last", 0))

                            # You can also use bid/ask for more precise pricing
                            highest_bid = float(ticker.get("highest_bid", 0))
                            lowest_ask = float(ticker.get("lowest_ask", 0))

                            # Use mid price if bid/ask available, otherwise last price
                            if highest_bid > 0 and lowest_ask > 0:
                                mid_price = (highest_bid + lowest_ask) / 2
                                logger.info(
                                    f"Gate.io mid price for {symbol}: {mid_price}"
                                )
                                return mid_price
                            elif last_price > 0:
                                logger.info(
                                    f"Gate.io last price for {symbol}: {last_price}"
                                )
                                return last_price
                            else:
                                logger.warning(
                                    f"No valid price data from Gate.io for {symbol}"
                                )
                                return None
                        else:
                            logger.warning(
                                f"No ticker data returned from Gate.io for {symbol}"
                            )
                            return None
                    else:
                        logger.error(
                            f"Gate.io API error: {response.status} - {await response.text()}"
                        )
                        return None

        except aiohttp.ClientError as e:
            logger.error(
                f"Network error fetching Gate.io price for {base_asset}_{quote_asset}: {e}"
            )
            return None
        except ValueError as e:
            logger.error(f"Error parsing Gate.io price data: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error fetching Gate.io price: {e}")
            return None

    async def cancel_order(self, order_id: int, side: str) -> bool:
        """Cancel an existing order"""
        config = self.config
        payload = {
            "orderId": order_id,
            "side": side,
            "baseAsset": config["base_asset"],
            "quoteAsset": config["quote_asset"],
        }

        response = await self.send_request("cancel_order", payload)

        if response.get("status_code") == 1:
            logger.info(f"Cancelled {side} order: ID {order_id}")
            return True
        else:
            logger.error(
                f"Failed to cancel {side} order {order_id}: {response.get('message', 'Unknown error')}"
            )
            return False

    async def update_orders(self, token_pair: str = None):
        """Update existing orders with new prices from Gate.io

        Args:
            token_pair: Optional token pair override (e.g., 'BTC_USDT')
        """
        if not self.config:
            return

        try:
            # Determine token pair
            if token_pair:
                # Parse provided token pair
                if "_" in token_pair:
                    base_asset, quote_asset = token_pair.split("_", 1)
                else:
                    logger.error(
                        f"Invalid token pair format: {token_pair}. Use format like 'BTC_USDT'"
                    )
                    return
            else:
                base_asset = self.config["base_asset"]
                quote_asset = self.config["quote_asset"]

            # Get reference price from Gate.io
            reference_price = self.config.get("reference_price")
            if not reference_price:
                reference_price = await self.get_gateio_price(base_asset, quote_asset)

            if not reference_price or reference_price <= 0:
                logger.warning(
                    "No valid reference price available from Gate.io, trying local orderbook"
                )
                reference_price = await self.get_market_reference_price(
                    base_asset, quote_asset
                )

            if not reference_price or reference_price <= 0:
                logger.warning("No valid reference price available, skipping update")
                return

            # Calculate new prices
            bid_price, ask_price = self.calculate_market_prices(
                reference_price, self.config.get("spread_percentage", 0.5)
            )

            quantity = self.config["quantity"]

            # Cancel existing orders and place new ones
            new_orders = {}

            # Handle bid order
            if "bid" in self.current_orders:
                await self.cancel_order(self.current_orders["bid"]["orderId"], "bid")

            if self.config["side"] == "bid":
                bid_order = await self.place_order("bid", bid_price, quantity)
                if bid_order:
                    new_orders["bid"] = bid_order

            # Handle ask order
            if "ask" in self.current_orders:
                await self.cancel_order(self.current_orders["ask"]["orderId"], "ask")

            if self.config["side"] == "ask":
                ask_order = await self.place_order("ask", ask_price, quantity)
                if ask_order:
                    new_orders["ask"] = ask_order

            # Update current orders
            self.current_orders = new_orders

            logger.info(
                f"Orders updated with Gate.io price - Bid: {bid_price}, Ask: {ask_price}, Reference: {reference_price}"
            )

        except Exception as e:
            logger.error(f"Error updating orders: {e}")

    async def run_bot(self):
        """Main bot loop - runs every 60 seconds"""
        logger.info("Market maker bot started")

        while self.running:
            try:
                token_pair = f"{self.config['base_asset']}_{self.config['quote_asset']}"
                await self.update_orders(token_pair)
                await asyncio.sleep(60)  # Wait 60 seconds
            except Exception as e:
                logger.error(f"Error in bot loop: {e}")
                await asyncio.sleep(10)  # Short wait before retry

    async def start_bot(self, config: dict):
        """Start the market making bot"""
        self.config = config
        await self.start_session()

        # Pre-approvals are handled dynamically during escrow deposit per network
        await self.ensure_token_allowances()

        self.running = True

        # Create the background task only if the loop is running
        try:
            loop = asyncio.get_running_loop()
            self.update_task = loop.create_task(self.run_bot())
        except RuntimeError:
            # No running loop — fallback to create_task which will also raise,
            # but we catch to provide a clearer message
            logger.exception("Failed to start background task — event loop not running")
            raise

        logger.info("Bot started with config: %s", config)

    def get_status(self) -> dict:
        """Get current bot status"""
        return {
            "running": self.running,
            "config": self.config,
            "current_orders": self.current_orders,
            "timestamp": datetime.now().isoformat(),
        }
