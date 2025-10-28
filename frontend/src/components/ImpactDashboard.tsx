import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Heart, Users, Globe, Award, ExternalLink, Download, Shield } from 'lucide-react';

interface ImpactStats {
  totalDonated: string;
  totalImpactCertificates: number;
  currentYieldDonationRate: number;
  beneficiariesReached: number;
  activeProjects: number;
}

interface Project {
  id: string;
  name: string;
  organization: string;
  description: string;
  totalFunding: string;
  currentFunding: string;
  beneficiaries: number;
  region: string;
  hederaPartner: boolean;
}

const mockImpactStats: ImpactStats = {
  totalDonated: "2,847.50",
  totalImpactCertificates: 156,
  currentYieldDonationRate: 15,
  beneficiariesReached: 1243,
  activeProjects: 8
};

const mockProjects: Project[] = [
  {
    id: "proj_001",
    name: "Clean Water Access Initiative",
    organization: "WaterAid International",
    description: "Providing sustainable clean water solutions to rural communities",
    totalFunding: "50,000",
    currentFunding: "32,450",
    beneficiaries: 500,
    region: "East Africa",
    hederaPartner: true
  },
  {
    id: "proj_002",
    name: "Digital Education Program",
    organization: "Code.org",
    description: "Teaching coding and digital literacy to underserved youth",
    totalFunding: "75,000",
    currentFunding: "28,750",
    beneficiaries: 300,
    region: "Latin America",
    hederaPartner: true
  },
  {
    id: "proj_003",
    name: "Sustainable Agriculture Support",
    organization: "Grameen Foundation",
    description: "Supporting smallholder farmers with sustainable farming techniques",
    totalFunding: "40,000",
    currentFunding: "15,200",
    beneficiaries: 150,
    region: "Southeast Asia",
    hederaPartner: false
  }
];

export const ImpactDashboard = () => {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  const calculateProgress = (current: string, total: string) => {
    return (parseFloat(current.replace(',', '')) / parseFloat(total.replace(',', ''))) * 100;
  };

  return (
    <div className="space-y-6">
      {/* Impact Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Impact Donated</CardTitle>
            <Heart className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${mockImpactStats.totalDonated}</div>
            <p className="text-xs text-muted-foreground">
              From yield donations & fees
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">People Reached</CardTitle>
            <Users className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockImpactStats.beneficiariesReached.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Across {mockImpactStats.activeProjects} active projects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Impact Certificates</CardTitle>
            <Award className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockImpactStats.totalImpactCertificates}</div>
            <p className="text-xs text-muted-foreground">
              Verified on Hedera
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Yield Donation Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-success" />
            Impact Settings
          </CardTitle>
          <CardDescription>
            Configure how much of your yield goes to social impact projects
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Current Donation Rate</p>
              <p className="text-sm text-muted-foreground">
                {mockImpactStats.currentYieldDonationRate}% of your yield goes to impact projects
              </p>
            </div>
            <Badge variant="outline" className="text-success border-success">
              {mockImpactStats.currentYieldDonationRate}% Active
            </Badge>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium">Quick Settings</p>
            <div className="flex gap-2">
              {[5, 10, 15, 25].map((rate) => (
                <Button
                  key={rate}
                  variant={mockImpactStats.currentYieldDonationRate === rate ? "default" : "outline"}
                  size="sm"
                  className="text-xs"
                >
                  {rate}%
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Projects */}
      <Card>
        <CardHeader>
          <CardTitle>Active Impact Projects</CardTitle>
          <CardDescription>
            Projects currently receiving funding from the impact pool
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mockProjects.map((project) => (
            <div key={project.id} className="space-y-3 p-4 border rounded-lg">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{project.name}</h4>
                    {project.hederaPartner && (
                      <Badge variant="outline" className="text-xs">
                        <Shield className="h-3 w-3 mr-1" />
                        Hedera Partner
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{project.organization}</p>
                  <p className="text-sm">{project.description}</p>
                </div>
                <Button variant="ghost" size="sm">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Funding Progress</span>
                  <span>${project.currentFunding} / ${project.totalFunding}</span>
                </div>
                <Progress value={calculateProgress(project.currentFunding, project.totalFunding)} />
              </div>

              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{project.beneficiaries} beneficiaries</span>
                <span>{project.region}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Impact Certificates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Your Impact Certificates
          </CardTitle>
          <CardDescription>
            Verifiable proof of your contributions to social impact projects
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
              <div>
                <p className="font-medium">December 2024 Impact Certificate</p>
                <p className="text-sm text-muted-foreground">
                  $127.30 donated • 3 projects supported
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Verify
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
              <div>
                <p className="font-medium">November 2024 Impact Certificate</p>
                <p className="text-sm text-muted-foreground">
                  $98.45 donated • 2 projects supported
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Verify
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};