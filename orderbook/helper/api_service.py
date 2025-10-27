from decimal import Decimal
import json
import logging
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from helper.api_helper import APIHelper
from src.trade_settlement_client import SettlementClient
from src import OrderBook

# from src.trade_settlement_client import AllowanceChecker, TradeSettlementClient

root = logging.getLogger()
if root.handlers:
    root.handlers.clear()

LOG_FORMAT = (
    "%(asctime)s %(levelname)s " "[%(filename)s:%(lineno)d %(funcName)s] " "%(message)s"
)

logging.basicConfig(level=logging.INFO, format=LOG_FORMAT, datefmt="%Y-%m-%d %H:%M:%S")
logger = logging.getLogger(__name__)


class APIService:
    def __init__(self):
        pass

    def register_startup_event(
        self, WEB3_PROVIDER, TRADE_SETTLEMENT_CONTRACT_ADDRESS, PRIVATE_KEY
    ) -> SettlementClient:
        """Initialize settlement client on startup"""
        global settlement_client, allowance_checker, allowance_manager

        # CONTRACT_ABI = APIHelper.load_abi("orderbook/settlement_abi.json")
        # print(CONTRACT_ABI)

        try:
            settlement_client = SettlementClient(
                WEB3_PROVIDER,
                TRADE_SETTLEMENT_CONTRACT_ADDRESS,
                PRIVATE_KEY,
            )

            # allowance_checker = AllowanceChecker(WEB3_PROVIDER)
            logger.info("Settlement client initialized successfully")
            return settlement_client
        except Exception as e:
            logger.error(f"Failed to initialize settlement client: {e}")
            # You might want to exit here if settlement is critical

    async def register_order(
        self,
        request: Request,
        order_books,
        WEB3PROVIDER,
        TOKEN_ADDRESSES,
        SUPPORTED_NETWORKS,
        settlement_client,
        TRADE_SETTLEMENT_CONTRACT_ADDRESS=None,
        CONTRACT_ABI=None,
        PRIVATE_KEY=None,
    ):
        logger.info("GOT HERE")
        try:
            payload_json = await APIHelper.handlePayloadJson(request)

            # payload_json = json.loads(payload)
            symbol = "%s_%s" % (payload_json["baseAsset"], payload_json["quoteAsset"])

            # Step 1: Validate order prerequisites (balance and allowance)
            logger.info(f"Validating prerequisites for order: {payload_json}")
            validation_result = await APIHelper.validate_order_prerequisites(
                order_data=payload_json,
                settlement_client=settlement_client,
                WEB3_PROVIDER=WEB3PROVIDER,
                TOKEN_ADDRESSES=TOKEN_ADDRESSES,
            )

            if not validation_result["valid"]:
                logger.warning(f"Order validation failed: {validation_result}")
                return JSONResponse(
                    content={
                        "message": "Order validation failed",
                        "errors": validation_result.get("errors", []),
                        "validation_details": validation_result.get("checks", {}),
                        "status_code": 0,
                    },
                    status_code=400,
                )

            logger.info(f"Order validation passed: {validation_result['checks']}")

            # Step 2: Process the order in the order book
            if symbol not in order_books:
                order_books[symbol] = OrderBook()

            order_book = order_books[symbol]

            _order = {
                "type": payload_json.get("type", "limit"),
                "trade_id": payload_json["account"],
                "from_network": payload_json["from_network"],
                "to_network": payload_json["to_network"],
                "receive_wallet": payload_json.get("receive_wallet")
                or payload_json.get("receiveWallet"),
                "account": payload_json["account"],
                "price": Decimal(payload_json["price"]),
                "quantity": Decimal(payload_json["quantity"]),
                "side": payload_json["side"],
                "baseAsset": payload_json["baseAsset"],
                "quoteAsset": payload_json["quoteAsset"],
                "private_key": payload_json["privateKey"],
            }

            process_result = order_book.process_order(_order, False, False)

            # This is the Failure case
            if not process_result["success"]:
                return JSONResponse(
                    content={"message": process_result["data"], "status_code": 0},
                    status_code=400,
                )

            trades, order, task_id, next_best_order = process_result["data"]

            if order is None:
                order = _order.copy()
                order["order_id"] = 1

            assert order is not None

            # Convert trades to the expected format
            converted_trades = []
            for trade in trades:
                party1 = [
                    trade["party1"][0],
                    trade["party1"][1],
                    int(trade["party1"][2]) if trade["party1"][2] is not None else None,
                    (
                        float(trade["party1"][3])
                        if trade["party1"][3] is not None
                        else None
                    ),
                    trade["party1"][4],
                    # source network for party1
                    trade["party1"][5] if len(trade["party1"]) > 5 else None,
                    # destination network for party1
                    trade["party1"][6] if len(trade["party1"]) > 6 else None,
                    # receive wallet on destination chain for party1
                    trade["party1"][7] if len(trade["party1"]) > 7 else None,
                ]
                party2 = [
                    trade["party2"][0],
                    trade["party2"][1],
                    int(trade["party2"][2]) if trade["party2"][2] is not None else None,
                    (
                        float(trade["party2"][3])
                        if trade["party2"][3] is not None
                        else None
                    ),
                    trade["party2"][4],
                    # source network for party2 (where their assets originate)
                    trade["party2"][5] if len(trade["party2"]) > 5 else None,
                    # destination network for party2
                    trade["party2"][6] if len(trade["party2"]) > 6 else None,
                    # receive wallet on destination chain for party2
                    trade["party2"][7] if len(trade["party2"]) > 7 else None,
                ]

                converted_trade = {
                    "timestamp": int(trade["timestamp"]),
                    "price": float(trade["price"]),
                    "quantity": float(trade["quantity"]),
                    "time": int(trade["time"]),
                    "party1": party1,
                    "party2": party2,
                }
                converted_trades.append(converted_trade)

            # Convert order to a serializable format
            order_dict = {
                "orderId": int(order["order_id"]),
                "account": order["account"],
                "price": float(order["price"]),
                "quantity": float(order["quantity"]),
                "side": order["side"],
                "baseAsset": order["baseAsset"],
                "quoteAsset": order["quoteAsset"],
                "trade_id": order["trade_id"],
                "trades": converted_trades,
                "isValid": True if order["order_id"] != 0 else True,
                "timestamp": order["timestamp"],
            }

            next_best_order_dict = None
            if next_best_order is not None:
                next_best_order_dict = {
                    "orderId": int(next_best_order.order_id),
                    "account": next_best_order.account,
                    "price": float(next_best_order.price),
                    "quantity": float(next_best_order.quantity),
                    "side": next_best_order.side,
                    "baseAsset": next_best_order.baseAsset,
                    "quoteAsset": next_best_order.quoteAsset,
                    "trade_id": next_best_order.trade_id,
                    "trades": [],
                    "isValid": True if next_best_order.order_id != 0 else True,
                    "timestamp": next_best_order.timestamp,
                }

            # Step 3: Settle trades if any exist
            settlement_info = {"settled": False}
            if converted_trades:
                logger.info(f"Attempting to settle {len(converted_trades)} trade(s)")
                # pass supported networks and settlement contract details into the helper
                # Enforce client-signed signatures: require client-provided signatures and do not fall back to server demo signatures
                settlement_info = await APIHelper.settle_trades_if_any(
                    order_dict,
                    SUPPORTED_NETWORKS,
                    TRADE_SETTLEMENT_CONTRACT_ADDRESS,
                    CONTRACT_ABI,
                    PRIVATE_KEY,
                    TOKEN_ADDRESSES,
                    REQUIRE_CLIENT_SIGNATURES=True,
                )
                logger.info(f"Settlement result: {settlement_info}")

            logger.info(
                f"Order processed successfully with {len(converted_trades)} trades"
            )

            return JSONResponse(
                content={
                    "message": "Order registered successfully",
                    "order": order_dict,
                    "nextBest": next_best_order_dict,
                    "taskId": task_id,
                    "validation_details": validation_result.get("checks", {}),
                    "settlement_info": settlement_info,
                    "status_code": 1,
                },
                status_code=200,
            )

        except Exception as e:
            logger.error(f"Error in register_order: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    async def cancel_order(self, request: Request, order_books):
        try:
            payload_json = await APIHelper.handlePayloadJson(request)
            order_id = payload_json["orderId"]
            side = payload_json["side"]
            symbol = "%s_%s" % (payload_json["baseAsset"], payload_json["quoteAsset"])

            order_book = order_books[symbol]
            order = (
                order_book.bids.get_order(order_id)
                if order_id in order_book.bids.order_map
                else order_book.asks.get_order(order_id)
            )
            order_book.cancel_order(side, order_id)

            # Convert order to a serializable format
            order_dict = {
                "orderId": int(order_id),
                "account": order.account,
                "price": float(order.price),
                "quantity": float(order.quantity),
                "side": order.side,
                "baseAsset": order.baseAsset,
                "quoteAsset": order.quoteAsset,
                "trade_id": order.trade_id,
                "trades": [],
                "isValid": False,
                "timestamp": order.timestamp,
            }

            return JSONResponse(
                content={
                    "message": "Order cancelled successfully",
                    "order": order_dict,
                    "status_code": 1,
                }
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    def get_order(self, payload: str, order_books):
        try:
            payload_json = json.loads(payload)
            order_id = payload_json["orderId"]

            order = None
            for symbol, order_book in order_books.items():
                if (
                    order_id in order_book.bids.order_map
                    or order_id in order_book.asks.order_map
                ):
                    order = (
                        order_book.bids.get_order(order_id)
                        if order_id in order_book.bids.order_map
                        else order_book.asks.get_order(order_id)
                    )

            if order is not None:
                order_dict = {
                    "orderId": (
                        int(order.order_id) if order.order_id is not None else None
                    ),
                    "account": order.account,
                    "price": float(order.price),
                    "quantity": float(order.quantity),
                    "side": order.side,
                    "baseAsset": order.baseAsset,
                    "quoteAsset": order.quoteAsset,
                    "trade_id": order.trade_id,
                    "trades": [],
                    "isValid": True if order.order_id is not None else False,
                    "timestamp": order.timestamp,
                }

                return JSONResponse(
                    content={
                        "message": "Order retrieved successfully",
                        "order": order_dict,
                        "status_code": 1,
                    }
                )
            else:
                return JSONResponse(
                    content={
                        "message": "Order not found",
                        "order": None,
                        "status_code": 0,
                    }
                )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    async def get_orderbook(self, request: Request, order_books):
        try:
            payload_json = await APIHelper.handlePayloadJson(request)

            symbol = payload_json["symbol"]

            if symbol not in order_books:
                order_book = OrderBook()
                order_books[symbol] = order_book
            else:
                order_book = order_books[symbol]

            result = order_book.get_orderbook(payload_json["symbol"])

            return JSONResponse(
                content={
                    "message": "Order book retrieved successfully",
                    "orderbook": result,
                    "status_code": 1,
                }
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    def get_settlement_address(self, TRADE_SETTLEMENT_CONTRACT_ADDRESS):
        try:
            if not TRADE_SETTLEMENT_CONTRACT_ADDRESS:
                raise "Trade settlement address not set"
            return JSONResponse(
                content={
                    "status_code": 200,
                    "message": "Settlement Address",
                    "data": {"settlement_address": TRADE_SETTLEMENT_CONTRACT_ADDRESS},
                }
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    def check_available_funds(self, order_books, payload):
        try:
            payload_json = json.loads(payload)
            account = payload_json["account"]
            asset = payload_json["asset"]

            # Calculate total locked funds across all order books
            total_locked_amount = Decimal("0")

            # Iterate through all order books
            for symbol, order_book in order_books.items():
                # Check if this order book involves the asset we're looking for
                base_asset, quote_asset = symbol.split("_")

                # Check bids (buying orders)
                if quote_asset == asset:  # If quote asset matches, check bids
                    for order_id, order in order_book.bids.order_map.items():
                        if order["account"].lower() == account.lower():
                            # For bids, the locked amount is price * quantity in quote asset
                            locked_amount = order["price"] * order["quantity"]
                            total_locked_amount += locked_amount

                # Check asks (selling orders)
                if base_asset == asset:  # If base asset matches, check asks
                    for order_id, order in order_book.asks.order_map.items():
                        if order["account"].lower() == account.lower():
                            # For asks, the locked amount is just the quantity in base asset
                            total_locked_amount += order["quantity"]

            return JSONResponse(
                content={
                    "message": "Available funds checked successfully",
                    "account": account,
                    "asset": asset,
                    "lockedAmount": float(total_locked_amount),
                    "status_code": 1,
                }
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    # Add a health check endpoint for the settlement system
    async def settlement_health(
        self, settlement_client, TRADE_SETTLEMENT_CONTRACT_ADDRESS
    ):
        """Check if settlement system is operational"""
        try:
            if not settlement_client:
                return JSONResponse(
                    content={
                        "status": "unhealthy",
                        "message": "Settlement client not initialized",
                        "web3_connected": False,
                    },
                    status_code=503,
                )

            # Check if web3 is connected
            web3_connected = settlement_client.web3.isConnected()

            return JSONResponse(
                content={
                    "status": "healthy" if web3_connected else "degraded",
                    "message": (
                        "Settlement system operational"
                        if web3_connected
                        else "Web3 connection issues"
                    ),
                    "web3_connected": web3_connected,
                    "contract_address": TRADE_SETTLEMENT_CONTRACT_ADDRESS,
                },
                status_code=200 if web3_connected else 503,
            )
        except Exception as e:
            return JSONResponse(
                content={
                    "status": "unhealthy",
                    "message": f"Settlement health check failed: {str(e)}",
                    "web3_connected": False,
                },
                status_code=503,
            )

    async def check_escrow_balance(self, request: Request):
        """Check escrow balance for a user"""
        try:
            payload_json = await APIHelper.handlePayloadJson(request)

            user_address = payload_json["userAddress"]
            token_address = payload_json["tokenAddress"]

            balance = settlement_client.check_escrow_balance(
                user_address,
                token_address,
                token_decimals=payload_json.get("decimals", 18),
            )

            return JSONResponse(
                content={
                    "message": "Balance retrieved successfully",
                    "balance": balance,
                    "status_code": 1,
                }
            )
        except Exception as e:
            logger.error(f"Error checking escrow balance: {e}")
            raise HTTPException(status_code=500, detail=str(e))
