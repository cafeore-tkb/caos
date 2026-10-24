import type React from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
export function Button({
  variant: _variant,
  size: _size,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 font-bold disabled:opacity-40 ${className}`}
      {...props}
    />
  );
}
export function TwoStepButton({
  label,
  confirmLabel,
  onConfirm,
  className,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <Button
      className={className}
      onBlur={() => setArmed(false)}
      onClick={(event) => {
        event.stopPropagation();
        if (armed) onConfirm();
        setArmed(!armed);
      }}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}
export const orderByNo = <T extends { orderId: number }>(orders: readonly T[], digits: string) =>
  orders.find((order) => order.orderId === Number(digits));

const DialogContext = createContext({ open: false, onOpenChange: (_open: boolean) => {} });
export function AlertDialog({
  children,
  ...value
}: React.PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}
export function AlertDialogContent({
  children,
  className = '',
  overlayClassName = '',
  ...props
}: React.HTMLAttributes<HTMLDialogElement> & { overlayClassName?: string }) {
  const { open, onOpenChange } = useContext(DialogContext);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
  }, [open]);
  if (!open) return null;
  return createPortal(
    <dialog
      ref={ref}
      onCancel={() => onOpenChange(false)}
      aria-label="元の抽出の破棄"
      className={`m-auto max-w-lg rounded-xl bg-white p-6 shadow-xl backdrop:bg-black/40 ${className}`}
      {...props}
    >
      {children}
    </dialog>,
    document.body
  );
}
export function AlertDialogCancel(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const dialog = useContext(DialogContext);
  return <Button {...props} onClick={() => dialog.onOpenChange(false)} />;
}
export const AlertDialogHeader = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="mb-4 space-y-2" {...props} />
);
export const AlertDialogTitle = (props: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className="text-lg font-black" {...props} />
);
export const AlertDialogDescription = (props: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className="text-sm text-slate-600" {...props} />
);
export const AlertDialogFooter = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="mt-5 flex justify-end gap-3" {...props} />
);
