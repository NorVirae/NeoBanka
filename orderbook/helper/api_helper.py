from fastapi import HTTPException, Request
import json

from dotenv import load_dotenv

# import asyncio
import logging

from src.trade_settlement_client import SettlementClient

# Import the TradeSettlementClient
# from orderbook.trade_settlement_client import (
#     AllowanceManager,
# )

# Configure logging
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
load_dotenv()


class APIHelper:

    @staticmethod
    def get_token_address(symbol: str, TOKEN_ADDRESSES: dict) -> str:
        """Get token address from symbol"""
        token_address = TOKEN_ADDRESSES.get(symbol.upper(), symbol)
        print(token_address, "TOKEN_ADDRESS")
        return token_address

    @staticmethod
    def load_abi(abi_path):
        """Load ABI from relative path and return it"""
        with open(abi_path, "r") as f:
            data = json.load(f)
        return data["abi"] if isinstance(data, dict) and "abi" in data else data

    @staticmethod
    async def validate_order_prerequisites(
        order_data: dict,
        settlement_client: SettlementClient,
        WEB3_PROVIDER: str,
        TOKEN_ADDRESSES: dict,
    ) -> dict:
        """
        Validate that user has sufficient escrow balance and locked funds for the order
        """
        results = {"valid": True, "errors": [], "checks": {}}

        try:
            account = order_data["account"]
            side = order_data["side"]
            quantity = float(order_data["quantity"])
            price = float(order_data["price"])

            # Get token addresses
            base_asset = APIHelper.get_token_address(
                order_data["baseAsset"], TOKEN_ADDRESSES
            )
            quote_asset = APIHelper.get_token_address(
                order_data["quoteAsset"], TOKEN_ADDRESSES
            )

            if side.lower() == "ask":
                # Seller needs base asset in escrow
                required_amount = quantity
                token_to_check = base_asset
            else:  # bid
                # Buyer needs quote asset in escrow
                required_amount = quantity * price
                token_to_check = quote_asset


            print(settlement_client, "SETTLEMENT CLIENT")

            # Check escrow balance
            balance_info = settlement_client.check_escrow_balance(
                account, token_to_check
            )

            available = balance_info.get("available", 0)

            results["checks"] = {
                "account": account,
                "side": side,
                "token": token_to_check,
                "required_amount": required_amount,
                "available_escrow": available,
                "total_escrow": balance_info.get("total", 0),
                "locked_escrow": balance_info.get("locked", 0),
            }

            if available < required_amount:
                results["valid"] = False
                results["errors"].append(
                    f"Insufficient available escrow balance. Required: {required_amount}, Available: {available}"
                )

            return results

        except Exception as e:
            logger.error(f"Error validating prerequisites: {e}")
            results["valid"] = False
            results["errors"].append(f"Validation error: {str(e)}")
            return results

    @staticmethod
    def create_trade_signature_for_user(
        party_addr: str,
        order_id: int,
        base_asset: str,
        quote_asset: str,
        price: int,
        quantity: int,
        side: str,
        timestamp: int,
        nonce: int,
        settlement_client,
    ) -> str:
        """Create a signature for a party (in production, this would be done client-side)"""
        try:
            # This is a simplified version - in production, each party would sign their own order
            # You'll need to implement proper signature generation or have users sign on the frontend

            # For now, return a placeholder signature that indicates signature is needed
            # The actual signature would be created using the party's private key]
            return settlement_client.create_trade_signature(
                party_addr,
                order_id,
                base_asset,
                quote_asset,
                price,
                quantity,
                side,
                timestamp,
                nonce,
            )
            # return "0x" + "0" * 130  # Placeholder - replace with actual signature logic

        except Exception as e:
            logger.error(f"Error creating signature: {e}")
            return ""

    @staticmethod
    async def settle_trades_if_any(
        order_dict: dict,
        SUPPORTED_NETWORKS: dict,
        TRADE_SETTLEMENT_CONTRACT_ADDRESS: str,
        CONTRACT_ABI: list,
        PRIVATE_KEY: str,
        TOKEN_ADDRESSES: dict,
        settlement_client: SettlementClient,
        REQUIRE_CLIENT_SIGNATURES: bool = False,
    ) -> dict:
        """
        Settle cross-chain trades using the new settlement contract.
        Handles both source and destination chain settlements.
        """
        if not order_dict.get("trades"):
            return {"settled": False, "reason": "No trades to settle"}

        settlement_results = []

        try:
            # Import SettlementClient
            
            
            for trade in order_dict["trades"]:
                # Extract party information
                party1_addr = trade["party1"][0]
                party1_side = trade["party1"][1]
                party1_priv_key = trade["party1"][4]
                party1_from_network = trade["party1"][5] if len(trade["party1"]) > 5 else None
                party1_to_network = trade["party1"][6] if len(trade["party1"]) > 6 else None
                party1_receive_wallet = trade["party1"][7] if len(trade["party1"]) > 7 else party1_addr

                party2_addr = trade["party2"][0]
                party2_side = trade["party2"][1]
                party2_priv_key = trade["party2"][4]
                party2_from_network = trade["party2"][5] if len(trade["party2"]) > 5 else None
                party2_to_network = trade["party2"][6] if len(trade["party2"]) > 6 else None
                party2_receive_wallet = trade["party2"][7] if len(trade["party2"]) > 7 else party2_addr

                # Resolve network configurations
                source_network_cfg = SUPPORTED_NETWORKS.get(party1_from_network)
                dest_network_cfg = SUPPORTED_NETWORKS.get(party2_from_network)

                if not source_network_cfg or not dest_network_cfg:
                    settlement_results.append({
                        "trade": trade,
                        "settlement_result": {
                            "success": False,
                            "error": "Network configuration not found"
                        }
                    })
                    continue

                # Get contract addresses and RPCs
                source_rpc = source_network_cfg.get("rpc")
                dest_rpc = dest_network_cfg.get("rpc")
                source_contract = source_network_cfg.get("contract_address", TRADE_SETTLEMENT_CONTRACT_ADDRESS)
                dest_contract = dest_network_cfg.get("contract_address", TRADE_SETTLEMENT_CONTRACT_ADDRESS)
                source_chain_id = source_network_cfg.get("chain_id")
                dest_chain_id = dest_network_cfg.get("chain_id")

                # Create clients for both chains (using matching engine key)
                client_source = SettlementClient(source_rpc, source_contract, PRIVATE_KEY)
                client_dest = SettlementClient(dest_rpc, dest_contract, PRIVATE_KEY)

                # Get token addresses
                base_token = APIHelper.get_token_address(order_dict["baseAsset"], TOKEN_ADDRESSES)
                quote_token = APIHelper.get_token_address(order_dict["quoteAsset"], TOKEN_ADDRESSES)

                # Get nonces
                nonce1 = client_source.get_user_nonce(party1_addr, base_token)
                nonce2 = client_dest.get_user_nonce(party2_addr, base_token)

                # Trade parameters
                order_id = str(order_dict["orderId"])
                price = float(trade["price"])
                quantity = float(trade["quantity"])
                timestamp = int(trade["timestamp"])

                # Get or create signatures
                sig1 = trade.get("signature1") or (trade["party1"][8] if len(trade["party1"]) > 8 else None)
                sig2 = trade.get("signature2") or (trade["party2"][8] if len(trade["party2"]) > 8 else None)

                # Create signatures if not provided (demo mode)
                if not sig1:
                    if REQUIRE_CLIENT_SIGNATURES:
                        settlement_results.append({
                            "trade": trade,
                            "settlement_result": {"success": False, "error": "Missing client signature for party1"}
                        })
                        continue
                    sig1 = client_source.create_trade_signature(
                        party1_priv_key, order_id, base_token, quote_token,
                        price, quantity, party1_side, party1_receive_wallet,
                        source_chain_id, dest_chain_id, timestamp, nonce1
                    )

                if not sig2:
                    if REQUIRE_CLIENT_SIGNATURES:
                        settlement_results.append({
                            "trade": trade,
                            "settlement_result": {"success": False, "error": "Missing client signature for party2"}
                        })
                        continue
                    sig2 = client_dest.create_trade_signature(
                        party2_priv_key, order_id, base_token, quote_token,
                        price, quantity, party2_side, party2_receive_wallet,
                        source_chain_id, dest_chain_id, timestamp, nonce2
                    )

                # Create matching engine signatures for both chains
                me_sig_source = client_source.create_matching_engine_signature(
                    PRIVATE_KEY, order_id, party1_addr, party2_addr,
                    party1_receive_wallet, party2_receive_wallet,
                    base_token, quote_token, price, quantity,
                    is_source_chain=True, chain_id=source_chain_id
                )

                me_sig_dest = client_dest.create_matching_engine_signature(
                    PRIVATE_KEY, order_id, party1_addr, party2_addr,
                    party1_receive_wallet, party2_receive_wallet,
                    base_token, quote_token, price, quantity,
                    is_source_chain=False, chain_id=dest_chain_id
                )

                # Settle on source chain
                logger.info(f"Settling on source chain (Chain ID: {source_chain_id})")
                result_source = client_source.settle_cross_chain_trade(
                    order_id, party1_addr, party2_addr,
                    party1_receive_wallet, party2_receive_wallet,
                    base_token, quote_token, price, quantity,
                    party1_side, party2_side,
                    source_chain_id, dest_chain_id,
                    timestamp, nonce1, nonce2,
                    sig1, sig2, me_sig_source, is_source_chain=True
                )

                # Settle on destination chain
                logger.info(f"Settling on destination chain (Chain ID: {dest_chain_id})")
                result_dest = client_dest.settle_cross_chain_trade(
                    order_id, party1_addr, party2_addr,
                    party1_receive_wallet, party2_receive_wallet,
                    base_token, quote_token, price, quantity,
                    party1_side, party2_side,
                    source_chain_id, dest_chain_id,
                    timestamp, nonce1, nonce2,
                    sig1, sig2, me_sig_dest, is_source_chain=False
                )

                settlement_results.append({
                    "trade": trade,
                    "settlement_result": {
                        "success": result_source["success"] and result_dest["success"],
                        "source_chain": result_source,
                        "destination_chain": result_dest
                    }
                })

            return {
                "settled": True,
                "settlement_results": settlement_results,
                "total_trades": len(order_dict["trades"]),
                "successful_settlements": sum(
                    1 for r in settlement_results 
                    if r["settlement_result"].get("success")
                )
            }

        except Exception as e:
            logger.error(f"Error during trade settlement: {e}")
            return {"settled": False, "error": str(e)}

    @staticmethod
    async def handlePayloadJson(request: Request):
        content_type = request.headers.get("content-type", "")

        if "application/json" in content_type:
            payload_json = await request.json()
            return payload_json
        elif (
            "application/x-www-form-urlencoded" in content_type
            or "multipart/form-data" in content_type
        ):
            form = await request.form()
            # form['payload'] is expected to be a JSON string
            payload_field = form.get("payload")
            if not payload_field:
                raise HTTPException(
                    status_code=422, detail="Missing 'payload' form field"
                )
            payload_json = json.loads(payload_field)
            return payload_json
        else:
            # try json fallback
            try:
                payload_json = await request.json()
                return payload_json
            except Exception:
                raise HTTPException(status_code=415, detail="Unsupported content type")
