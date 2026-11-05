import { motion, useReducedMotion } from 'motion/react';
import { useToast } from '../../shared/components/ToastProvider';
import { SaveStatus } from '../../shared/components/SaveFeedback';
import { AnimatedMenu as Menu } from '../../shared/components/AnimatedMenu';
import { StudioWorkbench } from './StudioWorkbench';
import { StudioNumberField } from './StudioNumberField';
import { Breadcrumbs } from '../../shared/components/Breadcrumbs';
import { authorHomeCrumb, navigationLabels } from '../../shared/components/navigation';
import { AnimatedTooltip } from '../../shared/components/AnimatedTooltip';
import { useStudioHistory } from './useStudioHistory';
import { revealStudioSelection } from './studio-tools';
import { RichManuscriptEditor } from './RichManuscriptEditor';
import { StudioContextMenu } from './StudioContextMenu';
import { StudioSelectionTools } from './StudioSelectionTools';
import { StudioNovelSearch, type ChapterSearchHit } from './StudioNovelSearch';
import { locateAnchor } from './studio-annotations';
import { authorNoteDefinitions } from '../../shared/lib/author-notes';
import { useStudioPosition } from './useStudioPosition';
import { PublishChecklist, StoryReferenceLookup, TextComparison } from './StudioReviewTools';
import { AnimatedModal } from '../../shared/components/AnimatedModal';
import { CopyTextButton, FeedbackReveal } from '../../shared/components/ActionFeedback';
import { ChapterSchedule } from '../author-projects/ChapterSchedule';
import { RevisionHistory, snapshotDraft } from './RevisionHistory';
import { useAuthStore } from '../auth/useAuthStore';
import { useDraftPersistence } from './useDraftPersistence';
import { resolveAuthorContext, writeAuthorContext } from './author-context';
import { Alert, Button, Group, Text } from '@mantine/core';
import { ThemeControl } from '../../shared/components/ThemeControl';
import { AuthorDialog } from '../../shared/components/AuthorTheme';
import { AuthorMemoryPanel } from '../ai-copilot/AuthorMemoryPanel';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  createChapter,
  getChapter,
  getNovel,
  listChapters,
  listMyNovels,
  submitChapterPublish,
  updateChapter
} from '../novels/novel-api';
import type { Chapter, Novel } from '../novels/novel-types';
import {
  listCharacterRelationships,
  listCharacters,
  listPlotSummaries,
  listTimelineEvents
} from '../story-context/story-context-api';
import type {
  CharacterProfile,
  CharacterRelationship,
  PlotSummary,
  StoryTimelineEvent
} from '../story-context/story-context-types';
import {
  startWritingGeneration,
  getJobStatus,
  acceptDraftRevision,
  createChapterSnapshot,
  fetchContextPreview,
  listChapterRevisions,
  utf16OffsetToCodePoint,
  codePointToUtf16Offset,
  type WritingGenerationJob
} from '../ai-copilot/ai-copilot-api';
import { getApiErrorMessage } from '../../shared/api/api-client';

export type FontOption = 'merriweather' | 'lora' | 'literata' | 'playfair' | 'roboto-slab' | 'vietnam' | 'jakarta';
export type TextAlignment = 'justify' | 'left' | 'center' | 'right';

export interface FontConfig {
  id: FontOption;
  name: string;
  tagline: string;
  category: 'Serif (Có chân)' | 'Sans-serif (Không chân)';
  fontFamily: string;
}

export const AVAILABLE_FONTS: FontConfig[] = [
  {
    id: 'merriweather',
    name: 'Merriweather',
    tagline: 'Kinh điển • Chuẩn mực văn chương sách in',
    category: 'Serif (Có chân)',
    fontFamily: "'Merriweather', Georgia, serif"
  },
  {
    id: 'lora',
    name: 'Lora',
    tagline: 'Văn học • Dòng chảy câu từ êm dịu, tao nhã',
    category: 'Serif (Có chân)',
    fontFamily: "'Lora', Georgia, serif"
  },
  {
    id: 'literata',
    name: 'Literata',
    tagline: 'Sách chuyên dụng • Tối ưu cho tiểu thuyết dài chương',
    category: 'Serif (Có chân)',
    fontFamily: "'Literata', Georgia, serif"
  },
  {
    id: 'playfair',
    name: 'Playfair Display',
    tagline: 'Quý phái • Nghệ thuật, kịch tính, lôi cuốn',
    category: 'Serif (Có chân)',
    fontFamily: "'Playfair Display', Georgia, serif"
  },
  {
    id: 'roboto-slab',
    name: 'Roboto Slab',
    tagline: 'Hiện đại • Chân phương, rõ ràng, khỏe khoắn',
    category: 'Serif (Có chân)',
    fontFamily: "'Roboto Slab', Georgia, serif"
  },
  {
    id: 'vietnam',
    name: 'Be Vietnam Pro',
    tagline: 'Không chân • Chuẩn ngữ âm & dấu tiếng Việt hiện đại',
    category: 'Sans-serif (Không chân)',
    fontFamily: "'Be Vietnam Pro', sans-serif"
  },
  {
    id: 'jakarta',
    name: 'Plus Jakarta Sans',
    tagline: 'Tối giản • Thanh lịch, không gian số tinh gọn',
    category: 'Sans-serif (Không chân)',
    fontFamily: "'Plus Jakarta Sans', sans-serif"
  }
];

function parseIdeCharacterDesc(rawDesc: string | null | undefined): { customTitle: string; cleanDescription: string } {
  if (!rawDesc) return { customTitle: '', cleanDescription: '' };
  const match = rawDesc.match(/^\[(?:Thân phận|Danh xưng|Vai trò cụ thể):\s*([^\]]+)\]\s*\n?/);
  if (match) {
    return {
      customTitle: match[1].trim(),
      cleanDescription: rawDesc.replace(match[0], '').trim()
    };
  }
  return { customTitle: '', cleanDescription: rawDesc };
}

type AccessMode = 'free' | 'vip';
type StoryBibleTab = 'characters' | 'relationships' | 'timeline' | 'summaries';
function readEditorSetting(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function writeEditorSetting(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Presentation preferences must never block writing. */ } }

export function AuthorWritingIde() {
  const user = useAuthStore(state => state.user);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // URL State
  const { novelId, chapterId } = resolveAuthorContext(user?.userId ?? '', searchParams);

  // Local Editor State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isVip, setIsVip] = useState(false);
  const [priceCoins, setPriceCoins] = useState(15);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<string>('');

  // UI Interactive Panels & Modals State
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 901px)').matches);
  const [rightPanel, setRightPanel] = useState<'ai' | 'notes' | null>(null);
  const aiDrawerOpen = rightPanel === 'ai';
  const reducePanelMotion = useReducedMotion();
  const openAiDrawer = () => {
    if (window.matchMedia('(max-width: 900px)').matches) setSidebarOpen(false);
    setRightPanel('ai');
  };
  const toggleAiDrawer = () => {
    if (aiDrawerOpen) setRightPanel(null); else openAiDrawer();
  };
  const changeNotesOpen = (open: boolean) => {
    if (open && window.matchMedia('(max-width: 900px)').matches) setSidebarOpen(false);
    setRightPanel(current => open ? 'notes' : current === 'notes' ? null : current);
  };
  const [storyBibleOpen, setStoryBibleOpen] = useState(false);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [chapterToDelete, setChapterToDelete] = useState<Chapter | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [formatToolbarVisible, setFormatToolbarVisible] = useState(true);
  const [visualEditor, setVisualEditor] = useState(() => readEditorSetting('storycraft-studio-editor-mode') !== 'source');
  const [exportOpen, setExportOpen] = useState(false);
  const [referenceQuery, setReferenceQuery] = useState<string | null>(null);
  const [novelSearchOpen, setNovelSearchOpen] = useState(false);
  const pendingSearchJump = useRef<{ scope: string; hit: ChapterSearchHit } | null>(null);
  const [aiComparisonOpen, setAiComparisonOpen] = useState(false);
  const aiBaseRef = useRef({ scope: '', content: '' });

  // Rich Typography & Manuscript Formatting State
  const [fontOption, setFontOption] = useState<FontOption>(() => {
    const value = readEditorSetting('ephurin_editor_font');
    return AVAILABLE_FONTS.some(font => font.id === value) ? value as FontOption : 'vietnam';
  });
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = Number(readEditorSetting('ephurin_editor_font_size'));
    return Number.isFinite(saved) && saved >= 13 && saved <= 28 ? saved : 17;
  });
  const [lineHeight, setLineHeight] = useState<number>(() => {
    const saved = Number(readEditorSetting('ephurin_editor_line_height'));
    return Number.isFinite(saved) && saved >= 1.2 && saved <= 3 ? saved : 2.15;
  });
  const [textAlign, setTextAlign] = useState<TextAlignment>(() => {
    const value = readEditorSetting('ephurin_editor_text_align');
    return ['justify','left','center','right'].includes(value ?? '') ? value as TextAlignment : 'justify';
  });
  const [paragraphIndent, setParagraphIndent] = useState<boolean>(() => {
    return readEditorSetting('ephurin_editor_indent') !== 'false';
  });



  const [storyBibleTab, setStoryBibleTab] = useState<StoryBibleTab>('characters');
  const [chapterSearch, setChapterSearch] = useState('');

  // AI Assistant State (Canonical P1 Closed-Loop)
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiScope, setAiScope] = useState<'selection' | 'full' | 'bible'>('selection');
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiSuggestionTone, setAiSuggestionTone] = useState<string>('Trầm lắng • Hoài niệm');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isAcceptingAi, setIsAcceptingAi] = useState(false);
  const [currentJob, setCurrentJob] = useState<WritingGenerationJob | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  // References for tracking changes
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const editorSelectionRef = useRef<{ scope: string; start: number; end: number } | null>(null);
  const acceptedCaretRef = useRef<{ scope: string; position: number; scrollTop: number } | null>(null);
  const rememberEditorSelection = () => {
    const editor = editorRef.current;
    if (editor) editorSelectionRef.current = {
      scope: activeDraftScope, start: editor.selectionStart, end: editor.selectionEnd
    };
  };

  // Toast Helper
  const { showToast } = useToast();

  // Queries
  const novelsQuery = useQuery({
    queryKey: ['author', 'my-novels', user?.userId],
    queryFn: () => listMyNovels({ status: 'ALL' })
  });

  const activeNovelId = novelId || novelsQuery.data?.[0]?.novelId || '';

  const novelQuery = useQuery({
    queryKey: ['author', 'novel', activeNovelId, user?.userId],
    queryFn: () => getNovel(activeNovelId),
    enabled: Boolean(activeNovelId)
  });

  const chaptersQuery = useQuery({
    queryKey: ['author', 'chapters', activeNovelId, user?.userId],
    queryFn: () => listChapters(activeNovelId),
    enabled: Boolean(activeNovelId)
  });

  const activeChapterId = useMemo(() => {
    if (!chaptersQuery.data) return '';
    if (chapterId) return chaptersQuery.data.some(ch => ch.chapterId === chapterId) ? chapterId : '';
    return chaptersQuery.data?.[0]?.chapterId || '';
  }, [chapterId, chaptersQuery.data]);

  const chapterQuery = useQuery({
    queryKey: ['author', 'chapter', activeChapterId, user?.userId],
    queryFn: () => getChapter(activeChapterId),
    refetchInterval: query => ['PENDING','PENDING_MODERATION'].includes(query.state.data?.publicationSchedule?.status ?? '') ? 10000 : false,
    enabled: Boolean(activeChapterId)
  });

  const persistence = useDraftPersistence(user?.userId ?? '', activeChapterId);
  const activeDraftScope = `${user?.userId}:${activeChapterId}`;
  const loadedChapter = useRef('');
  // Story Bible Queries
  const charactersQuery = useQuery({
    queryKey: ['author', 'story-context', 'characters', activeNovelId],
    queryFn: () => listCharacters(activeNovelId),
    enabled: (storyBibleOpen || referenceQuery !== null) && Boolean(activeNovelId)
  });

  const relationshipsQuery = useQuery({
    queryKey: ['author', 'story-context', 'relationships', activeNovelId],
    queryFn: () => listCharacterRelationships(activeNovelId),
    enabled: storyBibleOpen && Boolean(activeNovelId)
  });

  const timelineQuery = useQuery({
    queryKey: ['author', 'story-context', 'timeline', activeNovelId],
    queryFn: () => listTimelineEvents(activeNovelId),
    enabled: (storyBibleOpen || referenceQuery !== null) && Boolean(activeNovelId)
  });

  const plotSummariesQuery = useQuery({
    queryKey: ['author', 'story-context', 'summaries', activeNovelId],
    queryFn: () => listPlotSummaries(activeNovelId),
    enabled: (storyBibleOpen || referenceQuery !== null) && Boolean(activeNovelId)
  });

  // Keep search params in sync
  useEffect(() => {
    if (activeNovelId && activeChapterId) {
      writeAuthorContext(user?.userId ?? '', { novelId: activeNovelId, chapterId: activeChapterId });
      if (searchParams.get('novelId') !== activeNovelId || searchParams.get('chapterId') !== activeChapterId) {
        setSearchParams({ novelId: activeNovelId, chapterId: activeChapterId }, { replace: true });
      }
    }
  }, [activeNovelId, activeChapterId, searchParams, setSearchParams, user?.userId]);

  // Clean up AI generation polling timer on unmount and chapter switch
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setIsGeneratingAi(false);
    setIsAcceptingAi(false);
    setCurrentJob(null);
    setAiSuggestion(null);
    setAiComparisonOpen(false);
    setReferenceQuery(null);
  }, [activeChapterId]);

  // Load chapter data into editor when chapter changes
  useEffect(() => {
    loadedChapter.current = '';
    setTitle(''); setContent(''); setIsVip(false); setPriceCoins(0);
  }, [user?.userId]);

  useEffect(() => {
    if (chapterQuery.data) {
      const ch = chapterQuery.data;
      if (loadedChapter.current === activeDraftScope) return;
      loadedChapter.current = activeDraftScope;
      const value = persistence.initialize(ch);
      if (!value) return;
      setTitle(value.title); setContent(value.content); setIsVip(value.isVip); setPriceCoins(value.priceCoins);
      setAutosaveStatus('saved');
      setLastSavedTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
    }
  }, [chapterQuery.data, activeChapterId, user?.userId]);

  // The outer workspace scrolls; the manuscript and textarea keep their full height.
  const adjustHeight = () => {
    const el = editorRef.current;
    if (!el || el.hidden) return;
    const viewport = el.closest<HTMLElement>('.sc-editor-workspace');
    const scrollTop = viewport?.scrollTop ?? 0;
    el.style.height = 'auto';
    el.style.height = `${Math.max(520, Math.ceil(el.scrollHeight) + 2)}px`;
    if (viewport) viewport.scrollTop = scrollTop;
  };

  useEffect(() => {
    adjustHeight();
  }, [content, fontOption, fontSize, lineHeight, textAlign, paragraphIndent]);

  useLayoutEffect(() => {
    const caret = acceptedCaretRef.current;
    if (!caret || isAcceptingAi) return;
    acceptedCaretRef.current = null;
    const editor = editorRef.current;
    if (!editor || caret.scope !== activeDraftScope) return;
    adjustHeight();
    revealStudioSelection(editor, caret.position, caret.position);
    rememberEditorSelection();
    const viewport = editor.closest<HTMLElement>('.sc-editor-workspace');
    if (viewport) viewport.scrollTop = caret.scrollTop;
  }, [content, isAcceptingAi, activeDraftScope]);

  useEffect(() => {
    const editor = editorRef.current;
    let width = -1;
    const observer = new ResizeObserver(entries => {
      const nextWidth = entries[0]?.contentRect.width ?? 0;
      if (Math.abs(nextWidth - width) < 1) return;
      width = nextWidth;
      adjustHeight();
    });
    if (editor) observer.observe(editor);
    window.addEventListener('resize', adjustHeight);
    document.fonts.addEventListener('loadingdone', adjustHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', adjustHeight);
      document.fonts.removeEventListener('loadingdone', adjustHeight);
    };
  }, []);

  // Persist formatting preferences in localStorage
  useEffect(() => {
    writeEditorSetting('ephurin_editor_font', fontOption);
  }, [fontOption]);

  useEffect(() => {
    writeEditorSetting('ephurin_editor_font_size', String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    writeEditorSetting('ephurin_editor_line_height', String(lineHeight));
  }, [lineHeight]);

  useEffect(() => {
    writeEditorSetting('ephurin_editor_text_align', textAlign);
  }, [textAlign]);

  useEffect(() => {
    writeEditorSetting('ephurin_editor_indent', String(paragraphIndent));
  }, [paragraphIndent]);


  const currentFontConfig = useMemo(() => {
    return AVAILABLE_FONTS.find((f) => f.id === fontOption) || AVAILABLE_FONTS[0];
  }, [fontOption]);
  const preserveNextToolbarMenu = (event: Event) => {
    // An exiting font menu must not steal focus from the spacing menu just opened.
    if (document.querySelector('[role="menu"][data-state="open"]') || document.activeElement?.getAttribute('aria-expanded') === 'true') event.preventDefault();
  };

  // Selection & prose formatting helpers
  const wrapSelection = (prefix: string, suffix: string = prefix, placeholder: string = 'văn bản') => {
    if (isAcceptingAi) return;
    const textarea = editorRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;

    if (Array.from(currentVal.matchAll(authorNoteDefinitions())).some(note => start < note.index! + note[0].length && end > note.index! || start === end && start >= note.index! && start < note.index! + note[0].length)) {
      showToast('Chọn lời văn để định dạng. Chỉnh sửa lời chú thích trong Ghi chú → Cho độc giả.', 'error');
      return;
    }

    let newContent = '';
    let newCursorStart = start;
    let newCursorEnd = end;

    if (start !== end) {
      const selected = currentVal.substring(start, end);
      const italicBoundary = prefix !== '*' || ((currentVal.slice(0, start).match(/\*+$/)?.[0].length ?? 0) % 2 === 1 && (currentVal.slice(end).match(/^\*+/)?.[0].length ?? 0) % 2 === 1);
      const selectedItalic = prefix !== '*' || ((selected.match(/^\*+/)?.[0].length ?? 0) % 2 === 1 && (selected.match(/\*+$/)?.[0].length ?? 0) % 2 === 1);
      if (italicBoundary && start >= prefix.length && currentVal.slice(start - prefix.length, start) === prefix && currentVal.slice(end, end + suffix.length) === suffix) {
        newContent = currentVal.slice(0, start - prefix.length) + selected + currentVal.slice(end + suffix.length);
        newCursorStart = start - prefix.length; newCursorEnd = end - prefix.length;
      } else if (selectedItalic && selected.startsWith(prefix) && selected.endsWith(suffix) && selected.length >= prefix.length + suffix.length) {
        const plain = selected.slice(prefix.length, -suffix.length);
        newContent = currentVal.slice(0, start) + plain + currentVal.slice(end); newCursorStart = start; newCursorEnd = start + plain.length;
      } else {
        newContent = currentVal.substring(0, start) + prefix + selected + suffix + currentVal.substring(end);
        newCursorStart = start + prefix.length; newCursorEnd = end + prefix.length;
      }
    } else {
      newContent = currentVal.substring(0, start) + prefix + placeholder + suffix + currentVal.substring(end);
      newCursorStart = start + prefix.length;
      newCursorEnd = start + prefix.length + placeholder.length;
    }

    applyStudioEdit(newContent, newCursorStart, newCursorEnd);
  };

  const insertDialogueDash = () => {
    if (isAcceptingAi) return;
    const textarea = editorRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const currentVal = textarea.value;
    const prefix = '— ';
    const newContent = currentVal.substring(0, start) + prefix + currentVal.substring(textarea.selectionEnd);
    applyStudioEdit(newContent, start + prefix.length, start + prefix.length);
  };

  useEffect(() => { setAutosaveStatus(persistence.status); if (persistence.status === 'saved') setLastSavedTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })); }, [persistence.status]);
  const triggerAutosave = (newTitle: string, newContent: string, newIsVip: boolean, newPrice: number) => persistence.queue({ title: newTitle, content: newContent, isVip: newIsVip, priceCoins: newIsVip ? Math.max(1, newPrice) : 0 });
  const handleTitleChange = (val: string) => {
    if (isAcceptingAi || loadedChapter.current !== activeDraftScope) return;
    setTitle(val);
    triggerAutosave(val, content, isVip, priceCoins);
  };

  const handleContentChange = (val: string) => {
    if (isAcceptingAi || loadedChapter.current !== activeDraftScope) return;
    setContent(val);
    triggerAutosave(title, val, isVip, priceCoins);
  };

  const studioReady = Boolean(chapterQuery.data) && loadedChapter.current === activeDraftScope;
  useStudioPosition(activeDraftScope, content, studioReady, editorRef);
  useLayoutEffect(() => {
    const pending = pendingSearchJump.current, source = editorRef.current;
    if (!pending || pending.scope !== activeDraftScope || !studioReady || !source) return;
    pendingSearchJump.current = null;
    const anchor = locateAnchor(pending.hit.anchor, content);
    if (anchor.detached) { showToast('Đoạn tìm thấy đã thay đổi. Hãy tìm lại trong chương.', 'error'); return; }
    revealStudioSelection(source, anchor.start, anchor.end);
  }, [activeDraftScope, content, studioReady]);
  const searchScope = `${user?.userId}:${activeNovelId}`, currentSearchScope = useRef(searchScope); currentSearchScope.current = searchScope;
  const navigateSearchHit = (hit: ChapterSearchHit) => {
    if (currentSearchScope.current !== searchScope || !chaptersQuery.data?.some(chapter => chapter.chapterId === hit.chapterId)) return;
    if (window.matchMedia('(max-width: 900px)').matches) setSidebarOpen(false);
    if (editorRef.current?.closest('.sc-studio-body')?.getAttribute('data-panel-layout') === 'drawer') setRightPanel(null);
    if (hit.chapterId === activeChapterId) {
      const anchor = locateAnchor(hit.anchor, content); if (anchor.detached) { showToast('Nội dung đã thay đổi. Hãy tìm lại.', 'error'); return; }
      if (editorRef.current) revealStudioSelection(editorRef.current, anchor.start, anchor.end);
    } else { pendingSearchJump.current = { scope: `${user?.userId}:${hit.chapterId}`, hit }; setSearchParams({ novelId: activeNovelId, chapterId: hit.chapterId }); }
  };
  const searchNavigationBlocked = useRef(false);
  useEffect(() => {
    if (searchNavigationBlocked.current && persistence.blocker.state === 'unblocked' && pendingSearchJump.current?.scope !== activeDraftScope) pendingSearchJump.current = null;
    searchNavigationBlocked.current = persistence.blocker.state === 'blocked';
  }, [persistence.blocker.state, activeDraftScope]);
  useEffect(() => {
    if (!aiDrawerOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[role="dialog"], [role="menu"][data-state="open"]')) return;
      setRightPanel(null); const source = editorRef.current; if (source) revealStudioSelection(source, source.selectionStart, source.selectionEnd, false);
    };
    document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close);
  }, [aiDrawerOpen]);
  const studioHistory = useStudioHistory(activeDraftScope, content, studioReady, handleContentChange);
  const studioCaret = useRef<{ scope: string; start: number; end: number; text: string } | null>(null);
  const changeEditorMode = (visual: boolean) => {
    if (visual === visualEditor) return;
    const editor = editorRef.current;
    if (editor) studioCaret.current = { scope: activeDraftScope, start: editor.selectionStart, end: editor.selectionEnd, text: content };
    setVisualEditor(visual); writeEditorSetting('storycraft-studio-editor-mode', visual ? 'visual' : 'source');
  };
  const applyStudioEdit = (value: string, start: number, end: number) => {
    if (!studioReady || isAcceptingAi) return;
    studioCaret.current = { scope: activeDraftScope, start, end, text: value };
    studioHistory.edit(value, start, end);
    if (value === content && editorRef.current) { revealStudioSelection(editorRef.current, start, end); studioCaret.current = null; }
  };
  const moveStudioHistory = (redo = false) => {
    if (!studioReady || isAcceptingAi) return;
    const entry = redo ? studioHistory.redo() : studioHistory.undo();
    if (entry) studioCaret.current = { scope: activeDraftScope, start: entry.start, end: entry.end, text: entry.text };
  };
  const rememberStudioSelection = () => { rememberEditorSelection(); const editor = editorRef.current; if (editor) studioHistory.remember(editor.selectionStart, editor.selectionEnd); };
  useLayoutEffect(() => {
    const caret = studioCaret.current;
    if (caret && caret.scope === activeDraftScope && caret.text === content && editorRef.current && studioReady) {
      studioCaret.current = null; adjustHeight(); revealStudioSelection(editorRef.current, caret.start, caret.end); rememberEditorSelection();
    } else if (caret?.scope !== activeDraftScope) studioCaret.current = null;
  }, [content, activeDraftScope, studioReady, visualEditor]);

  const handleAccessChange = (mode: AccessMode) => {
    if (isAcceptingAi) return;
    const nextIsVip = mode === 'vip';
    setIsVip(nextIsVip);
    triggerAutosave(title, content, nextIsVip, priceCoins);
  };

  const handlePriceChange = (val: number) => {
    if (isAcceptingAi) return;
    const safePrice = Math.max(1, Number.isNaN(val) ? 1 : val);
    setPriceCoins(safePrice);
    triggerAutosave(title, content, isVip, safePrice);
  };

  // Create Chapter Mutation
  const createChapterMutation = useMutation({
    mutationFn: async () => {
      if (!activeNovelId) throw new Error('No novel selected');
      const count = chaptersQuery.data?.length ?? 0;
      return createChapter(activeNovelId, {
        title: `Chương ${count + 1}: Bản thảo mới`,
        content: '',
        isVip: false,
        priceCoins: 0
      });
    },
    onSuccess: (newChap: Chapter) => {
      queryClient.invalidateQueries({ queryKey: ['author', 'chapters', activeNovelId] });
      setSearchParams({ novelId: activeNovelId, chapterId: newChap.chapterId });
      showToast(`Đã tạo ${newChap.title}`);
    },
    onError: (err: unknown) => {
      showToast(`Lỗi: ${getApiErrorMessage(err)}`);
    }
  });

  // Publish Chapter Mutation
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!activeChapterId) throw new Error('No chapter selected');
      await persistence.flush();
      await snapshotDraft(activeChapterId, content);
      return submitChapterPublish(activeChapterId);
    },
    onSuccess: (res: { chapterId: string; status: Chapter['status']; moderationRequired: boolean }) => {
      setPublishModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['author', 'chapter', activeChapterId] });
      queryClient.invalidateQueries({ queryKey: ['author', 'chapters', activeNovelId] });
      queryClient.invalidateQueries({ queryKey: ['reader-chapter', activeChapterId] });
      queryClient.invalidateQueries({ queryKey: ['public-reader-chapter', activeChapterId] });
      queryClient.invalidateQueries({ queryKey: ['reader-novel', activeNovelId] });
      queryClient.invalidateQueries({ queryKey: ['public-reader-novel', activeNovelId] });
      showToast(
        res.moderationRequired
          ? 'Chương đã gửi duyệt kiểm duyệt thành công!'
          : 'Chương đã được xuất bản công khai thành công!'
      );
    },
    onError: (err: unknown) => {
      showToast(`Lỗi xuất bản: ${getApiErrorMessage(err)}`);
    }
  });

  // Canonical P1 Writing Loop Generation & Draft Acceptance
  const handleGenerateAi = async (
    instructionText?: string,
    operationType: 'continue' | 'rewrite' | 'describe' | 'dialogue' = 'continue'
  ) => {
    if (!activeNovelId || !activeChapterId) {
      showToast('Vui lòng chọn tác phẩm và chương trước khi tạo bản thảo AI.');
      return;
    }
    const finalInstruction = instructionText || aiInstruction;
    if (!finalInstruction.trim()) return;

    // Capture before async preparation or focus changes in the assistant panel.
    const savedSelection = editorSelectionRef.current;
    const selStart = savedSelection?.scope === activeDraftScope ? savedSelection.start : content.length;
    const selEnd = savedSelection?.scope === activeDraftScope ? savedSelection.end : content.length;
    const codePointStart = utf16OffsetToCodePoint(content, selStart);
    const codePointEnd = utf16OffsetToCodePoint(content, selEnd);

    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    setIsGeneratingAi(true);
    aiBaseRef.current = { scope: activeDraftScope, content };
    setAiComparisonOpen(false);
    setCurrentJob(null);
    setAiSuggestion(null);

    try {
      // 1. Ensure base revision exists and matches current editor content
      let baseRevision: { revisionId: string; contentHash: string; content: string } | null = null;
      try {
        const revs = await listChapterRevisions(activeChapterId);
        if (revs && revs.length > 0) {
          baseRevision = revs[0];
        }
      } catch {
        // No revisions yet
      }

      if (!baseRevision || baseRevision.content !== content) {
        baseRevision = await createChapterSnapshot(activeChapterId, content);
      }

      // 2. Retrieve expected Story Brain version
      let brainVer = 1;
      try {
        const preview = await fetchContextPreview(activeNovelId, { chapterId: activeChapterId });
        if (preview?.brain_version) {
          brainVer = preview.brain_version;
        }
      } catch {
        brainVer = 1;
      }

      // 4. Start writing generation job
      const initiatedJob = await startWritingGeneration({
        novelId: activeNovelId,
        chapterId: activeChapterId,
        revisionId: baseRevision.revisionId,
        contentHash: baseRevision.contentHash,
        operation: operationType,
        selection: {
          start: codePointStart,
          end: codePointEnd,
          cursor: codePointEnd
        },
        instruction: finalInstruction,
        expectedBrainVersion: brainVer,
        idempotencyKey: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ui-${Date.now()}`
      });

      setCurrentJob(initiatedJob);
      pollJob(initiatedJob.job_id);
    } catch (err: unknown) {
      setIsGeneratingAi(false);
      showToast(`Lỗi khởi tạo AI: ${getApiErrorMessage(err)}`);
    }
  };

  const pollJob = async (jobId: string) => {
    try {
      const updated = await getJobStatus(jobId);
      setCurrentJob(updated);
      const status = updated.status?.toLowerCase();
      if (status === 'completed') {
        setIsGeneratingAi(false);
        const draftText = updated.draft || (updated.patch?.replacement ?? '');
        setAiSuggestion(draftText);
        setAiSuggestionTone(
          updated.validation_status === 'passed' ? 'Đã kiểm định nhất quán • P1 Loop' : 'Hoàn thành'
        );
      } else if (status === 'failed') {
        setIsGeneratingAi(false);
        showToast(`Tác vụ AI thất bại: ${updated.error?.message || 'Không rõ nguyên nhân'}`);
      } else {
        pollTimerRef.current = window.setTimeout(() => {
          void pollJob(jobId);
        }, 1000);
      }
    } catch (err: unknown) {
      setIsGeneratingAi(false);
      showToast(`Lỗi kiểm tra tiến trình: ${getApiErrorMessage(err)}`);
    }
  };

  // Canonical Accept Draft: creates immutable revision & emits INCREMENTAL_ANALYSIS outbox event
  const handleAcceptDraft = async () => {
    if (!activeChapterId || !currentJob) return;
    const scrollTop = editorRef.current?.closest<HTMLElement>('.sc-editor-workspace')?.scrollTop ?? 0;
    setIsAcceptingAi(true);
    try {
      await persistence.flush();
      await acceptDraftRevision(activeChapterId, currentJob.job_id);
      const chapter = await getChapter(activeChapterId);
      if (loadedChapter.current === activeDraftScope) {
        const value = persistence.initialize(chapter, true);
        setTitle(value.title);
        setContent(value.content);
        setIsVip(value.isVip);
        setPriceCoins(value.priceCoins);
        if (currentJob.patch) {
          acceptedCaretRef.current = {
            scope: activeDraftScope,
            position: codePointToUtf16Offset(value.content, currentJob.patch.start) + currentJob.patch.replacement.length,
            scrollTop
          };
        }
      }
      setCurrentJob(null);
      setAiSuggestion(null);
      setAiComparisonOpen(false);
      queryClient.invalidateQueries({ queryKey: ['author', 'chapter', activeChapterId] });
      queryClient.invalidateQueries({ queryKey: ['author', 'chapters', activeNovelId] });
      showToast('Đã chấp nhận bản thảo AI và kích hoạt cập nhật Story Brain!');
    } catch (err: unknown) {
      showToast(`Chấp nhận bản thảo thất bại: ${getApiErrorMessage(err)}`);
    } finally {
      setIsAcceptingAi(false);
    }
  };

  // Canonical Discard Draft: leaves canon, revision pointer, and Story Brain unchanged
  const handleDiscardDraft = () => {
    setAiComparisonOpen(false);
    setCurrentJob(null);
    setAiSuggestion(null);
    showToast('Đã từ chối gợi ý AI.');
  };

  // Word count & read time calculation
  const wordCount = useMemo(() => {
    const trimmed = content.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
  }, [content]);

  const readMinutes = Math.max(1, Math.ceil(wordCount / 350));

  // Filtered chapters for search
  const filteredChapters = useMemo(() => {
    const list = chaptersQuery.data ?? [];
    if (!chapterSearch.trim()) return list;
    const q = chapterSearch.toLowerCase();
    return list.filter((ch: Chapter) => ch.title.toLowerCase().includes(q) || String(ch.chapterNumber).includes(q));
  }, [chaptersQuery.data, chapterSearch]);

  const canSchedule = ['DRAFT','REJECTED'].includes(chapterQuery.data?.status ?? '');
  const openSchedule = async () => { try { await persistence.flush(); setScheduleOpen(true); } catch { showToast('Lưu bản nháp thành công trước khi đặt lịch.'); } };
  const manuscriptActions = <>{focusMode && <>{canSchedule && <Menu.Item onClick={openSchedule}>Lên lịch</Menu.Item>}<Menu.Item onClick={() => setHistoryOpen(true)} disabled={!chapterQuery.data}>Lịch sử bản thảo</Menu.Item></>}<Menu.Item onClick={() => setExportOpen(true)}>Xuất bản thảo</Menu.Item></>;

  const chapterSettings = !focusMode && (
        <section className="sc-studio-settings border-b border-stone-200/80 bg-surface-container-lowest/90 backdrop-blur-sm px-4 flex items-center justify-between shrink-0 z-20 text-meta">
          {/* Left: Sidebar toggle & Publication Status */}
          <div className="sc-studio-settings-context flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((prev: boolean) => !prev)}
              className="p-1 rounded text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors flex items-center"
              title="Đóng/Mở thanh danh sách chương"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">view_sidebar</span>
            </button>
            <div className="h-3.5 w-px bg-stone-200"></div>
            <div className="flex items-center gap-2">
              <span className="text-stone-500 font-medium hidden sm:inline">Trạng thái:</span>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800 text-meta font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span>{chapterQuery.data?.status || 'Bản nháp'}</span>
              </div>

            </div>
          </div>

          {/* Manuscript actions and chapter access share one toolbar. */}
          <div className="sc-studio-settings-controls">
            {canSchedule && <button type="button" className="sc-button sc-button-ghost" onClick={openSchedule}>Lên lịch</button>}
            <button type="button" className="sc-button sc-button-ghost" aria-label="Lịch sử bản thảo" title="Lịch sử bản thảo" onClick={() => setHistoryOpen(true)} disabled={!chapterQuery.data}><span className="material-symbols-outlined" aria-hidden="true">history</span></button>
            <div className="flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200">
              <button
                onClick={() => handleAccessChange('free')}
                className={`px-2.5 py-1 rounded-md text-meta transition-colors ${
                  !isVip
                    ? 'font-semibold bg-surface-container-lowest text-stone-900 shadow-2xs border border-stone-200/60'
                    : 'font-medium text-stone-600 hover:text-stone-900'
                }`}
                type="button"
              >
                Miễn phí
              </button>
              <button
                onClick={() => handleAccessChange('vip')}
                className={`px-2.5 py-1 rounded-md text-meta flex items-center gap-1 transition-all ${
                  isVip
                    ? 'font-semibold bg-surface-container-lowest text-primary-700 shadow-2xs border border-stone-200/60'
                    : 'font-medium text-stone-600 hover:text-stone-900'
                }`}
                type="button"
              >
                <span className="material-symbols-outlined text-table text-amber-500 fill-icon">stars</span>
                <span>Chương VIP ✦</span>
              </button>
            </div>

            {/* Dynamic Unlock Coin Price */}
            {isVip && (
              <div className="flex items-center gap-1.5 text-stone-600 text-meta bg-amber-50/70 border border-amber-200/80 px-2 py-0.5 rounded-md">
                <span className="text-meta font-medium text-amber-900">Giá mở khóa:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={priceCoins}
                    onChange={(e) => handlePriceChange(parseInt(e.target.value, 10))}
                    className="w-12 h-6 text-center text-meta font-semibold rounded border-stone-300 bg-surface-container-lowest py-0 px-1 focus:ring-primary-500 focus:border-primary-500 text-stone-800"
                  />
                  <span className="text-meta font-semibold text-amber-700">Xu</span>
                </div>
              </div>
            )}
          </div>
        </section>
      );

  return (
    <div className="sc-writing-studio h-screen flex flex-col text-stone-800 antialiased overflow-hidden select-none bg-surface">
      {/* ──────────────────────────────────────────
          BEGIN: TopHeader
         ────────────────────────────────────────── */}
      <section className="sc-studio-toolbar h-14 border-b border-stone-200/90 bg-surface-subtle/95 backdrop-blur-md px-3 md:px-4 flex items-center justify-between shrink-0 z-30">
        {/* Left: Return link, Breadcrumb & Autosave indicator */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            to={activeNovelId ? `/author/novels/${activeNovelId}` : authorHomeCrumb.to}
            className="inline-flex items-center gap-1 text-meta font-medium text-stone-500 hover:text-stone-900 transition-colors py-1 px-2 rounded-md hover:bg-stone-200/60 shrink-0"
            title={activeNovelId ? 'Quay lại quản lý tác phẩm' : `Quay lại ${navigationLabels.authorHome}`}
            aria-label={activeNovelId ? 'Quay lại quản lý tác phẩm' : `Quay lại ${navigationLabels.authorHome}`}
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span className="hidden sm:inline">{activeNovelId ? 'Tác phẩm' : navigationLabels.authorHome}</span>
          </Link>
          <div className="h-3.5 w-px bg-stone-300 shrink-0"></div>
          <Breadcrumbs className="is-compact" items={[{ label: novelQuery.data?.title || 'Tác phẩm', to: activeNovelId ? `/author/novels/${activeNovelId}` : authorHomeCrumb.to }, { label: title || 'Chương mới' }]} />

          {/* Autosave Indicator */}
          <SaveStatus className="hidden md:inline-flex shrink-0" status={activeChapterId && chapterQuery.data && loadedChapter.current === activeDraftScope ? autosaveStatus : 'idle'} dirty={persistence.dirty} savedAt={lastSavedTime} />
        </div>

        {/* Center/Right Primary Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Word Count Badge */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-100/80 text-stone-600 text-meta font-medium border border-stone-200/70">
            <span className="material-symbols-outlined text-body text-stone-400">description</span>
            <span>{wordCount.toLocaleString()} từ</span>
            <span className="text-stone-300">•</span>
            <span>~{readMinutes} phút</span>
          </div>

          {/* Secondary Tools Group */}
          <ThemeControl />
          <div className="flex items-center bg-stone-100/70 p-0.5 rounded-lg border border-stone-200/80">
            <button
              onClick={() => setFormatToolbarVisible((visible) => !visible)}
              aria-label={formatToolbarVisible ? 'Ẩn thanh công cụ' : 'Hiện thanh công cụ'}
              aria-expanded={formatToolbarVisible}
              aria-controls="studio-format-toolbar"
              title={formatToolbarVisible ? 'Ẩn thanh công cụ' : 'Hiện thanh công cụ'}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-stone-700 hover:text-stone-900 hover:bg-surface-container-lowest transition-all"
              type="button"
            >
              <span className="material-symbols-outlined text-stone-500 text-[15px]">text_format</span>
            </button>
            <button
              onClick={() => setStoryBibleOpen(true)}
              className="inline-flex items-center gap-1 px-2 py-1 text-meta font-medium rounded-md text-stone-700 hover:text-stone-900 hover:bg-surface-container-lowest transition-all"
              title="Cẩm nang thế giới truyện (Story Bible)"
              type="button"
            >
              <span className="material-symbols-outlined text-stone-500 text-[15px]">menu_book</span>
              <span className="hidden xl:inline text-meta">Cẩm nang</span>
            </button>
            <button
              onClick={() => setMemoryPanelOpen(true)}
              data-testid="btn-story-brain"
              aria-label="Story Brain & Kiểm tra nhất quán"
              className="inline-flex items-center gap-1 px-2 py-1 text-meta font-medium rounded-md text-stone-700 hover:text-stone-900 hover:bg-surface-container-lowest transition-all"
              title="Bộ nhớ cốt truyện & Kiểm tra nhất quán (Story Brain)"
              type="button"
            >
              <span className="material-symbols-outlined text-stone-500 text-[15px]">psychology</span>
              <span className="hidden xl:inline text-meta">Story Brain</span>
            </button>
            <button
              onClick={() => setFocusMode((prev: boolean) => !prev)}
              className="inline-flex items-center gap-1 px-2 py-1 text-meta font-medium rounded-md text-stone-700 hover:text-stone-900 hover:bg-surface-container-lowest transition-all"
              title="Chế độ tập trung (Zen Mode)"
              type="button"
            >
              <span className="material-symbols-outlined text-stone-500 text-[15px]">
                {focusMode ? 'fullscreen_exit' : 'fullscreen'}
              </span>
              <span className="hidden md:inline text-meta">{focusMode ? 'Thoát Focus' : 'Tập trung'}</span>
            </button>
          </div>

          <div className="h-4 w-px bg-stone-200 shrink-0 mx-0.5"></div>

          {/* AI Assistant Toggle Button */}
          <button
            onClick={toggleAiDrawer}
            aria-expanded={aiDrawerOpen}
            aria-controls="studio-ai-panel"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-meta font-semibold rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100 border border-primary-200/90 transition-all shadow-2xs "
            title="Mở trợ lý sáng tác AI"
            aria-label="AI Hỗ trợ viết"
            type="button"
          >
            <span className="material-symbols-outlined text-primary-600 text-[16px] fill-icon">auto_awesome</span>
            <span className="hidden sm:inline">AI Hỗ trợ viết</span>
          </button>

          {/* Primary Publish Button */}
          <button
            onClick={() => setPublishModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-meta font-semibold rounded-lg text-white bg-primary-600 hover:bg-primary-700 shadow-sm shadow-primary-200 transition-all "
            type="button"
          >
            <span>Xuất bản chương</span>
            <span className="material-symbols-outlined text-[15px]">send</span>
          </button>
        </div>
      </section>

      {/* ──────────────────────────────────────────
          BEGIN: Chapter Settings Subheader Bar
         ────────────────────────────────────────── */}


      {/* ──────────────────────────────────────────
          BEGIN: MainWorkspace
         ────────────────────────────────────────── */}
      {scheduleOpen && <ChapterSchedule chapterId={activeChapterId} novelId={activeNovelId} onClose={() => setScheduleOpen(false)} />}
      {historyOpen && <RevisionHistory chapterId={activeChapterId} content={content} onClose={() => setHistoryOpen(false)} onRestore={async next => { await persistence.flush(); setContent(next); triggerAutosave(title, next, isVip, priceCoins); await persistence.flush(); showToast('Đã khôi phục và lưu phiên bản bản thảo.'); }} />}
      {persistence.error && <Alert color="red" title="Bản nháp chưa được lưu">{persistence.error}<Group mt="xs"><Button size="xs" variant="light" onClick={() => void persistence.flush().catch(() => {})}>Thử lưu lại</Button><Button size="xs" variant="default" onClick={async () => { const result = await chapterQuery.refetch(); if (result.data) { const value = persistence.initialize(result.data, true); if (value) { setTitle(value.title); setContent(value.content); setIsVip(value.isVip); setPriceCoins(value.priceCoins); } } }}>Tải bản máy chủ</Button></Group></Alert>}
      {persistence.recovery && <Alert title="Có bản lưu trên máy chưa đồng bộ" color="orange"><Text size="sm">Bản lưu lúc {new Date(persistence.recovery.savedAt).toLocaleString('vi-VN')}. Nội dung máy chủ vẫn được giữ nguyên.</Text><Group mt="xs"><Button size="xs" onClick={() => { const value = persistence.recovery!.value; setTitle(value.title); setContent(value.content); setIsVip(value.isVip); setPriceCoins(value.priceCoins); persistence.dismissRecovery(); triggerAutosave(value.title, value.content, value.isVip, value.priceCoins); }}>Khôi phục vào trình soạn thảo</Button><Button size="xs" variant="default" onClick={persistence.dismissRecovery}>Bỏ bản lưu trên máy</Button></Group></Alert>}
      {persistence.blocker.state === 'blocked' && <AuthorDialog onClose={() => persistence.blocker.reset?.()}><div className="fixed inset-0 flex items-center justify-center p-4"><div className="w-full max-w-md p-6"><h2 className="text-section">Bản nháp chưa lưu xong</h2><p className="text-body">Bạn có thể lưu trước khi rời trang hoặc giữ bản dự phòng trên máy để khôi phục sau.</p><Group mt="md"><Button onClick={async () => { try { await persistence.flush(); persistence.blocker.proceed?.(); } catch {} }}>Lưu và rời trang</Button><Button variant="default" onClick={() => persistence.blocker.reset?.()}>Ở lại</Button><Button variant="subtle" onClick={() => { persistence.abandon(); persistence.blocker.proceed?.(); }}>Rời trang</Button></Group></div></div></AuthorDialog>}
      <StudioNovelSearch key={searchScope} opened={novelSearchOpen} chapters={chaptersQuery.data ?? []} activeChapterId={activeChapterId} content={content} onClose={() => setNovelSearchOpen(false)} onNavigate={navigateSearchHit} />
      <StudioWorkbench onSearchNovel={() => setNovelSearchOpen(true)} notesOpen={rightPanel === 'notes'} onNotesOpenChange={changeNotesOpen} onLookup={setReferenceQuery} formatToolbarVisible={formatToolbarVisible} chapterSettings={chapterSettings} fileActions={manuscriptActions} key={activeDraftScope} scope={activeDraftScope} title={title} content={content} editor={editorRef} disabled={!studioReady || isAcceptingAi} exportOpen={exportOpen} onExportClose={() => setExportOpen(false)}
        publishedContent={chapterQuery.data?.status === 'PUBLISHED' ? chapterQuery.data.content : undefined} chapterStatus={chapterQuery.data?.status} onPublish={() => setPublishModalOpen(true)}
        apply={applyStudioEdit} undo={() => moveStudioHistory()} redo={() => moveStudioHistory(true)} canUndo={studioHistory.canUndo} canRedo={studioHistory.canRedo}
        save={async () => { await persistence.flush(); }} onError={message => showToast(message, 'error')} />
      <StudioSelectionTools key={`selection:${activeDraftScope}`} editor={editorRef} disabled={!studioReady || isAcceptingAi}
        onFormat={format => format === 'bold' ? wrapSelection('**') : format === 'italic' ? wrapSelection('*') : wrapSelection('<u>', '</u>')}
        onLookup={setReferenceQuery} onAi={() => { rememberEditorSelection(); openAiDrawer(); }} />
      <div data-right-panel={rightPanel ?? 'none'} className="sc-studio-body flex-1 min-h-0 flex overflow-hidden relative">
        {/* Left Sidebar Chapters Outline Rail */}
        {sidebarOpen && !focusMode && (
          <aside className="sc-studio-sidebar w-[280px] shrink-0 border-r border-stone-200/90 bg-surface-subtle flex flex-col h-full z-10 select-none relative">
            {/* Rail Header */}
            <div className="p-3 border-b border-stone-200 flex items-center justify-between bg-stone-50/50">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-meta font-bold tracking-wider uppercase text-stone-600">Mục lục chương</span>
                  <span className="text-meta bg-stone-200/80 text-stone-700 px-1.5 py-0.2 rounded-full font-semibold">
                    {chaptersQuery.data?.length ?? 0}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors"
                title="Thu gọn danh sách"
                type="button"
              >
                <span className="material-symbols-outlined text-[17px]">first_page</span>
              </button>
            </div>

            {/* Chapter Search & Filter */}
            <div className="p-2.5 pb-1.5">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-2.5 top-2 text-stone-400 text-[16px]">
                  search
                </span>
                <input
                  type="text"
                  value={chapterSearch}
                  onChange={(e) => setChapterSearch(e.target.value)}
                  placeholder="Tìm kiếm chương..."
                  className="w-full bg-surface-container-lowest text-meta pl-8 pr-2.5 py-1.5 rounded-lg border border-stone-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 placeholder-stone-400"
                />
              </div>
            </div>

            {/* Add New Chapter Button */}
            <div className="px-2.5 py-1.5">
              <button
                onClick={() => createChapterMutation.mutate()}
                disabled={createChapterMutation.isPending}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 text-meta font-semibold rounded-lg border border-dashed border-stone-300 bg-surface-container-lowest/70 hover:bg-surface-container-lowest hover:border-primary-400 text-stone-700 hover:text-primary-600 transition-all shadow-2xs group"
                type="button"
              >
                <span className="material-symbols-outlined text-[16px] text-stone-500 group-hover:text-primary-600">
                  add_circle
                </span>
                <span>{createChapterMutation.isPending ? 'Đang tạo...' : 'Thêm chương mới'}</span>
              </button>
            </div>

            {/* Chapter List Navigation */}
            <nav className="flex-1 overflow-y-auto px-2 pb-6 space-y-1.5 text-meta">
              {filteredChapters.map((ch: Chapter, idx: number) => {
                const isActive = ch.chapterId === activeChapterId;
                return (
                  <button
                    type="button"
                    key={ch.chapterId}
                    onClick={() => {
                      if (!isActive) {
                        setSearchParams({ novelId: activeNovelId, chapterId: ch.chapterId });
                      }
                    }}
                    className={`block w-full text-left p-2 rounded-lg border transition-all cursor-pointer relative ${
                      isActive
                        ? 'bg-primary-50/90 border-primary-200 shadow-2xs'
                        : 'border-transparent hover:bg-stone-200/50'
                    }`}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-2 bottom-2 w-1 bg-primary-600 rounded-r-full"></div>
                    )}
                    <div className="flex items-center justify-between mb-0.5 pl-1">
                      <span
                        className={`text-meta font-semibold ${
                          isActive ? 'text-primary-700 font-bold' : 'text-stone-500'
                        }`}
                      >
                        CHƯƠNG {ch.chapterNumber ?? idx + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        {ch.isVip && (
                          <span className="text-meta px-1 py-0.2 rounded bg-amber-100 text-amber-800 font-bold border border-amber-300">
                            VIP
                          </span>
                        )}
                        <span
                          className={`text-meta px-1.5 py-0.2 rounded border font-normal ${
                            ch.status === 'PUBLISHED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-stone-100 text-stone-500 border-stone-200/70'
                          }`}
                        >
                          {ch.status === 'PUBLISHED' ? 'Đã đăng' : 'Bản nháp'}
                        </span>
                      </div>
                    </div>
                    <p
                      className={`truncate text-meta pl-1 ${
                        isActive ? 'font-semibold text-stone-900' : 'font-medium text-stone-700'
                      }`}
                    >
                      {ch.title || `Chương ${ch.chapterNumber}`}
                    </p>
                    <div className="flex items-center justify-between text-meta text-stone-400 mt-0.5 pl-1">
                      <span>{ch.wordCount ? `${ch.wordCount.toLocaleString()} từ` : 'Bản nháp'}</span>
                      {isActive && <span className="text-primary-600 font-medium text-meta">Đang mở</span>}
                    </div>
                  </button>
                );
              })}
            </nav>
          </aside>
        )}

        {/* ──────────────────────────────────────────
            BEGIN: ManuscriptWritingArea
           ────────────────────────────────────────── */}
        <div className="sc-studio-editor-region"><main className="sc-editor-workspace flex-1 min-h-0 overflow-y-auto flex flex-col items-center bg-surface relative select-text">
          {/* Sticky Formatting Toolbar with Frosted-Glass Backdrop */}
          {formatToolbarVisible && (
            <div id="studio-format-toolbar" className="sc-format-toolbar sticky top-0 z-20 w-full py-2 px-3 sm:px-4 bg-surface/95 backdrop-blur-md border-b border-stone-200/60 flex items-center justify-center mb-2 shrink-0">
              <div className="sc-format-controls py-0 px-1 flex items-center gap-1 max-w-4xl text-meta text-stone-700 select-none">
                {/* Portalled menus remain usable inside the horizontally scrolling toolbar. */}
                <Menu position="bottom-start" onCloseAutoFocus={preserveNextToolbarMenu}><Menu.Target><button className="font-medium flex items-center gap-1.5 px-2 py-1" title="Đổi kiểu chữ (7 phông chữ Việt hóa)" type="button">
                  <span className="material-symbols-outlined text-[16px]">text_fields</span><span>{currentFontConfig.name}</span><span className="material-symbols-outlined text-[15px]">expand_more</span>
                </button></Menu.Target><Menu.Dropdown><Menu.Label>Phông chữ soạn thảo</Menu.Label>{AVAILABLE_FONTS.map(font => <Menu.Item key={font.id} onClick={() => setFontOption(font.id)} leftSection={fontOption === font.id ? '✓' : ' '}><span style={{fontFamily:font.fontFamily}}>{font.name}</span><span className="block text-meta text-stone-500">{font.tagline}</span></Menu.Item>)}</Menu.Dropdown></Menu>

                <div className="h-4 w-px bg-stone-200 mx-1"></div>

                {/* 2. Font Size Stepper */}
                <div className="flex items-center bg-stone-100/80 rounded-lg p-0.5 border border-stone-200/60" title="Cỡ chữ">
                  <button
                    onClick={() => setFontSize((prev) => Math.max(13, prev - 1))}
                    disabled={fontSize <= 13}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface-container-lowest text-stone-600 hover:text-stone-900 disabled:opacity-30 disabled:hover:bg-transparent font-medium text-meta transition-colors"
                    title="Giảm cỡ chữ (A-)"
                    type="button"
                  >
                    A-
                  </button>
                  <StudioNumberField value={fontSize} onChange={setFontSize} min={13} max={28} step={1} label="Cỡ chữ" />
                  <button
                    onClick={() => setFontSize((prev) => Math.min(28, prev + 1))}
                    disabled={fontSize >= 28}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface-container-lowest text-stone-600 hover:text-stone-900 disabled:opacity-30 disabled:hover:bg-transparent font-medium text-meta transition-colors"
                    title="Tăng cỡ chữ (A+)"
                    type="button"
                  >
                    A+
                  </button>
                </div>

                <div className="h-4 w-px bg-stone-200 mx-1"></div>

                {/* 3. Text Alignment Group */}
                <div className="flex items-center bg-stone-100/80 rounded-lg p-0.5 border border-stone-200/60">
                  <button
                    onClick={() => setTextAlign('justify')}
                    className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                      textAlign === 'justify' ? 'bg-surface-container-lowest text-primary-700 shadow-2xs font-bold' : 'text-stone-500 hover:text-stone-800'
                    }`}
                    title="Căn đều hai bên (Chuẩn sách xuất bản)"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[15px]">format_align_justify</span>
                  </button>
                  <button
                    onClick={() => setTextAlign('left')}
                    className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                      textAlign === 'left' ? 'bg-surface-container-lowest text-primary-700 shadow-2xs font-bold' : 'text-stone-500 hover:text-stone-800'
                    }`}
                    title="Căn trái"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[15px]">format_align_left</span>
                  </button>
                  <button
                    onClick={() => setTextAlign('center')}
                    className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                      textAlign === 'center' ? 'bg-surface-container-lowest text-primary-700 shadow-2xs font-bold' : 'text-stone-500 hover:text-stone-800'
                    }`}
                    title="Căn giữa (Thơ, tiêu đề phụ, lời đề từ)"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[15px]">format_align_center</span>
                  </button>
                  <button
                    onClick={() => setTextAlign('right')}
                    className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                      textAlign === 'right' ? 'bg-surface-container-lowest text-primary-700 shadow-2xs font-bold' : 'text-stone-500 hover:text-stone-800'
                    }`}
                    title="Căn phải (Ký tên, ngày tháng, xuất xứ)"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[15px]">format_align_right</span>
                  </button>
                </div>

                <div className="h-4 w-px bg-stone-200 mx-1"></div>

                {/* 4. Line Spacing & Indent */}
                <div className="sc-studio-spacing-control">
                  <span className="material-symbols-outlined" aria-hidden="true">format_line_spacing</span>
                  <StudioNumberField value={lineHeight} onChange={setLineHeight} min={1.2} max={3} step={0.05} label="Giãn dòng" /><span aria-hidden="true">x</span>
                  <Menu position="bottom-start" onCloseAutoFocus={preserveNextToolbarMenu}><Menu.Target><button title="Khoảng cách giãn dòng (Line-height)" aria-label="Chọn mức giãn dòng" type="button"><span className="material-symbols-outlined" aria-hidden="true">expand_more</span></button></Menu.Target><Menu.Dropdown><Menu.Label>Giãn dòng bản thảo</Menu.Label>{[{val:1.8,label:'1.8x • Gọn gàng'},{val:2.15,label:'2.15x • Chuẩn tiểu thuyết'},{val:2.5,label:'2.5x • Rộng rãi, thoáng'}].map(option => <Menu.Item key={option.val} onClick={() => setLineHeight(option.val)} leftSection={lineHeight === option.val ? '✓' : ' '}>{option.label}</Menu.Item>)}</Menu.Dropdown></Menu>
                </div>

                {/* First-line Indent Toggle */}
                <button
                  onClick={() => setParagraphIndent((prev) => !prev)}
                  className={`h-7 px-2 flex items-center gap-1 rounded-lg transition-colors border ${
                    paragraphIndent
                      ? 'bg-primary-50/80 border-primary-200 text-primary-700 font-semibold'
                      : 'border-transparent hover:bg-stone-100 text-stone-500 hover:text-stone-800'
                  }`}
                  title="Thụt đầu dòng đoạn văn (~2.5rem - Quy chuẩn tiểu thuyết)"
                  aria-label="Thụt đầu dòng"
                  aria-pressed={paragraphIndent}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[15px]">format_indent_increase</span>
                  <span className="sr-only">Thụt dòng</span>
                </button>

                <div className="h-4 w-px bg-stone-200 mx-1"></div>

                {/* 5. Inline Formatting Tools */}
                <button
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => wrapSelection('**', '**', 'văn bản in đậm')}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-100 text-stone-700 hover:text-stone-900 transition-colors font-bold text-meta"
                  title="In đậm (**văn bản**)"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">format_bold</span>
                </button>

                <button
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => wrapSelection('*', '*', 'văn bản in nghiêng')}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-100 text-stone-700 hover:text-stone-900 transition-colors italic text-meta"
                  title="In nghiêng (*văn bản*)"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">format_italic</span>
                </button>

                <button
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => wrapSelection('<u>', '</u>', 'văn bản gạch chân')}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-100 text-stone-700 hover:text-stone-900 transition-colors text-meta"
                  title="Gạch chân (<u>văn bản</u>)"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">format_underlined</span>
                </button>

                <button
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => wrapSelection('~~', '~~', 'văn bản gạch ngang')}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-100 text-stone-700 hover:text-stone-900 transition-colors text-meta"
                  title="Gạch ngang (~~văn bản~~)"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">strikethrough_s</span>
                </button>

                <button
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => wrapSelection('“', '”', 'lời thoại nhân vật')}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-100 text-stone-700 hover:text-stone-900 font-serif text-body transition-colors"
                  title="Trích dẫn lời thoại “...”"
                  type="button"
                >
                  “”
                </button>

                <button
                  onMouseDown={event => event.preventDefault()}
                  onClick={insertDialogueDash}
                  className="px-1.5 h-7 flex items-center justify-center rounded-md hover:bg-stone-100 text-stone-700 hover:text-stone-900 font-serif text-meta transition-colors"
                  title="Gạch đầu dòng lời thoại (— )"
                  type="button"
                >
                  —
                </button>
                <AnimatedTooltip label="Chèn ký tự đặc biệt"><button type="button" className="sc-studio-symbol-trigger" aria-label="Chèn ký tự đặc biệt" onMouseDown={event => event.preventDefault()} onClick={() => editorRef.current?.dispatchEvent(new CustomEvent('studio-open-symbols'))}>Ω</button></AnimatedTooltip>
              </div>
            </div>
          )}

          {/* Centered Manuscript Page */}
          <article className="sc-manuscript-page w-full max-w-3xl shrink-0 bg-surface-container-lowest rounded-xl shadow-sm border border-stone-200/70">
            {/* Editable Chapter Title Header */}
            <div className="sc-studio-title-header mb-4 pb-3 border-b border-stone-100">
              <input
                type="text"
                value={title}
                readOnly={isAcceptingAi}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Đặt tiêu đề chương tại đây..."
                style={{ fontFamily: currentFontConfig.fontFamily }}
                className="sc-chapter-title w-full font-bold text-2xl md:text-3xl text-stone-900 border-none p-0 focus:ring-0 focus:outline-none placeholder-stone-300 tracking-tight bg-transparent"
              />
              <div className="flex flex-wrap items-center gap-2 mt-2.5 text-meta text-stone-400 font-sans">
                <span>{lastSavedTime ? `Đã lưu: ${lastSavedTime}` : 'Đang soạn thảo'}</span>
                <span>•</span>
                <span className="text-stone-600 font-medium">{novelQuery.data?.title || 'Tác phẩm'}</span>
                <span>•</span>
                <span className="text-stone-500">Chương số {chapterQuery.data?.chapterNumber ?? 1}</span>
              </div>
            </div>

            {/* Prose Editor Textarea: Auto-grow without internal scrollbar */}
            <StudioContextMenu key={activeDraftScope} editor={editorRef} disabled={!studioReady || isAcceptingAi} apply={applyStudioEdit} onError={message => showToast(message, 'error')} onLookup={setReferenceQuery} onAi={() => { rememberEditorSelection(); openAiDrawer(); }} onCopied={() => showToast('Đã sao chép vùng chọn.')}><div className="sc-manuscript-input w-full min-h-[500px]">
              <div className="sc-studio-editor-mode" role="group" aria-label="Chế độ soạn thảo"><button type="button" aria-pressed={visualEditor} onMouseDown={event => event.preventDefault()} onClick={() => changeEditorMode(true)}>Soạn thảo</button><button type="button" aria-pressed={!visualEditor} onMouseDown={event => event.preventDefault()} onClick={() => changeEditorMode(false)}>Ký hiệu định dạng</button></div>
              {visualEditor && <RichManuscriptEditor value={content} source={editorRef} disabled={!studioReady || isAcceptingAi}
                style={{ fontFamily: currentFontConfig.fontFamily, fontSize: `${fontSize}px`, lineHeight, textAlign, textIndent: paragraphIndent ? '2.5rem' : '0' }}
                onChange={(next, start, end) => studioHistory.edit(next, start, end, true)} onSelection={(start, end) => { editorSelectionRef.current = { scope: activeDraftScope, start, end }; studioHistory.remember(start, end); }}
                onKeyDown={e => { if (e.nativeEvent.isComposing || !(e.ctrlKey || e.metaKey) || isAcceptingAi) return; const key = e.key.toLowerCase(); if (['b','i','u'].includes(key)) { e.preventDefault(); if (key === 'b') wrapSelection('**'); else if (key === 'i') wrapSelection('*'); else wrapSelection('<u>', '</u>'); } }} />}
              <textarea
                ref={editorRef}
                hidden={visualEditor}
                readOnly={isAcceptingAi || !chapterQuery.data || loadedChapter.current !== activeDraftScope}
                value={content}
                onChange={(e) => studioHistory.edit(e.target.value, e.currentTarget.selectionStart, e.currentTarget.selectionEnd, true)}
                onBeforeInput={e => studioHistory.remember(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)}
                onSelect={rememberStudioSelection}
                onClick={rememberStudioSelection}
                onKeyUp={rememberStudioSelection}
                onBlur={rememberStudioSelection}
                onKeyDown={e => { if (e.nativeEvent.isComposing || !(e.ctrlKey || e.metaKey) || isAcceptingAi) return; const key = e.key.toLowerCase(); if (['b','i','u'].includes(key)) { e.preventDefault(); if (key === 'b') wrapSelection('**'); else if (key === 'i') wrapSelection('*'); else wrapSelection('<u>', '</u>'); } }}
                aria-label="Nội dung bản thảo"
                spellCheck
                placeholder="Bắt đầu câu từ chương truyện của bạn tại đây..."
                style={{
                  overflow: 'hidden',
                  resize: 'none',
                  minHeight: '520px',
                  fontFamily: currentFontConfig.fontFamily,
                  fontSize: `${fontSize}px`,
                  lineHeight: lineHeight,
                  textAlign: textAlign,
                  textIndent: paragraphIndent ? '2.5rem' : '0'
                }}
                className="sc-manuscript w-full border-none p-0 text-stone-800 bg-transparent focus:ring-0 focus:outline-none placeholder-stone-300 selection:bg-primary-100 selection:text-primary-900"
              />
            </div></StudioContextMenu>
          </article>
        </main></div>

        {/* ──────────────────────────────────────────
            BEGIN: Docked AI Assistant
           ────────────────────────────────────────── */}
        {aiDrawerOpen && (
          <motion.aside initial={{ opacity: 0, x: reducePanelMotion ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reducePanelMotion ? 0 : 12 }} transition={{ duration: 0.18 }} id="studio-ai-panel" aria-label="Trợ lý sáng tác AI" className="sc-ai-panel bg-surface-container-lowest border-l border-stone-200 flex flex-col select-none">
            {/* Drawer Header */}
            <div className="h-14 border-b border-stone-200 px-4 flex items-center justify-between bg-stone-50/80">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary-50 border border-primary-200 flex items-center justify-center text-primary-600">
                  <span className="material-symbols-outlined text-[17px] fill-icon">auto_awesome</span>
                </div>
                <div>
                  <h3 className="text-meta font-bold text-stone-900 leading-none">Trợ lý sáng tác AI • Ephurin</h3>
                  <span className="text-meta text-stone-400">Context-Aware LLM & Story Bible</span>
                </div>
              </div>
              <button
                onClick={() => setRightPanel(null)}
                className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 transition-colors"
                title="Đóng trợ lý"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Context Scope Selector */}
            <div className="sc-ai-context-scope">
              <label htmlFor="studio-ai-context-scope">Phạm vi ngữ cảnh</label>
              <select
                id="studio-ai-context-scope"
                value={aiScope}
                onChange={(e) => setAiScope(e.target.value as typeof aiScope)}
              >
                <option value="selection">Đoạn văn vừa viết</option>
                <option value="full">Toàn bộ chương hiện tại</option>
                <option value="bible">Story Bible · Nhân vật &amp; sự kiện</option>
              </select>
            </div>

            {/* Quick Action Chips */}
            <div className="p-3 border-b border-stone-100 bg-stone-50/40">
              <span className="text-meta font-bold uppercase text-stone-400 tracking-wider block mb-2">
                Tác vụ văn học nhanh
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => handleGenerateAi('Viết tiếp phân cảnh này tự nhiên bám sát giọng văn', 'continue')}
                  disabled={isGeneratingAi}
                  className="text-left px-2.5 py-1.5 rounded-md border border-stone-200 bg-white hover:border-primary-400 hover:text-primary-600 text-[11px] font-medium text-stone-700 shadow-2xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                  type="button"
                >
                  <span>✍️</span> <span>Viết tiếp</span>
                </button>
                <button
                  onClick={() => handleGenerateAi('Gọt giũa và nâng tầm đoạn văn, giàu hình ảnh biểu cảm hơn', 'rewrite')}
                  disabled={isGeneratingAi}
                  className="text-left px-2.5 py-1.5 rounded-md border border-stone-200 bg-white hover:border-primary-400 hover:text-primary-600 text-[11px] font-medium text-stone-700 shadow-2xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                  type="button"
                >
                  <span>✨</span> <span>Gọt giũa văn phong</span>
                </button>
                <button
                  onClick={() => handleGenerateAi('Mô tả ngoại cảnh và không gian xung quanh sâu sắc', 'describe')}
                  disabled={isGeneratingAi}
                  className="text-left px-2.5 py-1.5 rounded-md border border-stone-200 bg-white hover:border-primary-400 hover:text-primary-600 text-[11px] font-medium text-stone-700 shadow-2xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                  type="button"
                >
                  <span>🎨</span> <span>Mô tả ngoại cảnh</span>
                </button>
                <button
                  onClick={() => handleGenerateAi('Phát triển đoạn đối thoại kịch tính giữa các nhân vật', 'dialogue')}
                  disabled={isGeneratingAi}
                  className="text-left px-2.5 py-1.5 rounded-md border border-stone-200 bg-white hover:border-primary-400 hover:text-primary-600 text-[11px] font-medium text-stone-700 shadow-2xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                  type="button"
                >
                  <span>💬</span> <span>Viết hội thoại</span>
                </button>
              </div>
            </div>

            {/* AI Suggestion Display */}
            <div className="sc-ai-results flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3.5 text-meta select-text">
              {isGeneratingAi && (
                <div className="p-4 rounded-xl bg-primary-50/70 border border-primary-200 flex flex-col items-center justify-center gap-2 text-primary-700">
                  <span className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></span>
                  <span className="text-meta font-semibold">AI đang suy nghĩ và tổng hợp Story Bible...</span>
                </div>
              )}

              {aiSuggestion && !isGeneratingAi && (
                <FeedbackReveal className="bg-primary-50/70 border border-primary-100 rounded-xl p-3.5 text-stone-800 shadow-2xs">
                  <div className="flex items-center justify-between mb-2 text-meta font-semibold text-primary-700">
                    <span className="uppercase tracking-wide">Gợi ý từ AI Copilot</span>
                    <span className="bg-primary-100 px-1.5 py-0.2 rounded text-meta">{aiSuggestionTone}</span>
                  </div>
                  <p className="font-serif text-table leading-relaxed italic text-stone-700 bg-surface-container-lowest/70 p-2.5 rounded-lg border border-primary-100/60 whitespace-pre-wrap">
                    {aiSuggestion}
                  </p>
                  <div className="sc-studio-tool-row"><button type="button" className="sc-feedback-button" onClick={() => setAiComparisonOpen(true)}>So sánh trước khi áp dụng</button><CopyTextButton value={aiSuggestion} label="Sao chép gợi ý" onError={message => showToast(message, 'error')} /></div>
                  <div className="mt-3 grid grid-cols-2 gap-1.5 font-sans pt-1">
                    <button
                      onClick={() => handleAcceptDraft()}
                      disabled={isAcceptingAi}
                      className="px-2 py-1.5 rounded bg-primary-600 text-white font-medium text-[11px] hover:bg-primary-700 text-center transition-all shadow-2xs active:scale-95 disabled:opacity-50"
                      type="button"
                    >
                      {isAcceptingAi ? 'Đang xác nhận...' : 'Chấp nhận bản thảo'}
                    </button>
                    <button
                      onClick={() => handleDiscardDraft()}
                      disabled={isAcceptingAi}
                      className="px-2 py-1.5 rounded bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 font-medium text-[11px] text-center transition-all disabled:opacity-50"
                      type="button"
                    >
                      Từ chối / Bỏ qua
                    </button>
                  </div>
                </FeedbackReveal>
              )}

              {!aiSuggestion && !isGeneratingAi && (
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-stone-700">
                  <div className="flex items-center justify-between mb-1 text-meta font-semibold text-stone-500 uppercase">
                    <span>Sẵn sàng hỗ trợ</span>
                    <span className="text-meta text-stone-400">Ephurin AI</span>
                  </div>
                  <p className="text-meta leading-normal text-stone-600">
                    Nhập yêu cầu vào ô bên dưới hoặc bấm vào các tác vụ nhanh để AI phân tích bối cảnh truyện và viết tiếp.
                  </p>
                </div>
              )}
            </div>

            {/* Prompt Input Footer */}
            <div className="p-3 border-t border-stone-200 bg-surface-container-lowest">
              <div className="relative">
                <textarea
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerateAi();
                    }
                  }}
                  placeholder="Nhập yêu cầu phát triển tình tiết, miêu tả tâm lý nhân vật..."
                  rows={2}
                  className="w-full text-meta rounded-lg border-stone-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 placeholder-stone-400 resize-none pr-10 text-stone-800"
                />
                <button
                  onClick={() => handleGenerateAi()}
                  disabled={isGeneratingAi || !aiInstruction.trim()}
                  className="absolute right-2 bottom-2.5 p-1 rounded-md bg-primary-600 text-white hover:bg-primary-700 transition-colors shadow-2xs disabled:opacity-50"
                  title="Gửi yêu cầu"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">send</span>
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </div>

      {/* ──────────────────────────────────────────
          BEGIN: Story Bible Modal
         ────────────────────────────────────────── */}
      {referenceQuery !== null && <StoryReferenceLookup key={`${activeNovelId}:${referenceQuery}`} novelId={activeNovelId} initialQuery={referenceQuery}
        characters={charactersQuery.data ?? []} timeline={timelineQuery.data ?? []} summaries={plotSummariesQuery.data ?? []}
        loading={charactersQuery.isFetching || timelineQuery.isFetching || plotSummariesQuery.isFetching}
        failed={charactersQuery.isError || timelineQuery.isError || plotSummariesQuery.isError}
        onRetry={() => { void charactersQuery.refetch(); void timelineQuery.refetch(); void plotSummariesQuery.refetch(); }} onClose={() => setReferenceQuery(null)} />}
      <AnimatedModal opened={aiComparisonOpen && !!aiSuggestion && aiBaseRef.current.scope === activeDraftScope} onClose={() => !isAcceptingAi && setAiComparisonOpen(false)} title="So sánh đề xuất AI" size="xl" centered closeOnEscape={!isAcceptingAi} closeOnClickOutside={!isAcceptingAi} withCloseButton={!isAcceptingAi}>
        <p className="text-meta">{currentJob?.patch ? 'So sánh vùng văn bản AI đề xuất thay thế. Phần được tô là vùng khác nhau; nội dung chưa được áp dụng.' : 'Đối chiếu bản gốc lúc yêu cầu với gợi ý AI. Nội dung chưa được áp dụng.'}</p>
        {content !== aiBaseRef.current.content && <p role="status" className="text-meta">Bạn đã sửa bản thảo sau khi yêu cầu AI. Máy chủ sẽ kiểm tra phiên bản trước khi chấp nhận.</p>}
        <TextComparison before={currentJob?.patch ? aiBaseRef.current.content.slice(codePointToUtf16Offset(aiBaseRef.current.content, currentJob.patch.start), codePointToUtf16Offset(aiBaseRef.current.content, currentJob.patch.end)) : aiBaseRef.current.content} after={currentJob?.patch?.replacement ?? aiSuggestion ?? ''} />
        <div className="sc-ai-comparison-actions"><button type="button" className="sc-feedback-button" disabled={isAcceptingAi} onClick={() => setAiComparisonOpen(false)}>Quay lại gợi ý</button><button type="button" className="sc-feedback-button" disabled={isAcceptingAi} onClick={() => void handleAcceptDraft()}>{isAcceptingAi ? 'Đang xác nhận…' : 'Chấp nhận bản thảo'}</button></div>
      </AnimatedModal>
      {storyBibleOpen && (
        <AuthorDialog onClose={() => setStoryBibleOpen(false)}><div className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div
            style={{ height: '620px', maxHeight: '88vh' }}
            className="bg-surface-container-lowest rounded-2xl shadow-sm border border-stone-200/90 w-full max-w-3xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Header */}
            <div className="h-16 border-b border-stone-200 px-6 flex items-center justify-between bg-stone-50/90 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary-50 border border-primary-200/60 flex items-center justify-center text-primary-600 shadow-xs">
                  <span className="material-symbols-outlined text-[20px]">menu_book</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-body font-bold text-stone-900">Cẩm Nang Thế Giới (Story Bible)</h3>
                    <span className="px-2 py-0.5 rounded-full bg-stone-200/60 text-meta font-semibold text-stone-600">Tra cứu nhanh</span>
                  </div>
                  <p className="text-meta text-stone-500 font-medium">Tác phẩm: {novelQuery.data?.title || 'Đang tải...'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={activeNovelId ? `/author/context/${activeNovelId}` : '/author'}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 text-meta text-stone-700 hover:text-stone-900 hover:bg-surface-container-lowest font-medium shadow-xs transition-colors"
                  title="Mở toàn màn hình để thêm/sửa nhân vật, thiết lập chi tiết"
                >
                  <span className="material-symbols-outlined text-[15px] text-primary-600">open_in_new</span>
                  <span>Mở Cẩm nang đầy đủ</span>
                </Link>
                <button
                  onClick={() => setStoryBibleOpen(false)}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors"
                  type="button"
                  title="Đóng popup"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-6 border-b border-stone-200 flex items-center gap-6 text-meta font-semibold bg-surface-container-lowest text-stone-500 shrink-0">
              <button
                onClick={() => setStoryBibleTab('characters')}
                className={`py-3.5 flex items-center gap-1.5 transition-colors ${
                  storyBibleTab === 'characters'
                    ? 'text-primary-600 border-b-2 border-primary-600 font-bold'
                    : 'hover:text-stone-900'
                }`}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">groups</span>
                <span>Nhân vật ({charactersQuery.data?.length ?? 0})</span>
              </button>
              <button
                onClick={() => setStoryBibleTab('relationships')}
                className={`py-3.5 flex items-center gap-1.5 transition-colors ${
                  storyBibleTab === 'relationships'
                    ? 'text-primary-600 border-b-2 border-primary-600 font-bold'
                    : 'hover:text-stone-900'
                }`}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">hub</span>
                <span>Mối quan hệ ({relationshipsQuery.data?.length ?? 0})</span>
              </button>
              <button
                onClick={() => setStoryBibleTab('timeline')}
                className={`py-3.5 flex items-center gap-1.5 transition-colors ${
                  storyBibleTab === 'timeline'
                    ? 'text-primary-600 border-b-2 border-primary-600 font-bold'
                    : 'hover:text-stone-900'
                }`}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">history_edu</span>
                <span>Dòng thời gian ({timelineQuery.data?.length ?? 0})</span>
              </button>
              <button
                onClick={() => setStoryBibleTab('summaries')}
                className={`py-3.5 flex items-center gap-1.5 transition-colors ${
                  storyBibleTab === 'summaries'
                    ? 'text-primary-600 border-b-2 border-primary-600 font-bold'
                    : 'hover:text-stone-900'
                }`}
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">auto_stories</span>
                <span>Tóm tắt hồi ({plotSummariesQuery.data?.length ?? 0})</span>
              </button>
            </div>

            {/* Tab Contents: Uniform scrollable container */}
            <div className="p-6 overflow-y-auto space-y-3 flex-1 min-h-0 text-meta text-stone-700 bg-stone-50/40">
              {storyBibleTab === 'characters' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {charactersQuery.data?.map((c: CharacterProfile) => {
                      const { customTitle, cleanDescription } = parseIdeCharacterDesc(c.description);
                      const roleBadgeClass =
                        c.role === 'PROTAGONIST'
                          ? 'bg-primary-50 text-primary-700 border-primary-200'
                          : c.role === 'ANTAGONIST'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : c.role === 'SUPPORTING'
                          ? 'bg-primary-50 text-primary-700 border-primary-200'
                          : 'bg-stone-100 text-stone-600 border-stone-200';
                      const roleLabel =
                        c.role === 'PROTAGONIST'
                          ? 'Tuyến chính'
                          : c.role === 'ANTAGONIST'
                          ? 'Phản diện'
                          : c.role === 'SUPPORTING'
                          ? 'Tuyến phụ'
                          : 'Quần chúng';

                      return (
                        <div
                          key={c.characterId}
                          className="p-3.5 rounded-xl border border-stone-200 bg-surface-container-lowest hover:border-stone-300 hover:shadow-xs transition-all flex flex-col justify-between gap-2.5"
                        >
                          <div className="flex items-start gap-3">
                            <span className="w-11 h-11 rounded-full bg-stone-100 border border-stone-200 shrink-0 shadow-2xs flex items-center justify-center font-bold text-stone-600" aria-label={c.name}>{c.name.slice(0, 1).toUpperCase()}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-stone-900 text-body truncate">{c.name}</span>
                                {customTitle && (
                                  <span className="px-1.5 py-0.5 rounded text-meta font-semibold bg-amber-50 text-amber-800 border border-amber-200 truncate">
                                    {customTitle}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 mt-1">
                                <span className={`text-meta px-2 py-0.5 rounded-full border font-semibold ${roleBadgeClass}`}>
                                  {roleLabel}
                                </span>
                              </div>
                            </div>
                          </div>

                          <details className="text-meta text-stone-600">
                          <summary className="cursor-pointer font-medium">Chi tiết nhân vật</summary>
                          {c.personality && (
                            <div className="bg-stone-50 rounded-lg p-2 border border-stone-100 text-meta text-stone-600 italic">
                              "{c.personality}"
                            </div>
                          )}

                          <p className="text-stone-600 text-meta whitespace-pre-wrap leading-relaxed mt-2">
                            {cleanDescription || 'Chưa có tiểu sử chi tiết.'}
                          </p>
                          </details>
                        </div>
                      );
                    })}
                  </div>

                  {(!charactersQuery.data || charactersQuery.data.length === 0) && (
                    <div className="py-12 text-center flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 mb-2">
                        <span className="material-symbols-outlined text-[24px]">person_off</span>
                      </div>
                      <p className="text-stone-600 font-semibold text-body">Chưa có nhân vật nào trong Story Bible</p>
                      <Link
                        to={activeNovelId ? `/author/context/${activeNovelId}` : '/author'}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-meta shadow-xs inline-flex items-center gap-1.5 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]">add</span>
                        <span>Mở Cẩm nang để thêm nhân vật ↗</span>
                      </Link>
                    </div>
                  )}
                </>
              )}

              {storyBibleTab === 'relationships' && (
                <>
                  <div className="space-y-2.5">
                    {relationshipsQuery.data?.map((r: CharacterRelationship) => (
                      <div key={r.relationshipId} className="p-3.5 rounded-xl border border-stone-200 bg-surface-container-lowest hover:border-stone-300 transition-colors">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-stone-900 text-meta flex items-center gap-1.5">
                            <span className="text-primary-700">{r.sourceCharacterName}</span>
                            <span className="material-symbols-outlined text-body text-stone-400">arrow_forward</span>
                            <span className="text-stone-800">{r.targetCharacterName}</span>
                          </span>
                          <span className="text-meta bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                            {r.relationshipType}
                          </span>
                        </div>
                        {r.description && <p className="text-meta text-stone-600 leading-relaxed">{r.description}</p>}
                      </div>
                    ))}
                  </div>

                  {(!relationshipsQuery.data || relationshipsQuery.data.length === 0) && (
                    <div className="py-12 text-center text-stone-400">
                      <span className="material-symbols-outlined text-[28px] text-stone-300 block mb-1">hub</span>
                      <p className="text-meta italic">Chưa có dữ liệu mối quan hệ nhân vật nào.</p>
                    </div>
                  )}
                </>
              )}

              {storyBibleTab === 'timeline' && (
                <>
                  <div className="space-y-2.5">
                    {timelineQuery.data?.map((ev: StoryTimelineEvent) => (
                      <div key={ev.eventId} className="p-3.5 rounded-xl border border-stone-200 bg-surface-container-lowest hover:border-stone-300 transition-colors">
                        <div className="flex items-center gap-2 font-bold text-stone-900 mb-1">
                          <span className="w-5 h-5 rounded-full bg-stone-100 border border-stone-200 text-meta flex items-center justify-center text-stone-600 font-mono">
                            #{ev.eventOrder}
                          </span>
                          <span className="text-meta">{ev.title}</span>
                        </div>
                        <p className="text-meta text-stone-600 leading-relaxed ml-7">{ev.summary}</p>
                      </div>
                    ))}
                  </div>

                  {(!timelineQuery.data || timelineQuery.data.length === 0) && (
                    <div className="py-12 text-center text-stone-400">
                      <span className="material-symbols-outlined text-[28px] text-stone-300 block mb-1">history_edu</span>
                      <p className="text-meta italic">Chưa có sự kiện mốc thời gian nào được ghi nhận.</p>
                    </div>
                  )}
                </>
              )}

              {storyBibleTab === 'summaries' && (
                <>
                  <div className="space-y-2.5">
                    {plotSummariesQuery.data?.map((s: PlotSummary) => (
                      <div key={s.summaryId} className="p-3.5 rounded-xl border border-stone-200 bg-surface-container-lowest hover:border-stone-300 transition-colors">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="material-symbols-outlined text-[16px] text-primary-600">bookmark</span>
                          <span className="font-bold text-stone-900 text-meta">{s.arcName || 'Tóm tắt phân cảnh'}</span>
                        </div>
                        <p className="text-meta text-stone-600 leading-relaxed ml-6">{s.summary}</p>
                      </div>
                    ))}
                  </div>

                  {(!plotSummariesQuery.data || plotSummariesQuery.data.length === 0) && (
                    <div className="py-12 text-center text-stone-400">
                      <span className="material-symbols-outlined text-[28px] text-stone-300 block mb-1">auto_stories</span>
                      <p className="text-meta italic">Chưa có tóm tắt hồi hay chương nào.</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between shrink-0">
              <div className="text-meta text-stone-500 hidden sm:flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-amber-500">lightbulb</span>
                <span>Dữ liệu Cẩm nang được AI Copilot tự động nạp để tạo gợi ý văn phong nhất quán.</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Link
                  to={activeNovelId ? `/author/context/${activeNovelId}` : '/author'}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-1.5 rounded-xl border border-stone-300 text-meta text-stone-700 hover:bg-stone-100 font-medium inline-flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px]">edit_note</span>
                  <span>Chỉnh sửa Cẩm nang ↗</span>
                </Link>
                <button
                  onClick={() => setStoryBibleOpen(false)}
                  className="px-4 py-1.5 rounded-xl bg-primary-600 text-white text-meta font-semibold hover:bg-primary-700 transition-colors shadow-2xs"
                  type="button"
                >
                  Đóng cẩm nang
                </button>
              </div>
            </div>
          </div>
        </div></AuthorDialog>
      )}

      {/* ──────────────────────────────────────────
          BEGIN: Publish Confirmation Modal
         ────────────────────────────────────────── */}
      {publishModalOpen && (
        <AuthorDialog onClose={() => setPublishModalOpen(false)}><div className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-stone-200 w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-primary-50 border border-primary-200 text-primary-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">send</span>
                </div>
                <div>
                  <h3 className="text-body font-bold text-stone-900">Xác nhận xuất bản chương</h3>
                  <p className="text-meta text-stone-500">Tác phẩm: {novelQuery.data?.title || '...'}</p>
                </div>
              </div>
              <button
                onClick={() => setPublishModalOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-700 rounded-md"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Summary Box */}
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 space-y-1.5 text-meta text-stone-700 mb-4">
              <div className="flex justify-between">
                <span className="text-stone-500">Tiêu đề chương:</span>
                <span className="font-semibold text-stone-900">{title || 'Chưa đặt tiêu đề'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Độ dài:</span>
                <span className="font-medium text-stone-800">
                  {wordCount.toLocaleString()} từ (~{readMinutes} phút đọc)
                </span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-stone-200/60">
                <span className="text-stone-500">Quyền truy cập:</span>
                <span
                  className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded text-meta ${
                    isVip
                      ? 'text-amber-700 bg-amber-50 border border-amber-200'
                      : 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                  }`}
                >
                  {isVip ? (
                    <>
                      <span className="material-symbols-outlined text-meta text-amber-500 fill-icon">stars</span>
                      Chương VIP ({priceCoins} Xu)
                    </>
                  ) : (
                    'Chương Miễn Phí'
                  )}
                </span>
              </div>
            </div>

            {/* Validation Checklist */}
            <PublishChecklist scope={activeDraftScope} title={title} content={content} isVip={isVip} price={priceCoins}
              saved={autosaveStatus === 'saved' && !persistence.dirty} saving={autosaveStatus === 'saving'} error={autosaveStatus === 'error'} scheduledAt={chapterQuery.data?.publicationSchedule?.status === 'PENDING' ? chapterQuery.data.publicationSchedule.scheduledAt : undefined} />

            {/* Moderation Notice */}
            <div className="p-2.5 rounded-lg bg-primary-50/60 border border-primary-100 text-meta text-stone-600 leading-relaxed mb-5 flex items-start gap-2">
              <span className="material-symbols-outlined text-primary-600 text-[16px] shrink-0 mt-0.5">info</span>
              <span>
                Hệ thống sẽ tự động quét từ khóa nhạy cảm và kiểm tra kiểm duyệt nội dung trước khi chương được độc giả đọc công khai.
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 text-meta">
              <button
                onClick={() => setPublishModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-100 font-medium transition-colors"
                type="button"
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending}
                className="px-4 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 font-semibold transition-all shadow-sm shadow-primary-200  disabled:opacity-50"
                type="button"
              >
                {publishMutation.isPending ? 'Đang gửi duyệt...' : 'Xác nhận gửi duyệt'}
              </button>
            </div>
          </div>
        </div></AuthorDialog>
      )}

      {/* ──────────────────────────────────────────
          BEGIN: Toast Notification
         ────────────────────────────────────────── */}

      {/* ──────────────────────────────────────────
          BEGIN: Author Memory & Consistency Drawer
         ────────────────────────────────────────── */}
      <AuthorMemoryPanel
        novelId={activeNovelId}
        chapterId={activeChapterId}
        content={content}
        opened={memoryPanelOpen}
        onClose={() => setMemoryPanelOpen(false)}
        saved={autosaveStatus === 'saved'}
      />
    </div>
  );
}
