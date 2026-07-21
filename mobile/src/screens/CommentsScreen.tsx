import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { createComment, listComments } from '../api/reader-api';
import { getApiErrorMessage } from '../api/api-client';
import type { ReaderComment } from '../api/types';
import { Field } from '../components/Form';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PrimaryButton, Screen, Section, styles } from '../components/Screen';

export function CommentsScreen({
  chapterId,
  authenticated,
  onLoginRequired
}: {
  chapterId: string;
  authenticated: boolean;
  onLoginRequired: () => void;
}) {
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
      const result = await createComment(chapterId, content);
      setContent('');
      setNotice(`Comment submitted: ${result.status}`);
      await load();
    } catch (caughtError) {
      setNotice(getApiErrorMessage(caughtError));
    }
  };

  if (loading) return <LoadingState label="Loading comments..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <Screen>
      <Section title="Comments" subtitle="Approved comments are visible publicly. Flagged comments may wait for moderation.">
        <Field label="Add comment" value={content} onChangeText={setContent} multiline />
        {notice ? <Text style={styles.ghostButtonText}>{notice}</Text> : null}
        <PrimaryButton label="Submit comment" onPress={submit} disabled={!content.trim()} />
      </Section>

      <Section title="Approved Comments">
        {!comments.length ? <EmptyState label="No approved comments yet." /> : null}
        {comments.map((comment) => (
          <Card key={comment.commentId}>
            <Badge label={comment.status} />
            <Text style={styles.muted}>{comment.content}</Text>
          </Card>
        ))}
      </Section>
    </Screen>
  );
}
