# NeoBank Market Maker Bot - Hedera Africa Hackathon Winner

## TL, DR
Automated market making bot for the NeoBank DEX protocol on Hedera that helped win the Hedera Africa Hackathon. This sophisticated liquidity provider demonstrates advanced algorithmic trading capabilities, showcasing African innovation in DeFi automation. Built with Python/FastAPI, it provides liquidity through intelligent bid/ask order management with Gate.io price feeds.

## Architecture

```python
market-maker-bot/
├── market_maker_bot.py     # Core bot implementation (755 LOC)
└── requirements.txt        # Python dependencies
```

## Components

### MarketMakerBot Class
```python
class MarketMakerBot:
    def __init__(self, private_key, base_token_address, quote_token_address, 
                 orderbook_api_url="http://localhost:8001"):
        self.rpc_url = "https://evm-rpc-testnet.hedera-apis.com"
        self.api_url = orderbook_api_url
        self.running = False
        self.current_orders = {}  # Track active orders
        self.config = {}  # Bot configuration
```

**Methods:**
- `approve_token_allowance()` - ERC-20 token approvals
- `place_order()` - Submit orders to NeoBank API
- `get_gateio_price()` - External price feed integration
- `calculate_market_prices()` - Spread-based pricing logic
- `update_orders()` - 60-second order refresh cycle

### FastAPI Controller
```python
app = FastAPI(title="Market Maker Bot Controller")
bot = MarketMakerBot(os.getenv("PRIVATE_KEY"))

@app.post("/bot/command")
async def bot_command(command: BotCommand):
    # Handle start/stop/modify/status commands
    
@app.get("/bot/status") 
async def get_bot_status():
    # Return bot state and active orders
```

## Price Discovery Algorithm

### Gate.io Integration
```python
async def get_gateio_price(self, base_asset: str, quote_asset: str) -> Optional[float]:
    symbol = f"{base_asset.upper()}_{quote_asset.upper()}"
    url = f"https://api.gateio.ws/api/v4/spot/tickers"
    
    async with aiohttp.ClientSession() as session:
        params = {"currency_pair": symbol}
        async with session.get(url, params=params) as response:
            data = await response.json()
            ticker = data[0]
            
            highest_bid = float(ticker.get("highest_bid", 0))
            lowest_ask = float(ticker.get("lowest_ask", 0))
            
            # Return mid price
            return (highest_bid + lowest_ask) / 2
```

### Spread Calculation
```python
def calculate_market_prices(self, reference_price: float, spread_percentage: float):
    spread = reference_price * (spread_percentage / 100)
    bid_price = reference_price - (spread / 2)  
    ask_price = reference_price + (spread / 2)
    return round(bid_price, 6), round(ask_price, 6)
```

## Smart Contract Integration

### Token Allowance Management
```python
async def approve_token_allowance(self, token_address: str, amount: float) -> bool:
    w3 = Web3(Web3.HTTPProvider(self.rpc_url))
    account = Account.from_key(self.private_key)
    
    # ERC20 approve() call
    erc20_abi = [{
        "constant": False,
        "inputs": [
            {"name": "_spender", "type": "address"},
            {"name": "_value", "type": "uint256"}
        ],
        "name": "approve",
        "type": "function"
    }]
    
    token_contract = w3.eth.contract(
        address=Web3.to_checksum_address(token_address), 
        abi=erc20_abi
    )
    
    amount_in_units = int(amount * (10**decimals))
    approve_txn = token_contract.functions.approve(
        self.settler_contract_address, amount_in_units
    ).build_transaction({...})
    
    signed_txn = w3.eth.account.sign_transaction(approve_txn, self.private_key)
    tx_hash = w3.eth.send_raw_transaction(signed_txn.raw_transaction)
    return receipt.status == 1
```

### Contract Addresses
```python
BASE_TOKEN = "0x8eFcF5c2DDDA6C1A63D8395965Ca6c0609CE32D5"
QUOTE_TOKEN = "0x54099052D0e04a5CF24e4c7c82eA693Fb25E0Bed" 
SETTLER_CONTRACT = "0xF14dbF48b727AD8346dD8Fa6C0FC42FCb81FF115"
HBAR_RPC = "https://evm-rpc-testnet.hedera-apis.com"
```

## API Protocol

### Order Placement
```python
async def place_order(self, side: str, price: float, quantity: float) -> Optional[dict]:
    payload = {
        "account": self.config["account"],
        "baseAsset": self.config["base_asset"], 
        "quoteAsset": self.config["quote_asset"],
        "privateKey": self.config["private_key"],
        "price": str(price),
        "quantity": str(quantity),
        "side": side  # "bid" or "ask"
    }
    
    response = await self.send_request("register_order", payload)
    return response.get("order") if response.get("status_code") == 1 else None
```

### Request Format
```python
async def send_request(self, endpoint: str, payload: dict) -> dict:
    form_data = aiohttp.FormData()
    form_data.add_field("payload", json.dumps(payload))
    
    async with self.session.post(f"{self.api_url}/api/{endpoint}", data=form_data) as response:
        return await response.json()
```

## Bot Control Interface

### Command Structure
```python
class BotCommand(BaseModel):
    action: str  # "start", "stop", "register", "cancel", "modify", "status"
    account: str
    base_asset: str
    quote_asset: str  
    private_key: str
    side: str
    quantity: Optional[float] = None
    spread_percentage: Optional[float] = 0.5
    reference_price: Optional[float] = None
```

### Runtime Commands
```bash
# Start bot
curl -X POST http://localhost:8001/bot/command \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start",
    "account": "0x...",
    "base_asset": "BTC", 
    "quote_asset": "USDT",
    "private_key": "0x...",
    "side": "bid",
    "quantity": 1.0,
    "spread_percentage": 0.5
  }'

# Get status  
curl http://localhost:8001/bot/status
```

## Dependencies & Setup

### requirements.txt
```python
fastapi==0.104.1      # REST API framework
uvicorn==0.24.0       # ASGI server
aiohttp==3.9.0        # Async HTTP client  
pydantic==2.5.0       # Data validation
web3>=6.0.0           # Ethereum interactions
eth-account>=0.8.0    # Transaction signing
python-dotenv==1.0.1  # Environment variables
```

### Execution
```bash
# Install dependencies
pip install -r requirements.txt

# Set private key
export PRIVATE_KEY=your_ethereum_private_key  

# Run bot server
python market_maker_bot.py
# Server starts on http://0.0.0.0:8001
```

## Trading Algorithm

### Main Loop
```python  
async def run_bot(self):
    logger.info("Market maker bot started")
    
    while self.running:
        try:
            token_pair = f"{self.config['base_asset']}_{self.config['quote_asset']}"
            await self.update_orders(token_pair)
            await asyncio.sleep(60)  # 60-second cycle
        except Exception as e:
            logger.error(f"Error in bot loop: {e}")
            await asyncio.sleep(10)  # Retry delay
```

### Order Update Logic
```python
async def update_orders(self, token_pair: str = None):
    # 1. Get Gate.io reference price
    reference_price = await self.get_gateio_price(base_asset, quote_asset)
    
    # 2. Calculate bid/ask with spread
    bid_price, ask_price = self.calculate_market_prices(
        reference_price, self.config.get("spread_percentage", 0.5)
    )
    
    # 3. Cancel existing orders  
    if "bid" in self.current_orders:
        await self.cancel_order(self.current_orders["bid"]["orderId"], "bid")
        
    # 4. Place new orders
    bid_order = await self.place_order("bid", bid_price, quantity)
    if bid_order:
        new_orders["bid"] = bid_order
        
    self.current_orders = new_orders
```

## Performance

- **Latency:** <1s price updates from Gate.io
- **Cycle Time:** 60S order refresh
- **Concurrency:** Async/await architecture  
- **Memory:** Minimal state (~1MB runtime)
- **Throughput:** Real-time order management
- **Uptime:** Continuous operation with error recovery
