from web3 import Web3
import json

# ERC20 Token ABI (just the approve function)
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
    }
]

def give_allowance():
    """Simple script to give token allowance to a contract on Hedera"""
    
    print("=== Token Allowance Script (Hedera) ===")
    
    # User inputs
    rpc_url = input("Enter RPC URL (default: https://testnet.hashio.io/api): ") or "https://testnet.hashio.io/api"
    private_key = input("Enter your private key: ")
    token_address = input("Enter token contract address: ")
    spender_address = input("Enter spender contract address: ")
    amount = input("Enter amount to approve (in tokens, e.g., 100): ")
    
    try:
        # Setup Web3
        web3 = Web3(Web3.HTTPProvider(rpc_url))
        
        if not web3.is_connected():
            print("❌ Failed to connect to RPC")
            return
        
        # Setup account
        account = web3.eth.account.from_key(private_key)
        print(f"✅ Using account: {account.address}")
        
        # Setup token contract
        token_contract = web3.eth.contract(
            address=Web3.to_checksum_address(token_address),
            abi=ERC20_ABI
        )
        
        # Convert amount to wei (18 decimals)
        amount_wei = int(float(amount) * (10 ** 18))
        
        # Get current gas price from network
        try:
            gas_price = web3.eth.gas_price
            print(f"📊 Current gas price: {web3.from_wei(gas_price, 'gwei')} gwei")
        except:
            # Fallback for Hedera - use a minimal gas price
            gas_price = web3.to_wei('0.0000001', 'gwei')
            print(f"📊 Using fallback gas price: {web3.from_wei(gas_price, 'gwei')} gwei")
        
        # Build transaction - Hedera specific settings
        transaction = token_contract.functions.approve(
            Web3.to_checksum_address(spender_address),
            amount_wei
        ).build_transaction({
            'from': account.address,
            'gas': 100000,
            'gasPrice': gas_price,
            'nonce': web3.eth.get_transaction_count(account.address),
            'chainId': 296  # Hedera testnet chain ID
        })
        
        # Sign transaction
        signed_txn = web3.eth.account.sign_transaction(transaction, private_key)
        
        print(f"📝 Approving {amount} tokens...")
        print(f"   Token: {token_address}")
        print(f"   Spender: {spender_address}")
        print(f"   Chain ID: 296 (Hedera Testnet)")
        
        # Send transaction
        tx_hash = web3.eth.send_raw_transaction(signed_txn.raw_transaction)
        print(f"🚀 Transaction sent: {tx_hash.hex()}")
        
        # Wait for confirmation
        print("⏳ Waiting for confirmation...")
        receipt = web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        
        if receipt.status == 1:
            print(f"✅ SUCCESS! Allowance approved")
            print(f"   Block: {receipt.blockNumber}")
            print(f"   Gas used: {receipt.gasUsed}")
            print(f"   Transaction hash: {receipt.transactionHash.hex()}")
        else:
            print("❌ Transaction failed")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        print("\nFull error details:")
        traceback.print_exc()

if __name__ == "__main__":
    give_allowance()