/**
 * Role marker shown beside a display name on the community board.
 *
 * Only the two roles that carry weight in a writing community are surfaced:
 * authors (their "Góc tác giả" threads should be traceable to a writer account)
 * and moderators. Readers get no badge — a badge on everyone is no signal at all.
 * The `role` field is optional in the API, so an unknown viewer/author simply
 * renders nothing.
 */
export function RoleBadge({ role }: { role?: string | null }) {
  if (role !== 'AUTHOR' && role !== 'ADMIN') return null;
  const admin = role === 'ADMIN';
  return (
    <span className="forum-badge forum-role" data-tone={admin ? 'admin' : 'author'}>
      {admin ? 'QTV' : 'Tác giả'}
      {/* "QTV" is an abbreviation; assistive tech gets the full word. */}
      {admin ? <span className="forum-visually-hidden">Quản trị viên</span> : null}
    </span>
  );
}
