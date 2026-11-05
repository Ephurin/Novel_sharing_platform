import { Popover } from '@animate-ui/react/primitives/radix-ui/popover';
import type { AuthorNote } from '../lib/author-notes';
import './author-notes.css';

export function AuthorNoteReference({ note }: { note: AuthorNote }) {
  return <Popover.Root>
    <Popover.Trigger asChild>
      <button type="button" className="sc-author-note-reference" aria-label={`Chú thích ${note.number} của tác giả`}><sup>[{note.number}]</sup></button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content className="sc-author-note-popover" side="bottom" sideOffset={8} collisionPadding={16} aria-label={`Chú thích ${note.number} của tác giả`}>
        <p>{note.body}</p>
        <Popover.Close asChild><button type="button" className="sc-author-note-close" aria-label="Đóng chú thích">×</button></Popover.Close>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
