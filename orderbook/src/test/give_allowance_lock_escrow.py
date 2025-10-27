from web3 import Web3
import json

# ERC20 Token ABI
ERC20_ABI = [
    {
        "constant": False,
        "inputs": [
            {"name": "spender", "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "name": "approve",
        "outputs": [{"name": "", "type": "bool"}],
        "type": "function",
    },
    {
        "constant": True,
        "inputs": [
            {"name": "owner", "type": "address"},
            {"name": "spender", "type": "address"},
        ],
        "name": "allowance",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function",
    },
    {
        "constant": True,
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function",
    }
]

# Settlement Contract ABI
SETTLEMENT_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "token", "type": "address"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"},
        ],
        "name": "depositToEscrow",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "address", "name": "user", "type": "address"},
            {"internalType": "address", "name": "token", "type": "address"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"},
            {"internalType": "bytes32", "name": "orderId", "type": "bytes32"},
        ],
        "name": "lockEscrowForOrder",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "address", "name": "user", "type": "address"},
            {"internalType": "address", "name": "token", "type": "address"},
        ],
        "name": "checkEscrowBalance",
        "outputs": [
            {"internalType": "uint256", "name": "total", "type": "uint256"},
            {"internalType": "uint256", "name": "available", "type": "uint256"},
            {"internalType": "uint256", "name": "locked", "type": "uint256"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
]


class HederaEscrowManager:
    def __init__(self):
        self.web3 = None
        self.account = None
        self.token_contract = None
        self.settlement_contract = None
        self.token_address = None
        self.settlement_address = None
        
    def setup(self):
        """Initialize Web3 connection and contracts"""
        print("\n=== Hedera Escrow Manager Setup ===\n")
        
        # Get connection details
        rpc_url = input("Enter RPC URL (default: https://testnet.hashio.io/api): ") or "https://testnet.hashio.io/api"
        private_key = input("Enter your private key: ")
        self.token_address = input("Enter token contract address: ")
        self.settlement_address = input("Enter settlement contract address: ")
        
        try:
            # Setup Web3
            self.web3 = Web3(Web3.HTTPProvider(rpc_url))
            
            if not self.web3.is_connected():
                print("❌ Failed to connect to RPC")
                return False
            
            # Setup account
            self.account = self.web3.eth.account.from_key(private_key)
            print(f"✅ Connected as: {self.account.address}\n")
            
            # Setup contracts
            self.token_contract = self.web3.eth.contract(
                address=Web3.to_checksum_address(self.token_address),
                abi=ERC20_ABI
            )
            
            self.settlement_contract = self.web3.eth.contract(
                address=Web3.to_checksum_address(self.settlement_address),
                abi=SETTLEMENT_ABI
            )
            
            return True
            
        except Exception as e:
            print(f"❌ Setup Error: {e}")
            return False
    
    def get_gas_price(self):
        """Get gas price for Hedera"""
        try:
            gas_price = self.web3.eth.gas_price
            return gas_price
        except:
            # Fallback for Hedera
            return self.web3.to_wei("0.0000001", "gwei")
    
    def get_failure_reason(self, tx_hash):
        """Get the reason why a transaction failed"""
        try:
            # Get the transaction receipt
            receipt = self.web3.eth.get_transaction_receipt(tx_hash)
            
            # Get the transaction details
            tx = self.web3.eth.get_transaction(tx_hash)
            
            # Try to replay the transaction to get the revert reason
            try:
                self.web3.eth.call(
                    {
                        'from': tx['from'],
                        'to': tx['to'],
                        'data': tx['input'],
                        'value': tx['value'],
                        'gas': tx['gas'],
                    },
                    tx.blockNumber - 1
                )
            except Exception as e:
                error_message = str(e)
                
                # Decode custom error selectors
                decoded_error = self.decode_custom_error(error_message)
                if decoded_error:
                    return decoded_error
                
                # Try to extract revert reason
                if "revert" in error_message.lower():
                    return error_message
                return f"Transaction reverted: {error_message}"
                
            return "Transaction failed but no revert reason found"
            
        except Exception as e:
            return f"Could not determine failure reason: {str(e)}"
    
    def decode_custom_error(self, error_message):
        """Decode common custom error selectors"""
        # Common custom error selectors
        error_selectors = {
            "0xe450d38c": "InsufficientAllowance - The settlement contract doesn't have enough token allowance",
            "0xf4d678b8": "InsufficientBalance - Not enough tokens in your wallet",
            "0x3f2a8f6f": "InsufficientEscrowBalance - Not enough funds in escrow",
            "0x750b219c": "TransferFailed - Token transfer failed",
            "0xd29d4325": "EscrowLocked - Escrow funds are locked for an order",
            "0x579610db": "Unauthorized - Caller is not authorized",
            "0xfb8f41b2": "ZeroAmount - Cannot use zero amount",
            "0x4e487b71": "Panic - Arithmetic error (overflow/underflow)",
        }
        
        # Extract error selector from message
        for selector, description in error_selectors.items():
            if selector in error_message:
                # Try to extract parameters
                params = self.extract_error_params(error_message, selector)
                if params:
                    return f"{description}\n   Error Details: {params}"
                return description
        
        return None
    
    def extract_error_params(self, error_message, selector):
        """Extract parameters from custom error"""
        try:
            # Find the hex data after the selector
            import re
            pattern = f"{selector}([0-9a-fA-F]+)"
            match = re.search(pattern, error_message)
            
            if match:
                params_hex = match.group(1)
                
                # Common parameter patterns
                if len(params_hex) >= 64:
                    # Likely contains addresses and/or amounts
                    chunks = [params_hex[i:i+64] for i in range(0, len(params_hex), 64)]
                    decoded_params = []
                    
                    for chunk in chunks[:3]:  # Only show first 3 params
                        # Try to decode as address
                        if chunk.startswith('0' * 24):
                            addr = '0x' + chunk[24:]
                            decoded_params.append(f"Address: 0x{chunk[24:]}")
                        # Try to decode as uint256
                        else:
                            try:
                                value = int(chunk, 16)
                                if value > 0:
                                    # Convert to tokens if it looks like wei
                                    if value > 1000000000000000:
                                        tokens = value / (10**18)
                                        decoded_params.append(f"Amount: {tokens} tokens ({value} wei)")
                                    else:
                                        decoded_params.append(f"Value: {value}")
                            except:
                                pass
                    
                    if decoded_params:
                        return ", ".join(decoded_params)
                
                return f"Raw data: 0x{params_hex[:64]}..."
        except:
            pass
        
        return None
    
    def check_token_balance(self):
        """Check token balance of an account"""
        print("\n=== Check Token Balance ===\n")
        
        address = input(f"Enter address to check (default: {self.account.address}): ") or self.account.address
        
        try:
            balance = self.token_contract.functions.balanceOf(
                Web3.to_checksum_address(address)
            ).call()
            
            balance_tokens = self.web3.from_wei(balance, 'ether')
            
            print(f"\n💰 Token Balance:")
            print(f"   Address:    {address}")
            print(f"   Token:      {self.token_address}")
            print(f"   Balance:    {balance_tokens} tokens")
            print(f"   Raw amount: {balance} wei")
            
            if balance == 0:
                print(f"\n⚠️  WARNING: This address has 0 tokens!")
            else:
                print(f"\n✅ Address has {balance_tokens} tokens available")
            
        except Exception as e:
            print(f"❌ Error: {e}")
    
    def check_allowance(self):
        """Check token allowance for settlement contract"""
        print("\n=== Check Token Allowance ===\n")
        
        owner_address = (
            input(f"Enter owner address (default: {self.account.address}): ")
            or self.account.address
        )
        
        try:
            allowance = self.token_contract.functions.allowance(
                Web3.to_checksum_address(owner_address),
                Web3.to_checksum_address(self.settlement_address)
            ).call()
            
            allowance_tokens = self.web3.from_wei(allowance, 'ether')
            
            print(f"\n💰 Allowance Details:")
            print(f"   Owner:      {owner_address}")
            print(f"   Spender:    {self.settlement_address}")
            print(f"   Allowance:  {allowance_tokens} tokens")
            print(f"   Raw amount: {allowance} wei")
            
            if allowance == 0:
                print(f"\n⚠️  No allowance set. Settlement contract cannot spend tokens.")
            else:
                print(f"\n✅ Settlement contract can spend up to {allowance_tokens} tokens")
            
        except Exception as e:
            print(f"❌ Error: {e}")
    
    def approve_tokens(self):
        """Approve tokens for settlement contract"""
        print("\n=== Approve Tokens ===\n")
        
        amount = input("Enter amount to approve (in tokens): ")
        
        try:
            amount_wei = int(float(amount) * (10**18))
            gas_price = self.get_gas_price()
            
            transaction = self.token_contract.functions.approve(
                Web3.to_checksum_address(self.settlement_address),
                amount_wei
            ).build_transaction({
                "from": self.account.address,
                "gas": 100000,
                "gasPrice": gas_price,
                "nonce": self.web3.eth.get_transaction_count(self.account.address),
                "chainId": 296,
            })
            
            signed_txn = self.web3.eth.account.sign_transaction(transaction, self.account.key)
            
            print(f"📝 Approving {amount} tokens...")
            tx_hash = self.web3.eth.send_raw_transaction(signed_txn.raw_transaction)
            print(f"🚀 Transaction sent: {tx_hash.hex()}")
            
            print("⏳ Waiting for confirmation...")
            receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            
            if receipt.status == 1:
                print(f"✅ SUCCESS! Approved {amount} tokens")
                print(f"   Gas used: {receipt.gasUsed}")
            else:
                print("❌ Transaction failed")
                reason = self.get_failure_reason(tx_hash)
                print(f"   Failure reason: {reason}")
                
        except Exception as e:
            print(f"❌ Error: {e}")
    
    def check_escrow_balance(self):
        """Check escrow balance"""
        print("\n=== Check Escrow Balance ===\n")
        
        user_address = input(f"Enter user address (default: {self.account.address}): ") or self.account.address
        
        try:
            total, available, locked = self.settlement_contract.functions.checkEscrowBalance(
                Web3.to_checksum_address(user_address),
                Web3.to_checksum_address(self.token_address)
            ).call()
            
            print(f"\n📊 Escrow Balance for {user_address}:")
            print(f"   Total:     {self.web3.from_wei(total, 'ether')} tokens")
            print(f"   Available: {self.web3.from_wei(available, 'ether')} tokens")
            print(f"   Locked:    {self.web3.from_wei(locked, 'ether')} tokens")
            
        except Exception as e:
            print(f"❌ Error: {e}")
    
    def diagnose_deposit_issue(self):
        """Diagnose why deposit might be failing"""
        print("\n=== Deposit Diagnostics ===\n")
        
        try:
            # Check wallet balance
            balance = self.token_contract.functions.balanceOf(
                Web3.to_checksum_address(self.account.address)
            ).call()
            balance_tokens = self.web3.from_wei(balance, 'ether')
            
            # Check allowance
            allowance = self.token_contract.functions.allowance(
                Web3.to_checksum_address(self.account.address),
                Web3.to_checksum_address(self.settlement_address)
            ).call()
            allowance_tokens = self.web3.from_wei(allowance, 'ether')
            
            print(f"📊 Account Status:")
            print(f"   Address:     {self.account.address}")
            print(f"   Token:       {self.token_address}")
            print(f"   Settlement:  {self.settlement_address}\n")
            
            print(f"💰 Token Balance:")
            print(f"   Wallet:      {balance_tokens} tokens")
            print(f"   Allowance:   {allowance_tokens} tokens\n")
            
            # Analyze issues
            issues = []
            if balance == 0:
                issues.append("❌ CRITICAL: Your wallet has 0 tokens! You need to get tokens first.")
            
            if allowance == 0:
                issues.append("❌ CRITICAL: Allowance is 0! You must approve tokens before depositing.")
            elif allowance < balance:
                issues.append(f"⚠️  WARNING: Allowance ({allowance_tokens}) is less than balance ({balance_tokens})")
            
            if issues:
                print("🔍 Issues Found:")
                for issue in issues:
                    print(f"   {issue}")
                    
                print("\n💡 Recommended Actions:")
                if balance == 0:
                    print("   1. Get tokens from a faucet or exchange")
                    print("   2. Transfer tokens to your wallet")
                if allowance == 0 or allowance < balance:
                    print(f"   3. Approve tokens (Menu option 3)")
                    print(f"      Recommended: Approve at least {balance_tokens} tokens")
            else:
                print("✅ Everything looks good! You should be able to deposit.")
                print(f"   Maximum deposit: {min(balance_tokens, allowance_tokens)} tokens")
            
        except Exception as e:
            print(f"❌ Error during diagnostics: {e}")
    
    def deposit_to_escrow(self):
        """Deposit tokens to escrow"""
        print("\n=== Deposit to Escrow ===\n")
        
        amount = input("Enter amount to deposit (in tokens): ")
        
        try:
            amount_wei = int(float(amount) * (10**18))
            gas_price = self.get_gas_price()
            
            transaction = self.settlement_contract.functions.depositToEscrow(
                Web3.to_checksum_address(self.token_address),
                amount_wei
            ).build_transaction({
                "from": self.account.address,
                "gas": 150000,
                "gasPrice": gas_price,
                "nonce": self.web3.eth.get_transaction_count(self.account.address),
                "chainId": 296,
            })
            
            signed_txn = self.web3.eth.account.sign_transaction(transaction, self.account.key)
            
            print(f"📝 Depositing {amount} tokens to escrow...")
            tx_hash = self.web3.eth.send_raw_transaction(signed_txn.raw_transaction)
            print(f"🚀 Transaction sent: {tx_hash.hex()}")
            
            print("⏳ Waiting for confirmation...")
            receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            
            if receipt.status == 1:
                print(f"✅ SUCCESS! Deposited {amount} tokens to escrow")
                print(f"   Gas used: {receipt.gasUsed}")
            else:
                print("❌ Transaction failed")
                reason = self.get_failure_reason(tx_hash)
                print(f"   Failure reason: {reason}")
                
        except Exception as e:
            print(f"❌ Error: {e}")
    
    def lock_escrow_for_order(self):
        """Lock escrow for an order"""
        print("\n=== Lock Escrow for Order ===\n")
        
        user_address = input(f"Enter user address (default: {self.account.address}): ") or self.account.address
        amount = input("Enter amount to lock (in tokens): ")
        order_id = input("Enter order ID (32-byte hex, e.g., 0x123...): ")
        
        try:
            amount_wei = int(float(amount) * (10**18))
            gas_price = self.get_gas_price()
            
            # Ensure order_id is proper bytes32 format
            if not order_id.startswith("0x"):
                order_id = "0x" + order_id
            if len(order_id) < 66:  # 0x + 64 hex chars
                order_id = order_id.ljust(66, '0')
            
            transaction = self.settlement_contract.functions.lockEscrowForOrder(
                Web3.to_checksum_address(user_address),
                Web3.to_checksum_address(self.token_address),
                amount_wei,
                order_id
            ).build_transaction({
                "from": self.account.address,
                "gas": 150000,
                "gasPrice": gas_price,
                "nonce": self.web3.eth.get_transaction_count(self.account.address),
                "chainId": 296,
            })
            
            signed_txn = self.web3.eth.account.sign_transaction(transaction, self.account.key)
            
            print(f"📝 Locking {amount} tokens for order {order_id}...")
            tx_hash = self.web3.eth.send_raw_transaction(signed_txn.raw_transaction)
            print(f"🚀 Transaction sent: {tx_hash.hex()}")
            
            print("⏳ Waiting for confirmation...")
            receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            
            if receipt.status == 1:
                print(f"✅ SUCCESS! Locked {amount} tokens for order")
                print(f"   Gas used: {receipt.gasUsed}")
            else:
                print("❌ Transaction failed")
                reason = self.get_failure_reason(tx_hash)
                print(f"   Failure reason: {reason}")
                
        except Exception as e:
            print(f"❌ Error: {e}")
    
    def run(self):
        """Main menu loop"""
        if not self.setup():
            return
        
        while True:
            print("\n" + "="*50)
            print("Hedera Escrow Manager - Main Menu")
            print("="*50)
            print("1. Check Token Balance")
            print("2. Check Token Allowance")
            print("3. Approve Tokens")
            print("4. Check Escrow Balance")
            print("5. Deposit to Escrow")
            print("6. Lock Escrow for Order")
            print("7. Quick Flow (Approve → Deposit → Lock)")
            print("8. Diagnose Deposit Issues")
            print("9. Exit")
            print("="*50)
            
            choice = input("\nEnter your choice (1-9): ")
            
            if choice == "1":
                self.check_token_balance()
            elif choice == "2":
                self.check_allowance()
            elif choice == "3":
                self.approve_tokens()
            elif choice == "4":
                self.check_escrow_balance()
            elif choice == "5":
                self.deposit_to_escrow()
            elif choice == "6":
                self.lock_escrow_for_order()
            elif choice == "7":
                self.quick_flow()
            elif choice == "8":
                self.diagnose_deposit_issue()
            elif choice == "9":
                print("\n👋 Goodbye!")
                break
            else:
                print("❌ Invalid choice. Please try again.")
    
    def quick_flow(self):
        """Quick workflow: approve, deposit, and lock in one go"""
        print("\n=== Quick Flow: Approve → Deposit → Lock ===\n")
        
        amount = input("Enter amount (in tokens): ")
        order_id = input("Enter order ID (32-byte hex, e.g., 0x123...): ")
        
        print("\n🔄 Step 1/3: Approving tokens...")
        self.approve_tokens_quick(amount)
        
        input("\nPress Enter to continue to deposit...")
        
        print("\n🔄 Step 2/3: Depositing to escrow...")
        self.deposit_to_escrow_quick(amount)
        
        input("\nPress Enter to continue to lock...")
        
        print("\n🔄 Step 3/3: Locking for order...")
        self.lock_escrow_for_order_quick(self.account.address, amount, order_id)
        
        print("\n✅ Quick flow completed!")
    
    def approve_tokens_quick(self, amount):
        """Quick approve without prompts"""
        try:
            amount_wei = int(float(amount) * (10**18))
            gas_price = self.get_gas_price()
            
            transaction = self.token_contract.functions.approve(
                Web3.to_checksum_address(self.settlement_address),
                amount_wei
            ).build_transaction({
                "from": self.account.address,
                "gas": 100000,
                "gasPrice": gas_price,
                "nonce": self.web3.eth.get_transaction_count(self.account.address),
                "chainId": 296,
            })
            
            signed_txn = self.web3.eth.account.sign_transaction(transaction, self.account.key)
            tx_hash = self.web3.eth.send_raw_transaction(signed_txn.raw_transaction)
            print(f"🚀 Approval sent: {tx_hash.hex()}")
            
            receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            if receipt.status == 1:
                print(f"✅ Approved {amount} tokens")
            else:
                print("❌ Approval failed")
                reason = self.get_failure_reason(tx_hash)
                print(f"   Failure reason: {reason}")
                
        except Exception as e:
            print(f"❌ Error: {e}")
    
    def deposit_to_escrow_quick(self, amount):
        """Quick deposit without prompts"""
        try:
            amount_wei = int(float(amount) * (10**18))
            gas_price = self.get_gas_price()
            
            transaction = self.settlement_contract.functions.depositToEscrow(
                Web3.to_checksum_address(self.token_address),
                amount_wei
            ).build_transaction({
                "from": self.account.address,
                "gas": 150000,
                "gasPrice": gas_price,
                "nonce": self.web3.eth.get_transaction_count(self.account.address),
                "chainId": 296,
            })
            
            signed_txn = self.web3.eth.account.sign_transaction(transaction, self.account.key)
            tx_hash = self.web3.eth.send_raw_transaction(signed_txn.raw_transaction)
            print(f"🚀 Deposit sent: {tx_hash.hex()}")
            
            receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            if receipt.status == 1:
                print(f"✅ Deposited {amount} tokens")
            else:
                print("❌ Deposit failed")
                reason = self.get_failure_reason(tx_hash)
                print(f"   Failure reason: {reason}")
                
        except Exception as e:
            print(f"❌ Error: {e}")
    
    def lock_escrow_for_order_quick(self, user_address, amount, order_id):
        """Quick lock without prompts"""
        try:
            amount_wei = int(float(amount) * (10**18))
            gas_price = self.get_gas_price()
            
            if not order_id.startswith("0x"):
                order_id = "0x" + order_id
            if len(order_id) < 66:
                order_id = order_id.ljust(66, '0')
            
            transaction = self.settlement_contract.functions.lockEscrowForOrder(
                Web3.to_checksum_address(user_address),
                Web3.to_checksum_address(self.token_address),
                amount_wei,
                order_id
            ).build_transaction({
                "from": self.account.address,
                "gas": 150000,
                "gasPrice": gas_price,
                "nonce": self.web3.eth.get_transaction_count(self.account.address),
                "chainId": 296,
            })
            
            signed_txn = self.web3.eth.account.sign_transaction(transaction, self.account.key)
            tx_hash = self.web3.eth.send_raw_transaction(signed_txn.raw_transaction)
            print(f"🚀 Lock sent: {tx_hash.hex()}")
            
            receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            if receipt.status == 1:
                print(f"✅ Locked {amount} tokens")
            else:
                print("❌ Lock failed")
                reason = self.get_failure_reason(tx_hash)
                print(f"   Failure reason: {reason}")
                
        except Exception as e:
            print(f"❌ Error: {e}")


if __name__ == "__main__":
    manager = HederaEscrowManager()
    manager.run()