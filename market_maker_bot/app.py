import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from dotenv import load_dotenv
from src.market_maker_bot import BotCommand, MarketMakerBot

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
load_dotenv()

# Global bot instance (will be initialized in lifespan)
bot = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown"""
    global bot
    
    # Startup
    logger.info("Market Maker Bot Controller starting...")
    
    # Initialize bot with async create method
    bot = MarketMakerBot(
        os.getenv("PRIVATE_KEY"),
        orderbook_api_url=os.getenv("MARKET_MAKER_API", "http://localhost:8001"),
        base_token_address=os.getenv("BASE_TOKEN_ADDRESS"),
        quote_token_address=os.getenv("QUOTE_TOKEN_ADDRESS"),
        rpc_url=os.getenv("RPC_URL", "https://testnet.hashio.io/api"),
    )
    
    # Call async create method
    await bot.create()
    
    logger.info(f"Settlement address: {bot.settler_contract_address}")
    logger.info("Market Maker Bot Controller started")
    
    yield
    
    # Shutdown
    logger.info("Market Maker Bot Controller shutting down...")
    if bot and bot.running:
        await bot.stop_bot()
    logger.info("Shutdown complete")


# FastAPI app for controlling the bot
app = FastAPI(title="Market Maker Bot Controller", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/bot/command")
async def bot_command(command: BotCommand):
    """Send commands to the market maker bot"""
    global bot
    
    if bot is None:
        return JSONResponse(
            content={"message": "Bot not initialized", "status": "error"},
            status_code=500,
        )
    
    try:
        logger.info(f"Received command: {command.action}")
        
        if command.action == "start":
            if bot.running:
                return JSONResponse(
                    content={"message": "Bot is already running", "status": "error"},
                    status_code=400,
                )

            # Validate required fields
            required_fields = [
                "account",
                "base_asset",
                "quote_asset",
                "private_key",
                "quantity",
            ]

            for field in required_fields:
                if not getattr(command, field):
                    return JSONResponse(
                        content={
                            "message": f"Missing required field: {field}",
                            "status": "error",
                        },
                        status_code=400,
                    )

            config = {
                "type":command.type,
                "account": command.account,
                "base_asset": command.base_asset,
                "quote_asset": command.quote_asset,
                "private_key": command.private_key,
                "quantity": command.quantity,
                "side": command.side,
                "spread_percentage": command.spread_percentage or 0.5,
                "reference_price": command.reference_price,
                # network defaults
                "from_network": command.from_network or os.getenv("FROM_NETWORK", "hedera"),
                "to_network": command.to_network or os.getenv("TO_NETWORK", "polygon"),
                # receive wallet
                "receive_wallet": command.account,
            }

            await bot.start_bot(config)
            return JSONResponse(
                content={"message": "Bot started successfully", "status": "success"}
            )

        elif command.action == "stop":
            if not bot.running:
                return JSONResponse(
                    content={"message": "Bot is not running", "status": "error"},
                    status_code=400,
                )

            await bot.stop_bot()
            return JSONResponse(
                content={"message": "Bot stopped successfully", "status": "success"}
            )

        elif command.action == "status":
            status = bot.get_status()
            return JSONResponse(content={"status": "success", "data": status})

        elif command.action == "register":
            if not bot.running:
                return JSONResponse(
                    content={"message": "Bot is not running", "status": "error"},
                    status_code=400,
                )

            # Force immediate order placement
            await bot.update_orders()
            return JSONResponse(
                content={"message": "Orders registered/updated", "status": "success"}
            )

        elif command.action == "cancel":
            if not bot.running:
                return JSONResponse(
                    content={"message": "Bot is not running", "status": "error"},
                    status_code=400,
                )

            # Cancel all current orders
            for side, order in bot.current_orders.items():
                await bot.cancel_order(order["orderId"], side)

            bot.current_orders = {}
            return JSONResponse(
                content={"message": "All orders cancelled", "status": "success"}
            )

        elif command.action == "modify":
            if not bot.running:
                return JSONResponse(
                    content={"message": "Bot is not running", "status": "error"},
                    status_code=400,
                )

            # Update configuration
            if command.spread_percentage is not None:
                bot.config["spread_percentage"] = command.spread_percentage
            if command.quantity is not None:
                bot.config["quantity"] = command.quantity
            if command.reference_price is not None:
                bot.config["reference_price"] = command.reference_price

            # Force immediate update with new config
            await bot.update_orders()
            return JSONResponse(
                content={"message": "Bot configuration updated", "status": "success"}
            )

        else:
            return JSONResponse(
                content={
                    "message": f"Unknown action: {command.action}",
                    "status": "error",
                },
                status_code=400,
            )

    except Exception as e:
        logger.error(f"Error processing command: {e}", exc_info=True)
        return JSONResponse(
            content={"message": f"Command failed: {str(e)}", "status": "error"},
            status_code=500,
        )


@app.get("/bot/status")
async def get_bot_status():
    """Get current bot status"""
    global bot
    
    if bot is None:
        return JSONResponse(
            content={"message": "Bot not initialized", "status": "error"},
            status_code=500,
        )
    
    try:
        status = bot.get_status()
        return JSONResponse(content={"status": "success", "data": status})
    except Exception as e:
        logger.error(f"Failed to get status: {e}", exc_info=True)
        return JSONResponse(
            content={"message": f"Failed to get status: {str(e)}", "status": "error"},
            status_code=500,
        )


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)