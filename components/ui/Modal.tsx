'use client';

import { useModalA11y } from '../hooks/useModalA11y';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  /** id of the element that names the dialog; defaults to the first heading inside it. */
  labelledBy?: string;
  /** Accessible name when there is no visible heading. */
  ariaLabel?: string;
  /** Close when the backdrop is clicked (default true). */
  closeOnBackdrop?: boolean;
  /** Close on Escape (default true). */
  closeOnEscape?: boolean;
  role?: 'dialog' | 'alertdialog';
}

export function Modal({
  open,
  onOpenChange,
  children,
  className = '',
  labelledBy,
  ariaLabel,
  closeOnBackdrop = true,
  closeOnEscape = true,
  role = 'dialog',
}: ModalProps) {
  const panelRef = useModalA11y<HTMLDivElement>(open, () => onOpenChange(false), { closeOnEscape });

  if (!open) return null;

  // Apply default max-w-lg only if no custom className provided
  const modalClasses = className
    ? `relative bg-white rounded-lg shadow-xl w-full mx-4 max-h-[90vh] overflow-y-auto focus:outline-none ${className}`
    : `relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto focus:outline-none`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={closeOnBackdrop ? () => onOpenChange(false) : undefined}
    >
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={ariaLabel}
        tabIndex={-1}
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
    <Modal open={open} onOpenChange={onOpenChange} role="alertdialog">
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
