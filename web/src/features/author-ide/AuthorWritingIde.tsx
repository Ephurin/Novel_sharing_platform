import { AuthorDialog } from '../../shared/components/AuthorTheme';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { createCopilotSuggestion } from '../ai-copilot/ai-copilot-api';
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

export function AuthorWritingIde() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // URL State
  const fallbackNovelId = localStorage.getItem('ephurin_author_novel_id') ?? '';
  const fallbackChapterId = localStorage.getItem('ephurin_author_chapter_id') ?? '';
  const novelId = searchParams.get('novelId') ?? fallbackNovelId;
  const chapterId = searchParams.get('chapterId') ?? fallbackChapterId;

  // Local Editor State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isVip, setIsVip] = useState(false);
  const [priceCoins, setPriceCoins] = useState(15);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<string>('');

  // UI Interactive Panels & Modals State
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 901px)').matches);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const toggleAiDrawer = () => {
    if (!aiDrawerOpen && window.matchMedia('(max-width: 1200px)').matches) setSidebarOpen(false);
    setAiDrawerOpen(open => !open);
  };
  const [storyBibleOpen, setStoryBibleOpen] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [chapterToDelete, setChapterToDelete] = useState<Chapter | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [formatToolbarVisible, setFormatToolbarVisible] = useState(true);

  // Rich Typography & Manuscript Formatting State
  const [fontOption, setFontOption] = useState<FontOption>(() => {
    return (localStorage.getItem('ephurin_editor_font') as FontOption) || 'vietnam';
  });
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('ephurin_editor_font_size');
    return saved ? Math.min(28, Math.max(13, Number(saved))) : 17;
  });
  const [lineHeight, setLineHeight] = useState<number>(() => {
    const saved = localStorage.getItem('ephurin_editor_line_height');
    return saved ? Number(saved) : 2.15;
  });
  const [textAlign, setTextAlign] = useState<TextAlignment>(() => {
    return (localStorage.getItem('ephurin_editor_text_align') as TextAlignment) || 'justify';
  });
  const [paragraphIndent, setParagraphIndent] = useState<boolean>(() => {
    const saved = localStorage.getItem('ephurin_editor_indent');
    return saved !== null ? saved === 'true' : true;
  });

  const [fontDropdownOpen, setFontDropdownOpen] = useState(false);
  const [spacingDropdownOpen, setSpacingDropdownOpen] = useState(false);
  const fontDropdownRef = useRef<HTMLDivElement>(null);
  const spacingDropdownRef = useRef<HTMLDivElement>(null);

  const [storyBibleTab, setStoryBibleTab] = useState<StoryBibleTab>('characters');
  const [chapterSearch, setChapterSearch] = useState('');

  // AI Assistant State
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiScope, setAiScope] = useState<'selection' | 'full' | 'bible'>('selection');
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiSuggestionTone, setAiSuggestionTone] = useState<string>('Trầm lắng • Hoài niệm');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // References for tracking changes
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedSnapshot = useRef({ title: '', content: '', isVip: false, priceCoins: 15 });
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Toast Helper
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3800);
  };

  // Queries
  const novelsQuery = useQuery({
    queryKey: ['author', 'my-novels'],
    queryFn: () => listMyNovels({ status: 'ALL' })
  });

  const activeNovelId = novelId || novelsQuery.data?.[0]?.novelId || '';

  const novelQuery = useQuery({
    queryKey: ['author', 'novel', activeNovelId],
    queryFn: () => getNovel(activeNovelId),
    enabled: Boolean(activeNovelId)
  });

  const chaptersQuery = useQuery({
    queryKey: ['author', 'chapters', activeNovelId],
    queryFn: () => listChapters(activeNovelId),
    enabled: Boolean(activeNovelId)
  });

  const activeChapterId = useMemo(() => {
    if (chapterId) return chapterId;
    return chaptersQuery.data?.[0]?.chapterId || '';
  }, [chapterId, chaptersQuery.data]);

  const chapterQuery = useQuery({
    queryKey: ['author', 'chapter', activeChapterId],
    queryFn: () => getChapter(activeChapterId),
    enabled: Boolean(activeChapterId)
  });

  // Story Bible Queries
  const charactersQuery = useQuery({
    queryKey: ['author', 'story-context', 'characters', activeNovelId],
    queryFn: () => listCharacters(activeNovelId),
    enabled: storyBibleOpen && Boolean(activeNovelId)
  });

  const relationshipsQuery = useQuery({
    queryKey: ['author', 'story-context', 'relationships', activeNovelId],
    queryFn: () => listCharacterRelationships(activeNovelId),
    enabled: storyBibleOpen && Boolean(activeNovelId)
  });

  const timelineQuery = useQuery({
    queryKey: ['author', 'story-context', 'timeline', activeNovelId],
    queryFn: () => listTimelineEvents(activeNovelId),
    enabled: storyBibleOpen && Boolean(activeNovelId)
  });

  const plotSummariesQuery = useQuery({
    queryKey: ['author', 'story-context', 'summaries', activeNovelId],
    queryFn: () => listPlotSummaries(activeNovelId),
    enabled: storyBibleOpen && Boolean(activeNovelId)
  });

  // Keep search params in sync
  useEffect(() => {
    if (activeNovelId && activeChapterId) {
      localStorage.setItem('ephurin_author_novel_id', activeNovelId);
      localStorage.setItem('ephurin_author_chapter_id', activeChapterId);
      if (searchParams.get('novelId') !== activeNovelId || searchParams.get('chapterId') !== activeChapterId) {
        setSearchParams({ novelId: activeNovelId, chapterId: activeChapterId }, { replace: true });
      }
    }
  }, [activeNovelId, activeChapterId, searchParams, setSearchParams]);

  // Load chapter data into editor when chapter changes
  useEffect(() => {
    if (chapterQuery.data) {
      const ch = chapterQuery.data;
      const initialTitle = ch.draft?.title ?? ch.title ?? '';
      const initialContent = ch.draft?.content ?? ch.content ?? '';
      const initialVip = Boolean(ch.isVip);
      const initialPrice = ch.priceCoins ?? 15;

      setTitle(initialTitle);
      setContent(initialContent);
      setIsVip(initialVip);
      setPriceCoins(initialPrice);

      lastSavedSnapshot.current = {
        title: initialTitle,
        content: initialContent,
        isVip: initialVip,
        priceCoins: initialPrice
      };
      setAutosaveStatus('saved');
      setLastSavedTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
    }
  }, [chapterQuery.data]);

  // The outer workspace scrolls; the manuscript and textarea keep their full height.
  const adjustHeight = () => {
    const el = editorRef.current;
    if (!el) return;
    const viewport = el.closest<HTMLElement>('.sc-editor-workspace');
    const scrollTop = viewport?.scrollTop ?? 0;
    el.style.height = 'auto';
    el.style.height = `${Math.max(520, Math.ceil(el.scrollHeight) + 2)}px`;
    if (viewport) viewport.scrollTop = scrollTop;
  };

  useEffect(() => {
    adjustHeight();
  }, [content, fontOption, fontSize, lineHeight, textAlign, paragraphIndent]);

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
    localStorage.setItem('ephurin_editor_font', fontOption);
  }, [fontOption]);

  useEffect(() => {
    localStorage.setItem('ephurin_editor_font_size', String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('ephurin_editor_line_height', String(lineHeight));
  }, [lineHeight]);

  useEffect(() => {
    localStorage.setItem('ephurin_editor_text_align', textAlign);
  }, [textAlign]);

  useEffect(() => {
    localStorage.setItem('ephurin_editor_indent', String(paragraphIndent));
  }, [paragraphIndent]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fontDropdownRef.current && !fontDropdownRef.current.contains(event.target as Node)) {
        setFontDropdownOpen(false);
      }
      if (spacingDropdownRef.current && !spacingDropdownRef.current.contains(event.target as Node)) {
        setSpacingDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const currentFontConfig = useMemo(() => {
    return AVAILABLE_FONTS.find((f) => f.id === fontOption) || AVAILABLE_FONTS[0];
  }, [fontOption]);

  // Selection & prose formatting helpers
  const wrapSelection = (prefix: string, suffix: string = prefix, placeholder: string = 'văn bản') => {
    const textarea = editorRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;

    let newContent = '';
    let newCursorStart = start;
    let newCursorEnd = end;

    if (start !== end) {
      const selected = currentVal.substring(start, end);
      newContent = currentVal.substring(0, start) + prefix + selected + suffix + currentVal.substring(end);
      newCursorStart = start + prefix.length;
      newCursorEnd = end + prefix.length;
    } else {
      newContent = currentVal.substring(0, start) + prefix + placeholder + suffix + currentVal.substring(end);
      newCursorStart = start + prefix.length;
      newCursorEnd = start + prefix.length + placeholder.length;
    }

    setContent(newContent);
    triggerAutosave(title, newContent, isVip, priceCoins);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorStart, newCursorEnd);
      adjustHeight();
    }, 10);
  };

  const insertDialogueDash = () => {
    const textarea = editorRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const currentVal = textarea.value;
    const prefix = '— ';
    const newContent = currentVal.substring(0, start) + prefix + currentVal.substring(start);
    setContent(newContent);
    triggerAutosave(title, newContent, isVip, priceCoins);

    setTimeout(() => {
      textarea.focus();
      const pos = start + prefix.length;
      textarea.setSelectionRange(pos, pos);
      adjustHeight();
    }, 10);
  };

  // Autosave Mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: { title?: string; content?: string; isVip?: boolean; priceCoins?: number }) => {
      if (!activeChapterId) throw new Error('No chapter selected');
      return updateChapter(activeChapterId, { ...payload, autosave: true });
    },
    onSuccess: (updated: Chapter) => {
      setAutosaveStatus('saved');
      setLastSavedTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
      lastSavedSnapshot.current = {
        title,
        content,
        isVip,
        priceCoins
      };
      queryClient.setQueryData(['author', 'chapter', activeChapterId], updated);
      queryClient.invalidateQueries({ queryKey: ['author', 'chapters', activeNovelId] });
    },
    onError: () => {
      setAutosaveStatus('error');
    }
  });

  // Debounced Autosave Trigger
  const triggerAutosave = (newTitle: string, newContent: string, newIsVip: boolean, newPrice: number) => {
    if (!activeChapterId) return;

    const hasChanged =
      newTitle !== lastSavedSnapshot.current.title ||
      newContent !== lastSavedSnapshot.current.content ||
      newIsVip !== lastSavedSnapshot.current.isVip ||
      newPrice !== lastSavedSnapshot.current.priceCoins;

    if (!hasChanged) return;

    setAutosaveStatus('saving');
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(() => {
      saveMutation.mutate({
        title: newTitle,
        content: newContent,
        isVip: newIsVip,
        priceCoins: newIsVip ? Math.max(1, newPrice) : 0
      });
    }, 1200);
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    triggerAutosave(val, content, isVip, priceCoins);
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    triggerAutosave(title, val, isVip, priceCoins);
  };

  const handleAccessChange = (mode: AccessMode) => {
    const nextIsVip = mode === 'vip';
    setIsVip(nextIsVip);
    triggerAutosave(title, content, nextIsVip, priceCoins);
  };

  const handlePriceChange = (val: number) => {
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
      // Save current content first if unsaved
      await updateChapter(activeChapterId, {
        title,
        content,
        isVip,
        priceCoins: isVip ? priceCoins : 0,
        autosave: false
      });
      return submitChapterPublish(activeChapterId);
    },
    onSuccess: (res: { chapterId: string; status: Chapter['status']; moderationRequired: boolean }) => {
      setPublishModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['author', 'chapter', activeChapterId] });
      queryClient.invalidateQueries({ queryKey: ['author', 'chapters', activeNovelId] });
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

  // AI Copilot Mutation
  const handleGenerateAi = async (instructionText?: string) => {
    if (!activeNovelId) return;
    const finalInstruction = instructionText || aiInstruction;
    if (!finalInstruction.trim()) return;

    setIsGeneratingAi(true);
    try {
      const recentSnippet = content.slice(-1500) || 'Bắt đầu câu chuyện mới...';
      const result = await createCopilotSuggestion({
        novelId: activeNovelId,
        chapterId: activeChapterId || null,
        instruction: finalInstruction,
        recentText: recentSnippet
      });
      setAiSuggestion(result.suggestion);
      setAiSuggestionTone(result.context?.characters?.length ? 'Bám sát nhân vật & bối cảnh' : 'Trầm lắng • Văn học');
    } catch (err) {
      showToast(`Lỗi AI: ${getApiErrorMessage(err)}`);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const insertAiText = (action: 'insert' | 'replace') => {
    if (!aiSuggestion) return;
    if (action === 'insert') {
      const separator = content.trim().length ? '\n\n' : '';
      const updated = content + separator + aiSuggestion;
      setContent(updated);
      triggerAutosave(title, updated, isVip, priceCoins);
      showToast('Đã chèn nội dung AI vào bản thảo');
    } else {
      setContent(aiSuggestion);
      triggerAutosave(title, aiSuggestion, isVip, priceCoins);
      showToast('Đã thay thế nội dung bản thảo bằng gợi ý AI');
    }
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

  return (
    <div className="sc-writing-studio h-screen flex flex-col text-stone-800 antialiased overflow-hidden select-none bg-surface">
      {/* ──────────────────────────────────────────
          BEGIN: TopHeader
         ────────────────────────────────────────── */}
      <section className="sc-studio-toolbar h-14 border-b border-stone-200/90 bg-surface-subtle/95 backdrop-blur-md px-3 md:px-4 flex items-center justify-between shrink-0 z-30">
        {/* Left: Return link, Breadcrumb & Autosave indicator */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            to={activeNovelId ? `/author/novels/${activeNovelId}` : '/author'}
            className="inline-flex items-center gap-1 text-meta font-medium text-stone-500 hover:text-stone-900 transition-colors py-1 px-2 rounded-md hover:bg-stone-200/60 shrink-0"
            title="Quay lại danh sách tác phẩm"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span className="hidden sm:inline">Tủ truyện</span>
          </Link>
          <div className="h-3.5 w-px bg-stone-300 shrink-0"></div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-meta text-stone-500 truncate">
            <span
              onClick={() => navigate(activeNovelId ? `/author/novels/${activeNovelId}` : '/author')}
              className="font-medium text-stone-600 hover:text-stone-900 cursor-pointer truncate max-w-[130px] md:max-w-[160px]"
            >
              {novelQuery.data?.title || 'Đang tải truyện...'}
            </span>
            <span className="text-stone-300">/</span>
            <span
              className="font-semibold text-stone-900 truncate max-w-[150px] lg:max-w-[200px]"
              title={title || 'Chương đang soạn'}
            >
              {title || 'Chương mới'}
            </span>
          </nav>

          {/* Autosave Indicator */}
          <div className="hidden md:flex items-center gap-1.5 ml-1.5 px-2 py-0.5 rounded-full bg-emerald-50/80 border border-emerald-200/60 text-meta text-emerald-700 font-medium shrink-0">
            {autosaveStatus === 'saving' ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                <span>Đang lưu...</span>
              </>
            ) : autosaveStatus === 'error' ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                <span className="text-red-600">Lỗi lưu đám mây</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Đã lưu • {lastSavedTime || 'Mới nhất'}</span>
              </>
            )}
          </div>
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
          <div className="flex items-center bg-stone-100/70 p-0.5 rounded-lg border border-stone-200/80">
            <button
              onClick={() => setFormatToolbarVisible((visible) => !visible)}
              aria-label={formatToolbarVisible ? 'Ẩn thanh công cụ' : 'Hiện thanh công cụ'}
              aria-expanded={formatToolbarVisible}
              aria-controls="studio-format-toolbar"
              title={formatToolbarVisible ? 'Ẩn thanh công cụ' : 'Hiện thanh công cụ'}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-stone-700 hover:text-stone-900 hover:bg-white transition-all"
              type="button"
            >
              <span className="material-symbols-outlined text-stone-500 text-[15px]">text_format</span>
            </button>
            <button
              onClick={() => setStoryBibleOpen(true)}
              className="inline-flex items-center gap-1 px-2 py-1 text-meta font-medium rounded-md text-stone-700 hover:text-stone-900 hover:bg-white transition-all"
              title="Cẩm nang thế giới truyện (Story Bible)"
              type="button"
            >
              <span className="material-symbols-outlined text-stone-500 text-[15px]">menu_book</span>
              <span className="hidden xl:inline text-meta">Cẩm nang</span>
            </button>
            <button
              onClick={() => setFocusMode((prev: boolean) => !prev)}
              className="inline-flex items-center gap-1 px-2 py-1 text-meta font-medium rounded-md text-stone-700 hover:text-stone-900 hover:bg-white transition-all"
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
      {!focusMode && (
        <section className="h-11 border-b border-stone-200/80 bg-white/90 backdrop-blur-sm px-4 flex items-center justify-between shrink-0 z-20 text-meta">
          {/* Left: Sidebar toggle & Publication Status */}
          <div className="flex items-center gap-3">
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
              <div className="text-meta text-stone-400 hidden lg:inline">
                • Tác phẩm: <strong className="text-stone-600 font-medium">{novelQuery.data?.title || '...'}</strong>
              </div>
            </div>
          </div>

          {/* Right: VIP / Free segmented switch with Coin price input */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200">
              <button
                onClick={() => handleAccessChange('free')}
                className={`px-2.5 py-1 rounded-md text-meta transition-colors ${
                  !isVip
                    ? 'font-semibold bg-white text-stone-900 shadow-2xs border border-stone-200/60'
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
                    ? 'font-semibold bg-white text-primary-700 shadow-2xs border border-stone-200/60'
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
                    className="w-12 h-6 text-center text-meta font-semibold rounded border-stone-300 bg-white py-0 px-1 focus:ring-primary-500 focus:border-primary-500 text-stone-800"
                  />
                  <span className="text-meta font-semibold text-amber-700">Xu</span>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ──────────────────────────────────────────
          BEGIN: MainWorkspace
         ────────────────────────────────────────── */}
      <div className="sc-studio-body flex-1 min-h-0 flex overflow-hidden relative">
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
                  className="w-full bg-white text-meta pl-8 pr-2.5 py-1.5 rounded-lg border border-stone-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 placeholder-stone-400"
                />
              </div>
            </div>

            {/* Add New Chapter Button */}
            <div className="px-2.5 py-1.5">
              <button
                onClick={() => createChapterMutation.mutate()}
                disabled={createChapterMutation.isPending}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 text-meta font-semibold rounded-lg border border-dashed border-stone-300 bg-white/70 hover:bg-white hover:border-primary-400 text-stone-700 hover:text-primary-600 transition-all shadow-2xs group"
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
                  <div
                    key={ch.chapterId}
                    onClick={() => {
                      if (!isActive) {
                        setSearchParams({ novelId: activeNovelId, chapterId: ch.chapterId });
                      }
                    }}
                    className={`block p-2 rounded-lg border transition-all cursor-pointer relative ${
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
                  </div>
                );
              })}
            </nav>
          </aside>
        )}

        {/* ──────────────────────────────────────────
            BEGIN: ManuscriptWritingArea
           ────────────────────────────────────────── */}
        <main className="sc-editor-workspace flex-1 min-h-0 overflow-y-auto flex flex-col items-center bg-surface relative select-text">
          {/* Sticky Formatting Toolbar with Frosted-Glass Backdrop */}
          {formatToolbarVisible && (
            <div id="studio-format-toolbar" className="sc-format-toolbar sticky top-0 z-20 w-full py-2 px-3 sm:px-4 bg-surface/95 backdrop-blur-md border-b border-stone-200/60 flex items-center justify-center mb-6 shrink-0 shadow-2xs">
              <div className="bg-white/95 border border-stone-200/90 rounded-xl shadow-xs py-1 px-2.5 flex items-center flex-wrap gap-1 max-w-4xl text-meta text-stone-700 select-none">
                {/* 1. Font Family Dropdown */}
                <div className="relative" ref={fontDropdownRef}>
                  <button
                    onClick={() => setFontDropdownOpen((prev) => !prev)}
                    className="font-medium flex items-center gap-1.5 hover:text-stone-900 px-2 py-1 rounded-lg hover:bg-stone-100 transition-colors border border-transparent hover:border-stone-200 text-stone-800"
                    title="Đổi kiểu chữ (7 phông chữ Việt hóa)"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[16px] text-stone-500">text_fields</span>
                    <span className="font-semibold text-meta tracking-tight" style={{ fontFamily: currentFontConfig.fontFamily }}>
                      {currentFontConfig.name}
                    </span>
                    <span className="material-symbols-outlined text-[15px] text-stone-400">
                      {fontDropdownOpen ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>

                  {/* Dropdown Menu */}
                  {fontDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-80 bg-white rounded-xl shadow-sm border border-stone-200 py-2 px-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                      <div className="px-2.5 py-1 mb-1 border-b border-stone-100 flex items-center justify-between">
                        <span className="text-meta font-bold uppercase tracking-wider text-stone-400">
                          Phông chữ soạn thảo ({AVAILABLE_FONTS.length})
                        </span>
                        <span className="text-meta text-primary-600 font-medium">Hỗ trợ tiếng Việt</span>
                      </div>

                      <div className="max-h-72 overflow-y-auto space-y-0.5 py-1">
                        {/* Serif category */}
                        <div className="px-2.5 pt-1.5 pb-0.5 text-meta font-bold text-stone-400 uppercase tracking-wider">
                          Chữ có chân (Serif)
                        </div>
                        {AVAILABLE_FONTS.filter((f) => f.category === 'Serif (Có chân)').map((f) => (
                          <button
                            key={f.id}
                            onClick={() => {
                              setFontOption(f.id);
                              setFontDropdownOpen(false);
                            }}
                            type="button"
                            className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between transition-colors ${
                              fontOption === f.id
                                ? 'bg-primary-50/80 text-primary-700 font-semibold border border-primary-100'
                                : 'hover:bg-stone-50 text-stone-800'
                            }`}
                          >
                            <div>
                              <div className="text-body font-medium" style={{ fontFamily: f.fontFamily }}>
                                {f.name}
                              </div>
                              <div className="text-meta text-stone-400 leading-tight mt-0.5">{f.tagline}</div>
                            </div>
                            {fontOption === f.id && (
                              <span className="material-symbols-outlined text-[16px] text-primary-600 shrink-0">check</span>
                            )}
                          </button>
                        ))}

                        {/* Sans category */}
                        <div className="px-2.5 pt-2 pb-0.5 text-meta font-bold text-stone-400 uppercase tracking-wider">
                          Chữ không chân (Sans-serif)
                        </div>
                        {AVAILABLE_FONTS.filter((f) => f.category === 'Sans-serif (Không chân)').map((f) => (
                          <button
                            key={f.id}
                            onClick={() => {
                              setFontOption(f.id);
                              setFontDropdownOpen(false);
                            }}
                            type="button"
                            className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between transition-colors ${
                              fontOption === f.id
                                ? 'bg-primary-50/80 text-primary-700 font-semibold border border-primary-100'
                                : 'hover:bg-stone-50 text-stone-800'
                            }`}
                          >
                            <div>
                              <div className="text-body font-medium" style={{ fontFamily: f.fontFamily }}>
                                {f.name}
                              </div>
                              <div className="text-meta text-stone-400 leading-tight mt-0.5">{f.tagline}</div>
                            </div>
                            {fontOption === f.id && (
                              <span className="material-symbols-outlined text-[16px] text-primary-600 shrink-0">check</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-4 w-px bg-stone-200 mx-1"></div>

                {/* 2. Font Size Stepper */}
                <div className="flex items-center bg-stone-100/80 rounded-lg p-0.5 border border-stone-200/60" title="Cỡ chữ">
                  <button
                    onClick={() => setFontSize((prev) => Math.max(13, prev - 1))}
                    disabled={fontSize <= 13}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-white text-stone-600 hover:text-stone-900 disabled:opacity-30 disabled:hover:bg-transparent font-medium text-meta transition-colors"
                    title="Giảm cỡ chữ (A-)"
                    type="button"
                  >
                    A-
                  </button>
                  <span className="w-8 text-center font-mono font-semibold text-meta text-stone-700 select-none">
                    {fontSize}
                  </span>
                  <button
                    onClick={() => setFontSize((prev) => Math.min(28, prev + 1))}
                    disabled={fontSize >= 28}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-white text-stone-600 hover:text-stone-900 disabled:opacity-30 disabled:hover:bg-transparent font-medium text-meta transition-colors"
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
                      textAlign === 'justify' ? 'bg-white text-primary-700 shadow-2xs font-bold' : 'text-stone-500 hover:text-stone-800'
                    }`}
                    title="Căn đều hai bên (Chuẩn sách xuất bản)"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[15px]">format_align_justify</span>
                  </button>
                  <button
                    onClick={() => setTextAlign('left')}
                    className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                      textAlign === 'left' ? 'bg-white text-primary-700 shadow-2xs font-bold' : 'text-stone-500 hover:text-stone-800'
                    }`}
                    title="Căn trái"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[15px]">format_align_left</span>
                  </button>
                  <button
                    onClick={() => setTextAlign('center')}
                    className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                      textAlign === 'center' ? 'bg-white text-primary-700 shadow-2xs font-bold' : 'text-stone-500 hover:text-stone-800'
                    }`}
                    title="Căn giữa (Thơ, tiêu đề phụ, lời đề từ)"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[15px]">format_align_center</span>
                  </button>
                  <button
                    onClick={() => setTextAlign('right')}
                    className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                      textAlign === 'right' ? 'bg-white text-primary-700 shadow-2xs font-bold' : 'text-stone-500 hover:text-stone-800'
                    }`}
                    title="Căn phải (Ký tên, ngày tháng, xuất xứ)"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[15px]">format_align_right</span>
                  </button>
                </div>

                <div className="h-4 w-px bg-stone-200 mx-1"></div>

                {/* 4. Line Spacing & Indent */}
                <div className="relative" ref={spacingDropdownRef}>
                  <button
                    onClick={() => setSpacingDropdownOpen((prev) => !prev)}
                    className="h-7 px-2 flex items-center gap-1 rounded-lg hover:bg-stone-100 text-stone-600 hover:text-stone-900 text-meta transition-colors border border-transparent hover:border-stone-200"
                    title="Khoảng cách giãn dòng (Line-height)"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[15px] text-stone-500">format_line_spacing</span>
                    <span className="font-mono text-meta font-medium">{lineHeight}x</span>
                    <span className="material-symbols-outlined text-body text-stone-400">expand_more</span>
                  </button>

                  {spacingDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-48 bg-white rounded-xl shadow-sm border border-stone-200 p-1.5 z-50 animate-in fade-in duration-100">
                      <div className="px-2 py-1 text-meta font-bold text-stone-400 uppercase tracking-wider">
                        Giãn dòng bản thảo
                      </div>
                      {[
                        { val: 1.8, label: '1.8x • Gọn gàng' },
                        { val: 2.15, label: '2.15x • Chuẩn tiểu thuyết' },
                        { val: 2.5, label: '2.5x • Rộng rãi, thoáng' }
                      ].map((opt) => (
                        <button
                          key={opt.val}
                          onClick={() => {
                            setLineHeight(opt.val);
                            setSpacingDropdownOpen(false);
                          }}
                          type="button"
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-meta flex items-center justify-between transition-colors ${
                            lineHeight === opt.val
                              ? 'bg-primary-50 text-primary-700 font-semibold'
                              : 'hover:bg-stone-50 text-stone-700'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {lineHeight === opt.val && (
                            <span className="material-symbols-outlined text-[15px] text-primary-600">check</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
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
                  type="button"
                >
                  <span className="material-symbols-outlined text-[15px]">format_indent_increase</span>
                  <span className="text-meta hidden md:inline">Thụt dòng</span>
                </button>

                <div className="h-4 w-px bg-stone-200 mx-1"></div>

                {/* 5. Inline Formatting Tools */}
                <button
                  onClick={() => wrapSelection('**', '**', 'văn bản in đậm')}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-100 text-stone-700 hover:text-stone-900 transition-colors font-bold text-meta"
                  title="In đậm (**văn bản**)"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">format_bold</span>
                </button>

                <button
                  onClick={() => wrapSelection('*', '*', 'văn bản in nghiêng')}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-100 text-stone-700 hover:text-stone-900 transition-colors italic text-meta"
                  title="In nghiêng (*văn bản*)"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">format_italic</span>
                </button>

                <button
                  onClick={() => wrapSelection('<u>', '</u>', 'văn bản gạch chân')}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-100 text-stone-700 hover:text-stone-900 transition-colors text-meta"
                  title="Gạch chân (<u>văn bản</u>)"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">format_underlined</span>
                </button>

                <button
                  onClick={() => wrapSelection('~~', '~~', 'văn bản gạch ngang')}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-100 text-stone-700 hover:text-stone-900 transition-colors text-meta"
                  title="Gạch ngang (~~văn bản~~)"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">strikethrough_s</span>
                </button>

                <button
                  onClick={() => wrapSelection('“', '”', 'lời thoại nhân vật')}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-100 text-stone-700 hover:text-stone-900 font-serif text-body transition-colors"
                  title="Trích dẫn lời thoại “...”"
                  type="button"
                >
                  “”
                </button>

                <button
                  onClick={insertDialogueDash}
                  className="px-1.5 h-7 flex items-center justify-center rounded-md hover:bg-stone-100 text-stone-700 hover:text-stone-900 font-serif text-meta transition-colors"
                  title="Gạch đầu dòng lời thoại (— )"
                  type="button"
                >
                  —
                </button>


              </div>
            </div>
          )}

          {/* Centered Manuscript Page */}
          <article className="sc-manuscript-page w-full max-w-3xl shrink-0 bg-white rounded-xl shadow-sm border border-stone-200/70">
            {/* Editable Chapter Title Header */}
            <div className="mb-8 pb-5 border-b border-stone-100">
              <input
                type="text"
                value={title}
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
            <div className="w-full min-h-[500px]">
              <textarea
                ref={editorRef}
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
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
            </div>
          </article>
        </main>

        {/* ──────────────────────────────────────────
            BEGIN: Docked AI Assistant
           ────────────────────────────────────────── */}
        {aiDrawerOpen && (
          <aside id="studio-ai-panel" aria-label="Trợ lý sáng tác AI" className="sc-ai-panel bg-white border-l border-stone-200 flex flex-col select-none">
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
                onClick={() => setAiDrawerOpen(false)}
                className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 transition-colors"
                title="Đóng trợ lý"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Context Scope Selector */}
            <div className="px-3 py-2 border-b border-stone-100 bg-white flex items-center justify-between text-meta">
              <span className="text-stone-500 font-medium">Phạm vi ngữ cảnh:</span>
              <select
                value={aiScope}
                onChange={(e) => setAiScope(e.target.value as any)}
                className="text-meta py-0.5 px-2 rounded-md border-stone-200 bg-stone-50 text-stone-700 focus:ring-primary-500 focus:border-primary-500 font-medium"
              >
                <option value="selection">Đoạn văn vừa viết</option>
                <option value="full">Toàn bộ chương hiện tại</option>
                <option value="bible">Story Bible (Nhân vật & Sự kiện)</option>
              </select>
            </div>

            {/* Quick Action Chips */}
            <div className="p-3 border-b border-stone-100 bg-stone-50/40">
              <span className="text-meta font-bold uppercase text-stone-400 tracking-wider block mb-2">
                Tác vụ văn học nhanh
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => handleGenerateAi('Viết tiếp phân cảnh này tự nhiên bám sát giọng văn')}
                  className="text-left px-2.5 py-1.5 rounded-md border border-stone-200 bg-white hover:border-primary-400 hover:text-primary-600 text-meta font-medium text-stone-700 shadow-2xs transition-all flex items-center gap-1.5"
                  type="button"
                >
                  <span>✍️</span> <span>Viết tiếp</span>
                </button>
                <button
                  onClick={() => handleGenerateAi('Gọt giũa và nâng tầm đoạn văn, giàu hình ảnh biểu cảm hơn')}
                  className="text-left px-2.5 py-1.5 rounded-md border border-stone-200 bg-white hover:border-primary-400 hover:text-primary-600 text-meta font-medium text-stone-700 shadow-2xs transition-all flex items-center gap-1.5"
                  type="button"
                >
                  <span>✨</span> <span>Gọt giũa văn phong</span>
                </button>
                <button
                  onClick={() => handleGenerateAi('Mô tả ngoại cảnh và không gian xung quanh sâu sắc')}
                  className="text-left px-2.5 py-1.5 rounded-md border border-stone-200 bg-white hover:border-primary-400 hover:text-primary-600 text-meta font-medium text-stone-700 shadow-2xs transition-all flex items-center gap-1.5"
                  type="button"
                >
                  <span>🎨</span> <span>Mô tả ngoại cảnh</span>
                </button>
                <button
                  onClick={() => handleGenerateAi('Gợi ý bước ngoặt và tình tiết bất ngờ tiếp theo cho cốt truyện')}
                  className="text-left px-2.5 py-1.5 rounded-md border border-stone-200 bg-white hover:border-primary-400 hover:text-primary-600 text-meta font-medium text-stone-700 shadow-2xs transition-all flex items-center gap-1.5"
                  type="button"
                >
                  <span>💡</span> <span>Gợi ý ý tưởng</span>
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
                <div className="bg-primary-50/70 border border-primary-100 rounded-xl p-3.5 text-stone-800 shadow-2xs">
                  <div className="flex items-center justify-between mb-2 text-meta font-semibold text-primary-700">
                    <span className="uppercase tracking-wide">Gợi ý từ AI Copilot</span>
                    <span className="bg-primary-100 px-1.5 py-0.2 rounded text-meta">{aiSuggestionTone}</span>
                  </div>
                  <p className="font-serif text-table leading-relaxed italic text-stone-700 bg-white/70 p-2.5 rounded-lg border border-primary-100/60 whitespace-pre-wrap">
                    {aiSuggestion}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-1.5 font-sans pt-1">
                    <button
                      onClick={() => insertAiText('insert')}
                      className="px-2 py-1.5 rounded bg-primary-600 text-white font-medium text-meta hover:bg-primary-700 text-center transition-all shadow-2xs "
                      type="button"
                    >
                      Chèn vào bản thảo
                    </button>
                    <button
                      onClick={() => insertAiText('replace')}
                      className="px-2 py-1.5 rounded bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 font-medium text-meta text-center transition-all"
                      type="button"
                    >
                      Thay thế nội dung
                    </button>
                  </div>
                </div>
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
            <div className="p-3 border-t border-stone-200 bg-white">
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
          </aside>
        )}
      </div>

      {/* ──────────────────────────────────────────
          BEGIN: Story Bible Modal
         ────────────────────────────────────────── */}
      {storyBibleOpen && (
        <AuthorDialog onClose={() => setStoryBibleOpen(false)}><div className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div
            style={{ height: '620px', maxHeight: '88vh' }}
            className="bg-white rounded-2xl shadow-sm border border-stone-200/90 w-full max-w-3xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
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
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 text-meta text-stone-700 hover:text-stone-900 hover:bg-white font-medium shadow-xs transition-colors"
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
            <div className="px-6 border-b border-stone-200 flex items-center gap-6 text-meta font-semibold bg-white text-stone-500 shrink-0">
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
                          className="p-3.5 rounded-xl border border-stone-200 bg-white hover:border-stone-300 hover:shadow-xs transition-all flex flex-col justify-between gap-2.5"
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
                      <div key={r.relationshipId} className="p-3.5 rounded-xl border border-stone-200 bg-white hover:border-stone-300 transition-colors">
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
                      <div key={ev.eventId} className="p-3.5 rounded-xl border border-stone-200 bg-white hover:border-stone-300 transition-colors">
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
                      <div key={s.summaryId} className="p-3.5 rounded-xl border border-stone-200 bg-white hover:border-stone-300 transition-colors">
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
          <div className="bg-white rounded-xl shadow-sm border border-stone-200 w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-200">
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
            <div className="mb-4">
              <span className="text-meta font-bold uppercase tracking-wider text-stone-400 block mb-2">
                Kiểm tra tiêu chuẩn xuất bản
              </span>
              <div className="space-y-1.5 text-meta">
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50/70 border border-emerald-200/70 px-2.5 py-1.5 rounded-md">
                  <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                  <span>Tiêu đề chương hợp lệ và đúng quy chuẩn</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50/70 border border-emerald-200/70 px-2.5 py-1.5 rounded-md">
                  <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                  <span>Bản thảo đã được lưu trữ tự động trên đám mây</span>
                </div>
              </div>
            </div>

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
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in  duration-300">
          <div className="flex items-center gap-2.5 bg-stone-900 text-white px-4 py-2.5 rounded-xl shadow-sm text-meta font-medium border border-stone-800">
            <span className="material-symbols-outlined text-emerald-400 text-[18px]">check_circle</span>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
