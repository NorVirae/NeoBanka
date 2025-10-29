from fastapi import HTTPException, Request
import json

from dotenv import load_dotenv
import asyncio

# import asyncio
import logging
import time

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
    def get_token_address(symbol: str, network_key: str, SUPPORTED_NETWORKS: dict, TOKEN_ADDRESSES: dict | None = None) -> str:
        """Resolve token address by symbol and network key, fallback to legacy mapping."""
        symbol_up = symbol.upper()
        try:
            net = SUPPORTED_NETWORKS.get(network_key) or {}
            tokens = net.get("tokens") or {}
            addr = tokens.get(symbol_up)
            if addr:
                print(addr, "TOKEN_ADDRESS")
                return addr
        except Exception:
            pass
        if TOKEN_ADDRESSES:
            token_address = TOKEN_ADDRESSES.get(symbol_up, symbol)
            print(token_address, "TOKEN_ADDRESS")
            return token_address
        return symbol

    @staticmethod
    def load_abi(abi_path):
        """Load ABI from relative path and return it"""
        with open(abi_path, "r") as f:
            data = json.load(f)
        return data["abi"] if isinstance(data, dict) and "abi" in data else data

    @staticmethod
    async def validate_order_prerequisites(
        order_data: dict,
        SUPPORTED_NETWORKS: dict,
        TOKEN_ADDRESSES: dict,
        PRIVATE_KEY: str,
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

            # Resolve networks
            from_network = (order_data.get("from_network") or order_data.get("fromNetwork") or "").lower()
            to_network = (order_data.get("to_network") or order_data.get("toNetwork") or "").lower()

            # Get token addresses for each network
            base_asset_from = APIHelper.get_token_address(order_data["baseAsset"], from_network, SUPPORTED_NETWORKS, TOKEN_ADDRESSES)
            quote_asset_to = APIHelper.get_token_address(order_data["quoteAsset"], to_network, SUPPORTED_NETWORKS, TOKEN_ADDRESSES)

            if side.lower() == "ask":
                required_amount = quantity
                token_to_check = base_asset_from
                network_key = from_network
            else:
                required_amount = quantity * price
                token_to_check = quote_asset_to
                network_key = to_network

            # Create a temporary client for the correct chain
            net_cfg = SUPPORTED_NETWORKS.get(network_key) or {}
            client = SettlementClient(
                net_cfg.get("rpc"),
                net_cfg.get("contract_address"),
                PRIVATE_KEY,
            )

            # Determine correct token decimals for accurate normalization with retries and sensible fallback
            symbol_for_decimals = order_data["baseAsset"] if side.lower() == "ask" else order_data["quoteAsset"]
            default_decimals_map = {"USDT": 6, "HBAR": 18}
            token_decimals = default_decimals_map.get(symbol_for_decimals.upper(), 18)
            for attempt in range(3):
                try:
                    token_decimals = client.get_token_decimals(token_to_check)
                    break
                except Exception:
                    if attempt == 2:
                        break
                    await asyncio.sleep(0.5 * (attempt + 1))

            # Check escrow balance on that chain with proper decimals, retry on transient RPC errors (e.g., 429)
            balance_info = {}
            for attempt in range(4):
                try:
                    balance_info = client.check_escrow_balance(account, token_to_check, token_decimals=token_decimals)
                    if "error" not in balance_info:
                        break
                except Exception as e:
                    balance_info = {"error": str(e)}
                await asyncio.sleep(0.5 * (attempt + 1))

            available = balance_info.get("available", 0)

            results["checks"] = {
                "account": account,
                "side": side,
                "token": token_to_check,
                "required_amount": required_amount,
                "available_escrow": available,
                "total_escrow": balance_info.get("total", 0),
                "locked_escrow": balance_info.get("locked", 0),
                "network_key": network_key,
                "rpc": net_cfg.get("rpc"),
                "contract_address": net_cfg.get("contract_address"),
                "token_decimals": token_decimals,
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
        start_ts = time.time()
        req_id = order_dict.get("request_id") or f"req_{int(start_ts*1000)}"
        logger.info(f"[{req_id}] Settlement start | trades={len(order_dict.get('trades') or [])} base={order_dict.get('baseAsset')} quote={order_dict.get('quoteAsset')}")
        if not order_dict.get("trades"):
            logger.info(f"[{req_id}] No trades to settle")
            return {"settled": False, "reason": "No trades to settle"}

        settlement_results = []

        try:
            # Import SettlementClient
            
            
            for idx, trade in enumerate(order_dict["trades"]):
                t0 = time.time()
                logger.info(f"[{req_id}] Trade[{idx}] start | price={trade.get('price')} qty={trade.get('quantity')}")
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

                logger.info(f"[{req_id}] Trade[{idx}] networks | source={party1_from_network} dest={party2_from_network}")

                if not source_network_cfg or not dest_network_cfg:
                    settlement_results.append({
                        "trade": trade,
                        "settlement_result": {
                            "success": False,
                            "error": "Network configuration not found"
                        }
                    })
                    logger.warning(f"[{req_id}] Trade[{idx}] missing network configuration")
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
                logger.info(f"[{req_id}] Trade[{idx}] clients ready | source_chain_id={source_chain_id} dest_chain_id={dest_chain_id}")

                # Check owner vs signer (must be owner for onlyOwner functions)
                try:
                    owner_addr = client_source.get_contract_owner()
                    signer_addr = client_source.get_signer_address()
                    if owner_addr and signer_addr and owner_addr.lower() != signer_addr.lower():
                        logger.warning(f"[{req_id}] Trade[{idx}] signer is not contract owner | owner={owner_addr} signer={signer_addr}")
                        settlement_results.append({
                            "trade": trade,
                            "settlement_result": {
                                "success": False,
                                "error": "signer_not_owner",
                                "details": {"owner": owner_addr, "signer": signer_addr},
                            }
                        })
                        logger.info(f"[{req_id}] Trade[{idx}] done | ok_source=False ok_dest=False elapsed={time.time()-t0:.2f}s")
                        continue
                except Exception:
                    pass

                # Get token addresses for the source chain (party1_from_network)
                base_token_src = APIHelper.get_token_address(
                    order_dict["baseAsset"],
                    party1_from_network,
                    SUPPORTED_NETWORKS,
                    TOKEN_ADDRESSES,
                )
                quote_token_src = APIHelper.get_token_address(
                    order_dict["quoteAsset"],
                    party1_from_network,
                    SUPPORTED_NETWORKS,
                    TOKEN_ADDRESSES,
                )
                # Get token addresses for the destination chain (party2_from_network)
                base_token_dest = APIHelper.get_token_address(
                    order_dict["baseAsset"],
                    party2_from_network,
                    SUPPORTED_NETWORKS,
                    TOKEN_ADDRESSES,
                )
                quote_token_dest = APIHelper.get_token_address(
                    order_dict["quoteAsset"],
                    party2_from_network,
                    SUPPORTED_NETWORKS,
                    TOKEN_ADDRESSES,
                )

                # Get nonces with basic retry/backoff to handle rate limits
                async def _retry_get_nonce(client, user, token, attempts=3):
                    last = 0
                    for a in range(attempts):
                        try:
                            val = client.get_user_nonce(user, token)
                            return val
                        except Exception as _e:
                            last = 0
                            await asyncio.sleep(0.5 * (a + 1))
                    return last

                nonce1 = await _retry_get_nonce(client_source, party1_addr, base_token_src)
                nonce2 = await _retry_get_nonce(client_dest, party2_addr, base_token_dest)
                logger.info(f"[{req_id}] Trade[{idx}] nonces | n1={nonce1} n2={nonce2}")

                # Trade parameters
                order_id = str(order_dict["orderId"])
                price = float(trade["price"])
                quantity = float(trade["quantity"])
                timestamp = int(trade["timestamp"])

                # Signatures removed in contract; onlyOwner authorization controls settlement

                same_chain = source_chain_id == dest_chain_id
                if same_chain:
                    # Normalize roles so party1 is the seller (ask) on source chain
                    if str(party1_side).lower() == "bid" and str(party2_side).lower() == "ask":
                        party1_addr, party2_addr = party2_addr, party1_addr
                        party1_side, party2_side = party2_side, party1_side
                        party1_receive_wallet, party2_receive_wallet = party2_receive_wallet, party1_receive_wallet
                        nonce1, nonce2 = nonce2, nonce1
                    logger.info(f"[{req_id}] Trade[{idx}] same-chain settlement on chain_id={source_chain_id}")
                    # Ensure base funds are locked for seller on source chain
                    try:
                        base_dec = client_source.get_token_decimals(base_token_src)
                    except Exception:
                        base_dec = 18
                    # Ensure sufficient locked balance before settlement
                    # Lock with retries (rate-limit tolerant)
                    lock_res = {"success": False}
                    for a in range(3):
                        try:
                            lock_res = client_source.lock_escrow_for_order(
                                party1_addr, base_token_src, float(quantity), order_id, token_decimals=base_dec
                            )
                            break
                        except Exception as e:
                            logger.warning(f"[{req_id}] Trade[{idx}] lock source base attempt {a+1} failed: {e}")
                            await asyncio.sleep(0.75 * (a + 1))
                    logger.info(f"[{req_id}] Trade[{idx}] lock source base result: {lock_res}")

                    # Verify locked balance
                    bal_info = client_source.check_escrow_balance(party1_addr, base_token_src, token_decimals=base_dec)
                    if bal_info.get("locked", 0) < float(quantity):
                        logger.warning(f"[{req_id}] Trade[{idx}] insufficient locked base after lock attempt | locked={bal_info.get('locked')} required={quantity}")
                        settlement_results.append({
                            "trade": trade,
                            "settlement_result": {
                                "success": False,
                                "error": "insufficient_locked_base_on_source",
                                "details": {
                                    "locked": bal_info.get("locked"),
                                    "required": float(quantity),
                                }
                            }
                        })
                        logger.info(f"[{req_id}] Trade[{idx}] done | ok_source=False ok_dest=False elapsed={time.time()-t0:.2f}s")
                        continue

                    result_source = client_source.settle_cross_chain_trade(
                        order_id, party1_addr, party2_addr,
                        party1_receive_wallet, party2_receive_wallet,
                        base_token_src, quote_token_src, price, quantity,
                        party1_side, party2_side,
                        source_chain_id, dest_chain_id,
                        timestamp, nonce1, nonce2,
                        is_source_chain=True
                    )
                    result_dest = {"success": True, "skipped": True, "reason": "same_chain_single_leg"}
                else:
                    # Settle on source chain (lock base funds for seller)
                    logger.info(f"Settling on source chain (Chain ID: {source_chain_id})")
                    logger.info(f"[{req_id}] Trade[{idx}] settle source chain")
                    try:
                        base_dec = client_source.get_token_decimals(base_token_src)
                    except Exception:
                        base_dec = 18
                    # Lock with retries (rate-limit tolerant)
                    lock_check_addr = party1_addr if str(party1_side).lower() == "ask" else party2_addr
                    for a in range(3):
                        try:
                            if str(party1_side).lower() == "ask":
                                client_source.lock_escrow_for_order(party1_addr, base_token_src, float(quantity), order_id, token_decimals=base_dec)
                            else:
                                # If party1 is bid on source chain, then party2 is seller for base
                                client_source.lock_escrow_for_order(party2_addr, base_token_src, float(quantity), order_id, token_decimals=base_dec)
                            break
                        except Exception as e:
                            logger.warning(f"[{req_id}] Trade[{idx}] lock source base attempt {a+1} failed: {e}")
                            await asyncio.sleep(0.75 * (a + 1))

                    # Verify locked balance on source
                    bal_info_src = client_source.check_escrow_balance(lock_check_addr, base_token_src, token_decimals=base_dec)
                    if bal_info_src.get("locked", 0) < float(quantity):
                        logger.warning(f"[{req_id}] Trade[{idx}] insufficient locked base on source | locked={bal_info_src.get('locked')} required={quantity}")
                        settlement_results.append({
                            "trade": trade,
                            "settlement_result": {
                                "success": False,
                                "error": "insufficient_locked_base_on_source",
                                "details": {
                                    "locked": bal_info_src.get("locked"),
                                    "required": float(quantity),
                                }
                            }
                        })
                        logger.info(f"[{req_id}] Trade[{idx}] done | ok_source=False ok_dest=False elapsed={time.time()-t0:.2f}s")
                        continue

                    result_source = client_source.settle_cross_chain_trade(
                        order_id, party1_addr, party2_addr,
                        party1_receive_wallet, party2_receive_wallet,
                        base_token_src, quote_token_src, price, quantity,
                        party1_side, party2_side,
                        source_chain_id, dest_chain_id,
                        timestamp, nonce1, nonce2,
                        is_source_chain=True
                    )

                    # Settle on destination chain (lock quote funds for buyer)
                    logger.info(f"[{req_id}] Trade[{idx}] settle destination chain")
                    try:
                        quote_dec = client_dest.get_token_decimals(quote_token_dest)  # correct token decimals
                    except Exception:
                        quote_dec = 18
                    # Compute quote amount in decimals of quote token
                    amt = float(quantity) * float(price)
                    # Lock with retries (rate-limit tolerant)
                    for a in range(3):
                        try:
                            client_dest.lock_escrow_for_order(party2_addr, quote_token_dest, amt, order_id, token_decimals=quote_dec)
                            break
                        except Exception as e:
                            logger.warning(f"[{req_id}] Trade[{idx}] lock dest quote attempt {a+1} failed: {e}")
                            await asyncio.sleep(0.75 * (a + 1))

                    # Verify locked balance on destination for quote
                    bal_info_dest = client_dest.check_escrow_balance(party2_addr, quote_token_dest, token_decimals=quote_dec)
                    if bal_info_dest.get("locked", 0) < float(amt):
                        logger.warning(f"[{req_id}] Trade[{idx}] insufficient locked quote on destination | locked={bal_info_dest.get('locked')} required={amt}")
                        settlement_results.append({
                            "trade": trade,
                            "settlement_result": {
                                "success": False,
                                "error": "insufficient_locked_quote_on_destination",
                                "details": {
                                    "locked": bal_info_dest.get("locked"),
                                    "required": float(amt),
                                }
                            }
                        })
                        logger.info(f"[{req_id}] Trade[{idx}] done | ok_source={result_source.get('success')} ok_dest=False elapsed={time.time()-t0:.2f}s")
                        continue
                    result_dest = client_dest.settle_cross_chain_trade(
                        order_id, party1_addr, party2_addr,
                        party1_receive_wallet, party2_receive_wallet,
                        base_token_dest, quote_token_dest, price, quantity,
                        party1_side, party2_side,
                        source_chain_id, dest_chain_id,
                        timestamp, nonce1, nonce2,
                        is_source_chain=False
                    )

                settlement_results.append({
                    "trade": trade,
                    "settlement_result": {
                        "success": result_source["success"] and result_dest["success"],
                        "source_chain": result_source,
                        "destination_chain": result_dest
                    }
                })
                logger.info(f"[{req_id}] Trade[{idx}] done | ok_source={result_source.get('success')} ok_dest={result_dest.get('success')} elapsed={time.time()-t0:.2f}s")

            total_elapsed = time.time() - start_ts
            logger.info(f"[{req_id}] Settlement finished | trades={len(order_dict['trades'])} elapsed={total_elapsed:.2f}s ok={sum(1 for r in settlement_results if r['settlement_result'].get('success'))}")
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
            logger.error(f"[{req_id}] Error during trade settlement: {e}")
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
