import { ActionIcon, Menu, useMantineColorScheme } from '@mantine/core';
import { IconCheck, IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react';

export function ThemeControl() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const choices = [
    { value: 'light', label: 'Sáng', icon: IconSun },
    { value: 'dark', label: 'Tối', icon: IconMoon },
    { value: 'auto', label: 'Theo hệ thống', icon: IconDeviceDesktop }
  ] as const;
  const CurrentIcon = choices.find(choice => choice.value === colorScheme)?.icon ?? IconDeviceDesktop;
  return <Menu position="bottom-end" withinPortal>
    <Menu.Target>
      <ActionIcon variant="subtle" color="gray" size={32} aria-label="Giao diện" title="Giao diện">
        <CurrentIcon size={18} aria-hidden="true" />
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
