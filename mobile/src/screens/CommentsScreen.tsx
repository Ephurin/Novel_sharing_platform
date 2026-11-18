import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { getApiErrorMessage } from '../api/api-client';
import { createComment, listComments } from '../api/reader-api';
import type { ReaderComment } from '../api/types';
import { AvatarBadge } from '../components/BookCover';
import { Field } from '../components/Form';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  Screen,
  Section,
  useScreenStyles
} from '../components/Screen';
import { formatRelativeOrDate } from '../utils/format';

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
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      setComments(await listComments(chapterId));
    } catch (caughtError) {
      setError(getApiErrorMessage(caughtError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(false);
  }, [chapterId]);

  const submit = async () => {
    if (!authenticated) {
      onLoginRequired();
      return;
    }
    const trimmed = content.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setNotice(null);
    setSubmitError(null);
    try {
      const result = await createComment(chapterId, trimmed);
      setContent('');
      setNotice(
        result.status === 'APPROVED'
          ? 'Đã đăng bình luận.'
          : 'Đã gửi bình luận, đang chờ kiểm duyệt.'
      );
      setComments(await listComments(chapterId));
    } catch (caughtError) {
      setSubmitError(getApiErrorMessage(caughtError));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState label="Đang tải bình luận..." />;
  if (error) return <ErrorState message={error} onRetry={() => void load(false)} />;

  return (
    <Screen refreshing={refreshing} onRefresh={() => void load(true)}>
      <Card>
        <Field
          label="Viết bình luận"
          value={content}
          onChangeText={setContent}
          placeholder="Chia sẻ cảm nhận của bạn về chương này..."
          multiline
          editable={!submitting}
        />
        {notice ? (
          <Text accessibilityLiveRegion="polite" style={themed.notice}>
            {notice}
          </Text>
        ) : null}
        {submitError ? (
          <Text accessibilityLiveRegion="polite" style={themed.error}>
            {submitError}
          </Text>
        ) : null}
        <PrimaryButton
          label={submitting ? 'Đang gửi...' : 'Gửi bình luận'}
          accessibilityLabel="Gửi bình luận"
          loading={submitting}
          onPress={() => void submit()}
          disabled={!content.trim() || submitting}
        />
      </Card>

      <Section title={`Bình luận độc giả (${comments.length})`}>
        {!comments.length ? (
          <EmptyState label="Chưa có bình luận nào được duyệt." />
        ) : null}
        {comments.map((comment) => {
          const authorLabel =
            comment.displayName?.trim() ||
            comment.username?.trim() ||
            'Độc giả StoryCraft';
          const formattedDate = formatRelativeOrDate(comment.createdAt);

          return (
            <Card key={comment.commentId}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <AvatarBadge size="sm" uri={comment.avatarUrl} name={authorLabel} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <Text style={themed.cardTitle} numberOfLines={1}>
                        {authorLabel}
                      </Text>
                      {comment.isAuthor ? <Badge label="Tác giả" tone="primary" /> : null}
                    </View>
                    {formattedDate ? <Text style={themed.muted}>{formattedDate}</Text> : null}
                  </View>
                </View>

                {comment.status && comment.status !== 'APPROVED' ? (
                  <Badge
                    label={COMMENT_STATUS_LABELS[comment.status] ?? comment.status}
                    tone={
                      comment.status === 'PENDING_MODERATION'
                        ? 'warning'
                        : comment.status === 'REJECTED'
                        ? 'danger'
                        : 'default'
                    }
                  />
                ) : null}
              </View>
              <Text style={themed.body}>{comment.content}</Text>
            </Card>
          );
        })}
      </Section>
    </Screen>
  );
}
