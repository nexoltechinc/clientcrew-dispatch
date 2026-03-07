import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
  isLoading?: boolean;
}

const variantConfig = {
  danger: {
    icon: AlertTriangle,
    iconColor: 'text-rose-500',
    iconBg: 'bg-rose-50',
    buttonVariant: 'destructive' as const,
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    iconBg: 'bg-amber-50',
    buttonVariant: 'default' as const,
  },
  info: {
    icon: Info,
    iconColor: 'text-sky-500',
    iconBg: 'bg-sky-50',
    buttonVariant: 'default' as const,
  },
  success: {
    icon: CheckCircle,
    iconColor: 'text-emerald-500',
    iconBg: 'bg-emerald-50',
    buttonVariant: 'default' as const,
  },
};

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'info',
  isLoading = false,
}: ConfirmationModalProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="gap-4">
          <div className={cn('w-12 h-12 rounded-full flex items-center justify-center', config.iconBg)}>
            <Icon className={cn('w-6 h-6', config.iconColor)} />
          </div>
          <div className="space-y-2">
            <DialogTitle className="text-xl font-semibold text-gray-900">
              {title}
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              {description}
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-3 sm:gap-0 mt-6">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {cancelText}
          </Button>
          <Button
            variant={config.buttonVariant}
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'w-full sm:w-auto',
              variant === 'warning' && 'bg-amber-500 hover:bg-amber-600'
            )}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              confirmText
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
