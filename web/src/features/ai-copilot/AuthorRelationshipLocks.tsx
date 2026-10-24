import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon
} from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconLock, IconLockOpen, IconRefresh } from '@tabler/icons-react';
import {
  type MemoryEntity,
  type Relationship,
  lockRelationship
} from './author-memory-api';
import { ApiClientError, getApiErrorMessage } from '../../shared/api/api-client';

export function AuthorRelationshipLocks({
  novelId,
  brainVersion,
  entities,
  relations,
  disabled,
  perform,
  onLocked
}: {
  novelId: string;
  brainVersion: number;
  entities: MemoryEntity[];
  relations: Relationship[];
  disabled: boolean;
  perform: (fn: () => Promise<unknown>) => void;
  onLocked: () => Promise<unknown>;
}) {
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [objectId, setObjectId] = useState<string | null>(null);
  const [relationType, setRelationType] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Entities mapped to select options with explicit UUIDs
  const entityOptions = entities.map(e => ({
    value: e.entity_id,
    label: `${e.name} [${e.entity_type}] · ID: ${e.entity_id.slice(0, 8)}...`
  }));

  const handleLock = () => {
    if (!subjectId || !objectId) {
      setErrorMsg('Vui lòng chọn cả hai thực thể chính xác từ danh sách Canon.');
      return;
    }
    if (subjectId === objectId) {
      setErrorMsg('Chủ thể và đối tượng phải là hai thực thể khác nhau.');
      return;
    }
    const trimmed = relationType.trim();
    if (!trimmed || trimmed.length > 80) {
      setErrorMsg('Loại quan hệ không được để trống và tối đa 80 ký tự.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    perform(async () => {
      try {
        const result = await lockRelationship(novelId, {
          subject_entity_id: subjectId,
          object_entity_id: objectId,
          relation_type: trimmed,
          expected_brain_version: brainVersion
        });
        setSuccessMsg(
          `Đã khóa quan hệ Canon thành công (v${result.brain_version}). Quan hệ giữa hai thực thể này được bảo vệ khỏi việc ghi đè tự động.`
        );
        setRelationType('');
        await onLocked();
      } catch (err) {
        if (err instanceof ApiClientError) {
          if (err.status === 409) {
            setErrorMsg(
              'Xung đột phiên bản Story Brain (409 Conflict). Dữ liệu đã thay đổi trên máy chủ; vui lòng kiểm tra lại.'
            );
          } else if (err.status === 422) {
            setErrorMsg(
              `Dữ liệu không hợp lệ (422): ${getApiErrorMessage(err)}`
            );
          } else {
            setErrorMsg(getApiErrorMessage(err));
          }
        } else {
          setErrorMsg(String(err));
        }
        throw err;
      }
    });
  };

  const handlePrefillForRemediation = (rel: Relationship) => {
    // Try to find matching entity IDs by metadata or exact match
    const subjId = rel.metadata?.subject_entity_id || entities.find(e => e.name === rel.subject)?.entity_id || null;
    const objId = rel.metadata?.object_entity_id || entities.find(e => e.name === rel.object)?.entity_id || null;
    if (subjId) setSubjectId(subjId);
    if (objId) setObjectId(objId);
    setRelationType(rel.relation);
    setErrorMsg(null);
    setSuccessMsg('Đã nạp thông tin quan hệ vào form để bạn chọn lại UUID chính xác.');
  };

  const lockedRelations = relations.filter(r => r.locked);

  return (
    <Stack gap="md">
      {/* ──────────────────────────────────────────
          Section 1: Relationship Lock Form
         ────────────────────────────────────────── */}
      <Paper p="md" withBorder radius="md">
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <ThemeIcon color="indigo" variant="light" size="sm">
                <IconLock size={14} />
              </ThemeIcon>
              <Text fw={600} size="sm">
                Khóa quan hệ Canon (Exact-ID Relationship Lock)
              </Text>
            </Group>
            <Badge variant="outline" color="gray">
              Brain v{brainVersion}
            </Badge>
          </Group>

          <Text size="xs" c="dimmed">
            Khóa quan hệ bằng UUID định danh duy nhất giữa hai thực thể. Khi đã khóa, AI không thể
            tự động thay đổi quan hệ này trong các lần trích xuất tiếp theo. Hai nhân vật cùng tên
            (ví dụ: Minh A và Minh B) sẽ có các khóa quan hệ hoàn toàn độc lập.
          </Text>

          {errorMsg && (
            <Alert
              color="red"
              icon={<IconAlertTriangle size={16} />}
              title="Lỗi khóa quan hệ"
              withCloseButton
              onClose={() => setErrorMsg(null)}
            >
              {errorMsg}
            </Alert>
          )}

          {successMsg && (
            <Alert
              color="teal"
              icon={<IconCheck size={16} />}
              withCloseButton
              onClose={() => setSuccessMsg(null)}
            >
              {successMsg}
            </Alert>
          )}

          <Group grow align="flex-start">
            <Select
              size="xs"
              label="Chủ thể (Subject)"
              placeholder="Chọn thực thể đã duyệt..."
              data={entityOptions}
              value={subjectId}
              onChange={setSubjectId}
              searchable
              clearable
              disabled={disabled || entities.length === 0}
            />

            <Select
              size="xs"
              label="Đối tượng (Object)"
              placeholder="Chọn thực thể đã duyệt..."
              data={entityOptions}
              value={objectId}
              onChange={setObjectId}
              searchable
              clearable
              disabled={disabled || entities.length === 0}
            />
          </Group>

          <Group align="flex-end">
            <TextInput
              style={{ flex: 1 }}
              size="xs"
              label="Loại quan hệ (Relation Type, tối đa 80 ký tự)"
              placeholder="Ví dụ: ally, enemy, mentor, sibling, đồng minh, kẻ thù..."
              value={relationType}
              onChange={e => setRelationType(e.currentTarget.value)}
              disabled={disabled}
            />

            <Button
              size="xs"
              color="indigo"
              leftSection={<IconLock size={14} />}
              disabled={disabled || !subjectId || !objectId || !relationType.trim()}
              onClick={handleLock}
            >
              Khóa quan hệ vào Canon
            </Button>
          </Group>
        </Stack>
      </Paper>

      {/* ──────────────────────────────────────────
          Section 2: Existing Relationships List
         ────────────────────────────────────────── */}
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Text fw={600} size="sm">
            Danh sách quan hệ hiện có ({relations.length} quan hệ · {lockedRelations.length} đã khóa)
          </Text>
        </Group>

        {relations.length === 0 ? (
          <Paper p="md" withBorder radius="md">
            <Text size="xs" c="dimmed" ta="center">
              Chưa có quan hệ nào được ghi nhận trong Canon. Hãy chọn hai thực thể ở trên để tạo khóa quan hệ.
            </Text>
          </Paper>
        ) : (
          relations.map((rel, idx) => {
            const hasExactIds = Boolean(rel.metadata?.subject_entity_id && rel.metadata?.object_entity_id);
            const isAmbiguousLegacy = rel.locked && !hasExactIds;

            return (
              <Card key={idx} withBorder radius="sm" p="xs">
                <Stack gap="xs">
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <Text fw={600} size="sm">
                        {rel.subject}
                      </Text>
                      <Badge variant="light" color="indigo" size="xs">
                        {rel.relation}
                      </Badge>
                      <Text fw={600} size="sm">
                        {rel.object}
                      </Text>
                    </Group>

                    {rel.locked ? (
                      <Badge color="green" size="xs" leftSection={<IconLock size={10} />}>
                        Đã khóa Canon
                      </Badge>
                    ) : (
                      <Badge color="gray" size="xs" leftSection={<IconLockOpen size={10} />}>
                        Chưa khóa
                      </Badge>
                    )}
                  </Group>

                  {/* Metadata and Exact ID display */}
                  {hasExactIds ? (
                    <Paper p="xs" bg="var(--mantine-color-gray-0)" radius="xs">
                      <Group gap="md">
                        <Text size="xs" c="dimmed">
                          Chủ thể UUID:{' '}
                          <Text component="span" ff="monospace" size="xs">
                            {rel.metadata?.subject_entity_id}
                          </Text>
                        </Text>
                        <Text size="xs" c="dimmed">
                          Đối tượng UUID:{' '}
                          <Text component="span" ff="monospace" size="xs">
                            {rel.metadata?.object_entity_id}
                          </Text>
                        </Text>
                      </Group>
                    </Paper>
                  ) : null}

                  {/* Ambiguous Legacy Lock Warning & Remediation */}
                  {isAmbiguousLegacy && (
                    <Alert
                      color="orange"
                      icon={<IconAlertTriangle size={14} />}
                      title="Cảnh báo: Khóa quan hệ cũ thiếu UUID chính xác (Ambiguous Legacy Lock)"
                    >
                      <Stack gap="xs">
                        <Text size="xs">
                          Khóa này được tạo từ phiên bản cũ chỉ lưu tên hiển thị &ldquo;{rel.subject}&rdquo; và &ldquo;{rel.object}&rdquo;.
                          Nếu truyện có nhiều nhân vật cùng tên, khóa này có thể gây nhầm lẫn. Vui lòng chọn lại UUID chính xác để cập nhật.
                        </Text>
                        <Group justify="flex-end">
                          <Button
                            size="compact-xs"
                            color="orange"
                            variant="light"
                            onClick={() => handlePrefillForRemediation(rel)}
                            disabled={disabled}
                          >
                            Cập nhật khóa bằng UUID chính xác
                          </Button>
                        </Group>
                      </Stack>
                    </Alert>
                  )}
                </Stack>
              </Card>
            );
          })
        )}
      </Stack>
    </Stack>
  );
}
