import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useStoryCraftTheme } from '../theme/ThemeProvider';
import { Field } from './Form';
import { GhostButton, PrimaryButton, useScreenStyles } from './Screen';

export const REPORT_REASONS = [
  'Spam / Quảng cáo',
  'Nội dung vi phạm',
  'Bản quyền',
  'Khác'
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const DEFAULT_REPORT_REASON: ReportReason = 'Nội dung vi phạm';
export const REPORT_DESCRIPTION_MAX_LENGTH = 2000;

export function ReportReasonModal({
  visible,
  title,
  targetKey,
  submitting = false,
  error = null,
  onClose,
  onSubmit
}: {
  visible: boolean;
  title: string;
  targetKey?: string;
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: { reason: string; description?: string }) => void;
}) {
  const { palette } = useStoryCraftTheme();
  const themed = useScreenStyles();
  const [selectedReason, setSelectedReason] = useState<ReportReason>(DEFAULT_REPORT_REASON);
  const [description, setDescription] = useState('');

  const resetKey = `${visible ? '1' : '0'}:${targetKey ?? ''}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setSelectedReason(DEFAULT_REPORT_REASON);
    setDescription('');
  }

  if (!visible) return null;

  const handleConfirm = () => {
    const trimmedDesc = description.trim();
    onSubmit({
      reason: selectedReason,
      ...(trimmedDesc ? { description: trimmedDesc } : {})
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!submitting) onClose();
      }}
    >
      <View style={[sheetStyles.backdrop, { backgroundColor: palette.overlay }]}>
        <View
          accessibilityRole="summary"
          style={[
            sheetStyles.dialog,
            {
              backgroundColor: palette.surfaceElevated,
              borderColor: palette.border
            }
          ]}
        >
          <Text style={themed.cardTitle}>{title}</Text>
          <Text style={themed.muted}>
            Chọn lý do báo cáo để đội ngũ kiểm duyệt xử lý chính xác.
          </Text>

          <View style={sheetStyles.reasonList}>
            {REPORT_REASONS.map((reason) => {
              const active = selectedReason === reason;
              return (
                <Pressable
                  key={reason}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active, selected: active }}
                  accessibilityLabel={reason}
                  disabled={submitting}
                  onPress={() => setSelectedReason(reason)}
                  style={({ pressed }) => [
                    sheetStyles.reasonOption,
                    {
                      borderColor: active ? palette.primaryMuted : palette.controlBorder,
                      backgroundColor: active ? palette.primarySoft : palette.surface
                    },
                    pressed && !submitting ? { opacity: 0.85 } : null
                  ]}
                >
                  <View
                    style={[
                      sheetStyles.radioOuter,
                      { borderColor: active ? palette.primaryMuted : palette.textMuted }
                    ]}
                  >
                    {active ? (
                      <View
                        style={[sheetStyles.radioInner, { backgroundColor: palette.primaryMuted }]}
                      />
                    ) : null}
                  </View>
                  <Text
                    style={[
                      themed.body,
                      active ? { color: palette.primaryMuted, fontWeight: '600' } : null
                    ]}
                  >
                    {reason}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Field
            label="Ghi chú thêm (tùy chọn)"
            value={description}
            onChangeText={(next) => setDescription(next.slice(0, REPORT_DESCRIPTION_MAX_LENGTH))}
            placeholder="Mô tả ngắn gọn vị trí hoặc chi tiết vi phạm..."
            maxLength={REPORT_DESCRIPTION_MAX_LENGTH}
            editable={!submitting}
          />

          {error ? (
            <Text accessibilityLiveRegion="polite" style={themed.error}>
              {error}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <GhostButton
              flex={1}
              label="Hủy"
              disabled={submitting}
              onPress={onClose}
            />
            <PrimaryButton
              flex={1}
              label="Gửi báo cáo"
              loading={submitting}
              disabled={submitting}
              onPress={handleConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    padding: 16,
    justifyContent: 'center'
  },
  dialog: {
    gap: 12,
    padding: 18,
    borderRadius: 12,
    borderWidth: 1
  },
  reasonList: {
    gap: 8
  },
  reasonOption: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5
  }
});
