import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWallet } from './useWallet';
import { CONTRACTS } from '@/lib/contracts';
import CERTIFICATE_ABI from '@/contracts/ImpactCertificateABI.json';

export interface Certificate {
  id: number;
  amount: string;
  timestamp: number;
  projectName: string;
  isMinted: boolean;
  tokenId?: number;
}

export interface ImpactStats {
  userBalance: string;
  totalDonated: string;
  certificatesEarned: number;
  certificates: Certificate[];
}

export const useImpactCertificate = () => {
  const { account, signer, provider, isConnected } = useWallet();
  const [stats, setStats] = useState<ImpactStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [minting, setMinting] = useState(false);

  const getCertificateContract = useCallback(() => {
    if (!signer) return null;
    return new ethers.Contract(
      CONTRACTS.IMPACT_CERTIFICATE_ADDRESS,
      CERTIFICATE_ABI,
      signer
    );
  }, [signer]);

  const loadUserCertificates = useCallback(async () => {
    if (!provider || !account) return;

    try {
      setLoading(true);
      const contract = new ethers.Contract(
        CONTRACTS.IMPACT_CERTIFICATE_ADDRESS,
        CERTIFICATE_ABI,
        provider
      );

      const [userCertIds, totalDonated] = await Promise.all([
        contract.getUserCertificates(account),
        contract.getUserTotalDonated(account)
      ]);

      const certificates: Certificate[] = [];

      for (const certId of userCertIds) {
        const cert = await contract.getCertificate(certId);
        certificates.push({
          id: cert.id.toNumber(),
          amount: ethers.formatEther(cert.amount),
          timestamp: cert.timestamp.toNumber(),
          projectName: cert.projectName,
          isMinted: true,
          tokenId: cert.id.toNumber()
        });
      }

      // Add mock unminted certificates for demo
      const mockUnminted: Certificate[] = [
        {
          id: 156,
          amount: "127.30",
          timestamp: Date.now() / 1000,
          projectName: "The Giving Block",
          isMinted: false
        }
      ];

      setStats({
        userBalance: "0.00",
        totalDonated: ethers.formatEther(totalDonated),
        certificatesEarned: certificates.length + mockUnminted.length,
        certificates: [...mockUnminted, ...certificates]
      });
    } catch (error) {
      console.error('Error loading certificates:', error);
      // Set mock data for demo
      setStats({
        userBalance: "0.00",
        totalDonated: "225.75",
        certificatesEarned: 2,
        certificates: [
          {
            id: 156,
            amount: "127.30",
            timestamp: 1733184000,
            projectName: "The Giving Block",
            isMinted: false
          },
          {
            id: 155,
            amount: "98.45",
            timestamp: 1730592000,
            projectName: "Power Ledger Foundation",
            isMinted: true,
            tokenId: 1
          }
        ]
      });
    } finally {
      setLoading(false);
    }
  }, [provider, account]);

  const mintCertificate = useCallback(async (certificateId: number) => {
    const contract = getCertificateContract();
    if (!contract || !account) {
      return { success: false, error: 'Wallet not connected' };
    }

    setMinting(true);
    try {
      // Find the certificate data
      const cert = stats?.certificates.find(c => c.id === certificateId);
      if (!cert) {
        return { success: false, error: 'Certificate not found' };
      }

      // Create metadata URI
      const metadata = {
        name: `Impact Certificate #${certificateId}`,
        description: `Proof of ${cert.amount} HBAR donation to ${cert.projectName}`,
        image: `ipfs://QmXxx...`, // Would upload to IPFS in production
        attributes: [
          { trait_type: "Amount", value: cert.amount },
          { trait_type: "Project", value: cert.projectName },
          { trait_type: "Date", value: new Date(cert.timestamp * 1000).toLocaleDateString() }
        ]
      };

      // In production, upload metadata to IPFS and get URI
      const metadataUri = `data:application/json;base64,${btoa(JSON.stringify(metadata))}`;

      // Mint the certificate
      const tx = await contract.mintCertificate(
        account,
        ethers.parseEther(cert.amount),
        cert.projectName,
        metadataUri
      );

      await tx.wait();

      // Update local state
      if (stats) {
        const updatedCerts = stats.certificates.map(c =>
          c.id === certificateId
            ? { ...c, isMinted: true, tokenId: certificateId }
            : c
        );
        setStats({ ...stats, certificates: updatedCerts });
      }

      return {
        success: true,
        tokenId: certificateId,
        txHash: tx.hash
      };
    } catch (error: any) {
      console.error('Minting error:', error);
      return {
        success: false,
        error: error.message || 'Failed to mint certificate'
      };
    } finally {
      setMinting(false);
    }
  }, [getCertificateContract, account, stats]);

  const verifyCertificate = useCallback(async (tokenId: number) => {
    if (!provider) return null;

    try {
      const contract = new ethers.Contract(
        CONTRACTS.IMPACT_CERTIFICATE_ADDRESS,
        CERTIFICATE_ABI,
        provider
      );

      const [cert, uri, owner] = await Promise.all([
        contract.getCertificate(tokenId),
        contract.tokenURI(tokenId),
        contract.ownerOf(tokenId)
      ]);

      return {
        certificate: {
          id: cert.id.toNumber(),
          donor: cert.donor,
          amount: ethers.formatEther(cert.amount),
          timestamp: cert.timestamp.toNumber(),
          projectName: cert.projectName
        },
        owner,
        metadataUri: uri,
        verified: true
      };
    } catch (error) {
      console.error('Verification error:', error);
      return null;
    }
  }, [provider]);

  useEffect(() => {
    if (isConnected) {
      loadUserCertificates();
    }
  }, [isConnected, loadUserCertificates]);

  return {
    stats,
    loading,
    minting,
    mintCertificate,
    verifyCertificate,
    refreshStats: loadUserCertificates
  };
};