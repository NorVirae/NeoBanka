import { ethers } from 'ethers';
import erc20Json from './ERC20.json';
import tradeSettlementJson from './TradeSettlement.json';

// Create Interfaces from the ABIs
export const erc20Interface = new ethers.Interface(erc20Json.abi);
export const tradeSettlementInterface = new ethers.Interface(tradeSettlementJson.abi);

// Export the ABI arrays as well in case they're needed
export const erc20Abi = erc20Json.abi;
export const tradeSettlementAbi = tradeSettlementJson.abi;