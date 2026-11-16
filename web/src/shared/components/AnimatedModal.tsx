import { useLayoutEffect, useRef, type PropsWithChildren, type ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { Drawer } from 'vaul';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CloseButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import './animated-overlays.css';

type AnimatedModalProps = PropsWithChildren<{
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  centered?: boolean;
  closeOnClickOutside?: boolean;
  closeOnEscape?: boolean;
  withCloseButton?: boolean;
  className?: string;
  side?: 'right';
  onCloseAutoFocus?: (event: Event) => void;
}>;

/** Guard combobox escape key before dismissing parent dialog or mobile sheet. */
function isListboxOpen(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[aria-expanded="true"][aria-haspopup="listbox"], [data-expanded="true"][aria-haspopup="listbox"]'));
}

/** Keep the existing form controls and dismissal rules, animate the shared shell. */
export function AnimatedModal({ opened, onClose, title, children, size = 'md', centered = false,
  closeOnClickOutside = true, closeOnEscape = true, withCloseButton = true, className = '', side, onCloseAutoFocus }: AnimatedModalProps) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();
  const mobile = useMediaQuery('(max-width: 767px)', undefined, { getInitialValueInEffect: false });
  const hidden = side ? { opacity: reduceMotion ? 0 : 1, x: reduceMotion ? 0 : '100%' } : { opacity: 0, scale: reduceMotion ? 1 : 0.96 };
  useLayoutEffect(() => {
    if (opened && document.activeElement instanceof HTMLElement) {
      const active = document.activeElement;
      const menuTriggerId = active.closest('[role="menu"]')?.getAttribute('aria-labelledby');
      // Menu items unmount on selection. Return to their trigger when the dialog closes.
      previousFocus.current = (menuTriggerId ? document.getElementById(menuTriggerId) : null) ?? active;
    }
  }, [opened]);

  const handleCloseAutoFocus = (event: Event) => {
    onCloseAutoFocus?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
  };

  if (side === 'right' && mobile) {
    return <Drawer.Root open={opened} onOpenChange={(open) => { if (!open) onClose(); }} direction="bottom" dismissible={closeOnClickOutside || closeOnEscape} noBodyStyles>
      <Drawer.Portal>
        <Drawer.Overlay className="sc-animated-modal-overlay sc-vaul-overlay" />
        <Drawer.Content className={`sc-vaul-sheet ${className}`} aria-describedby={undefined}
          onEscapeKeyDown={(event) => {
            if (!closeOnEscape || isListboxOpen(event.target)) event.preventDefault();
          }}
          onPointerDownOutside={(event) => { if (!closeOnClickOutside) event.preventDefault(); }}
          onCloseAutoFocus={handleCloseAutoFocus}>
          <Drawer.Handle className="sc-vaul-handle" />
          <header className="sc-animated-modal-header">
            <Drawer.Title className="sc-animated-modal-title">{title}</Drawer.Title>
            {withCloseButton && <Drawer.Close asChild><CloseButton aria-label="Đóng hộp thoại" /></Drawer.Close>}
          </header>
          <div className="sc-animated-modal-body">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>;
  }

  return <Dialog.Root open={opened} onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog.Portal forceMount>
      <AnimatePresence>
      {opened && <Dialog.Overlay key="overlay" forceMount asChild>
        <motion.div className="sc-animated-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} />
      </Dialog.Overlay>}
      {opened && <motion.div key="dialog" className={`sc-animated-modal-position ${centered ? 'is-centered' : ''} ${side ? 'is-drawer' : ''}`}>
        <Dialog.Content forceMount asChild aria-describedby={undefined}
          onEscapeKeyDown={(event) => {
            // Escape closes the active combobox before dismissing its parent dialog.
            if (!closeOnEscape || isListboxOpen(event.target)) event.preventDefault();
          }}
          onPointerDownOutside={(event) => { if (!closeOnClickOutside) event.preventDefault(); }}
          onCloseAutoFocus={handleCloseAutoFocus}>
          <motion.div className={`sc-animated-modal sc-animated-modal-${size} ${side ? 'sc-animated-drawer' : ''} ${className}`}
            initial={hidden} animate={side ? { opacity: 1, x: 0 } : { opacity: 1, scale: 1 }} exit={{ ...hidden, pointerEvents: 'none' }}
            transition={{ duration: reduceMotion ? 0.12 : 0.18, ease: 'easeOut' }}>
          <header className="sc-animated-modal-header">
            <Dialog.Title className="sc-animated-modal-title">{title}</Dialog.Title>
            {withCloseButton && <Dialog.Close asChild><CloseButton aria-label="Đóng hộp thoại" /></Dialog.Close>}
          </header>
          <div className="sc-animated-modal-body">{children}</div>
          </motion.div>
        </Dialog.Content>
      </motion.div>}
      </AnimatePresence>
    </Dialog.Portal>
  </Dialog.Root>;
}
