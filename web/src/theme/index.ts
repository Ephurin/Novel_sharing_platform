import { Checkbox, Switch, createTheme, type CSSVariablesResolver } from '@mantine/core';
import { AnimatedCheckIcon } from '../shared/components/AnimatedCheckIcon';

export const theme = createTheme({
  primaryColor: 'terracotta',
  fontFamily: '"Be Vietnam Pro", system-ui, sans-serif',
  defaultRadius: 'md',
  components: {
    Checkbox: Checkbox.extend({ defaultProps: { icon: AnimatedCheckIcon, iconColor: 'var(--sc-on-primary)' } }),
    Switch: Switch.extend({ classNames: { root: 'sc-animated-switch' } })
  },
  colors: {
    terracotta: ['#fff1ea', '#fce1d5', '#f6c8b5', '#eeac91', '#e69b7f', '#dd8567', '#c96f52', '#ad583c', '#9b4930', '#773623'],
    dark: ['#f2efea', '#d9d3ca', '#bdb6ad', '#a2998d', '#746a60', '#45403a', '#322e2a', '#24221f', '#1c1b18', '#171715']
  },
  headings: {
    fontFamily: '"Be Vietnam Pro", system-ui, sans-serif',
    sizes: {
      h1: { fontSize: '24px', lineHeight: '32px', fontWeight: '700' },
      h2: { fontSize: '18px', lineHeight: '26px', fontWeight: '600' },
      h3: { fontSize: '16px', lineHeight: '24px', fontWeight: '600' }
    }
  }
});

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    '--mantine-color-body': 'var(--sc-bg)',
    '--mantine-color-text': 'var(--sc-text)',
    '--mantine-color-dimmed': 'var(--sc-text-muted)',
    '--mantine-color-placeholder': 'var(--sc-text-muted)',
    '--mantine-color-default': 'var(--sc-surface)',
    '--mantine-color-default-color': 'var(--sc-text)',
    '--mantine-color-default-hover': 'var(--sc-surface-subtle)',
    '--mantine-color-default-border': 'var(--sc-border)',
    '--mantine-primary-color-filled': 'var(--sc-primary)',
    '--mantine-primary-color-filled-hover': 'var(--sc-primary-hover)',
    '--mantine-primary-color-light': 'var(--sc-primary-soft)',
    '--mantine-primary-color-light-hover': 'var(--sc-neutral-bg)',
    '--mantine-primary-color-light-color': 'var(--sc-primary-text)'
  },
  light: {},
  dark: {}
});
