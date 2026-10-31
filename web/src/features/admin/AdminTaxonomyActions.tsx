import { useState } from 'react';
import { Button, Select, TextInput, Textarea } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminConfirm, number } from './AdminShared';
import { adminSend } from './admin-operations-api';

type Item = { id: string; name: string; description?: string; usageCount: number };
export function AdminTaxonomyActions({ kind, items }: { kind: 'genres' | 'tags'; items: Item[] }) {
  const cache = useQueryClient();
  const [selected, setSelected] = useState<{
    item: Item;
    action: 'edit' | 'merge' | 'delete';
  } | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: async () => {
      const { item, action } = selected!;
      const path = `/admin/taxonomy/${kind}/${item.id}`;
      if (action === 'edit') {
        if (!name.trim()) throw new Error('Vui lòng nhập tên.');
        return adminSend('patch', path, { name, description, reason });
      }
      if (action === 'merge') {
        if (!targetId) throw new Error('Chọn danh mục đích.');
        return adminSend('post', `${path}/merge`, { targetId, confirm: true, reason });
      }
      return adminSend('delete', path, { confirm: true, reason });
    },
    onSuccess: async () => {
      setSelected(null);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['admin-taxonomy'] }),
        cache.invalidateQueries({ queryKey: ['admin-novels'] }),
        cache.invalidateQueries({ queryKey: ['admin-novel'] })
      ]);
    }
  });
  const open = (item: Item, action: 'edit' | 'merge' | 'delete') => {
    mutation.reset();
    setReason('');
    setName(item.name);
    setDescription(item.description || '');
    setTargetId('');
    setSelected({ item, action });
  };
  return (
    <>
      <div>
        {items.map((item) => (
          <div className="admin-taxonomy-row" key={item.id}>
            <div>
              <strong>
                {kind === 'tags' ? '# ' : ''}
                {item.name}
              </strong>
              <small className="admin-block">{number(item.usageCount)} truyện</small>
            </div>
            <div className="admin-actions">
              <Button variant="subtle" size="xs" onClick={() => open(item, 'edit')}>
                Sửa
              </Button>
              <Button
                variant="subtle"
                size="xs"
                disabled={items.length < 2}
                onClick={() => open(item, 'merge')}
              >
                Gộp
              </Button>
              <Button
                variant="subtle"
                color="red"
                size="xs"
                disabled={item.usageCount > 0}
                onClick={() => open(item, 'delete')}
              >
                Xóa
              </Button>
            </div>
          </div>
        ))}
      </div>
      <AdminConfirm
        opened={!!selected}
        title={
          selected?.action === 'edit'
            ? 'Chỉnh sửa danh mục'
            : selected?.action === 'merge'
              ? 'Gộp danh mục'
              : 'Xóa danh mục'
        }
        confirmLabel="Lưu thay đổi"
        destructive={selected?.action !== 'edit'}
        reason={reason}
        setReason={setReason}
        required
        pending={mutation.isPending}
        error={mutation.error}
        onClose={() => setSelected(null)}
        onConfirm={() => mutation.mutate()}
      >
        {selected?.action === 'edit' ? (
          <>
            <TextInput
              label="Tên"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            {kind === 'genres' && (
              <Textarea
                mt="sm"
                label="Mô tả"
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
              />
            )}
          </>
        ) : selected?.action === 'merge' ? (
          <>
            <p>
              Chuyển toàn bộ truyện từ <strong>{selected.item.name}</strong> sang danh mục đích, rồi
              xóa danh mục nguồn.
            </p>
            <Select
              label="Gộp vào"
              searchable
              required
              data={items
                .filter((i) => i.id !== selected.item.id)
                .map((i) => ({ value: i.id, label: i.name }))}
              value={targetId}
              onChange={(v) => setTargetId(v || '')}
            />
          </>
        ) : (
          <p>
            Xóa <strong>{selected?.item.name}</strong>. Chỉ xóa được danh mục chưa có truyện sử
            dụng.
          </p>
        )}
      </AdminConfirm>
    </>
  );
}
