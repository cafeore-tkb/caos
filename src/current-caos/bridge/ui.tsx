import type React from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
export function Button({
  variant = 'default',
  size = 'default',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) {
  return (
    <button
      data-variant={variant}
      data-size={size}
      className={`caos-button inline-flex items-center justify-center whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`caos-input flex w-full rounded-md border px-3 py-2 disabled:opacity-50 ${className}`}
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
      type="button"
      size="sm"
      variant={armed ? 'destructive' : 'outline'}
      className={`w-full ${className ?? ''}`}
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
      className={`m-auto grid w-full max-w-lg gap-4 border border-[#e5e5e5] bg-white p-6 shadow-lg backdrop:bg-black/40 sm:rounded-lg ${className}`}
      {...props}
    >
      {children}
    </dialog>,
    document.body
  );
}
export function AlertDialogCancel(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const dialog = useContext(DialogContext);
  return <Button variant="outline" {...props} onClick={() => dialog.onOpenChange(false)} />;
}
export const AlertDialogHeader = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="flex flex-col space-y-2 text-center sm:text-left" {...props} />
);
export const AlertDialogTitle = (props: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className="font-semibold text-lg" {...props} />
);
export const AlertDialogDescription = (props: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className="text-sm text-[#737373]" {...props} />
);
export const AlertDialogFooter = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2" {...props} />
);
