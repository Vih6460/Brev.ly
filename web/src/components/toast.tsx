import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircleIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react';

type ToastMessage = { text: string; kind: 'success' | 'error' };
const ToastContext = createContext<(text: string, kind?: ToastMessage['kind']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toast = useCallback((text: string, kind: ToastMessage['kind'] = 'success') => {
    clearTimeout(timer.current);
    setMessage({ text, kind });
    timer.current = setTimeout(() => setMessage(null), 5000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      {message && (
        <div
          className={`toast toast-${message.kind}`}
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          {message.kind === 'error' ? (
            <WarningCircleIcon size={22} />
          ) : (
            <CheckCircleIcon size={22} />
          )}
          <span>{message.text}</span>
          <button type="button" aria-label="Fechar notificação" onClick={() => setMessage(null)}>
            <XIcon size={18} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
