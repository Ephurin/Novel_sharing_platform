import { createContext, useCallback, useContext, useState, type PropsWithChildren } from 'react';
import { Toast } from 'radix-ui';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import './animated-feedback.css';

type Tone = 'success' | 'error' | 'info';
type Notice = { id: number; message: string; tone: Tone; open: boolean };
const ToastContext = createContext<{ showToast: (message: string, tone?: Tone) => void } | null>(null);
let nextToastId = 0;

export function ToastProvider({ children }: PropsWithChildren) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const reduce = useReducedMotion();
  const showToast = useCallback((message: string, tone: Tone = 'info') => {
    setNotices(current => [...current, { id: ++nextToastId, message, tone, open: true }].slice(-3));
  }, []);
  return <ToastContext.Provider value={{ showToast }}>
    <Toast.Provider label="Thông báo" duration={4500} swipeDirection="right">
      {children}
      <AnimatePresence initial={false}>
        {notices.filter(notice => notice.open).map(notice => <Toast.Root key={notice.id} asChild forceMount open={notice.open}
          onOpenChange={open => setNotices(current => current.map(item => item.id === notice.id ? { ...item, open } : item))}>
          <motion.li
            layout={reduce ? false : 'position'}
            className="sc-toast"
            data-tone={notice.tone}
            initial={{ opacity: 0, y: reduce ? 0 : 14, scale: reduce ? 1 : 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduce ? 0 : 8, scale: reduce ? 1 : 0.96 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
          >
            <span className="material-symbols-outlined sc-toast-icon" aria-hidden="true">{notice.tone === 'error' ? 'error' : notice.tone === 'success' ? 'check_circle' : 'info'}</span>
            <Toast.Description className="sc-toast-message">{notice.message}</Toast.Description>
            <Toast.Close className="sc-toast-close" aria-label="Đóng thông báo">×</Toast.Close>
            {!reduce && (
              <motion.span
                className="sc-toast-progress"
                aria-hidden="true"
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 4.5, ease: 'linear' }}
              />
            )}
          </motion.li>
        </Toast.Root>)}
      </AnimatePresence>
      <Toast.Viewport className="sc-toast-viewport" label="Thông báo ({hotkey})" />
    </Toast.Provider>
  </ToastContext.Provider>;
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast requires ToastProvider');
  return value;
}
