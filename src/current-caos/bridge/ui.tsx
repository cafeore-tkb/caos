import type React from 'react';
import { useEffect, useState } from 'react';
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
