'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { formatErrorMessage, sanitizeWhiteLabelText } from '@/lib/error-formatter';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
  durationMs?: number;
}

interface ToastContextValue {
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const NOOP_TOAST: ToastContextValue = {
  addToast: () => {},
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
  dismissToast: () => {},
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const duration = toast.durationMs ?? (toast.variant === 'error' ? 6500 : 4200);
    const cleanMessage =
      toast.variant === 'error'
        ? formatErrorMessage(toast.message)
        : sanitizeWhiteLabelText(toast.message);
    const cleanTitle = toast.title ? sanitizeWhiteLabelText(toast.title) : undefined;
    setToasts((prev) => [
      ...prev.slice(-4),
      { ...toast, message: cleanMessage, title: cleanTitle, id },
    ]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const success = useCallback(
    (message: string, title?: string) =>
      addToast({ message, title, variant: 'success' }),
    [addToast]
  );

  const error = useCallback(
    (message: string, title?: string) =>
      addToast({ message, title, variant: 'error' }),
    [addToast]
  );

  const warning = useCallback(
    (message: string, title?: string) =>
      addToast({ message, title, variant: 'warning' }),
    [addToast]
  );

  const info = useCallback(
    (message: string, title?: string) =>
      addToast({ message, title, variant: 'info' }),
    [addToast]
  );

  const contextValue = useMemo<ToastContextValue>(
    () => ({ addToast, success, error, warning, info, dismissToast }),
    [addToast, success, error, warning, info, dismissToast]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      {/* Global Toast Viewport */}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2.5 w-[calc(100vw-2rem)] max-w-sm pointer-events-none"
      >
        {toasts.map((toast) => {
          const styles =
            toast.variant === 'success'
              ? 'border-emerald-200 bg-white text-[#20243A] shadow-lg shadow-emerald-900/5'
              : toast.variant === 'error'
              ? 'border-red-200 bg-white text-[#20243A] shadow-lg shadow-red-900/5'
              : toast.variant === 'warning'
              ? 'border-amber-200 bg-white text-[#20243A] shadow-lg shadow-amber-900/5'
              : 'border-[#C7CBFF] bg-white text-[#20243A] shadow-lg shadow-indigo-900/5';

          const Icon =
            toast.variant === 'success'
              ? CheckCircle2
              : toast.variant === 'error'
              ? XCircle
              : toast.variant === 'warning'
              ? AlertTriangle
              : Info;

          const iconColor =
            toast.variant === 'success'
              ? 'text-emerald-600'
              : toast.variant === 'error'
              ? 'text-red-600'
              : toast.variant === 'warning'
              ? 'text-amber-600'
              : 'text-[#635BFF]';

          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 animate-slide-up ${styles}`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
              <div className="flex-1 min-w-0">
                {toast.title && (
                  <p className="text-xs font-bold text-[#20243A] mb-0.5">
                    {toast.title}
                  </p>
                )}
                <p className="text-xs text-[#747B91] leading-relaxed break-words">
                  {toast.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="text-[#747B91] hover:text-[#20243A] p-0.5 rounded transition-colors"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return ctx || NOOP_TOAST;
}
