import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertCircle,
  info: Info,
};

const STYLES = {
  success: 'bg-leaf-50 border-leaf-200 text-leaf-800',
  error: 'bg-earth-50 border-earth-200 text-earth-800',
  warning: 'bg-olive-50 border-olive-200 text-olive-800',
  info: 'bg-sage-50 border-sage-200 text-sage-800',
};

const ICON_COLORS = {
  success: 'text-leaf-600',
  error: 'text-earth-600',
  warning: 'text-olive-600',
  info: 'text-sage-600',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
    return id;
  }, [removeToast]);

  const toast = {
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
    warning: (msg) => addToast(msg, 'warning'),
    info: (msg) => addToast(msg, 'info'),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Toast container */}
      <div className="fixed inset-x-3 top-3 z-100 flex flex-col gap-2 pointer-events-none sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:w-full sm:max-w-sm">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div
              key={t.id}
              className={`flex items-start gap-3 p-3.5 rounded-lg border shadow-soft-md animate-slide-in-right pointer-events-auto ${STYLES[t.type] || STYLES.info}`}
            >
              <Icon size={18} className={`shrink-0 mt-0.5 ${ICON_COLORS[t.type] || ICON_COLORS.info}`} />
              <p className="text-sm flex-1 leading-snug">{t.message}</p>
              <button
                onClick={() => removeToast(t.id)}
                className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                aria-label="Fermer la notification"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
