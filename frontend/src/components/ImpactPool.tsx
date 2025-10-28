import { useState, useEffect } from 'react';
import { useImpactCertificate } from '@/hooks/useImpactCertificate';
import { TransactionDialog } from '@/components/ui/transaction-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Heart, Users, Globe, Award, ExternalLink, Download, Shield, Plus, CheckCircle } from 'lucide-react';
import { CONTRACTS } from '@/lib/contracts';

interface ImpactPoolProps {
  userBalance: string;
  totalPoolBalance: string;
  onDonateAmount: (amount: string) => void;
  onWithdrawCertificate: (certificateId: string) => void;
}

export const ImpactPool = ({
  userBalance,
  totalPoolBalance,
  onDonateAmount,
  onWithdrawCertificate
}: ImpactPoolProps) => {
  const [donationAmount, setDonationAmount] = useState('');
  const [isDonating, setIsDonating] = useState(false);
  const { stats, loading, minting, mintCertificate } = useImpactCertificate();
  
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    type: 'success' | 'error' | 'warning';
    title: string;
    description?: string;
    details?: Array<{ label: string; value: string; highlight?: boolean }>;
    txHash?: string;
  }>({ open: false, type: 'success', title: '' });

  const handleDonationSubmit = () => {
    const amount = parseFloat(donationAmount);
    if (amount > 0) {
      onDonateAmount(donationAmount);
      setDialogState({
        open: true,
        type: 'success',
        title: 'Donation Initiated',
        description: 'Thank you for supporting social impact projects!',
        details: [
          { label: 'Donation Amount', value: `${donationAmount} WHBAR` },
          { label: 'Status', value: 'Processing' }
        ]
      });
      setDonationAmount('');
      setIsDonating(false);
    }
  };

  const handleMintCertificate = async (certificateId: number) => {
    try {
      const result = await mintCertificate(certificateId);
      if (result.success) {
        setDialogState({
          open: true,
          type: 'success',
          title: 'Certificate Minted Successfully',
          description: 'Your impact certificate has been minted as an HTS NFT',
          details: [
            { label: 'Certificate ID', value: `#${certificateId}` },
            { label: 'Token Standard', value: 'HTS NFT' },
            { label: 'Blockchain', value: 'Hedera Testnet' }
          ],
          txHash: result.txHash
        });
      } else {
        setDialogState({
          open: true,
          type: 'error',
          title: 'Certificate Minting Failed',
          description: result.error || 'Failed to mint certificate. Please try again.'
        });
      }
    } catch (error) {
      setDialogState({
        open: true,
        type: 'error',
        title: 'Minting Error',
        description: 'An unexpected error occurred while minting'
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-success" />
            Impact Pool Contribution
          </CardTitle>
          <CardDescription>
            Make direct donations to verified social impact projects and earn impact certificates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Your Pool Balance</Label>
              <div className="text-2xl font-bold">${userBalance} WHBAR</div>
            </div>
            <div className="space-y-2">
              <Label>Total Pool</Label>
              <div className="text-2xl font-bold">${totalPoolBalance} WHBAR</div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Make a Donation</Label>
              <Badge variant="outline" className="text-success border-success">
                Direct Contribution
              </Badge>
            </div>

            {!isDonating ? (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  {[10, 25, 50, 100].map((amount) => (
                    <Button
                      key={amount}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onDonateAmount(amount.toString());
                        setDialogState({
                          open: true,
                          type: 'success',
                          title: 'Donation Initiated',
                          description: 'Thank you for supporting social impact projects!',
                          details: [
                            { label: 'Donation Amount', value: `${amount} WHBAR` },
                            { label: 'Status', value: 'Processing' }
                          ]
                        });
                      }}
                      className="text-xs"
                    >
                      ${amount}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsDonating(true)}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Custom Amount
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={donationAmount}
                  onChange={(e) => setDonationAmount(e.target.value)}
                  placeholder="Enter amount (WHBAR)"
                />
                <Button onClick={handleDonationSubmit}>Donate</Button>
                <Button variant="outline" onClick={() => setIsDonating(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Projects</CardTitle>
          <CardDescription>
            Projects receiving funding from the impact pool
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 p-4 border rounded-lg">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">The Giving Block</h4>
                </div>
                <p className="text-sm text-muted-foreground">Cryptocurrency donations for nonprofits</p>
                <p className="text-sm">Enabling crypto donations to verified nonprofits worldwide through blockchain technology</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => window.open('https://thegivingblock.com', '_blank')}>
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Funding Progress</span>
                <span>$45,230 / $75,000</span>
              </div>
              <Progress value={60.3} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1,200+ nonprofits</span>
              <span>Global</span>
            </div>
          </div>

          <div className="space-y-3 p-4 border rounded-lg">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">Power Ledger Foundation</h4>
                </div>
                <p className="text-sm text-muted-foreground">Renewable energy access</p>
                <p className="text-sm">Democratizing access to renewable energy through blockchain-powered microgrids</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => window.open('https://www.powerledger.io', '_blank')}>
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Funding Progress</span>
                <span>$28,750 / $60,000</span>
              </div>
              <Progress value={47.9} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>850 households</span>
              <span>Southeast Asia</span>
            </div>
          </div>

          <div className="space-y-3 p-4 border rounded-lg">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">Climate Collective</h4>
                </div>
                <p className="text-sm text-muted-foreground">Climate action and sustainability</p>
                <p className="text-sm">Supporting global climate initiatives and sustainable development projects</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => window.open('https://climatecollective.org', '_blank')}>
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Funding Progress</span>
                <span>$12,400 / $40,000</span>
              </div>
              <Progress value={31.0} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>2,500 users</span>
              <span>Latin America & Africa</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Impact Certificates
          </CardTitle>
          <CardDescription>
            HTS tokenized proof of your social impact contributions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-4">Loading certificates...</div>
            ) : stats?.certificates.length ? (
              stats.certificates.map((cert) => (
                <div key={cert.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                  <div>
                    <p className="font-medium">Certificate #{cert.id}</p>
                    <p className="text-sm text-muted-foreground">
                      ${cert.amount} donated • {new Date(cert.timestamp * 1000).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-xs text-muted-foreground">{cert.projectName}</p>
                  </div>
                  <div className="flex gap-2">
                    {cert.isMinted ? (
                      <Button variant="outline" size="sm" disabled>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Minted
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMintCertificate(cert.id)}
                        disabled={minting}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {minting ? 'Minting...' : 'Mint'}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => cert.isMinted && cert.tokenId ?
                        window.open(`https://hashscan.io/testnet/token/${CONTRACTS.IMPACT_CERTIFICATE_ADDRESS}/${cert.tokenId}`, '_blank') :
                        window.open(`https://hashscan.io/testnet/contract/${CONTRACTS.IMPACT_CERTIFICATE_ADDRESS}`, '_blank')
                      }
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Verify
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                No certificates available
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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