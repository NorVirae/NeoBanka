import type { HardhatUserConfig } from "hardhat/config";
import { config as dotenvConfig } from "dotenv";

import "@nomicfoundation/hardhat-toolbox";

dotenvConfig();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    
    testnet: {
      // Hedera Testnet
      url: process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api",
      accounts: process.env.HEDERA_PRIVATE_KEY ? [process.env.HEDERA_PRIVATE_KEY] : []
    },

    // Note please: for cross chain settlement test
    polygon: {
      // Polygon Mainnet
      url: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      accounts: process.env.HEDERA_PRIVATE_KEY ? [process.env.HEDERA_PRIVATE_KEY] : [],
      chainId: 137
    }
  }
};

export default config;
