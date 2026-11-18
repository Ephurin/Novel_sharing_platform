import { useState } from 'react';
import { Text, View } from 'react-native';
import { Field } from './Form';
import { GhostButton, PrimaryButton, styles } from './Screen';
import { listPeople, type CommentInput, type Person } from '../api/social-api';
import { useFocusedResource } from '../state/useFocusedResource';
import { getApiErrorMessage } from '../api/api-client';

export function Pages({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{page > 1 && <GhostButton label="Trang trước" onPress={() => onChange(page - 1)} />}<Text style={styles.muted}>{page}/{pages}</Text>{page < pages && <GhostButton label="Trang sau" onPress={() => onChange(page + 1)} />}</View>;
}
export function PeoplePicker({ onSelect, selected = [] }: { onSelect: (person: Person) => void; selected?: string[] }) {
  const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const people = useFocusedResource(`mutual:${q}:${page}`, () => listPeople('MUTUAL', q, page));
  return <View style={{ gap: 8 }}><Field label="Tìm bạn bè" value={q} onChangeText={value => { setQ(value); setPage(1); }} />
    {people.loading && <Text style={styles.muted}>Đang tải bạn bè…</Text>}{people.error && <GhostButton label={people.error + ' · Thử lại'} onPress={people.reload} />}
    {people.data?.items.map(person => <GhostButton key={person.userId} label={`${selected.includes(person.userId) ? '✓ ' : ''}${person.displayName} (@${person.username})`} onPress={() => onSelect(person)} />)}
    {people.data?.items.length === 0 && <Text style={styles.muted}>Chưa có bạn bè phù hợp.</Text>}{people.data && people.data.pages > 1 && <Pages page={page} pages={people.data.pages} onChange={setPage} />}</View>;
}
export function SocialComposer({ privateMode = false, onSubmit, label = 'Nội dung', onCancel }: { privateMode?: boolean; onSubmit: (input: CommentInput) => Promise<unknown>; label?: string; onCancel?: () => void }) {
  const [draft, setDraft] = useState<CommentInput>({ content: '', mentions: [] }); const [tagging, setTagging] = useState(false);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  return <View style={{ gap: 10 }}><Field label={label} value={draft.content} multiline onChangeText={content => setDraft(previous => ({ ...previous, content: content.slice(0, 2000), mentions: previous.mentions?.filter(m => content.slice(0, m.end) === previous.content.slice(0, m.end)) }))} />
    {!privateMode && <GhostButton label="@ Nhắc đến bạn bè" onPress={() => setTagging(!tagging)} />}
    {tagging && !privateMode && <PeoplePicker onSelect={person => {
      const prefix = draft.content ? draft.content.trimEnd() + ' ' : ''; const token = '@' + person.username;
      if (prefix.length + token.length > 2000) return;
      setDraft({ ...draft, content: prefix + token + ' ', mentions: [...(draft.mentions ?? []), { userId: person.userId, start: prefix.length, end: prefix.length + token.length }] }); setTagging(false);
    }} />}
    <GhostButton label={draft.isSpoiler ? '✓ Có spoiler' : 'Đánh dấu spoiler'} onPress={() => setDraft({ ...draft, isSpoiler: !draft.isSpoiler })} />
    <PrimaryButton label={busy ? 'Đang gửi…' : 'Gửi'} disabled={busy || !draft.content.trim()} onPress={async () => {
      setBusy(true); setNotice(''); const offset = draft.content.length - draft.content.trimStart().length;
      try { await onSubmit({ content: draft.content.trim(), isSpoiler: draft.isSpoiler, ...(!privateMode ? { mentions: draft.mentions?.map(m => ({ ...m, start: m.start - offset, end: m.end - offset })) } : {}) }); setDraft({ content: '', mentions: [] }); setNotice('Đã gửi. Nội dung có thể đang chờ duyệt.'); }
      catch (error) { setNotice(getApiErrorMessage(error)); } finally { setBusy(false); }
    }} />{onCancel && <GhostButton label="Hủy" onPress={onCancel} />}{notice ? <Text accessibilityLiveRegion="polite" style={styles.muted}>{notice}</Text> : null}</View>;
}
