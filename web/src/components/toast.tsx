import { useEffect } from 'react';

interface ToastProps {
  message: string;
  visible: boolean;
  onDismiss: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, visible, onDismiss }) => {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, 2500);
    return () => clearTimeout(timer);
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface border border-accent-4/40 text-accent-4 text-xs font-mono font-bold uppercase tracking-widest px-5 py-2.5 rounded-sm shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3"
    >
      {message}
    </div>
  );
};
