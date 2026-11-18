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

type CssVarMap = Record<string, string>;

function semanticPaletteVars(
  names: readonly string[],
  tokens: { text: string; bg: string; lightHover: string; filled?: string; filledHover: string }
): CssVarMap {
  const vars: CssVarMap = {};
  for (const name of names) {
    vars[`--mantine-color-${name}-text`] = tokens.text;
    vars[`--mantine-color-${name}-filled`] = tokens.filled ?? tokens.text;
    vars[`--mantine-color-${name}-filled-hover`] = tokens.filledHover;
    vars[`--mantine-color-${name}-light`] = tokens.bg;
    vars[`--mantine-color-${name}-light-hover`] = tokens.lightHover;
    vars[`--mantine-color-${name}-light-color`] = tokens.text;
    vars[`--mantine-color-${name}-outline`] = tokens.text;
    vars[`--mantine-color-${name}-outline-hover`] = tokens.bg;
  }
  return vars;
}

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
    '--mantine-primary-color-light-hover': 'var(--mantine-color-terracotta-light-hover)',
    '--mantine-primary-color-light-color': 'var(--sc-primary-text)',
    '--mantine-primary-color-outline': 'var(--sc-primary-text)',
    '--mantine-primary-color-outline-hover': 'var(--sc-primary-soft)'
  },
  // Mantine v7 Badge, Alert, and colored Buttons reference palette-named variables rather than
  // --mantine-primary-color-*, so map them per scheme to keep WCAG AA (>= 4.5:1) ink contrast.
  light: {
    ...semanticPaletteVars(['terracotta'], {
      text: 'var(--sc-primary-text)',
      filled: 'var(--sc-primary)',
      filledHover: 'var(--sc-primary-hover)',
      bg: 'var(--sc-primary-soft)',
      lightHover: 'color-mix(in srgb, var(--sc-primary) 12%, var(--sc-surface))'
    }),
    ...semanticPaletteVars(['teal', 'green'], {
      text: 'var(--sc-success)',
      filledHover: 'color-mix(in srgb, var(--sc-success) 88%, #000)',
      bg: 'var(--sc-success-bg)',
      lightHover: 'color-mix(in srgb, var(--sc-success) 10%, var(--sc-surface))'
    }),
    ...semanticPaletteVars(['orange', 'yellow'], {
      text: 'var(--sc-warning)',
      filledHover: 'color-mix(in srgb, var(--sc-warning) 88%, #000)',
      bg: 'var(--sc-warning-bg)',
      lightHover: 'color-mix(in srgb, var(--sc-warning) 10%, var(--sc-surface))'
    }),
    ...semanticPaletteVars(['red'], {
      text: 'var(--sc-danger)',
      filledHover: 'color-mix(in srgb, var(--sc-danger) 88%, #000)',
      bg: 'var(--sc-danger-bg)',
      lightHover: 'color-mix(in srgb, var(--sc-danger) 7%, var(--sc-surface))'
    }),
    ...semanticPaletteVars(['gray'], {
      text: '#635e5a',
      filled: 'var(--sc-neutral-bg)',
      filledHover: 'var(--sc-border)',
      bg: 'var(--sc-neutral-bg)',
      lightHover: 'var(--sc-border)'
    })
  },
  dark: {
    ...semanticPaletteVars(['terracotta'], {
      text: 'var(--sc-primary-text)',
      filled: 'var(--sc-primary)',
      filledHover: 'var(--sc-primary-hover)',
      bg: 'var(--sc-primary-soft)',
      lightHover: 'color-mix(in srgb, var(--sc-primary-soft) 82%, var(--sc-bg))'
    }),
    ...semanticPaletteVars(['teal', 'green'], {
      text: 'var(--sc-success)',
      filledHover: 'color-mix(in srgb, var(--sc-success) 88%, #fff)',
      bg: 'var(--sc-success-bg)',
      lightHover: 'color-mix(in srgb, var(--sc-success-bg) 82%, var(--sc-bg))'
    }),
    ...semanticPaletteVars(['orange', 'yellow'], {
      text: 'var(--sc-warning)',
      filledHover: 'color-mix(in srgb, var(--sc-warning) 88%, #fff)',
      bg: 'var(--sc-warning-bg)',
      lightHover: 'color-mix(in srgb, var(--sc-warning-bg) 82%, var(--sc-bg))'
    }),
    ...semanticPaletteVars(['red'], {
      text: 'var(--sc-danger)',
      filledHover: 'color-mix(in srgb, var(--sc-danger) 88%, #fff)',
      bg: 'var(--sc-danger-bg)',
      lightHover: 'color-mix(in srgb, var(--sc-danger-bg) 82%, var(--sc-bg))'
    }),
    ...semanticPaletteVars(['gray'], {
      text: 'var(--sc-text-muted)',
      filled: 'var(--sc-neutral-bg)',
      filledHover: 'var(--sc-border)',
      bg: 'var(--sc-neutral-bg)',
      lightHover: 'var(--sc-border)'
    })
  }
});
