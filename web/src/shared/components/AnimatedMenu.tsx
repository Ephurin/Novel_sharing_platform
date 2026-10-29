import { createContext, useContext, useRef, type ComponentPropsWithoutRef, type ElementType, type PropsWithChildren, type ReactElement, type ReactNode, type RefObject } from 'react';
import { DropdownMenu } from '@animate-ui/react/primitives/radix-ui/dropdown-menu';
import './animated-overlays.css';

const MenuOptions = createContext<{ withinPortal: boolean; align: 'start' | 'end'; trigger: RefObject<HTMLButtonElement | null> | null; onCloseAutoFocus?: (event: Event) => void }>({ withinPortal: true, align: 'end', trigger: null });

function MenuRoot({ children, position = 'bottom-end', withinPortal = true, onCloseAutoFocus }: PropsWithChildren<{
  position?: 'bottom-start' | 'bottom-end';
  withinPortal?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
}>) {
  const trigger = useRef<HTMLButtonElement>(null);
  return <MenuOptions.Provider value={{ withinPortal, align: position === 'bottom-start' ? 'start' : 'end', trigger, onCloseAutoFocus }}>
    <DropdownMenu.Root modal={false}>{children}</DropdownMenu.Root>
  </MenuOptions.Provider>;
}

function Target({ children }: { children: ReactElement }) {
  const { trigger } = useContext(MenuOptions);
  return <DropdownMenu.Trigger ref={trigger ?? undefined} asChild>{children}</DropdownMenu.Trigger>;
}

function Dropdown({ children }: PropsWithChildren) {
  const { withinPortal, align, trigger, onCloseAutoFocus } = useContext(MenuOptions);
  const content = <DropdownMenu.Content className="sc-animated-menu" align={align} sideOffset={6} collisionPadding={12}
    onCloseAutoFocus={(event) => {
      onCloseAutoFocus?.(event);
      if (event.defaultPrevented) return;
      event.preventDefault();
      const active = document.activeElement;
      // Keep focus in a newly opened dialog or an outside field. Restoring a
      // trigger after an exit animation must never scroll the page back up.
      if (active?.closest('[role="dialog"]')) return;
      if (active && active !== document.body && active !== trigger?.current && !active.closest('[role="menu"]')) return;
      trigger?.current?.focus({ preventScroll: true });
    }}>{children}</DropdownMenu.Content>;
  return withinPortal ? <DropdownMenu.Portal>{content}</DropdownMenu.Portal> : content;
}

type ItemProps = ComponentPropsWithoutRef<'button'> & {
  component?: ElementType;
  to?: string;
  color?: 'red';
  leftSection?: ReactNode;
  rightSection?: ReactNode;
};

function Item({ component: Component = 'button', children, color, leftSection, rightSection, disabled, className = '', ...props }: ItemProps) {
  return <DropdownMenu.Item asChild disabled={disabled}>
    <Component type={Component === 'button' ? 'button' : undefined} disabled={disabled}
      className={`sc-animated-menu-item ${className}`} data-destructive={color === 'red' || undefined} {...props}>
      {leftSection && <span className="sc-animated-menu-icon">{leftSection}</span>}
      <span className="sc-animated-menu-label">{children}</span>
      {rightSection && <span className="sc-animated-menu-icon">{rightSection}</span>}
    </Component>
  </DropdownMenu.Item>;
}

function Label({ children }: PropsWithChildren) {
  return <DropdownMenu.Label className="sc-animated-menu-heading">{children}</DropdownMenu.Label>;
}

function Divider() {
  return <DropdownMenu.Separator className="sc-animated-menu-divider" />;
}

export const AnimatedMenu = Object.assign(MenuRoot, { Target, Dropdown, Item, Label, Divider });
