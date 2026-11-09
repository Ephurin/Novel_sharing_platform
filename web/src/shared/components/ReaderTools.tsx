import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Button } from '@mantine/core';
import { Link } from 'react-router-dom';
import { Popover } from '@animate-ui/react/primitives/radix-ui/popover';
import type { ReaderChapter } from '../../features/reader/reader-api';
import { AnimatedModal } from './AnimatedModal';
import './interaction-widgets.css';

export function ChapterToc({ chapters, currentId, publicMode = false }: { chapters: ReaderChapter[]; currentId: string; publicMode?: boolean }) {
  const [opened, setOpened] = useState(false);
  const list = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!opened) return;
    const frame = requestAnimationFrame(() => list.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(frame);
  }, [opened, currentId]);
  return <>
    <Button variant="light" onClick={() => setOpened(true)}>Mục lục</Button>
    <AnimatedModal side="right" opened={opened} onClose={() => setOpened(false)} title="Mục lục chương">
      <nav ref={list} className="sc-chapter-toc" aria-label="Mục lục chương">
        {chapters.map(chapter => <Link key={chapter.chapterId} to={`${publicMode ? '/public' : '/reader'}/chapters/${chapter.chapterId}`}
          aria-current={chapter.chapterId === currentId ? 'page' : undefined} onClick={() => setOpened(false)}>
          <span>{chapter.chapterNumber}. {chapter.title}</span>{chapter.isVip && <span className="text-meta">VIP</span>}
        </Link>)}
        {!chapters.length && <p>Đang tải danh sách chương…</p>}
      </nav>
    </AnimatedModal>
  </>;
}

export function ReadingSettings({ children }: PropsWithChildren) {
  const [opened, setOpened] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!opened) return;
    const frame = requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [opened]);
  return <Popover.Root open={opened} onOpenChange={setOpened}>
    <Popover.Trigger asChild><Button ref={trigger} variant="light">Tùy chỉnh đọc</Button></Popover.Trigger>
    <Popover.Portal forceMount>
      <Popover.Content ref={panel} forceMount className="sc-reading-settings" align="end" sideOffset={8} collisionPadding={12} aria-label="Tùy chỉnh đọc"
        onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}
        onEscapeKeyDown={() => trigger.current?.focus({ preventScroll: true })}>
        {children}
        <Popover.Close asChild><Button variant="subtle" size="compact-sm" mt="sm" onClick={() => trigger.current?.focus({ preventScroll: true })}>Đóng</Button></Popover.Close>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
