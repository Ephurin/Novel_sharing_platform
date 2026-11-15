import { ActionIcon, useMantineColorScheme } from '@mantine/core';
import { AnimatedMenu as Menu } from './AnimatedMenu';
import { IconCheck, IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import './interaction-widgets.css';

export function ThemeControl() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const reduce = useReducedMotion();
  const choices = [
    { value: 'light', label: 'Sáng', icon: IconSun },
    { value: 'dark', label: 'Tối', icon: IconMoon },
    { value: 'auto', label: 'Theo hệ thống', icon: IconDeviceDesktop }
  ] as const;
  const CurrentIcon = choices.find(choice => choice.value === colorScheme)?.icon ?? IconDeviceDesktop;
  return <Menu position="bottom-end" withinPortal>
    <Menu.Target>
      <ActionIcon variant="subtle" color="gray" size={32} aria-label="Giao diện" title="Giao diện">
        <span className="sc-theme-icon"><AnimatePresence initial={false}>
          <motion.span key={colorScheme} initial={{ opacity: 0, rotate: reduce ? 0 : -45, scale: reduce ? 1 : 0.75 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={{ opacity: 0, rotate: reduce ? 0 : 45 }} transition={{ duration: 0.18 }}>
            <CurrentIcon size={18} aria-hidden="true" />
          </motion.span>
        </AnimatePresence></span>
      </ActionIcon>
    </Menu.Target>
    <Menu.Dropdown>
      <Menu.Label>Giao diện</Menu.Label>
      {choices.map(({ value, label, icon: Icon }) => <Menu.Item key={value}
        leftSection={<Icon size={16} aria-hidden="true" />}
        rightSection={value === colorScheme ? <IconCheck size={14} aria-hidden="true" /> : null}
        aria-current={value === colorScheme ? 'true' : undefined}
        onClick={() => setColorScheme(value)}>{label}</Menu.Item>)}
    </Menu.Dropdown>
  </Menu>;
}
