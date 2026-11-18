import { useState } from 'react';
import { Text, View } from 'react-native';
import type { CurrentUser } from '../api/types';
import { listSocialComments, postComment, type AnchorInput, type Audience, type CommentTarget, type Person } from '../api/social-api';
import { ErrorState, GhostButton, LoadingState, Screen, Section, useScreenStyles } from '../components/Screen';
import { Pages, PeoplePicker, SocialComposer } from '../components/Social';
import { CommentCard } from './SocialScreens';
import { useFocusedResource } from '../state/useFocusedResource';

export function CommentsScreen({ target, anchor, user, onLoginRequired, onThread, onProfile }: { target: CommentTarget; anchor?: AnchorInput; user: CurrentUser | null; onLoginRequired: () => void; onThread: (id: string) => void; onProfile: (id: string) => void }) {
  const styles = useScreenStyles();
  const [channel, setChannel] = useState<Audience>(anchor && user ? 'FRIENDS_ALL' : 'PUBLIC'); const [page, setPage] = useState(1); const [recipients, setRecipients] = useState<Person[]>([]);
  const comments = useFocusedResource(`${user?.userId}:${target.kind}:${target.id}:${channel}:${page}`, () => listSocialComments(target, channel, page));
  const scopes: [Audience, string][] = [['PUBLIC', 'Công khai'], ['AUTHOR_PRIVATE', 'Chỉ tác giả'], ['FRIENDS_ALL', 'Tất cả bạn bè hiện tại'], ['FRIENDS_SELECTED', 'Chọn bạn bè']];
  return <Screen><Section title="Bình luận"><View style={{ gap: 8 }}>{scopes.filter(([value]) => value === 'PUBLIC' || (user && (value === 'AUTHOR_PRIVATE' || target.kind === 'chapter'))).map(([value, label]) => <GhostButton key={value} label={(channel === value ? '✓ ' : '') + label} onPress={() => { setChannel(value); setPage(1); }} />)}</View>
    {channel === 'FRIENDS_SELECTED' && <><PeoplePicker selected={recipients.map(p => p.userId)} onSelect={person => setRecipients(current => current.some(p => p.userId === person.userId) ? current.filter(p => p.userId !== person.userId) : [...current, person])} />{recipients.map(person => <GhostButton key={person.userId} label={`Bỏ ${person.displayName} (@${person.username})`} onPress={() => setRecipients(recipients.filter(p => p.userId !== person.userId))} />)}</>}
    {!user ? <GhostButton label="Đăng nhập để bình luận" onPress={onLoginRequired} /> : user.status !== 'ACTIVE' ? <Text style={styles.error}>Tài khoản chưa được phép bình luận.</Text> : channel.startsWith('FRIENDS') && !anchor ? <Text style={styles.muted}>Nhấn giữ một đoạn trong chương để viết trao đổi với bạn bè.</Text> : <SocialComposer key={channel} privateMode={channel !== 'PUBLIC'} onSubmit={async input => {
      await postComment(target, { ...input, audience: channel, ...(channel !== 'PUBLIC' && anchor ? { anchor } : {}), ...(channel === 'FRIENDS_SELECTED' ? { recipientUserIds: recipients.map(p => p.userId) } : {}) }); setPage(1); comments.reload();
    }} />}
    {comments.loading && <LoadingState />}{comments.error && <ErrorState message={comments.error} onRetry={comments.reload} />}{comments.data?.items.map(comment => <CommentCard key={comment.commentId} comment={comment} onProfile={onProfile} onOpen={() => onThread(comment.commentId)} />)}
    {comments.data?.items.length === 0 && <Text style={styles.muted}>Chưa có bình luận trong phạm vi này.</Text>}{comments.data && <Pages page={page} pages={comments.data.pages} onChange={setPage} />}</Section></Screen>;
}
