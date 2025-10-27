import os
from dotenv import load_dotenv
from web3 import Web3
from eth_account import Account
from pathlib import Path


# from eth_account.messages import encode_structured_data
import json

# import time
from typing import Tuple
load_dotenv()

base_path = Path(__file__).parent / "abi"
# Load ERC20 ABI
with open(base_path / "erc20.abi.json", "r", encoding="utf-8") as f:
    erc20_abi = json.load(f)

# Load Settlement ABI
with open(base_path / "settlement.abi.json", "r", encoding="utf-8") as f:
    settlement_abi = json.load(f)


class Web3Client:
    def __init__(
        self,
        web3_provider: str,
        contract_address: str,
        contract_abi: dict,
        private_key: str = None,
    ):
        self.web3 = Web3(Web3.HTTPProvider(web3_provider))
        self.contract_address = Web3.to_checksum_address(contract_address)
        self.contract = self.web3.eth.contract(
            address=self.contract_address, abi=contract_abi
        )
        self.account = Account.from_key(private_key) if private_key else None

    def give_allowance(self, spender_address, token_address, amount, private_key):
        """Simple script to give token allowance to a contract"""

        print("=== Token Allowance Script ===")

        # User inputs

        try:
            # Setup Web3

            if not self.web3.is_connected():
                print("❌ Failed to connect to RPC")
                return

            # Setup account
            account = self.web3.eth.account.from_key(private_key)
            print(f"✅ Using account: {account.address}")

            # Setup token contract
            token_contract = self.web3.eth.contract(
                address=Web3.to_checksum_address(token_address), abi=ERC20_ABI
            )

            # Convert amount to wei (18 decimals)
            amount_wei = int(float(amount) * (10**18))

            # Build transaction
            transaction = token_contract.functions.approve(
                Web3.to_checksum_address(spender_address), amount_wei
            ).build_transaction(
                {
                    "from": account.address,
                    "gas": 100000,
                    "gasPrice": self.web3.to_wei("20", "gwei"),
                    "nonce": self.web3.eth.get_transaction_count(account.address),
                }
            )

            # Sign transaction
            signed_txn = self.web3.eth.account.sign_transaction(
                transaction, private_key
            )

            print(f"📝 Approving {amount} tokens...")
            print(f"   Token: {token_address}")
            print(f"   Spender: {spender_address}")

            # Send transaction
            tx_hash = self.web3.eth.send_raw_transaction(signed_txn.raw_transaction)
            print(f"🚀 Transaction sent: {tx_hash.hex()}")

            # Wait for confirmation
            print("⏳ Waiting for confirmation...")
            receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash)

            if receipt.status == 1:
                print(f"✅ SUCCESS! Allowance approved")
                print(f"   Block: {receipt.blockNumber}")
                print(f"   Gas used: {receipt.gasUsed}")
            else:
                print("❌ Transaction failed")

        except Exception as e:
            print(f"❌ Error: {e}")

    async def check_allowance(
        self, user_address: str, token_address: str, required_amount: int
    ) -> Tuple[bool, int]:
        """Check if user has sufficient allowance for the contract"""
        try:
            user_address = Web3.to_checksum_address(user_address)
            token_address = Web3.to_checksum_address(token_address)

            result = self.contract.functions.checkAllowance(
                user_address, token_address, required_amount
            ).call()
            sufficient, current_allowance = result
            # print(sufficient, current_allowance, "CHEK HERe")

            return sufficient, current_allowance

        except Exception as e:
            print(f"Error checking allowance: {e}")
            return False, 0

    async def check_balance(
        self, user_address: str, token_address: str, required_amount: int
    ) -> Tuple[bool, int]:
        """Check if user has sufficient token balance"""
        try:
            user_address = Web3.to_checksum_address(user_address)
            token_address = Web3.to_checksum_address(token_address)

            result = self.contract.functions.checkBalance(
                user_address, token_address, required_amount
            ).call()

            sufficient, current_balance = result

            # print(sufficient, current_balance, "WHO BE YOU!")
            return sufficient, current_balance

        except Exception as e:
            print(f"Error checking balance: {e}")
            return False, 0


# ERC20 ABI for approve and allowance functions
ERC20_ABI = erc20_abi  # import abi

# Contract ABI for your TradeSettlement contract
TRADE_SETTLEMENT_ABI = settlement_abi  # import abi


# Helper function to encode ABI packed data
def encode_abi_packed(types, values):
    """Helper function to encode data similar to Solidity's abi.encodePacked"""
    from eth_abi.packed import encode_packed

    return encode_packed(types, values)


# Example usage
def main():
    # Configuration

    WEB3_PROVIDER = os.getenv("WEB3_PROVIDER", "https://your-ethereum-node.com")
    TRADE_SETTLEMENT_CONTRACT_ADDRESS = os.getenv(
        "TRADE_SETTLE_CONTRACT_ADDRESS", "0x237458E2cF7593084Ae397a50166A275A3928bA7"
    )
    PRIVATE_KEY = os.getenv("PRIVATE_KEY")

    # Initialize client
    client = Web3Client(
        web3_provider=WEB3_PROVIDER,
        contract_address=TRADE_SETTLEMENT_CONTRACT_ADDRESS,
        contract_abi=TRADE_SETTLEMENT_ABI,
        private_key=PRIVATE_KEY,
    )

    # Test basic functionality
    try:
        # Check if client is connected
        print(f"Web3 connected: {client.web3.isConnected()}")

        # Test allowance check
        test_user = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92367"
        test_token = "0x1234567890123456789012345678901234567890"
        test_amount = 1000000000000000000  # 1 token with 18 decimals

        sufficient, current = client.check_allowance(test_user, test_token, test_amount)
        print(f"Allowance check - Sufficient: {sufficient}, Current: {current}")

        # Test balance check
        balance_sufficient, current_balance = client.check_balance(
            test_user, test_token, test_amount
        )
        print(
            f"Balance check - Sufficient: {balance_sufficient}, Current: {current_balance}"
        )

        # Get nonce
        nonce = client.get_user_nonce(test_user, test_token)
        print(f"User nonce: {nonce}")

    except Exception as e:
        print(f"Error during testing: {e}")


if __name__ == "__main__":
    main()
