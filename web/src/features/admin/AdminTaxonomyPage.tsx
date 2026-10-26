import { useState } from 'react';
import { Alert, Button, TextInput } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createGenre, createTag, getTaxonomy } from './admin-api';
import { AdminError, AdminHeader, AdminPanel, number } from './AdminShared';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/PageStates';

export function AdminTaxonomyPage() {
  const cache = useQueryClient();
  const [genre, setGenre] = useState('');
  const [tag, setTag] = useState('');
  const [success, setSuccess] = useState('');
  const query = useQuery({
    queryKey: ['admin-taxonomy'],
    queryFn: getTaxonomy
  });
  const mutation = useMutation({
    mutationFn: async ({ kind, name }: { kind: 'genre' | 'tag'; name: string }) => {
      const normalized = name
        .trim()
        .replace(kind === 'tag' ? /^#+/ : /^$/, '')
        .trim();
      if (!normalized) throw new Error('Vui lòng nhập tên.');
      const existing = kind === 'genre' ? query.data?.genres : query.data?.tags;
      if (
        existing?.some(
          (item) => item.name.toLocaleLowerCase('vi') === normalized.toLocaleLowerCase('vi')
        )
      )
        throw new Error('Tên này đã tồn tại.');
      return kind === 'genre' ? createGenre(normalized) : createTag(normalized);
    },
    onSuccess: async (_, variables) => {
      if (variables.kind === 'genre') setGenre('');
      else setTag('');
      setSuccess(variables.kind === 'genre' ? 'Đã thêm thể loại.' : 'Đã thêm tag.');
      await cache.invalidateQueries({ queryKey: ['admin-taxonomy'] });
    }
  });
  return (
    <>
      <AdminHeader
        title="Thể loại & Tag"
        description="Quản lý phân loại nội dung trên StoryCraft."
        refresh={() => void query.refetch()}
      />
      {success && (
        <Alert color="green" mb="md" withCloseButton onClose={() => setSuccess('')} role="status">
          {success}
        </Alert>
      )}
      <AdminError error={mutation.error} />
      {query.isLoading && <LoadingState label="Đang tải danh mục..." />}
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && (
        <div className="admin-grid-two">
          <AdminPanel>
            <div className="admin-page-header">
              <h2>Thể loại</h2>
              <span className="admin-muted">{number(query.data.genres.length)} thể loại</span>
            </div>
            <form
              className="admin-toolbar"
              onSubmit={(e) => {
                e.preventDefault();
                setSuccess('');
                mutation.mutate({ kind: 'genre', name: genre });
              }}
            >
              <TextInput
                className="admin-search"
                aria-label="Tên thể loại mới"
                placeholder="Nhập thể loại mới..."
                value={genre}
                maxLength={100}
                onChange={(e) => setGenre(e.currentTarget.value)}
              />
              <Button
                type="submit"
                loading={mutation.isPending && mutation.variables?.kind === 'genre'}
                disabled={!genre.trim() || mutation.isPending}
              >
                Thêm thể loại
              </Button>
            </form>
            {!query.data.genres.length ? (
              <EmptyState description="Chưa có thể loại." />
            ) : (
              <div className="admin-taxonomy-list">
                {query.data.genres.map((item) => (
                  <div key={item.genreId}>{item.name}</div>
                ))}
              </div>
            )}
          </AdminPanel>
          <AdminPanel>
            <div className="admin-page-header">
              <h2>Tag</h2>
              <span className="admin-muted">{number(query.data.tags.length)} tag</span>
            </div>
            <form
              className="admin-toolbar"
              onSubmit={(e) => {
                e.preventDefault();
                setSuccess('');
                mutation.mutate({ kind: 'tag', name: tag });
              }}
            >
              <TextInput
                className="admin-search"
                aria-label="Tên tag mới"
                placeholder="Nhập tag mới..."
                value={tag}
                maxLength={100}
                onChange={(e) => setTag(e.currentTarget.value)}
              />
              <Button
                type="submit"
                loading={mutation.isPending && mutation.variables?.kind === 'tag'}
                disabled={!tag.trim() || mutation.isPending}
              >
                Thêm tag
              </Button>
            </form>
            {!query.data.tags.length ? (
              <EmptyState description="Chưa có tag." />
            ) : (
              <div className="admin-tags">
                {query.data.tags.map((item) => (
                  <span key={item.tagId}># {item.name}</span>
                ))}
              </div>
            )}
          </AdminPanel>
        </div>
      )}
    </>
  );
}
