// src/components/VaultDashboard.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { TransactionDialog } from '@/components/ui/transaction-dialog';
import { Loader2, RefreshCw, TrendingUp, Wallet, PiggyBank, Heart, ExternalLink } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { useVault } from '@/hooks/useVault';

export const VaultDashboard = () => {
  const { isConnected, isOnHederaTestnet } = useWallet();
  const { stats, loading, refreshing, deposit, withdraw, approveWHBAR, refreshStats } = useVault();
  
  const [depositAmount, setDepositAmount] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [donationPercentage, setDonationPercentage] = useState(1);
  
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    type: 'success' | 'error' | 'warning';
    title: string;
    description?: string;
    details?: Array<{ label: string; value: string; highlight?: boolean }>;
    txHash?: string;
  }>({ open: false, type: 'success', title: '' });

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      setDialogState({
        open: true,
        type: 'error',
        title: 'Invalid Amount',
        description: 'Please enter a valid deposit amount'
      });
      return;
    }

    if (stats && parseFloat(depositAmount) < parseFloat(stats.minDeposit)) {
      setDialogState({
        open: true,
        type: 'error',
        title: 'Amount Too Small',
        description: `Minimum deposit is ${stats.minDeposit} WHBAR`
      });
      return;
    }

    if (stats && parseFloat(depositAmount) > parseFloat(stats.whbarBalance)) {
      setDialogState({
        open: true,
        type: 'error',
        title: 'Insufficient Balance',
        description: "You don't have enough WHBAR"
      });
      return;
    }

    setIsDepositing(true);
    try {
      const result = await deposit(depositAmount);
      
      if (result.success) {
        setDialogState({
          open: true,
          type: 'success',
          title: 'Deposit Successful',
          description: 'Your WHBAR has been successfully deposited into the vault',
          details: [
            { label: 'Amount Deposited', value: `${depositAmount} WHBAR` }
          ],
          txHash: result.txHash
        });
        setDepositAmount('');
      } else {
        setDialogState({
          open: true,
          type: 'error',
          title: 'Deposit Failed',
          description: result.error || 'Unknown error occurred. Please try again.'
        });
      }
    } catch (error) {
      setDialogState({
        open: true,
        type: 'error',
        title: 'Deposit Failed',
        description: 'An unexpected error occurred'
      });
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!stats || parseFloat(stats.userShares) === 0) {
      setDialogState({
        open: true,
        type: 'error',
        title: 'No Shares to Withdraw',
        description: "You don't have any shares in the vault"
      });
      return;
    }

    setIsWithdrawing(true);
    try {
      // Convert percentage to basis points (1% = 100 bps)
      const impactAllocationBps = donationPercentage * 100;
      const result = await withdraw(impactAllocationBps);
      
      if (result.success) {
        const donationAmount = stats ? ((parseFloat(stats.userShares) * parseFloat(stats.sharePrice)) * donationPercentage / 100).toFixed(4) : '0';
        const withdrawalDetails = [
          { label: 'Amount Withdrawn', value: `${result.assets ? parseFloat(result.assets).toFixed(4) : 'Processing...'} WHBAR` }
        ];
        
        if (donationPercentage > 0) {
          withdrawalDetails.push({
            label: 'Your Donation',
            value: `${donationPercentage}% to impact projects`,
            highlight: true
          });
        }
        
        setDialogState({
          open: true,
          type: 'success',
          title: 'Withdrawal Successful',
          description: donationPercentage > 0 
            ? 'Your withdrawal is complete and your donation will support verified social impact projects'
            : 'Your WHBAR has been successfully withdrawn from the vault',
          details: withdrawalDetails,
          txHash: result.txHash
        });
      } else {
        setDialogState({
          open: true,
          type: 'error',
          title: 'Withdrawal Failed',
          description: result.error || 'Unknown error occurred. Please try again.'
        });
      }
    } catch (error) {
      setDialogState({
        open: true,
        type: 'error',
        title: 'Withdrawal Failed',
        description: 'An unexpected error occurred'
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleApprove = async () => {
    if (!depositAmount) return;
    
    try {
      const result = await approveWHBAR(depositAmount);
      if (result.success) {
        setDialogState({
          open: true,
          type: 'success',
          title: 'Token Approval Successful',
          description: 'You can now proceed with your deposit',
          details: [
            { label: 'Amount Approved', value: `${depositAmount} WHBAR` },
            { label: 'Approved For', value: 'Vault Deposits' }
          ],
          txHash: result.txHash
        });
      }
    } catch (error) {
      setDialogState({
        open: true,
        type: 'error',
        title: 'Approval Failed',
        description: result?.error || 'An unexpected error occurred during approval. Please try again.'
      });
    }
  };

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-[400px]">
          <CardHeader className="text-center">
            <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>Connect Your Wallet</CardTitle>
            <CardDescription>
              Please connect your wallet to access the Vault
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!isOnHederaTestnet) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-[400px]">
          <CardHeader className="text-center">
            <CardTitle>Wrong Network</CardTitle>
            <CardDescription>
              Please switch to Hedera Testnet to use the vault
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Your Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? parseFloat(stats.whbarBalance).toFixed(4) : '0.0000'}
            </div>
            <p className="text-xs text-muted-foreground">WHBAR</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Your Shares</CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? parseFloat(stats.userShares).toFixed(4) : '0.0000'}
            </div>
            <p className="text-xs text-muted-foreground">Vault Shares</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Share Price</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? parseFloat(stats.sharePrice).toFixed(4) : '1.0000'}
            </div>
            <p className="text-xs text-muted-foreground">WHBAR per Share</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? parseFloat(stats.totalAssets).toFixed(2) : '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">Total WHBAR</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deposit Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Deposit WHBAR</CardTitle>
                <CardDescription>
                  Deposit WHBAR tokens to receive vault shares
                </CardDescription>
              </div>
              {stats?.isPaused && (
                <Badge variant="destructive">Paused</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deposit-amount">Amount (WHBAR)</Label>
              <Input
                id="deposit-amount"
                type="number"
                placeholder="0.0"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                disabled={isDepositing || loading || stats?.isPaused}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Balance: {stats ? parseFloat(stats.whbarBalance).toFixed(4) : '0.0000'} WHBAR</span>
                <span>Min: {stats ? parseFloat(stats.minDeposit).toFixed(2) : '1.00'} WHBAR</span>
              </div>
            </div>

            {/* Approval Info */}
            {stats && depositAmount && parseFloat(depositAmount) > parseFloat(stats.whbarAllowance) && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Approval needed for {depositAmount} WHBAR
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleApprove}
                  disabled={loading}
                  className="mt-2"
                >
                  Approve WHBAR
                </Button>
              </div>
            )}

            <Button 
              onClick={handleDeposit} 
              disabled={isDepositing || loading || !depositAmount || stats?.isPaused}
              className="w-full"
            >
              {isDepositing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Depositing...
                </>
              ) : (
                'Deposit'
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Withdraw Card */}
        <Card>
          <CardHeader>
            <CardTitle>Withdraw</CardTitle>
            <CardDescription>
              Withdraw all your shares and receive WHBAR
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Your Shares:</span>
                  <span className="text-sm font-medium">
                    {stats ? parseFloat(stats.userShares).toFixed(4) : '0.0000'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Estimated WHBAR:</span>
                  <span className="text-sm font-medium">
                    {stats ? (parseFloat(stats.userShares) * parseFloat(stats.sharePrice)).toFixed(4) : '0.0000'}
                  </span>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-success" />
                  <Label className="text-sm font-medium">Impact Donation</Label>
                </div>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    {[1, 5, 10].map((percentage) => (
                      <Button
                        key={percentage}
                        variant={donationPercentage === percentage ? "default" : "outline"}
                        size="sm"
                        onClick={() => setDonationPercentage(percentage)}
                        className="text-xs flex-1"
                      >
                        {percentage}%
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {`${donationPercentage}% of withdrawn profits will be donated to verified social impact projects on Hedera. This creates transparency through blockchain verification and helps fund education, clean energy, and financial inclusion initiatives worldwide.`}
                  </p>
                  {stats && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Donation amount:</span>
                      <span className="font-medium text-success">
                        {((parseFloat(stats.userShares) * parseFloat(stats.sharePrice)) * donationPercentage / 100).toFixed(4)} WHBAR
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Button 
              onClick={handleWithdraw}
              disabled={isWithdrawing || loading || !stats || parseFloat(stats.userShares) === 0}
              variant="destructive"
              className="w-full"
            >
              {isWithdrawing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Withdrawing...
                </>
              ) : (
                'Withdraw All'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-center">
        <Button 
          variant="outline" 
          onClick={refreshStats}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh Data
        </Button>
      </div>

      <TransactionDialog
        open={dialogState.open}
        onOpenChange={(open) => setDialogState(prev => ({ ...prev, open }))}
        type={dialogState.type}
        title={dialogState.title}
        description={dialogState.description}
        details={dialogState.details}
        txHash={dialogState.txHash}
      />
    </div>
  );
};