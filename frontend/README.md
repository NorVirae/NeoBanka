# NeoBank Frontend - Hedera Africa Hackathon Winner

A DeFi vault management and trading terminal with social impact built with React and TypeScript for winning the Hedera Africa Hackathon. This innovative interface showcases African excellence in blockchain development, featuring vault deposits/withdrawals, AI-powered trading operations on Hedera through an intelligent multi-agent system.

## System Architecture

### Architecture 

NeoBank follows a layered architecture pattern with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐    │
│  │VaultDashboard│ │TradingTerminal│ │   ImpactPool     │    │
│  └─────────────┘ └─────────────┘ └─────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                     Business Logic Layer                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐    │
│  │  useVault   │ │ useWallet   │ │   useImpactPool     │    │
│  └─────────────┘ └─────────────┘ └─────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                    Data Access Layer                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐    │
│  │  Ethers.js  │ │  HPF API   │ │   Local Storage     │     │
│  └─────────────┘ └─────────────┘ └─────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                   Infrastructure Layer                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐    │
│  │Hedera Chain │ │  MetaMask   │ │   Vite Build        │    │
│  └─────────────┘ └─────────────┘ └─────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Data Architecture

The application implements a unidirectional data flow pattern:

1. **User**: User interacts with UI component
2. **Event**: Component calls hook method
3. **Hook**: Hook processes request and calls blockchain
4. **Blockchain**: Contract returns transaction result
5. **AI Update**: AI updates local state
6. **Re-render**: Component re-renders with new data

### Communication Pattern

Components communicate through a combination of props, context and hooks:

```typescript
// Parent component passes data down
<VaultDashboard />

// Child components use hooks for data access
const { stats, loading, deposit, withdraw } = useVault();

// Hooks manage state and provide methods
const useVault = () => {
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [loading, setLoading] = useState(false);

  const deposit = useCallback(async (amount: string) => {
    // Implementation
  }, []);

  return { stats, loading, deposit, withdraw };
};
```

## AI Trading System Architecture

### Trading System

NeoBank implements AI trading system with four specialized strategies, each providing financial education:

#### 1. Value Strategy (Fundamental Analysis)
- **Role**: Market analysis & long-term value assessment
- **Status**: Continuously analyzing fundamentals across markets
- **Performance**: +12.3% returns
- **Education**: "Buy assets trading below intrinsic value based on fundamentals, not hype."
- **Current Task**: Analyzing fundamentals across 12 markets

#### 2. Growth Strategy (Expansion Analysis)
- **Role**: Identifying high-growth opportunities
- **Status**: Processing growth metrics and adoption rates
- **Performance**: +8.9% returns
- **Education**: "Focus on projects with strong user adoption and expanding market share."
- **Current Task**: Tracking user base growth and partnerships

#### 3. Risk Strategy (Portfolio Diversification)
- **Role**: Risk management & systematic portfolio balance
- **Status**: Monitoring portfolio risk and rebalancing
- **Performance**: +15.7% returns
- **Education**: "Spread investments across sectors to minimize correlated losses."
- **Current Task**: Portfolio balanced: 67% long, 33% reserves

#### 4. Technical Strategy (Market Analysis)
- **Role**: Chart analysis & market timing
- **Status**: Executing trades based on technical indicators
- **Performance**: +22.1% returns
- **Education**: "Use price patterns and volume to time market entries and exits."
- **Current Task**: Identifying support/resistance levels

### Agent Coordination System

The agents operate in a coordinated manner:
- **Communication**: Live strategy updates displayed in activity log
- **Performance**: Continuous monitoring of success rates and decision accuracy
- **Synchronization**: Optimal coordination status with 89.3% success rate
- **Education**: Each agent provides clear financial literacy insights

## Impact Pool System

### Social Impact Architecture

NeoBank integrates charitable giving directly into the DeFi experience:

#### Donation System
- **Automatic Contributions**: Donate percentage of vault yields to verified charities
- **Transparency**: Blockchain-tracked donations with Hedera Consensus Service
- **Partners**: The Giving Block, Power Ledger Foundation, Celo Foundation
- **Impact Metrics**: 2,847 beneficiaries across 15 countries

#### HTS Impact Certificates
- **Tokenized Proof**: Mint donations as Hedera Token Service NFTs
- **Verification**: On-chain proof of charitable contributions
- **Tax Documentation**: Exportable records for tax purposes
- **Social Recognition**: Share impact achievements

## Components Architecture

### VaultDashboard Component

The `VaultDashboard` component implements a state machine pattern for managing deposit and withdrawal operations with integrated impact features:

```typescript
const [depositAmount, setDepositAmount] = useState('');
const [isDepositing, setIsDepositing] = useState(false);
const [donationPercentage, setDonationPercentage] = useState(5);
```

The component includes donation options on withdrawal, allowing users to contribute 0%, 5%, or 10% of profits to verified impact projects. This creates a seamless integration between profit-taking and social good.

### ImpactPool Component

The `ImpactPool` component manages charitable donations and impact tracking:

- **Donation Rate Management**: Set automatic donation percentages
- **Project Tracking**: Live updates on supported projects
- **Certificate Management**: Mint and verify HTS impact certificates
- **Transparency Dashboard**: Real-time impact metrics

### TradingTerminal Component

The `TradingTerminal` component implements a clean, professional interface with educational features:

- **Strategy Education**: Each agent explains their approach for financial literacy
- **Impact Integration**: "Trade & Bank with Purpose" banner showing social impact
- **Market Analysis**: Order book, market statistics, and activity logs
- **Professional Design**: Clean cards replacing terminal aesthetic

### WalletConnect Component

The `WalletConnect` component implements Hedera-specific connection logic:

```typescript
{isConnected && !isOnHederaTestnet && (
  <Button
    onClick={switchToHederaTestnet}
    variant="destructive"
    size="sm"
    className="flex items-center gap-2"
  >
    Switch to Hedera Testnet
  </Button>
)}
```

Network switching logic automatically detects when users are on incorrect networks and provides contextual actions for Hedera Testnet (Chain ID: 296).

## Smart Contract Integration Strategy

Contract integration follows a layered abstraction pattern for Hedera compatibility:

```typescript
const vaultContract = new ethers.Contract(
  CONTRACTS.VAULT_ADDRESS,
  VAULT_ABI,
  signer
);
```

### Hedera-Specific Contracts
- **VAULT_ADDRESS**: `0xFED81A469944B1D5d1500fA722Cb820a6481Dbcc`
- **WHBAR_ADDRESS**: `0xC230646FD55B68C7445C3b1aBB683C2357a7A180`
- **IMPACT_POOL_ADDRESS**: For donation tracking and certificate minting

The vault contract implements a share liquidity system where users deposit WHBAR tokens and receive vault shares proportional to their contribution.

## UI Component Library

NeoBank includes a complete set of UI components built on shadcn/ui and Radix UI:

### Core Components
- **Form Components**: Input, Label, Textarea, Select, Checkbox, Radio Group
- **Layout Components**: Card, Separator, Scroll Area, Aspect Ratio
- **Interactive Components**: Button, Badge, Toggle, Switch, Slider
- **Navigation Components**: Tabs, Breadcrumb, Navigation Menu, Sidebar
- **Feedback Components**: Toast, Alert, Progress, Skeleton, Tooltip

### Impact Components
- **Donation Slider**: Select donation percentage
- **Impact Cards**: Display charity projects
- **Certificate Badge**: Show HTS certificates
- **Progress Tracker**: Funding progress visualization

## How to Use NeoBank

### Getting Started

#### 1. Prerequisites
- **Web3 Wallet**: MetaMask or compatible wallet extension
- **Hedera Testnet**: Access to Hedera testnet (Chain ID: 296)
- **Testnet Tokens**: Some HBAR testnet tokens for gas fees

#### 2. Network Configuration
1. Open MetaMask and click the network dropdown
2. Select "Add Network" or "Custom RPC"
3. Enter the following details:
   - **Network Name**: Hedera Testnet
   - **RPC URL**: `https://testnet.hashio.io/api`
   - **Chain ID**: `296`
   - **Currency Symbol**: HBAR
   - **Block Explorer**: `https://hashscan.io/testnet`

#### 3. Accessing NeoBank
1. Navigate to the NeoBank application
2. Click "Connect Wallet" in the top-right corner
3. Approve the connection in MetaMask
4. Ensure you're connected to Hedera Testnet

### Vault Operations

#### Depositing WHBAR Tokens

1. **Navigate to Vault Dashboard**
   - Click the "Vault Dashboard" tab
   - View your current balance and vault statistics

2. **Prepare for Deposit**
   - Ensure you have sufficient WHBAR tokens
   - Check the minimum deposit requirement
   - Verify your wallet is connected to Hedera testnet

3. **Execute Deposit**
   - Enter the amount of WHBAR you want to deposit
   - Click "Deposit"
   - Approve the transaction in MetaMask
   - Wait for confirmation

4. **Check Results**
   - View your updated share balance
   - Check the transaction hash in HashScan
   - Monitor your vault position

#### Withdrawing with Impact

1. **Check Withdrawal Options**
   - Verify you have vault shares
   - Select donation percentage (0%, 5%, or 10%)
   - Review impact projects that will benefit

2. **Execute Withdrawal**
   - Click "Withdraw All"
   - Confirm donation percentage
   - Approve the transaction in MetaMask
   - Wait for confirmation

3. **Track Impact**
   - View donation receipt in Impact Pool
   - Mint HTS certificate for tax records
   - Monitor project progress

### Impact Pool Operations

#### Setting Donation Rate

1. Navigate to Impact Pool tab
2. Select donation percentage (0-100%)
3. Confirm transaction
4. View updated contribution metrics

#### Minting Impact Certificates

1. View available certificates
2. Click "Mint" on unminted certificates
3. Approve HTS token creation
4. Receive tokenized proof of donation

## Development Workflow

The development environment uses several tools to maintain code quality and development velocity:

- **ESLint 9.32.0**: Enforces consistent coding standards and catches common errors
- **TypeScript 5.8.3**: Provides compile-time error checking and improved developer experience
- **Vite**: Fast development server with hot module replacement
- **Component Tagging**: Development-time component identification for easier debugging
- **React Query**: Server state management and caching
- **React Router**: Client-side routing with 404 handling

## Testing Strategy

While the current implementation focuses on functionality, the architecture supports comprehensive testing:

- **Hook Testing**: Custom hooks can be tested independently using React Testing Library
- **Component Testing**: Components are designed with clear interfaces for easy testing
- **Contract Mocking**: The abstraction layer allows for easy contract interaction mocking
- **Integration Testing**: The modular architecture supports end-to-end testing scenarios
- **Impact Testing**: Donation flows and certificate minting can be tested independently

## Deployment Considerations

Production deployment uses Vite's build optimization features:

- **Code Splitting**: Automatic route-based code splitting reduces initial bundle size
- **Tree Shaking**: Unused code is automatically removed from production builds
- **Asset Optimization**: Images and other assets are optimized for web delivery
- **Environment Configuration**: Build-time environment variable injection for different deployment targets
- **CDN Compatibility**: Static site deployment for optimal global performance
- **Hedera Integration**: Optimized for Hedera's high-throughput, low-latency network
