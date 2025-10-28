import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, ExternalLink, AlertCircle } from "lucide-react";

interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'success' | 'error' | 'warning';
  title: string;
  description?: string;
  details?: Array<{
    label: string;
    value: string;
    highlight?: boolean;
  }>;
  txHash?: string;
  children?: React.ReactNode;
}

export function TransactionDialog({
  open,
  onOpenChange,
  type,
  title,
  description,
  details,
  txHash,
  children
}: TransactionDialogProps) {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="h-8 w-8 text-green-500" />;
      case 'error':
        return <XCircle className="h-8 w-8 text-red-500" />;
      case 'warning':
        return <AlertCircle className="h-8 w-8 text-amber-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = () => {
    switch (type) {
      case 'success':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Success</Badge>;
      case 'error':
        return <Badge variant="destructive">Failed</Badge>;
      case 'warning':
        return <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">Warning</Badge>;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center space-y-4">
          <div className="flex justify-center">
            {getIcon()}
          </div>
          <div className="space-y-2">
            <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
            {getStatusBadge()}
          </div>
          {description && (
            <DialogDescription className="text-center text-muted-foreground">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {details && details.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                {details.map((detail, index) => (
                  <div key={index}>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-muted-foreground">
                        {detail.label}
                      </span>
                      <span className={`text-sm font-semibold ${
                        detail.highlight ? 'text-green-600' : ''
                      }`}>
                        {detail.value}
                      </span>
                    </div>
                    {index < details.length - 1 && <Separator />}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {children}

          {txHash && (
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Transaction Hash</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(`https://hashscan.io/testnet/transaction/${txHash}`, '_blank')}
                    className="h-auto p-0 text-blue-600 hover:text-blue-800"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    View on HashScan
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-center pt-2">
            <Button onClick={() => onOpenChange(false)} className="min-w-[100px]">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}