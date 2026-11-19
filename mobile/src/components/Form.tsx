import { useState, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
  type TextInputProps
} from 'react-native';
import { resolveStoryCraftFontFamily, useStoryCraftTheme } from '../theme/ThemeProvider';

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  multiline = false,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
  autoComplete,
  textContentType,
  returnKeyType,
  onSubmitEditing,
  maxLength,
  editable = true,
  error,
  rightAccessory
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: KeyboardTypeOptions;
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  maxLength?: number;
  editable?: boolean;
  error?: string | null;
  rightAccessory?: ReactNode;
}) {
  const { palette, fontsLoaded } = useStoryCraftTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? palette.danger
    : focused
    ? palette.focusRing
    : palette.controlBorder;

  return (
    <View style={styles.wrapper}>
      <Text
        style={[
          styles.label,
          {
            color: palette.text,
            fontFamily: resolveStoryCraftFontFamily('500', fontsLoaded)
          }
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.inputRow,
          {
            borderColor,
            backgroundColor: focused ? palette.surface : palette.surfaceMuted
          },
          focused ? styles.inputRowFocused : null,
          !editable ? styles.inputDisabled : null
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          style={[
            styles.input,
            {
              color: palette.text,
              fontFamily: resolveStoryCraftFontFamily('400', fontsLoaded)
            },
            multiline ? styles.multiline : null
          ]}
          placeholder={placeholder}
          placeholderTextColor={palette.textMuted}
          secureTextEntry={secureTextEntry}
          multiline={multiline}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          maxLength={maxLength}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          value={value}
          onChangeText={onChangeText}
        />
        {rightAccessory}
      </View>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.errorText,
            {
              color: palette.danger,
              fontFamily: resolveStoryCraftFontFamily('500', fontsLoaded)
            }
          ]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6
  },
  label: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500'
  },
  inputRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8
  },
  inputRowFocused: {
    borderWidth: 1.5
  },
  inputDisabled: {
    opacity: 0.6
  },
  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 22
  },
  multiline: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: 'top'
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500'
  }
});
