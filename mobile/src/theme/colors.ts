import type { ReadingBackground } from '../api/types';

export type StoryCraftPalette = {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceElevated: string;
  neutralBg: string;
  border: string;
  controlBorder: string;
  overlay: string;
  focusRing: string;
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
  lightBackground: string;
  lightText: string;
  sepiaBackground: string;
  sepiaText: string;
  mintBackground: string;
  mintText: string;
  blueBackground: string;
  blueText: string;
  roseBackground: string;
  roseText: string;
  darkBackground: string;
  darkText: string;
  blackBackground: string;
  blackText: string;
};

/** StoryCraft Warm Editorial — Light Ivory & Terracotta (WCAG AA >= 4.5:1 verified). */
export const lightColors: StoryCraftPalette = {
  background: '#F8F7F4',
  surface: '#FFFFFF',
  surfaceMuted: '#FCFBF8',
  surfaceElevated: '#FFFFFF',
  neutralBg: '#F1F0ED',
  border: '#E8E5DF',
  controlBorder: '#DDD8D0',
  overlay: 'rgba(30, 25, 22, 0.42)',
  focusRing: '#A9573A',
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
  lightBackground: '#F8F7F4',
  lightText: '#252B2A',
  sepiaBackground: '#F4ECD8',
  sepiaText: '#3B2F22',
  mintBackground: '#E8F3EC',
  mintText: '#1E3329',
  blueBackground: '#EBF2F9',
  blueText: '#1D2E40',
  roseBackground: '#F9ECEF',
  roseText: '#3D2229',
  darkBackground: '#24221F',
  darkText: '#F2EFEA',
  blackBackground: '#0E0E0D',
  blackText: '#EAE6DF'
};

/** StoryCraft Warm Editorial — Editorial Night & Terracotta (WCAG AA >= 4.5:1 verified). */
export const darkColors: StoryCraftPalette = {
  background: '#171715',
  surface: '#24221F',
  surfaceMuted: '#2C2926',
  surfaceElevated: '#322E2A',
  neutralBg: '#393631',
  border: '#45403A',
  controlBorder: '#4F4943',
  overlay: 'rgba(0, 0, 0, 0.68)',
  focusRing: '#F1AD8D',
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
  lightBackground: '#F8F7F4',
  lightText: '#252B2A',
  sepiaBackground: '#2F261C',
  sepiaText: '#F5E6C8',
  mintBackground: '#E8F3EC',
  mintText: '#1E3329',
  blueBackground: '#EBF2F9',
  blueText: '#1D2E40',
  roseBackground: '#F9ECEF',
  roseText: '#3D2229',
  darkBackground: '#171715',
  darkText: '#F2EFEA',
  blackBackground: '#0E0E0D',
  blackText: '#EAE6DF'
};

export const READING_BACKGROUND_OPTIONS: ReadonlyArray<{
  value: ReadingBackground;
  label: string;
}> = [
  { value: 'LIGHT', label: 'Sáng' },
  { value: 'SEPIA', label: 'Sepia' },
  { value: 'MINT', label: 'Bạc hà' },
  { value: 'BLUE', label: 'Xanh dịu' },
  { value: 'ROSE', label: 'Hồng phấn' },
  { value: 'DARK', label: 'Tối' },
  { value: 'BLACK', label: 'Đen sâu' }
];

export function getReadingBackgroundColors(
  palette: StoryCraftPalette,
  background: ReadingBackground
): { backgroundColor: string; color: string } {
  switch (background) {
    case 'SEPIA':
      return { backgroundColor: palette.sepiaBackground, color: palette.sepiaText };
    case 'MINT':
      return { backgroundColor: palette.mintBackground, color: palette.mintText };
    case 'BLUE':
      return { backgroundColor: palette.blueBackground, color: palette.blueText };
    case 'ROSE':
      return { backgroundColor: palette.roseBackground, color: palette.roseText };
    case 'DARK':
      return { backgroundColor: palette.darkBackground, color: palette.darkText };
    case 'BLACK':
      return { backgroundColor: palette.blackBackground, color: palette.blackText };
    case 'LIGHT':
    default:
      return { backgroundColor: palette.lightBackground, color: palette.lightText };
  }
}

export const colors: StoryCraftPalette = lightColors;
