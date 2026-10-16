import { Badge, Button, Paper, createTheme, type MantineColorsTuple } from '@mantine/core';

// Matches the Tailwind `primary` palette in index.html so Mantine and Tailwind screens share one accent.
const brand: MantineColorsTuple = [
  '#fdf5f0',
  '#fbe8dc',
  '#f6d0b9',
  '#efb292',
  '#e7946d',
  '#e08a66',
  '#dc8363',
  '#c96f4f',
  '#a85a3e',
  '#7f4430'
];

// Warm stone greys instead of Mantine's cool greys, matching the Tailwind `stone-*` classes.
const gray: MantineColorsTuple = [
  '#fafaf9',
  '#f5f5f4',
  '#e7e5e4',
  '#d6d3d1',
  '#a8a29e',
  '#78716c',
  '#57534e',
  '#44403c',
  '#292524',
  '#1c1917'
];

const fontFamily = '"Be Vietnam Pro", "Plus Jakarta Sans", system-ui, sans-serif';

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: 6,
  colors: { brand, gray },
  black: '#292524',
  fontFamily,
  fontSizes: { xs: '12px', sm: '13px', md: '14px', lg: '16px', xl: '20px' },
  defaultRadius: 'md',
  headings: {
    fontFamily,
    fontWeight: '700',
    sizes: {
      h1: { fontSize: '28px', lineHeight: '1.3' },
      h2: { fontSize: '24px', lineHeight: '1.35' },
      h3: { fontSize: '20px', lineHeight: '1.4' },
      h4: { fontSize: '16px', lineHeight: '1.45' },
      h5: { fontSize: '14px', lineHeight: '1.5' },
      h6: { fontSize: '13px', lineHeight: '1.5' }
    }
  },
  components: {
    Button: Button.extend({
      styles: { root: { fontWeight: 500 } }
    }),
    Paper: Paper.extend({
      defaultProps: { radius: 'lg' },
      styles: { root: { borderColor: 'var(--mantine-color-gray-2)' } }
    }),
    Badge: Badge.extend({
      defaultProps: { radius: 'xl', variant: 'light' },
      styles: { root: { textTransform: 'none', fontWeight: 600 } }
    })
  }
});
