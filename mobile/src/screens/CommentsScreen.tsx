import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import { createComment, listComments } from '../api/reader-api';
import type { ReaderComment } from '../api/types';
import { Field } from '../components/Form';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PrimaryButton, Screen, Section, useScreenStyles } from '../components/Screen';

const COMMENT_STATUS_LABELS: Record<string, string> = {
  APPROVED: 'Đã duyệt',
  PENDING_MODERATION: 'Chờ duyệt',
  REJECTED: 'Từ chối',
  DELETED: 'Đã ẩn'
};

export function CommentsScreen({
  chapterId,
  authenticated,
  onLoginRequired
}: {
  chapterId: string;
  authenticated: boolean;
  onLoginRequired: () => void;
}) {
  const themed = useScreenStyles();
  const [comments, setComments] = useState<ReaderComment[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setComments(await listComments(chapterId));
    } catch (caughtError) {
      setError(getApiErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [chapterId]);

  const submit = async () => {
    if (!authenticated) {
      onLoginRequired();
      return;
    }

    try {
      const result = await createComment(chapterId, content.trim());
      setContent('');
      setNotice(
        result.status === 'APPROVED'
          ? 'Đã đăng bình luận.'
          : 'Đã gửi bình luận, đang chờ kiểm duyệt.'
      );
      await load();
    } catch (caughtError) {
      setNotice(getApiErrorMessage(caughtError));
    }
  };

  if (loading) return <LoadingState label="Đang tải bình luận..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <Screen>
      <Section
        title="Bình luận chương"
        subtitle="Bình luận đã duyệt hiển thị công khai cho độc giả."
      >
        <Card>
          <Field
            label="Viết bình luận"
            value={content}
            onChangeText={setContent}
            placeholder="Chia sẻ cảm nhận của bạn về chương này..."
            multiline
          />
          {notice ? (
            <Text accessibilityLiveRegion="polite" style={themed.notice}>
              {notice}
            </Text>
          ) : null}
          <PrimaryButton
            label="Gửi bình luận"
            onPress={submit}
            disabled={!content.trim()}
          />
        </Card>
      </Section>

      <Section title={`Bình luận độc giả (${comments.length})`}>
        {!comments.length ? (
          <EmptyState label="Chưa có bình luận nào được duyệt." />
        ) : null}
        {comments.map((comment) => (
          <Card key={comment.commentId}>
            <Badge
              label={COMMENT_STATUS_LABELS[comment.status] ?? comment.status}
              tone={
                comment.status === 'APPROVED'
                  ? 'success'
                  : comment.status === 'PENDING_MODERATION'
                  ? 'warning'
                  : comment.status === 'REJECTED'
                  ? 'danger'
                  : 'default'
              }
            />
            <Text style={themed.body}>{comment.content}</Text>
          </Card>
        ))}
      </Section>
    </Screen>
  );
}
