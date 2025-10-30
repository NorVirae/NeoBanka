

# NeoBank Market Making API

## TL,DR
We've built an order book engine with on-chain settlement for decentralized market making for the HBAR Hackathon when Filament API shut down. Built with Python/FastAPI, has live order matching, Web3 integration and automated trade settlement with cryptographic validation.

## Architecture

```python
NeoBank-market-making-api/
├── main.py                          # FastAPI server & endpoint handlers (837 LOC)
├── orderbook/                       # Core order book engine
│   ├── __init__.py
│   ├── orderbook.py                 # Order book implementation (424 LOC)  
│   ├── order.py                     # Order data structures (46 LOC)
│   ├── orderlist.py                 # Price-level order queues
│   ├── ordertree.py                 # Price-ordered binary tree
│   ├── trade_settlement_client.py   # Web3 settlement integration
│   └── settlement_abi.json          # Smart contract ABI
└── requirements.txt                 # Dependencies
```

## Components

### OrderBook Engine
```python
class OrderBook(object):
    def __init__(self, tick_size=0.0001):
        self.tape = deque(maxlen=None)      # Trade history
        self.bids = OrderTree()             # Bid orders (price-ordered)
        self.asks = OrderTree()             # Ask orders (price-ordered)
        self.next_order_id = 0
```

**Methods:**
- `process_limit_order()` - Match/place limit orders
- `process_market_order()` - Execute market orders  
- `cancel_order()` - Remove orders from book
- `get_orderbook()` - Serialize order book state

### Order Data Structure
```python
class Order(object):
    def __init__(self, quote, order_list):
        self.timestamp = int(quote['timestamp'])
        self.quantity = Decimal(quote['quantity'])
        self.price = Decimal(quote['price'])
        self.order_id = int(quote['order_id'])
        self.account = quote['account']
        self.side = quote['side']  # 'bid' or 'ask'
        self.private_key = quote['private_key']
        # Doubly-linked list for same-price orders
        self.next_order = None
        self.prev_order = None
```

### Trade Settlement Client
```python
class TradeSettlementClient:
    def __init__(self, web3_provider, contract_address, contract_abi, private_key):
        self.web3 = Web3(Web3.HTTPProvider(web3_provider))
        self.contract = self.web3.eth.contract(address=contract_address, abi=contract_abi)
        self.account = Account.from_key(private_key)
        
    def check_allowance(self, user_address, token_address, required_amount):
        # Verify ERC-20 token allowances
        
    def check_balance(self, user_address, token_address, required_amount): 
        # Validate user token balances
```

## API Endpoints

### FastAPI Server
```python
app = FastAPI()
settlement_client: TradeSettlementClient = None
order_books = {}  # Multi-symbol order books

@app.on_event("startup")
async def startup_event():
    global settlement_client
    settlement_client = TradeSettlementClient(WEB3_PROVIDER, CONTRACT_ADDRESS, CONTRACT_ABI, PRIVATE_KEY)
```

### Order Management

#### POST `/api/register_order`
Place new limit orders with validation and settlement.

**Payload Format:**
```python
payload = {
    "account": "0x...",
    "baseAsset": "HBAR",
    "quoteAsset": "USDT", 
    "price": "1.50",
    "quantity": "100.0",
    "side": "bid",  # or "ask"
    "privateKey": "0x..."
}
```

**Processing Pipeline:**
```python
async def register_order(payload: str = Form(...)):
    # 1. Parse JSON payload
    payload_json = json.loads(payload)
    
    # 2. Validate prerequisites (balance & allowance)
    validation_result = await validate_order_prerequisites(payload_json)
    
    # 3. Process order in order book
    symbol = f"{payload_json['baseAsset']}_{payload_json['quoteAsset']}"
    order_book = order_books.get(symbol, OrderBook())
    process_result = order_book.process_order(_order, False, False)
    
    # 4. Settle trades if any exist
    if trades:
        settlement_info = await settle_trades_if_any(order_dict)
        
    return {"order": order_dict, "settlement_info": settlement_info}
```

#### POST `/api/cancel_order`
Cancel existing orders by ID.

```python
def cancel_order(payload: str = Form(...)):
    payload_json = json.loads(payload)
    order_id = payload_json["orderId"]
    side = payload_json["side"]
    symbol = f"{payload_json['baseAsset']}_{payload_json['quoteAsset']}"
    
    order_book = order_books[symbol]
    order_book.cancel_order(side, order_id)
```

#### POST `/api/orderbook`
Retrieve order book snapshot.

```python
def get_orderbook(payload: str = Form(...)):
    symbol = payload_json["symbol"]
    order_book = order_books[symbol]
    result = order_book.get_orderbook(symbol)
    
    return {
        "orderbook": {
            "bids": [[price, quantity], ...],
            "asks": [[price, quantity], ...]
        }
    }
```

## Order Matching Algorithm

### Limit Order Processing
```python
def process_limit_order(self, quote, from_data, verbose):
    side = quote["side"]
    price = quote["price"]
    quantity_to_trade = quote["quantity"]
    
    if side == "bid":
        # Check if bid crosses spread
        if self.asks and price >= self.asks.min_price():
            # Execute against best asks
            best_price_asks = self.asks.min_price_list()
            quantity_to_trade, trades = self.process_order_list("ask", best_price_asks, quantity_to_trade, quote)
            
        # Add remaining quantity to book
        if quantity_to_trade > 0:
            self.bids.insert_order(quote)
            
    elif side == "ask":
        # Similar logic for asks vs bids
        if self.bids and price <= self.bids.max_price():
            best_price_bids = self.bids.max_price_list()
            quantity_to_trade, trades = self.process_order_list("bid", best_price_bids, quantity_to_trade, quote)
```

### Trade Execution
```python  
def process_order_list(self, side, order_list, quantity_still_to_trade, quote):
    trades = []
    quantity_to_trade = quantity_still_to_trade
    
    while len(order_list) > 0 and quantity_to_trade > 0:
        head_order = order_list.get_head_order()
        
        if quantity_to_trade < head_order.quantity:
            # Partial fill
            traded_quantity = quantity_to_trade
            head_order.update_quantity(head_order.quantity - quantity_to_trade)
            quantity_to_trade = 0
            
        elif quantity_to_trade == head_order.quantity:
            # Complete fill
            traded_quantity = quantity_to_trade
            self.remove_order_by_id(head_order.order_id)
            quantity_to_trade = 0
            
        # Record trade
        trade_record = {
            "timestamp": self.time,
            "price": head_order.price,
            "quantity": traded_quantity,
            "party1": [head_order.account, side, head_order.order_id, ...],
            "party2": [quote["account"], opposite_side, None, ...]
        }
        trades.append(trade_record)
```

## Smart Contract Integration

### Pre-Trade Validation
```python
async def validate_order_prerequisites(order_data: dict) -> dict:
    account = order_data["account"]
    base_asset = order_data["baseAsset"] 
    quote_asset = order_data["quoteAsset"]
    price = Decimal(order_data["price"])
    quantity = Decimal(order_data["quantity"])
    side = order_data["side"]
    
    base_token_addr = get_token_address(base_asset)
    quote_token_addr = get_token_address(quote_asset)
    
    if side.lower() == "bid":
        # Check quote asset allowance & balance
        quote_amount = int(quantity * price * (10**18))
        allowance_sufficient, current_allowance = settlement_client.check_allowance(
            account, quote_token_addr, quote_amount
        )
        balance_sufficient, current_balance = settlement_client.check_balance(
            account, quote_token_addr, quote_amount  
        )
    elif side.lower() == "ask":
        # Check base asset allowance & balance
        base_amount = int(quantity * (10**18))
        allowance_sufficient, current_allowance = settlement_client.check_allowance(
            account, base_token_addr, base_amount
        )
```

### Trade Settlement
```python
async def settle_trades_if_any(order_dict: dict) -> dict:
    settlement_results = []
    
    for trade in order_dict["trades"]:
        # Extract trade parties
        party1_addr = trade["party1"][0]
        party1_side = trade["party1"][1] 
        party2_addr = trade["party2"][0]
        party2_side = trade["party2"][1]
        
        # Convert to Wei amounts
        price_wei = int(float(trade["price"]) * (10**18))
        quantity_wei = int(float(trade["quantity"]) * (10**18))
        
        # Create signatures
        signature1 = create_trade_signature_for_user(
            party1_addr, order_dict["orderId"], base_token_addr, 
            quote_token_addr, price_wei, quantity_wei, party1_side
        )
        
        # Build settlement transaction
        settlement_function = settlement_client.contract.functions.settleTrade(
            trade_execution,      # Order details
            party1_addr,          # Maker address  
            party2_addr,          # Taker address
            party1_quantity,      # Maker quantity
            party2_quantity,      # Taker quantity
            party1_side,          # Maker side
            party2_side,          # Taker side
            signature1,           # Maker signature
            signature2,           # Taker signature
            nonce1, nonce2        # Nonces
        )
        
        # Execute on-chain settlement
        transaction = settlement_function.build_transaction({...})
        signed_txn = settlement_client.web3.eth.account.sign_transaction(transaction)
        tx_hash = settlement_client.web3.eth.send_raw_transaction(signed_txn.raw_transaction)
```

## Configuration & Deployment

### Environment Variables
```python
WEB3_PROVIDER = os.getenv("WEB3_PROVIDER", "https://evm-rpc-testnet.hedera-apis.com")
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS", "0xF14dbF48b727AD8346dD8Fa6C0FC42FCb81FF115")
PRIVATE_KEY = os.getenv("PRIVATE_KEY")

TOKEN_ADDRESSES = {
    "HBAR": os.getenv("HBAR_TOKEN_ADDRESS", "0x8eFcF5c2DDDA6C1A63D8395965Ca6c0609CE32D5"),
    "USDT": os.getenv("USDT_TOKEN_ADDRESS", "0x54099052D0e04a5CF24e4c7c82eA693Fb25E0Bed")
}
```

### Dependencies
```python
fastapi==0.115.8         # REST API framework
uvicorn==0.34.0          # ASGI server
sortedcontainers==2.4.0  # Efficient price-ordered trees
web3>=6.0.0              # Ethereum integration
eth-account>=0.8.0       # Transaction signing
six==1.17.0              # Python 2/3 compatibility
python-multipart==0.0.20 # Form data parsing
```

### Server Startup
```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
export WEB3_PROVIDER=https://evm-rpc-testnet.hedera-apis.com
export CONTRACT_ADDRESS=0xF14dbF48b727AD8346dD8Fa6C0FC42FCb81FF115
export PRIVATE_KEY=your_private_key

# Run server
python main.py
# Server starts on http://0.0.0.0:8000
```

## Integration

This service is designed to work with:
- Execution Service - to process new orders
- Validation Service - to validate order operations
- Smart Contracts - for on-chain settlement 
