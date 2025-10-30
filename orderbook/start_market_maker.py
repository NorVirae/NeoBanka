#!/usr/bin/env python3
"""
Startup script for the Cross-Chain Market Maker Bot

This script loads environment variables and starts the market maker bot
with proper configuration for cross-chain trading.
"""

import os
import sys
import asyncio
import logging
from dotenv import load_dotenv

# Add the orderbook directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def setup_logging():
    """Setup logging configuration"""
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, log_level),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler('market_maker.log')
        ]
    )

def validate_environment():
    """Validate required environment variables"""
    required_vars = [
        "PRIVATE_KEY",
        "HEDERA_SETTLEMENT",
        "ETHEREUM_SETTLEMENT", 
        "POLYGON_SETTLEMENT"
    ]
    
    missing_vars = []
    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        print(f"❌ Missing required environment variables: {', '.join(missing_vars)}")
        print("\nPlease set these variables in .env.market_maker or as environment variables:")
        for var in missing_vars:
            print(f"  {var}=your_value_here")
        sys.exit(1)
    
    print("✅ All required environment variables are set")

async def main():
    """Main startup function"""
    print("🤖 Starting Cross-Chain Market Maker Bot...")
    
    # Load environment variables
    env_file = os.path.join(os.path.dirname(__file__), '.env.market_maker')
    if os.path.exists(env_file):
        load_dotenv(env_file)
        print(f"✅ Loaded environment from {env_file}")
    else:
        print(f"⚠️  Environment file not found: {env_file}")
        print("Using system environment variables...")
    
    # Setup logging
    setup_logging()
    logger = logging.getLogger(__name__)
    
    # Validate environment
    validate_environment()
    
    # Display configuration
    print("\n📋 Market Maker Configuration:")
    print(f"  Orderbook API: {os.getenv('ORDERBOOK_API_URL', 'http://localhost:8001')}")
    print(f"  Hedera Settlement: {os.getenv('HEDERA_SETTLEMENT')}")
    print(f"  Ethereum Settlement: {os.getenv('ETHEREUM_SETTLEMENT')}")
    print(f"  Polygon Settlement: {os.getenv('POLYGON_SETTLEMENT')}")
    print(f"  Polling Interval: {os.getenv('POLLING_INTERVAL', '5')}s")
    print(f"  Price Tolerance: {os.getenv('MATCHING_TOLERANCE', '0.005')} (0.5%)")
    
    try:
        # Import and start the market maker
        from cross_chain_market_maker import CrossChainMarketMaker
        
        market_maker = CrossChainMarketMaker()
        logger.info("Cross-chain market maker initialized successfully")
        
        print("\n🚀 Market maker is now running...")
        print("Press Ctrl+C to stop")
        
        await market_maker.monitor_and_match()
        
    except KeyboardInterrupt:
        print("\n⏹️  Market maker stopped by user")
        logger.info("Market maker stopped by user")
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        logger.error(f"Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())