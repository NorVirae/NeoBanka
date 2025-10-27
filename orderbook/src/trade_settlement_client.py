"""
Cross-Chain Trade Settlement Client

This client handles all interactions with the Trade Settlement smart contract,
including escrow management, token approvals, signature creation, and trade settlement.
"""

import json
from web3 import Web3
from eth_account import Account
from eth_account.messages import encode_defunct
from typing import Dict, Optional

# from src import settlement ERC20_ABI, TRADE_SETTLEMENT_ABI


with open("orderbook/abis/ERC20_abi.json", "r", encoding="utf-8") as f:
    ERC20_ABI = json.load(f)

with open("orderbook/abis/settlement_abi.json", "r", encoding="utf-8") as f:
    TRADE_SETTLEMENT_ABI = json.load(f)


class SettlementClient:
    """
    Client for interacting with the Cross-Chain Trade Settlement contract

    This client provides methods for:
    - Escrow deposits and withdrawals
    - Token approvals
    - Balance checking
    - Signature creation and verification
    - Cross-chain trade settlement
    """

    def __init__(
        self,
        web3_provider: str,
        contract_address: str,
        private_key: Optional[str] = None,
    ):
        """
        Initialize the Settlement Client

        Args:
            web3_provider: RPC URL for the blockchain network
            contract_address: Address of the deployed settlement contract
            private_key: Private key for signing transactions (optional)
        """
        self.web3 = Web3(Web3.HTTPProvider(web3_provider))

        if not self.web3.is_connected():
            raise ConnectionError(f"Failed to connect to {web3_provider}")

        self.contract_address = Web3.to_checksum_address(contract_address)
        self.contract = self.web3.eth.contract(
            address=self.contract_address, abi=TRADE_SETTLEMENT_ABI
        )

        self.account = Account.from_key(private_key) if private_key else None

        print(f"✅ Connected to network (Chain ID: {self.web3.eth.chain_id})")
        if self.account:
            print(f"✅ Account loaded: {self.account.address}")

    # ==================== ESCROW MANAGEMENT ====================

    def deposit_to_escrow(
        self,
        token_address: str,
        amount: float,
        token_decimals: int = 18,
        gas_price_gwei: int = 20,
    ) -> Dict:
        """
        Deposit tokens into escrow

        Args:
            token_address: Address of the token to deposit
            amount: Amount in token units (e.g., 100 for 100 USDT)
            token_decimals: Token decimals (default 18)
            gas_price_gwei: Gas price in gwei

        Returns:
            Transaction receipt dictionary
        """
        if not self.account:
            raise ValueError("No private key provided for transaction signing")

        try:
            token_address = Web3.to_checksum_address(token_address)
            amount_wei = int(amount * (10**token_decimals))

            print(f"📥 Depositing {amount} tokens to escrow...")

            # Build transaction
            tx = self.contract.functions.depositToEscrow(
                token_address, amount_wei
            ).build_transaction(
                {
                    "from": self.account.address,
                    "nonce": self.web3.eth.get_transaction_count(self.account.address),
                    "gas": 200000,
                    "gasPrice": self.web3.to_wei(gas_price_gwei, "gwei"),
                }
            )

            # Sign and send
            signed_tx = self.web3.eth.account.sign_transaction(tx, self.account.key)
            tx_hash = self.web3.eth.send_raw_transaction(signed_tx.raw_transaction)

            print(f"🚀 Transaction sent: {tx_hash.hex()}")
            print("⏳ Waiting for confirmation...")

            receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            if receipt.status == 1:
                print(f"✅ Deposit successful!")
                print(f"   Gas used: {receipt.gasUsed}")
                print(f"   Block: {receipt.blockNumber}")
            else:
                print("❌ Transaction failed")

            return {
                "success": receipt.status == 1,
                "transaction_hash": receipt.transactionHash.hex(),
                "gas_used": receipt.gasUsed,
                "block_number": receipt.blockNumber,
                "amount_deposited": amount,
                "token": token_address,
            }

        except Exception as e:
            print(f"❌ Deposit failed: {e}")
            return {"success": False, "error": str(e)}

    def withdraw_from_escrow(
        self,
        token_address: str,
        amount: float,
        token_decimals: int = 18,
        gas_price_gwei: int = 20,
    ) -> Dict:
        """
        Withdraw tokens from escrow (only unlocked balance)

        Args:
            token_address: Address of the token to withdraw
            amount: Amount in token units
            token_decimals: Token decimals
            gas_price_gwei: Gas price in gwei

        Returns:
            Transaction receipt dictionary
        """
        if not self.account:
            raise ValueError("No private key provided for transaction signing")

        try:
            token_address = Web3.to_checksum_address(token_address)
            amount_wei = int(amount * (10**token_decimals))

            print(f"📤 Withdrawing {amount} tokens from escrow...")

            tx = self.contract.functions.withdrawFromEscrow(
                token_address, amount_wei
            ).build_transaction(
                {
                    "from": self.account.address,
                    "nonce": self.web3.eth.get_transaction_count(self.account.address),
                    "gas": 200000,
                    "gasPrice": self.web3.to_wei(gas_price_gwei, "gwei"),
                }
            )

            signed_tx = self.web3.eth.account.sign_transaction(tx, self.account.key)
            tx_hash = self.web3.eth.send_raw_transaction(signed_tx.raw_transaction)

            print(f"🚀 Transaction sent: {tx_hash.hex()}")
            receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            if receipt.status == 1:
                print(f"✅ Withdrawal successful!")
            else:
                print("❌ Transaction failed")

            return {
                "success": receipt.status == 1,
                "transaction_hash": receipt.transactionHash.hex(),
                "gas_used": receipt.gasUsed,
                "amount_withdrawn": amount,
                "token": token_address,
            }

        except Exception as e:
            print(f"❌ Withdrawal failed: {e}")
            return {"success": False, "error": str(e)}

    def check_escrow_balance(
        self, user_address: str, token_address: str, token_decimals: int = 18
    ) -> Dict:
        """
        Check escrow balance for a user

        Args:
            user_address: Address of the user
            token_address: Address of the token
            token_decimals: Token decimals

        Returns:
            Dictionary with total, available, and locked balances
        """
        try:
            user_address = Web3.to_checksum_address(user_address)
            token_address = Web3.to_checksum_address(token_address)

            total, available, locked = self.contract.functions.checkEscrowBalance(
                user_address, token_address
            ).call()

            divisor = 10**token_decimals

            return {
                "total": total / divisor,
                "total_wei": total,
                "available": available / divisor,
                "available_wei": available,
                "locked": locked / divisor,
                "locked_wei": locked,
                "user": user_address,
                "token": token_address,
            }

        except Exception as e:
            print(f"❌ Error checking balance: {e}")
            return {"error": str(e)}

    # ==================== TOKEN OPERATIONS ====================

    def approve_token(
        self,
        token_address: str,
        amount: Optional[float] = None,
        token_decimals: int = 18,
        gas_price_gwei: int = 20,
    ) -> Dict:
        """
        Approve the settlement contract to spend tokens

        Args:
            token_address: Token to approve
            amount: Amount to approve (None = unlimited)
            token_decimals: Token decimals
            gas_price_gwei: Gas price

        Returns:
            Transaction receipt
        """
        if not self.account:
            raise ValueError("No private key provided for transaction signing")

        try:
            token_address = Web3.to_checksum_address(token_address)

            # Unlimited approval if no amount specified
            if amount is None:
                amount_wei = 2**256 - 1
                print(f"🔓 Approving unlimited spending for {token_address}...")
            else:
                amount_wei = int(amount * (10**token_decimals))
                print(f"🔓 Approving {amount} tokens for spending...")

            token_contract = self.web3.eth.contract(
                address=token_address, abi=ERC20_ABI
            )

            tx = token_contract.functions.approve(
                self.contract_address, amount_wei
            ).build_transaction(
                {
                    "from": self.account.address,
                    "nonce": self.web3.eth.get_transaction_count(self.account.address),
                    "gas": 100000,
                    "gasPrice": self.web3.to_wei(gas_price_gwei, "gwei"),
                }
            )

            signed_tx = self.web3.eth.account.sign_transaction(tx, self.account.key)
            tx_hash = self.web3.eth.send_raw_transaction(signed_tx.raw_transaction)

            print(f"🚀 Approval transaction sent: {tx_hash.hex()}")
            receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            if receipt.status == 1:
                print(f"✅ Approval successful!")
            else:
                print("❌ Approval failed")

            return {
                "success": receipt.status == 1,
                "transaction_hash": receipt.transactionHash.hex(),
                "gas_used": receipt.gasUsed,
                "approved_amount": "UNLIMITED" if amount is None else amount,
            }

        except Exception as e:
            print(f"❌ Approval failed: {e}")
            return {"success": False, "error": str(e)}

    def check_token_allowance(
        self, token_address: str, owner: str, token_decimals: int = 18
    ) -> float:
        """
        Check token allowance for the settlement contract

        Args:
            token_address: Token address
            owner: Owner address
            token_decimals: Token decimals

        Returns:
            Current allowance amount
        """
        try:
            token_contract = self.web3.eth.contract(
                address=Web3.to_checksum_address(token_address), abi=ERC20_ABI
            )

            allowance = token_contract.functions.allowance(
                Web3.to_checksum_address(owner), self.contract_address
            ).call()

            return allowance / (10**token_decimals)

        except Exception as e:
            print(f"❌ Error checking allowance: {e}")
            return 0

    def check_token_balance(
        self, token_address: str, owner: str, token_decimals: int = 18
    ) -> float:
        """
        Check token balance for an address

        Args:
            token_address: Token address
            owner: Owner address
            token_decimals: Token decimals

        Returns:
            Token balance
        """
        try:
            token_contract = self.web3.eth.contract(
                address=Web3.to_checksum_address(token_address), abi=ERC20_ABI
            )

            balance = token_contract.functions.balanceOf(
                Web3.to_checksum_address(owner)
            ).call()

            return balance / (10**token_decimals)

        except Exception as e:
            print(f"❌ Error checking balance: {e}")
            return 0

    # ==================== NONCE MANAGEMENT ====================

    def get_user_nonce(self, user_address: str, token_address: str) -> int:
        """
        Get user's current nonce for a specific token

        Args:
            user_address: User's address
            token_address: Token address

        Returns:
            Current nonce value
        """
        try:
            nonce = self.contract.functions.getUserNonce(
                Web3.to_checksum_address(user_address),
                Web3.to_checksum_address(token_address),
            ).call()

            return nonce

        except Exception as e:
            print(f"❌ Error getting nonce: {e}")
            return 0

    # ==================== SIGNATURE CREATION ====================

    def create_trade_signature(
        self,
        user_private_key: str,
        order_id: str,
        base_asset: str,
        quote_asset: str,
        price: float,
        quantity: float,
        side: str,
        receive_wallet: str,
        source_chain_id: int,
        destination_chain_id: int,
        timestamp: int,
        nonce: int,
        price_decimals: int = 18,
        quantity_decimals: int = 18,
    ) -> str:
        """
        Create a signature for a cross-chain trade

        Args:
            user_private_key: Private key of the signer
            order_id: Unique order identifier (string, will be hashed to bytes32)
            base_asset: Base asset address
            quote_asset: Quote asset address
            price: Price with decimals (e.g., 1.5 for 1.5 USDT per token)
            quantity: Quantity with decimals
            side: "bid" or "ask"
            receive_wallet: Wallet address to receive funds on other chain
            source_chain_id: Chain ID of source chain
            destination_chain_id: Chain ID of destination chain
            timestamp: Unix timestamp
            nonce: User's nonce
            price_decimals: Price decimals (default 18)
            quantity_decimals: Quantity decimals (default 18)

        Returns:
            Signature as hex string
        """
        try:
            account = Account.from_key(user_private_key)

            # Convert order_id string to bytes32
            if isinstance(order_id, str):
                if order_id.startswith("0x"):
                    order_id_bytes = bytes.fromhex(order_id[2:].zfill(64))
                else:
                    order_id_bytes = Web3.keccak(text=order_id)
            else:
                order_id_bytes = order_id

            # Convert amounts to wei
            price_wei = int(price * (10**price_decimals))
            quantity_wei = int(quantity * (10**quantity_decimals))

            # Create message hash matching contract
            # Must match: keccak256(abi.encodePacked(...))
            message_hash = Web3.keccak(
                b"".join(
                    [
                        order_id_bytes,
                        bytes.fromhex(
                            Web3.to_checksum_address(base_asset)[2:].zfill(40)
                        ),
                        bytes.fromhex(
                            Web3.to_checksum_address(quote_asset)[2:].zfill(40)
                        ),
                        price_wei.to_bytes(32, "big"),
                        quantity_wei.to_bytes(32, "big"),
                        Web3.keccak(text=side),
                        bytes.fromhex(
                            Web3.to_checksum_address(receive_wallet)[2:].zfill(40)
                        ),
                        source_chain_id.to_bytes(32, "big"),
                        destination_chain_id.to_bytes(32, "big"),
                        timestamp.to_bytes(32, "big"),
                        nonce.to_bytes(32, "big"),
                    ]
                )
            )

            # Sign with Ethereum prefix
            eth_message = encode_defunct(message_hash)
            signature = account.sign_message(eth_message)

            print(f"✅ Trade signature created for {account.address}")

            return signature.signature.hex()

        except Exception as e:
            print(f"❌ Error creating trade signature: {e}")
            raise

    def create_matching_engine_signature(
        self,
        matching_engine_private_key: str,
        order_id: str,
        party1: str,
        party2: str,
        party1_receive_wallet: str,
        party2_receive_wallet: str,
        base_asset: str,
        quote_asset: str,
        price: float,
        quantity: float,
        is_source_chain: bool,
        chain_id: int,
        price_decimals: int = 18,
        quantity_decimals: int = 18,
    ) -> str:
        """
        Create matching engine signature for trade settlement

        This signature authorizes the settlement on a specific chain.
        Must be created by the contract owner (matching engine).

        Args:
            matching_engine_private_key: Private key of the matching engine (contract owner)
            order_id: Order identifier
            party1: Address of party 1
            party2: Address of party 2
            party1_receive_wallet: Party 1's receiving wallet
            party2_receive_wallet: Party 2's receiving wallet
            base_asset: Base asset address
            quote_asset: Quote asset address
            price: Trade price
            quantity: Trade quantity
            is_source_chain: True if settling on source chain, False for destination
            chain_id: Current chain ID where settlement will occur
            price_decimals: Price decimals
            quantity_decimals: Quantity decimals

        Returns:
            Signature as hex string
        """
        try:
            account = Account.from_key(matching_engine_private_key)

            # Convert order_id to bytes32
            if isinstance(order_id, str):
                if order_id.startswith("0x"):
                    order_id_bytes = bytes.fromhex(order_id[2:].zfill(64))
                else:
                    order_id_bytes = Web3.keccak(text=order_id)
            else:
                order_id_bytes = order_id

            price_wei = int(price * (10**price_decimals))
            quantity_wei = int(quantity * (10**quantity_decimals))

            # Create hash matching contract verification
            # Must match the contract's matching engine signature verification
            message_hash = Web3.keccak(
                b"".join(
                    [
                        order_id_bytes,
                        bytes.fromhex(Web3.to_checksum_address(party1)[2:].zfill(40)),
                        bytes.fromhex(Web3.to_checksum_address(party2)[2:].zfill(40)),
                        bytes.fromhex(
                            Web3.to_checksum_address(party1_receive_wallet)[2:].zfill(
                                40
                            )
                        ),
                        bytes.fromhex(
                            Web3.to_checksum_address(party2_receive_wallet)[2:].zfill(
                                40
                            )
                        ),
                        bytes.fromhex(
                            Web3.to_checksum_address(base_asset)[2:].zfill(40)
                        ),
                        bytes.fromhex(
                            Web3.to_checksum_address(quote_asset)[2:].zfill(40)
                        ),
                        price_wei.to_bytes(32, "big"),
                        quantity_wei.to_bytes(32, "big"),
                        (1 if is_source_chain else 0).to_bytes(32, "big"),
                        chain_id.to_bytes(32, "big"),
                    ]
                )
            )

            eth_message = encode_defunct(message_hash)
            signature = account.sign_message(eth_message)

            print(
                f"✅ Matching engine signature created (Chain: {chain_id}, Source: {is_source_chain})"
            )

            return signature.signature.hex()

        except Exception as e:
            print(f"❌ Error creating matching engine signature: {e}")
            raise

    # ==================== TRADE SETTLEMENT ====================

    def settle_cross_chain_trade(
        self,
        order_id: str,
        party1: str,
        party2: str,
        party1_receive_wallet: str,
        party2_receive_wallet: str,
        base_asset: str,
        quote_asset: str,
        price: float,
        quantity: float,
        party1_side: str,
        party2_side: str,
        source_chain_id: int,
        destination_chain_id: int,
        timestamp: int,
        nonce1: int,
        nonce2: int,
        signature1: str,
        signature2: str,
        matching_engine_signature: str,
        is_source_chain: bool,
        price_decimals: int = 18,
        quantity_decimals: int = 18,
        gas_price_gwei: int = 20,
    ) -> Dict:
        """
        Settle a cross-chain trade on this chain

        This function must be called on BOTH chains to complete the atomic swap:
        - On source chain (is_source_chain=True): Transfers base asset
        - On destination chain (is_source_chain=False): Transfers quote asset

        Args:
            order_id: Unique order identifier
            party1: Address of party 1 (on source chain)
            party2: Address of party 2 (on destination chain)
            party1_receive_wallet: Party 1's wallet on destination chain
            party2_receive_wallet: Party 2's wallet on source chain
            base_asset: Base asset address
            quote_asset: Quote asset address
            price: Trade price
            quantity: Trade quantity
            party1_side: "bid" or "ask"
            party2_side: "ask" or "bid" (must be opposite)
            source_chain_id: Source chain ID
            destination_chain_id: Destination chain ID
            timestamp: Trade timestamp
            nonce1: Party 1's nonce
            nonce2: Party 2's nonce
            signature1: Party 1's signature
            signature2: Party 2's signature
            matching_engine_signature: Matching engine authorization signature
            is_source_chain: True if this is the source chain, False if destination
            price_decimals: Price decimals
            quantity_decimals: Quantity decimals
            gas_price_gwei: Gas price in gwei

        Returns:
            Transaction receipt dictionary
        """
        if not self.account:
            raise ValueError("No private key provided for transaction signing")

        try:
            # Convert order_id to bytes32
            if isinstance(order_id, str):
                if order_id.startswith("0x"):
                    order_id_bytes = bytes.fromhex(order_id[2:].zfill(64))
                else:
                    order_id_bytes = Web3.keccak(text=order_id)
            else:
                order_id_bytes = order_id

            # Convert amounts to wei
            price_wei = int(price * (10**price_decimals))
            quantity_wei = int(quantity * (10**quantity_decimals))

            # Build trade data tuple matching the contract struct
            trade_data = (
                order_id_bytes,
                Web3.to_checksum_address(party1),
                Web3.to_checksum_address(party2),
                Web3.to_checksum_address(party1_receive_wallet),
                Web3.to_checksum_address(party2_receive_wallet),
                Web3.to_checksum_address(base_asset),
                Web3.to_checksum_address(quote_asset),
                price_wei,
                quantity_wei,
                party1_side,
                party2_side,
                source_chain_id,
                destination_chain_id,
                timestamp,
                nonce1,
                nonce2,
            )

            # Convert signatures to bytes
            sig1_bytes = bytes.fromhex(signature1.replace("0x", ""))
            sig2_bytes = bytes.fromhex(signature2.replace("0x", ""))
            me_sig_bytes = bytes.fromhex(matching_engine_signature.replace("0x", ""))

            print(f"\n{'='*60}")
            print(
                f"🔄 Settling cross-chain trade on {'SOURCE' if is_source_chain else 'DESTINATION'} chain"
            )
            print(f"{'='*60}")
            print(f"Order ID: {order_id}")
            print(f"Party 1: {party1} ({party1_side})")
            print(f"Party 2: {party2} ({party2_side})")
            print(f"Price: {price}")
            print(f"Quantity: {quantity}")
            print(f"Chain ID: {self.web3.eth.chain_id}")
            print(f"{'='*60}\n")

            # Build transaction
            function = self.contract.functions.settleCrossChainTrade(
                trade_data, sig1_bytes, sig2_bytes, me_sig_bytes, is_source_chain
            )

            # Estimate gas
            try:
                gas_estimate = function.estimate_gas({"from": self.account.address})
                gas_limit = int(gas_estimate * 1.3)  # Add 30% buffer
                print(f"⛽ Estimated gas: {gas_estimate}, using limit: {gas_limit}")
            except Exception as gas_error:
                print(f"⚠️  Gas estimation failed: {gas_error}")
                gas_limit = 500000  # Fallback gas limit
                print(f"⛽ Using fallback gas limit: {gas_limit}")

            # Build transaction
            tx = function.build_transaction(
                {
                    "from": self.account.address,
                    "nonce": self.web3.eth.get_transaction_count(self.account.address),
                    "gas": gas_limit,
                    "gasPrice": self.web3.to_wei(gas_price_gwei, "gwei"),
                }
            )

            # Sign and send
            signed_tx = self.web3.eth.account.sign_transaction(tx, self.account.key)
            tx_hash = self.web3.eth.send_raw_transaction(signed_tx.raw_transaction)

            print(f"🚀 Settlement transaction sent: {tx_hash.hex()}")
            print("⏳ Waiting for confirmation...")

            receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)

            if receipt.status == 1:
                print(f"\n✅ TRADE SETTLED SUCCESSFULLY!")
                print(f"   Gas used: {receipt.gasUsed}")
                print(f"   Block: {receipt.blockNumber}")
                print(f"   Transaction: {receipt.transactionHash.hex()}\n")
            else:
                print(f"\n❌ SETTLEMENT FAILED")
                print(f"   Transaction: {receipt.transactionHash.hex()}\n")

            return {
                "success": receipt.status == 1,
                "transaction_hash": receipt.transactionHash.hex(),
                "gas_used": receipt.gasUsed,
                "block_number": receipt.blockNumber,
                "is_source_chain": is_source_chain,
                "chain_id": self.web3.eth.chain_id,
            }

        except Exception as e:
            print(f"\n❌ Settlement failed: {e}\n")
            return {
                "success": False,
                "error": str(e),
                "is_source_chain": is_source_chain,
                "chain_id": self.web3.eth.chain_id,
            }

    # ==================== VERIFICATION METHODS ====================

    def verify_trade_signature(
        self,
        signer: str,
        order_id: str,
        base_asset: str,
        quote_asset: str,
        price: float,
        quantity: float,
        side: str,
        receive_wallet: str,
        source_chain_id: int,
        destination_chain_id: int,
        timestamp: int,
        nonce: int,
        signature: str,
        price_decimals: int = 18,
        quantity_decimals: int = 18,
    ) -> bool:
        """
        Verify a trade signature on-chain

        Args:
            signer: Expected signer address
            order_id: Order identifier
            base_asset: Base asset address
            quote_asset: Quote asset address
            price: Trade price
            quantity: Trade quantity
            side: "bid" or "ask"
            receive_wallet: Receiving wallet address
            source_chain_id: Source chain ID
            destination_chain_id: Destination chain ID
            timestamp: Timestamp
            nonce: Nonce
            signature: Signature to verify
            price_decimals: Price decimals
            quantity_decimals: Quantity decimals

        Returns:
            True if signature is valid, False otherwise
        """
        try:
            # Convert order_id to bytes32
            if isinstance(order_id, str):
                if order_id.startswith("0x"):
                    order_id_bytes = bytes.fromhex(order_id[2:].zfill(64))
                else:
                    order_id_bytes = Web3.keccak(text=order_id)
            else:
                order_id_bytes = order_id

            price_wei = int(price * (10**price_decimals))
            quantity_wei = int(quantity * (10**quantity_decimals))
            sig_bytes = bytes.fromhex(signature.replace("0x", ""))

            result = self.contract.functions.verifyCrossChainTradeSignature(
                Web3.to_checksum_address(signer),
                order_id_bytes,
                Web3.to_checksum_address(base_asset),
                Web3.to_checksum_address(quote_asset),
                price_wei,
                quantity_wei,
                side,
                Web3.to_checksum_address(receive_wallet),
                source_chain_id,
                destination_chain_id,
                timestamp,
                nonce,
                sig_bytes,
            ).call()

            return result

        except Exception as e:
            print(f"❌ Error verifying signature: {e}")
            return False

    def check_trade_settled(self, order_id: str) -> bool:
        """
        Check if a trade has been settled on this chain

        Args:
            order_id: Order identifier

        Returns:
            True if settled, False otherwise
        """
        try:
            if isinstance(order_id, str):
                if order_id.startswith("0x"):
                    order_id_bytes = bytes.fromhex(order_id[2:].zfill(64))
                else:
                    order_id_bytes = Web3.keccak(text=order_id)
            else:
                order_id_bytes = order_id

            settled = self.contract.functions.settledCrossChainOrders(
                order_id_bytes
            ).call()

            return settled

        except Exception as e:
            print(f"❌ Error checking settlement status: {e}")
            return False

    # ==================== UTILITY METHODS ====================

    def get_contract_owner(self) -> str:
        """Get the contract owner address"""
        try:
            return self.contract.functions.owner().call()
        except Exception as e:
            print(f"❌ Error getting owner: {e}")
            return ""

    def display_account_info(self):
        """Display current account information"""
        if not self.account:
            print("⚠️  No account loaded")
            return

        print(f"\n{'='*60}")
        print(f"ACCOUNT INFORMATION")
        print(f"{'='*60}")
        print(f"Address: {self.account.address}")
        print(f"Chain ID: {self.web3.eth.chain_id}")
        print(f"Contract: {self.contract_address}")

        try:
            balance = self.web3.eth.get_balance(self.account.address)
            print(f"Native Balance: {self.web3.from_wei(balance, 'ether')} ETH")
        except:
            pass

        print(f"{'='*60}\n")
