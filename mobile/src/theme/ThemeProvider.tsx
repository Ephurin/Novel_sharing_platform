import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { darkColors, lightColors, type StoryCraftPalette } from './colors';

export type ThemeMode = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  mode: ThemeMode;
  scheme: 'light' | 'dark';
  palette: StoryCraftPalette;
  setMode: (next: ThemeMode) => void;
};

const THEME_STORAGE_KEY = 'storycraft_mobile_theme';

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  scheme: 'light',
  palette: lightColors,
  setMode: () => {}
});

export function StoryCraftThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((saved) => {
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setModeState(saved);
        }
      })
      .catch(() => {});
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
  }, []);

  const scheme: 'light' | 'dark' =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  const palette = scheme === 'dark' ? darkColors : lightColors;

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, scheme, palette, setMode }),
    [mode, scheme, palette, setMode]
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
  const { mode, palette, setMode } = useStoryCraftTheme();

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
                    backgroundColor: palette.surface,
                    borderColor: palette.border
                  }
                : null,
              pressed ? { opacity: 0.85 } : null
            ]}
          >
            <Text
              style={[
                pickerStyles.label,
                { color: active ? palette.primaryMuted : palette.textMuted },
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
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 8
  },
  label: {
    fontSize: 13,
    fontWeight: '600'
  },
  labelActive: {
    fontWeight: '700'
  }
});
