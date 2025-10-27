from web3 import Web3
from eth_account import Account
import os
from dotenv import load_dotenv

load_dotenv()

# ERC20 ABI for approve and allowance functions
ERC20_ABI = [
    {
        "constant": False,
        "inputs": [
            {"name": "spender", "type": "address"},
            {"name": "amount", "type": "uint256"}
        ],
        "name": "approve",
        "outputs": [{"name": "", "type": "bool"}],
        "type": "function"
    },
    {
        "constant": True,
        "inputs": [
            {"name": "owner", "type": "address"},
            {"name": "spender", "type": "address"}
        ],
        "name": "allowance",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
    },
    {
        "constant": True,
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
    }
]


class AllowanceManager:
    def __init__(self, web3_provider: str, private_key: str):
        self.web3 = Web3(Web3.HTTPProvider(web3_provider))
        self.account = Account.from_key(private_key)
        print(f"Connected: {self.web3.is_connected()}")
        print(f"Account: {self.account.address}")
    
    def check_allowance(self, token_address: str, spender_address: str) -> dict:
        """Check current allowance for a token"""
        try:
            token_address = Web3.to_checksum_address(token_address)
            spender_address = Web3.to_checksum_address(spender_address)
            
            token_contract = self.web3.eth.contract(
                address=token_address,
                abi=ERC20_ABI
            )
            
            # Get allowance
            allowance = token_contract.functions.allowance(
                self.account.address,
                spender_address
            ).call()
            
            # Get balance
            balance = token_contract.functions.balanceOf(
                self.account.address
            ).call()
            
            return {
                "success": True,
                "token": token_address,
                "spender": spender_address,
                "owner": self.account.address,
                "allowance": allowance,
                "allowance_formatted": allowance / (10**18),
                "balance": balance,
                "balance_formatted": balance / (10**18)
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
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
                address=Web3.to_checksum_address(token_address),
                abi=ERC20_ABI
            )
            
            # Convert amount to wei (18 decimals)
            amount_wei = int(float(amount) * (10 ** 18))
            
            # Build transaction
            transaction = token_contract.functions.approve(
                Web3.to_checksum_address(spender_address),
                amount_wei
            ).build_transaction({
                'from': account.address,
                'gas': 100000,
                'gasPrice': self.web3.to_wei('20', 'gwei'),
                'nonce': self.web3.eth.get_transaction_count(account.address)
            })
            
            # Sign transaction
            signed_txn = self.web3.eth.account.sign_transaction(transaction, private_key)
            
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

    def approve_token(self, token_address: str, spender_address: str, amount: int = None) -> dict:
        """
        Approve spender to spend tokens
        If amount is None, approves maximum uint256 value
        """
        try:
            token_address = Web3.to_checksum_address(token_address)
            spender_address = Web3.to_checksum_address(spender_address)
            
            # If no amount specified, use max uint256
            if amount is None:
                amount = 2**256 - 1
            
            token_contract = self.web3.eth.contract(
                address=token_address,
                abi=ERC20_ABI
            )
            
            # Build transaction
            approve_txn = token_contract.functions.approve(
                spender_address,
                amount
            ).build_transaction({
                'from': self.account.address,
                'nonce': self.web3.eth.get_transaction_count(self.account.address),
                'gas': 100000,
                'gasPrice': self.web3.to_wei('20', 'gwei')
            })
            
            # Sign transaction
            signed_txn = self.web3.eth.account.sign_transaction(
                approve_txn,
                self.account.key
            )
            
            # Send transaction
            tx_hash = self.web3.eth.send_raw_transaction(signed_txn.raw_transaction)
            
            print(f"Transaction sent: {tx_hash.hex()}")
            print("Waiting for confirmation...")
            
            # Wait for receipt
            receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            
            return {
                "success": receipt.status == 1,
                "transaction_hash": receipt.transactionHash.hex(),
                "gas_used": receipt.gasUsed,
                "block_number": receipt.blockNumber,
                "approved_amount": amount,
                "approved_amount_formatted": amount / (10**18) if amount < 2**256 - 1 else "MAX"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def approve_with_specific_amount(self, token_address: str, spender_address: str, 
                                     amount_in_tokens: float) -> dict:
        """Approve a specific amount in token units (e.g., 100 USDT)"""
        amount_wei = int(amount_in_tokens * (10**18))
        return self.approve_token(token_address, spender_address, amount_wei)


def main():
    # Configuration
    WEB3_PROVIDER = os.getenv("WEB3_PROVIDER", "https://testnet.hashio.io/api")
    PRIVATE_KEY = os.getenv("PRIVATE_KEY")
    SETTLEMENT_CONTRACT = os.getenv(
        "TRADE_SETTLE_CONTRACT_ADDRESS", 
        "0x237458E2cF7593084Ae397a50166A275A3928bA7"
    )
    
    # Token addresses
    HBAR_TOKEN = os.getenv("HBAR_TOKEN_ADDRESS", "0xb1F616b8134F602c3Bb465fB5b5e6565cCAd37Ed")
    USDT_TOKEN = os.getenv("USDT_TOKEN_ADDRESS", "0xc8B47803222A02F4FFF1727C6b8A4F2E779F672E")
    
    if not PRIVATE_KEY:
        print("Error: PRIVATE_KEY not found in environment variables")
        return
    
    # Initialize manager
    manager = AllowanceManager(WEB3_PROVIDER, PRIVATE_KEY)
    
    print("\n" + "="*60)
    print("TOKEN ALLOWANCE MANAGER")
    print("="*60)
    
    # Check current allowances
    print("\n--- Checking Current Allowances ---")
    
    print("\nHBAR Token:")
    hbar_allowance = manager.check_allowance(HBAR_TOKEN, SETTLEMENT_CONTRACT)
    if hbar_allowance["success"]:
        print(f"  Current Allowance: {hbar_allowance['allowance_formatted']:.2f} HBAR")
        print(f"  Current Balance: {hbar_allowance['balance_formatted']:.2f} HBAR")
    else:
        print(f"  Error: {hbar_allowance['error']}")
    
    print("\nUSDT Token:")
    usdt_allowance = manager.check_allowance(USDT_TOKEN, SETTLEMENT_CONTRACT)
    if usdt_allowance["success"]:
        print(f"  Current Allowance: {usdt_allowance['allowance_formatted']:.2f} USDT")
        print(f"  Current Balance: {usdt_allowance['balance_formatted']:.2f} USDT")
    else:
        print(f"  Error: {usdt_allowance['error']}")
    
    # Ask user if they want to approve
    print("\n--- Approve Tokens ---")
    print("Options:")
    print("1. Approve maximum amount (recommended)")
    print("2. Approve specific amount")
    print("3. Skip approval")
    
    choice = input("\nEnter your choice (1-3): ").strip()
    
    if choice == "1":
        # Approve maximum for both tokens
        print("\nApproving HBAR...")
        hbar_result = manager.approve_token(HBAR_TOKEN, SETTLEMENT_CONTRACT)
        if hbar_result["success"]:
            print(f"  ✓ Success! TX: {hbar_result['transaction_hash']}")
        else:
            print(f"  ✗ Failed: {hbar_result['error']}")
        
        print("\nApproving USDT...")
        usdt_result = manager.approve_token(USDT_TOKEN, SETTLEMENT_CONTRACT)
        if usdt_result["success"]:
            print(f"  ✓ Success! TX: {usdt_result['transaction_hash']}")
        else:
            print(f"  ✗ Failed: {usdt_result['error']}")
    
    elif choice == "2":
        # Approve specific amounts
        token_choice = input("\nWhich token? (HBAR/USDT): ").strip().upper()
        amount = float(input("Enter amount to approve: "))
        
        token_address = HBAR_TOKEN if token_choice == "HBAR" else USDT_TOKEN
        
        print(f"\nApproving {amount} {token_choice}...")
        result = manager.approve_with_specific_amount(
            token_address, 
            SETTLEMENT_CONTRACT, 
            amount
        )
        
        if result["success"]:
            print(f"  ✓ Success! TX: {result['transaction_hash']}")
        else:
            print(f"  ✗ Failed: {result['error']}")
    
    else:
        print("\nSkipping approval.")
    
    # Final check
    if choice in ["1", "2"]:
        print("\n--- Final Allowance Check ---")
        
        print("\nHBAR Token:")
        final_hbar = manager.check_allowance(HBAR_TOKEN, SETTLEMENT_CONTRACT)
        if final_hbar["success"]:
            print(f"  New Allowance: {final_hbar['allowance_formatted']:.2f} HBAR")
        
        print("\nUSDT Token:")
        final_usdt = manager.check_allowance(USDT_TOKEN, SETTLEMENT_CONTRACT)
        if final_usdt["success"]:
            print(f"  New Allowance: {final_usdt['allowance_formatted']:.2f} USDT")
    
    print("\n" + "="*60)


if __name__ == "__main__":
    main()