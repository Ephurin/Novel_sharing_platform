import { AvatarBadge } from '../components/BookCover';
import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import type { CurrentUser, ReaderComment } from '../api/types';
import { changeFollow, getPerson, getThread, listFeedback, listPeople, postReply, type Person } from '../api/social-api';
import { apiClient, getApiErrorMessage } from '../api/api-client';
import { Card, ErrorState, GhostButton, LoadingState, PrimaryButton, Screen, Section, useScreenStyles } from '../components/Screen';
import { Field } from '../components/Form';
import { Pages, SocialComposer } from '../components/Social';
import { useFocusedResource } from '../state/useFocusedResource';

function PersonCard({ person, user, onProfile, onChanged }: { person: Person; user: CurrentUser | null; onProfile: (id: string) => void; onChanged: () => void }) {
  const styles = useScreenStyles();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <Card><GhostButton label={`${person.displayName || person.username} (@${person.username})`} onPress={() => onProfile(person.userId)} />
    {person.mutual && <Text style={styles.muted}>Bạn bè</Text>}{person.bio && <Text style={styles.muted}>{person.bio}</Text>}
    {person.followersCount != null && <Text style={styles.muted}>{person.followersCount} người theo dõi · {person.followingCount} đang theo dõi</Text>}
    {user && user.userId !== person.userId && <PrimaryButton label={person.following ? 'Bỏ theo dõi' : person.followedBy ? 'Theo dõi lại' : 'Theo dõi'} disabled={busy || user.status !== 'ACTIVE'} onPress={async () => {
      setBusy(true); setError(''); try { await changeFollow(person.userId, person.following); onChanged(); } catch (e) { setError(getApiErrorMessage(e)); } finally { setBusy(false); }
    }} />}{error ? <Text style={styles.error}>{error}</Text> : null}</Card>;
}
export function ConnectionsScreen({ user, onProfile }: { user: CurrentUser; onProfile: (id: string) => void }) {
  const styles = useScreenStyles();
  const [type, setType] = useState('SEARCH'); const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const data = useFocusedResource(`${user.userId}:${type}:${q}:${page}`, () => listPeople(type, q, page));
  return <Screen><Section title="Bạn bè"><Field label="Tìm độc giả" value={q} onChangeText={value => { setQ(value); setPage(1); }} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[['SEARCH', 'Tìm kiếm'], ['MUTUAL', 'Bạn bè'], ['FOLLOWING', 'Đang theo dõi'], ['FOLLOWERS', 'Người theo dõi']].map(([value, label]) => <GhostButton key={value} label={(value === type ? '✓ ' : '') + label} onPress={() => { setType(value); setPage(1); }} />)}</View>
    {data.loading && <LoadingState />}{data.error && <ErrorState message={data.error} onRetry={data.reload} />}{data.data?.items.map(person => <PersonCard key={person.userId} person={person} user={user} onProfile={onProfile} onChanged={data.reload} />)}
    {data.data?.items.length === 0 && <Text style={styles.muted}>Chưa có độc giả trong danh sách.</Text>}{data.data && <Pages page={page} pages={data.data.pages} onChange={setPage} />}</Section></Screen>;
}
export function ReaderProfileScreen({ userId, user, onProfile }: { userId: string; user: CurrentUser | null; onProfile: (id: string) => void }) {
  const data = useFocusedResource(`${user?.userId}:${userId}`, () => getPerson(userId));
  return <Screen><Section title="Hồ sơ độc giả">{data.loading && <LoadingState />}{data.error && <ErrorState message={data.error} onRetry={data.reload} />}{data.data && <PersonCard person={data.data} user={user} onProfile={onProfile} onChanged={data.reload} />}</Section></Screen>;
}
export function CommentCard({ comment, onProfile, onOpen, focused = false, spoiler = false }: { comment: ReaderComment; onProfile: (id: string) => void; onOpen?: () => void; focused?: boolean; spoiler?: boolean }) {
  const styles = useScreenStyles();
  const [revealed, setRevealed] = useState(false); const hidden = (comment.isSpoiler || spoiler) && !revealed;
  return <Card><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><AvatarBadge uri={comment.avatarUrl} name={comment.displayName} size="sm" /><GhostButton label={comment.displayName || 'Độc giả'} onPress={() => onProfile(comment.userId)} /></View>
    {focused && <Text accessibilityRole="header" style={styles.ghostButtonText}>Bình luận được chọn</Text>}
    {comment.status !== 'APPROVED' && <Text style={styles.muted}>{comment.status === 'REJECTED' ? 'Không được duyệt' : 'Chờ duyệt'}</Text>}
    {comment.anchor && !comment.parentCommentId && <Text style={styles.muted}>{comment.anchor.detached ? 'Đoạn gốc đã thay đổi: ' : 'Đoạn: '}{comment.anchor.quote}</Text>}
    {(comment.isSpoiler || spoiler) && <GhostButton label={hidden ? 'Hiện spoiler' : 'Ẩn spoiler'} onPress={() => setRevealed(!revealed)} />}
    {!hidden && <><Text selectable style={styles.muted}>{comment.content}</Text>{comment.audience === 'PUBLIC' && comment.imageUrl && <Image accessibilityLabel="Ảnh bình luận" source={{ uri: comment.imageUrl }} style={{ width: '100%', height: 180, resizeMode: 'contain' }} />}</>}
    {onOpen && <GhostButton label={`Mở trao đổi · ${comment.repliesCount ?? 0} trả lời`} onPress={onOpen} />}</Card>;
}
export function ThreadScreen({ commentId, user, onProfile, onLoginRequired }: { commentId: string; user: CurrentUser | null; onProfile: (id: string) => void; onLoginRequired: () => void }) {
  const styles = useScreenStyles();
  const [page, setPage] = useState(1); const [rootId, setRootId] = useState<string>(); const [replyTo, setReplyTo] = useState<Pick<ReaderComment, 'commentId' | 'displayName'>>(); const [notice, setNotice] = useState('');
  const [focusY, setFocusY] = useState<number>();
  const thread = useFocusedResource(`${user?.userId}:${commentId}:${rootId}:${page}`, () => getThread(rootId ?? commentId, page));
  if (thread.loading) return <LoadingState label="Đang kiểm tra quyền xem…" />;
  if (thread.error) return <Screen><ErrorState message={thread.error} onRetry={thread.reload} /></Screen>;
  if (!thread.data) return null;
  const { root, replies } = thread.data; const privateMode = root.audience !== 'PUBLIC';
  return <Screen focusY={focusY}><Section title={privateMode ? 'Trao đổi riêng' : 'Bình luận công khai'}>
    {[root, ...replies].map(comment => <View key={comment.commentId} onLayout={event => { if (comment.commentId === commentId) setFocusY(event.nativeEvent.layout.y + 18); }} style={{ gap: 8 }}><CommentCard comment={comment} onProfile={onProfile} focused={comment.commentId === commentId} spoiler={root.isSpoiler} />
      {root.canReply && <GhostButton label={`Trả lời ${comment.displayName}`} onPress={() => { if (user) setReplyTo({ commentId: comment.commentId, displayName: comment.displayName }); else onLoginRequired(); }} />}
      {comment.canDelete && <GhostButton label="Xóa bình luận" onPress={async () => { try { await apiClient.delete(`/comments/${comment.commentId}`); thread.reload(); } catch (e) { setNotice(getApiErrorMessage(e)); thread.reload(); } }} />}
    </View>)}
    <Pages page={thread.data.page} pages={thread.data.pages} onChange={next => { setFocusY(undefined); setRootId(root.commentId); setPage(next); setReplyTo(undefined); }} />
    {replyTo && user && <SocialComposer key={replyTo.commentId} privateMode={privateMode} label={`Trả lời ${replyTo.displayName}`} onCancel={() => setReplyTo(undefined)} onSubmit={async input => { await postReply(replyTo.commentId, input); setReplyTo(undefined); setRootId(root.commentId); setPage(Math.max(1, Math.ceil((root.repliesCount + 1) / 5))); thread.reload(); }} />}
    {notice ? <Text style={styles.error}>{notice}</Text> : null}
  </Section></Screen>;
}
export function FeedbackScreen({ user, box, onThread, onProfile }: { user: CurrentUser; box: 'sent' | 'received'; onThread: (id: string) => void; onProfile: (id: string) => void }) {
  const styles = useScreenStyles();
  const [page, setPage] = useState(1); const result = useFocusedResource(`${user.userId}:${box}:${page}`, () => listFeedback(box, page));
  return <Screen><Section title={box === 'sent' ? 'Góp ý đã gửi' : 'Góp ý gửi tôi'}>{result.loading && <LoadingState />}{result.error && <ErrorState message={result.error} onRetry={result.reload} />}
    {result.data?.items.map(comment => <CommentCard key={comment.commentId} comment={comment} onProfile={onProfile} onOpen={() => onThread(comment.commentId)} />)}{result.data?.items.length === 0 && <Text style={styles.muted}>Chưa có góp ý.</Text>}{result.data && <Pages page={page} pages={result.data.pages} onChange={setPage} />}</Section></Screen>;
}
