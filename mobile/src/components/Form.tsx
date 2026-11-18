import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { useStoryCraftTheme } from '../theme/ThemeProvider';

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  multiline = false,
  autoCapitalize = 'sentences',
  keyboardType = 'default'
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: KeyboardTypeOptions;
}) {
  const { palette } = useStoryCraftTheme();

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[
          styles.input,
          {
            borderColor: palette.controlBorder,
            backgroundColor: palette.surfaceMuted,
            color: palette.text
          },
          multiline ? styles.multiline : null
        ]}
        placeholder={placeholder}
        placeholderTextColor={palette.textMuted}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
    fontSize: 14
  },
  multiline: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: 'top'
  }
});
