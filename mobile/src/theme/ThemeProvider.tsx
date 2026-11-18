import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Platform, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { darkColors, lightColors, type StoryCraftPalette } from './colors';

export type ThemeMode = 'system' | 'light' | 'dark';
export type StoryCraftFontWeight = '400' | '500' | '600' | '700';

type ThemeContextValue = {
  mode: ThemeMode;
  scheme: 'light' | 'dark';
  palette: StoryCraftPalette;
  hydrated: boolean;
  fontsLoaded: boolean;
  setMode: (next: ThemeMode) => void;
};

const THEME_STORAGE_KEY = 'storycraft_mobile_theme';

export function resolveStoryCraftFontFamily(
  weight: StoryCraftFontWeight,
  fontsLoaded: boolean,
  os: string = Platform.OS
): string | undefined {
  if (os === 'web') {
    return '"Be Vietnam Pro", system-ui, -apple-system, sans-serif';
  }
  if (!fontsLoaded) {
    return undefined;
  }
  switch (weight) {
    case '700':
      return 'BeVietnamPro_700Bold';
    case '600':
      return 'BeVietnamPro_600SemiBold';
    case '500':
      return 'BeVietnamPro_500Medium';
    case '400':
    default:
      return 'BeVietnamPro_400Regular';
  }
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  scheme: 'light',
  palette: lightColors,
  hydrated: true,
  fontsLoaded: false,
  setMode: () => {}
});

export function StoryCraftThemeProvider({
  children,
  fontsLoaded = false
}: PropsWithChildren<{ fontsLoaded?: boolean }>) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((saved) => {
        if (active && (saved === 'light' || saved === 'dark' || saved === 'system')) {
          setModeState(saved);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) {
          setHydrated(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
  }, []);

  const scheme: 'light' | 'dark' =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  const palette = scheme === 'dark' ? darkColors : lightColors;

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, scheme, palette, hydrated, fontsLoaded, setMode }),
    [mode, scheme, palette, hydrated, fontsLoaded, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useStoryCraftTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

const MODE_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
  { value: 'system', label: 'Hệ thống' }
];

export function ThemeSegmentedPicker() {
  const { mode, palette, fontsLoaded, setMode } = useStoryCraftTheme();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Chế độ giao diện"
      style={[
        pickerStyles.track,
        { backgroundColor: palette.neutralBg, borderColor: palette.border }
      ]}
    >
      {MODE_OPTIONS.map((option) => {
        const active = mode === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Giao diện ${option.label}`}
            onPress={() => setMode(option.value)}
            style={({ pressed }) => [
              pickerStyles.segment,
              active
                ? {
                    backgroundColor: palette.surfaceElevated,
                    borderColor: palette.border
                  }
                : null,
              pressed ? { opacity: 0.85 } : null
            ]}
          >
            <Text
              style={[
                pickerStyles.label,
                {
                  color: active ? palette.primaryMuted : palette.textMuted,
                  fontFamily: resolveStoryCraftFontFamily(active ? '600' : '500', fontsLoaded)
                },
                active ? pickerStyles.labelActive : null
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4
  },
  segment: {
    flex: 1,
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 8
  },
  label: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500'
  },
  labelActive: {
    fontWeight: '600'
  }
});
