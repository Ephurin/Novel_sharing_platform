export type StoryCraftPalette = {
  background: string;
  surface: string;
  surfaceMuted: string;
  neutralBg: string;
  border: string;
  controlBorder: string;
  primary: string;
  primaryHover: string;
  primarySoft: string;
  primaryMuted: string;
  onPrimary: string;
  text: string;
  textMuted: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
  sepiaBackground: string;
  sepiaText: string;
  lightBackground: string;
  lightText: string;
  darkBackground: string;
  darkText: string;
};

/** StoryCraft Warm Editorial — Light Ivory & Terracotta (WCAG AA >= 4.5:1 verified). */
export const lightColors: StoryCraftPalette = {
  background: '#F8F7F4',
  surface: '#FFFFFF',
  surfaceMuted: '#FCFBF8',
  neutralBg: '#F1F0ED',
  border: '#E8E5DF',
  controlBorder: '#DDD8D0',
  primary: '#DC8363',
  primaryHover: '#C96F4F',
  primarySoft: '#FFF1EA',
  primaryMuted: '#A9573A',
  onPrimary: '#241915',
  text: '#252B2A',
  textMuted: '#6B6661',
  success: '#21785F',
  successBg: '#DDF7EB',
  warning: '#94601A',
  warningBg: '#FFF1DA',
  danger: '#B84D49',
  dangerBg: '#FFF0EF',
  sepiaBackground: '#F4ECD8',
  sepiaText: '#3B2F22',
  lightBackground: '#F8F7F4',
  lightText: '#252B2A',
  darkBackground: '#24221F',
  darkText: '#F2EFEA'
};

/** StoryCraft Warm Editorial — Editorial Night & Terracotta (WCAG AA >= 4.5:1 verified). */
export const darkColors: StoryCraftPalette = {
  background: '#171715',
  surface: '#24221F',
  surfaceMuted: '#2C2926',
  neutralBg: '#393631',
  border: '#45403A',
  controlBorder: '#4F4943',
  primary: '#E69B7F',
  primaryHover: '#F0AE95',
  primarySoft: '#423026',
  primaryMuted: '#E69B7F',
  onPrimary: '#241915',
  text: '#F2EFEA',
  textMuted: '#BDB6AD',
  success: '#89D9B6',
  successBg: '#1D3A30',
  warning: '#F2C37E',
  warningBg: '#423422',
  danger: '#F2A09A',
  dangerBg: '#4A2B2A',
  sepiaBackground: '#2F261C',
  sepiaText: '#F5E6C8',
  lightBackground: '#F8F7F4',
  lightText: '#252B2A',
  darkBackground: '#171715',
  darkText: '#F2EFEA'
};

export const colors: StoryCraftPalette = lightColors;
