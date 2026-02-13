'use client';

import { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onOpenChange, children, className = '' }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  // Apply default max-w-lg only if no custom className provided
  const modalClasses = className 
    ? `relative bg-white rounded-lg shadow-xl w-full mx-4 max-h-[90vh] overflow-y-auto ${className}`
    : `relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={() => onOpenChange(false)}
    >
      <div className="fixed inset-0 bg-black/50" />
      <div
        className={modalClasses}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string | React.ReactNode;
  children: React.ReactNode;
}

export function AlertDialog({ open, onOpenChange, title, description, children }: AlertDialogProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
        <div className="text-sm text-gray-600 mb-4">
          {description}
        </div>
        <div className="flex justify-end gap-3">
          {children}
        </div>
      </div>
    </Modal>
  );
}

