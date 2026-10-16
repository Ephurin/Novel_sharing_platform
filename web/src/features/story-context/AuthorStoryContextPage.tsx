import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getApiErrorMessage } from '../../shared/api/api-client';
import { getNovel, listChapters } from '../novels/novel-api';
import type { Chapter } from '../novels/novel-types';
import {
  createCharacter,
  createCharacterRelationship,
  createPlotSummary,
  createTimelineEvent,
  deleteCharacter,
  deleteCharacterRelationship,
  deletePlotSummary,
  deleteTimelineEvent,
  listCharacterRelationships,
  listCharacters,
  listPlotSummaries,
  listTimelineEvents,
  updateCharacter,
  updateCharacterRelationship,
  updatePlotSummary,
  updateTimelineEvent,
  type CreateCharacterPayload,
  type CreatePlotSummaryPayload,
  type CreateRelationshipPayload,
  type CreateTimelineEventPayload
} from './story-context-api';
import type {
  CharacterProfile,
  CharacterRelationship,
  CharacterRole,
  PlotSummary,
  PlotSummaryScope,
  StoryTimelineEvent
} from './story-context-types';
import { AppTopBar } from '../../shared/components/AppTopBar';

type StoryTab = 'characters' | 'relationships' | 'timeline' | 'summaries';
type RoleFilter = 'ALL' | 'PROTAGONIST' | 'SUPPORTING' | 'ANTAGONIST' | 'MINOR';

const characterRoles: { value: CharacterRole; label: string; badgeClass: string }[] = [
  { value: 'PROTAGONIST', label: 'Tuyến chính (Protagonist)', badgeClass: 'bg-primary-600 text-white' },
  { value: 'ANTAGONIST', label: 'Đối đầu / Phản diện (Antagonist)', badgeClass: 'bg-red-50 text-red-700 border border-red-200' },
  { value: 'SUPPORTING', label: 'Tuyến phụ (Supporting)', badgeClass: 'bg-primary-50 text-primary-700 border border-primary-200' },
  { value: 'MINOR', label: 'Quần chúng / Then chốt (Minor)', badgeClass: 'bg-stone-100 text-stone-600 border border-stone-200' }
];

export const ROLE_PRESET_TITLES: Record<CharacterRole, string[]> = {
  PROTAGONIST: ['Nam chính', 'Nữ chính', 'Nhân vật chính truyền kỳ', 'Người được chọn', 'Nhân vật chuyển sinh'],
  ANTAGONIST: ['Đại Boss / Kẻ chủ mưu', 'Kẻ thù truyền kiếp', 'Kình địch', 'Kẻ phản bội', 'Tà thần / Quỷ vương'],
  SUPPORTING: ['Sư phụ / Tiền bối', 'Huynh đệ tri kỷ', 'Quân sư / Cố vấn', 'Hộ vệ trung thành', 'Thân nhân gia đình', 'Bằng hữu'],
  MINOR: ['Nhân vật then chốt', 'Thương nhân bí ẩn', 'Người đưa tin', 'Khách qua đường', 'NPC hỗ trợ']
};

export function parseCharacterDescription(rawDesc: string | null | undefined): { customTitle: string; cleanDescription: string } {
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

export function formatCharacterDescription(customTitle: string, cleanDescription: string): string {
  const trimmedTitle = customTitle.trim();
  const trimmedDesc = cleanDescription.trim();
  if (trimmedTitle) {
    return `[Thân phận: ${trimmedTitle}]\n${trimmedDesc}`.trim();
  }
  return trimmedDesc;
}

const emptyCharacterForm: CreateCharacterPayload = {
  name: '',
  role: 'SUPPORTING',
  personality: '',
  description: '',
  notes: '',
  source: 'AUTHOR_MANUAL'
};

const emptyRelationshipForm: CreateRelationshipPayload = {
  sourceCharacterId: '',
  targetCharacterId: '',
  relationshipType: 'Bằng hữu tri kỷ',
  description: ''
};

const emptyTimelineForm: CreateTimelineEventPayload = {
  title: '',
  eventOrder: 1,
  chapterId: null,
  summary: '',
  source: 'AUTHOR_MANUAL'
};

const emptySummaryForm: CreatePlotSummaryPayload = {
  scope: 'NOVEL',
  arcName: '',
  chapterId: null,
  startChapterNumber: null,
  endChapterNumber: null,
  summary: '',
  source: 'AUTHOR_MANUAL'
};

// Avatar placeholder pool for character cards
const AVATAR_FALLBACKS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=160&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=160&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=160&q=80',
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=160&q=80'
];

export function AuthorStoryContextPage() {
  const { novelId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Tab & Filter State
  const [activeTab, setActiveTab] = useState<StoryTab>('characters');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [characterSearch, setCharacterSearch] = useState('');
  const [notice, setNotice] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Creation mode flags
  const [isCreatingCharacter, setIsCreatingCharacter] = useState(false);
  const [characterCustomTitle, setCharacterCustomTitle] = useState('');
  const [isCreatingRelationship, setIsCreatingRelationship] = useState(false);
  const [isCreatingTimeline, setIsCreatingTimeline] = useState(false);
  const [isCreatingSummary, setIsCreatingSummary] = useState(false);

  // Selection state
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedSummaryId, setSelectedSummaryId] = useState<string | null>(null);

  // Form states
  const [characterForm, setCharacterForm] = useState<CreateCharacterPayload>(emptyCharacterForm);
  const [relationshipForm, setRelationshipForm] = useState<CreateRelationshipPayload>(emptyRelationshipForm);
  const [timelineForm, setTimelineForm] = useState<CreateTimelineEventPayload>(emptyTimelineForm);
  const [summaryForm, setSummaryForm] = useState<CreatePlotSummaryPayload>(emptySummaryForm);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotice({ message, type });
    setTimeout(() => {
      setNotice(null);
    }, 4000);
  };

  // Queries
  const novelQuery = useQuery({
    queryKey: ['novel', novelId],
    queryFn: () => getNovel(novelId),
    enabled: Boolean(novelId)
  });

  const chaptersQuery = useQuery({
    queryKey: ['chapters', novelId],
    queryFn: () => listChapters(novelId),
    enabled: Boolean(novelId)
  });

  const charactersQuery = useQuery({
    queryKey: ['story-context', novelId, 'characters'],
    queryFn: () => listCharacters(novelId),
    enabled: Boolean(novelId)
  });

  const relationshipsQuery = useQuery({
    queryKey: ['story-context', novelId, 'relationships'],
    queryFn: () => listCharacterRelationships(novelId),
    enabled: Boolean(novelId)
  });

  const timelineQuery = useQuery({
    queryKey: ['story-context', novelId, 'timeline-events'],
    queryFn: () => listTimelineEvents(novelId),
    enabled: Boolean(novelId)
  });

  const summariesQuery = useQuery({
    queryKey: ['story-context', novelId, 'plot-summaries'],
    queryFn: () => listPlotSummaries(novelId),
    enabled: Boolean(novelId)
  });

  const characters = charactersQuery.data ?? [];
  const relationships = relationshipsQuery.data ?? [];
  const timelineEvents = timelineQuery.data ?? [];
  const plotSummaries = summariesQuery.data ?? [];
  const chapters = chaptersQuery.data ?? [];

  // Reset form states cleanly whenever novelId changes (switching novels)
  useEffect(() => {
    setIsCreatingCharacter(false);
    setSelectedCharacterId(null);
    setSelectedRelationshipId(null);
    setSelectedEventId(null);
    setSelectedSummaryId(null);
    setCharacterCustomTitle('');
    setCharacterForm(emptyCharacterForm);
    setRelationshipForm(emptyRelationshipForm);
    setTimelineForm(emptyTimelineForm);
    setSummaryForm(emptySummaryForm);
  }, [novelId]);

  // Default select first character if none selected and not creating
  useEffect(() => {
    if (isCreatingCharacter) return;
    if (characters.length > 0) {
      if (!selectedCharacterId || !characters.some((c: CharacterProfile) => c.characterId === selectedCharacterId)) {
        setSelectedCharacterId(characters[0].characterId);
      }
    } else {
      setSelectedCharacterId(null);
    }
  }, [characters, selectedCharacterId, isCreatingCharacter]);

  // Load character into form
  useEffect(() => {
    if (isCreatingCharacter) return;
    const ch = characters.find((c) => c.characterId === selectedCharacterId);
    if (ch) {
      const { customTitle, cleanDescription } = parseCharacterDescription(ch.description);
      setCharacterForm({
        name: ch.name,
        role: ch.role,
        personality: ch.personality ?? '',
        description: cleanDescription,
        notes: ch.notes ?? '',
        source: ch.source ?? 'AUTHOR_MANUAL'
      });
      setCharacterCustomTitle(customTitle);
    }
  }, [selectedCharacterId, characters, isCreatingCharacter]);

  // Load relationship into form
  useEffect(() => {
    if (isCreatingRelationship) return;
    const r = relationships.find((item) => item.relationshipId === selectedRelationshipId);
    if (r) {
      setRelationshipForm({
        sourceCharacterId: r.sourceCharacterId,
        targetCharacterId: r.targetCharacterId,
        relationshipType: r.relationshipType,
        description: r.description ?? ''
      });
    }
  }, [selectedRelationshipId, relationships, isCreatingRelationship]);

  // Load timeline event into form
  useEffect(() => {
    if (isCreatingTimeline) return;
    const ev = timelineEvents.find((item) => item.eventId === selectedEventId);
    if (ev) {
      setTimelineForm({
        title: ev.title,
        eventOrder: ev.eventOrder,
        chapterId: ev.chapterId,
        summary: ev.summary,
        source: ev.source ?? 'AUTHOR_MANUAL'
      });
    }
  }, [selectedEventId, timelineEvents, isCreatingTimeline]);

  // Load summary into form
  useEffect(() => {
    if (isCreatingSummary) return;
    const s = plotSummaries.find((item) => item.summaryId === selectedSummaryId);
    if (s) {
      setSummaryForm({
        scope: s.scope,
        arcName: s.arcName ?? '',
        chapterId: s.chapterId,
        startChapterNumber: s.startChapterNumber,
        endChapterNumber: s.endChapterNumber,
        summary: s.summary,
        source: s.source ?? 'AUTHOR_MANUAL'
      });
    }
  }, [selectedSummaryId, plotSummaries, isCreatingSummary]);

  const invalidateContext = async () => {
    await queryClient.invalidateQueries({ queryKey: ['story-context', novelId] });
  };

  // Mutations
  const characterMutation = useMutation({
    mutationFn: () => {
      const fullDescription = formatCharacterDescription(
        characterCustomTitle,
        characterForm.description ?? ''
      );
      const payload: CreateCharacterPayload = {
        ...characterForm,
        name: characterForm.name.trim(),
        personality: characterForm.personality?.trim() || null,
        description: fullDescription || null,
        notes: characterForm.notes?.trim() || null,
        source: 'AUTHOR_MANUAL'
      };
      return isCreatingCharacter || !selectedCharacterId
        ? createCharacter(novelId, payload)
        : updateCharacter(selectedCharacterId, payload);
    },
    onSuccess: async (ch) => {
      setIsCreatingCharacter(false);
      setSelectedCharacterId(ch.characterId);
      showToast(`Đã lưu hồ sơ nhân vật: ${ch.name}`);
      await invalidateContext();
    },
    onError: (err) => showToast(`Lỗi: ${getApiErrorMessage(err)}`, 'error')
  });

  const deleteCharacterMutation = useMutation({
    mutationFn: (id: string) => deleteCharacter(id),
    onSuccess: async () => {
      setIsCreatingCharacter(false);
      setSelectedCharacterId(null);
      setCharacterCustomTitle('');
      setCharacterForm(emptyCharacterForm);
      showToast('Đã lưu trữ / xóa nhân vật.');
      await invalidateContext();
    },
    onError: (err) => showToast(`Lỗi: ${getApiErrorMessage(err)}`, 'error')
  });

  const relationshipMutation = useMutation({
    mutationFn: () => {
      const payload: CreateRelationshipPayload = {
        ...relationshipForm,
        relationshipType: relationshipForm.relationshipType.trim(),
        description: relationshipForm.description?.trim() || null
      };
      return isCreatingRelationship || !selectedRelationshipId
        ? createCharacterRelationship(novelId, payload)
        : updateCharacterRelationship(selectedRelationshipId, payload);
    },
    onSuccess: async (r) => {
      setIsCreatingRelationship(false);
      setSelectedRelationshipId(r.relationshipId);
      showToast(`Đã lưu mối quan hệ: ${r.relationshipType}`);
      await invalidateContext();
    },
    onError: (err) => showToast(`Lỗi: ${getApiErrorMessage(err)}`, 'error')
  });

  const deleteRelationshipMutation = useMutation({
    mutationFn: (id: string) => deleteCharacterRelationship(id),
    onSuccess: async () => {
      setIsCreatingRelationship(false);
      setSelectedRelationshipId(null);
      setRelationshipForm(emptyRelationshipForm);
      showToast('Đã xóa mối quan hệ.');
      await invalidateContext();
    },
    onError: (err) => showToast(`Lỗi: ${getApiErrorMessage(err)}`, 'error')
  });

  const timelineMutation = useMutation({
    mutationFn: () => {
      const payload: CreateTimelineEventPayload = {
        ...timelineForm,
        title: timelineForm.title.trim(),
        eventOrder: Number(timelineForm.eventOrder),
        chapterId: timelineForm.chapterId || null,
        summary: timelineForm.summary.trim(),
        source: 'AUTHOR_MANUAL'
      };
      return isCreatingTimeline || !selectedEventId
        ? createTimelineEvent(novelId, payload)
        : updateTimelineEvent(selectedEventId, payload);
    },
    onSuccess: async (ev) => {
      setIsCreatingTimeline(false);
      setSelectedEventId(ev.eventId);
      showToast(`Đã lưu sự kiện timeline: ${ev.title}`);
      await invalidateContext();
    },
    onError: (err) => showToast(`Lỗi: ${getApiErrorMessage(err)}`, 'error')
  });

  const deleteTimelineMutation = useMutation({
    mutationFn: (id: string) => deleteTimelineEvent(id),
    onSuccess: async () => {
      setIsCreatingTimeline(false);
      setSelectedEventId(null);
      setTimelineForm(emptyTimelineForm);
      showToast('Đã xóa mốc thời gian.');
      await invalidateContext();
    },
    onError: (err) => showToast(`Lỗi: ${getApiErrorMessage(err)}`, 'error')
  });

  const summaryMutation = useMutation({
    mutationFn: () => {
      const payload: CreatePlotSummaryPayload = {
        scope: summaryForm.scope,
        arcName: summaryForm.scope === 'ARC' ? summaryForm.arcName?.trim() || null : null,
        chapterId: summaryForm.scope === 'CHAPTER' ? summaryForm.chapterId || null : null,
        startChapterNumber: summaryForm.scope === 'ARC' ? summaryForm.startChapterNumber || null : null,
        endChapterNumber: summaryForm.scope === 'ARC' ? summaryForm.endChapterNumber || null : null,
        summary: summaryForm.summary.trim(),
        source: 'AUTHOR_MANUAL'
      };
      return isCreatingSummary || !selectedSummaryId
        ? createPlotSummary(novelId, payload)
        : updatePlotSummary(selectedSummaryId, payload);
    },
    onSuccess: async (s) => {
      setIsCreatingSummary(false);
      setSelectedSummaryId(s.summaryId);
      showToast('Đã lưu bản tóm tắt cốt truyện.');
      await invalidateContext();
    },
    onError: (err) => showToast(`Lỗi: ${getApiErrorMessage(err)}`, 'error')
  });

  const deleteSummaryMutation = useMutation({
    mutationFn: (id: string) => deletePlotSummary(id),
    onSuccess: async () => {
      setIsCreatingSummary(false);
      setSelectedSummaryId(null);
      setSummaryForm(emptySummaryForm);
      showToast('Đã xóa tóm tắt hồi.');
      await invalidateContext();
    },
    onError: (err) => showToast(`Lỗi: ${getApiErrorMessage(err)}`, 'error')
  });

  // Filtered Characters
  const filteredCharacters = useMemo(() => {
    return characters.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(characterSearch.toLowerCase()) ||
        (c.description && c.description.toLowerCase().includes(characterSearch.toLowerCase()));
      const matchesRole = roleFilter === 'ALL' || c.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [characters, characterSearch, roleFilter]);

  // Export Bible as JSON File
  const handleExportBible = () => {
    const data = {
      novel: novelQuery.data?.title || 'Unknown Novel',
      exportedAt: new Date().toISOString(),
      characters,
      relationships,
      timelineEvents,
      plotSummaries
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `StoryBible_${novelQuery.data?.title || novelId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã xuất file Story Bible thành công!');
  };

  const handleSyncCopilot = async () => {
    await invalidateContext();
    showToast(`Đã đồng bộ ${characters.length} nhân vật & bối cảnh vào AI Copilot!`);
  };

  const selectedCharacter = characters.find((c) => c.characterId === selectedCharacterId);

  return (
    <div className="min-h-screen bg-[#f7f6f2] text-stone-800 antialiased flex flex-col font-body-md select-text selection:bg-primary-100 selection:text-primary-800">
      <AppTopBar active="works" onWrite={() => navigate(`/author/ide?novelId=${novelId}`)} />

      {/* ──────────────────────────────────────────
          2. Toast Notification
         ────────────────────────────────────────── */}
      {notice && (
        <div className="fixed bottom-5 right-5 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div
            className={`px-4 py-2.5 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-2 ${
              notice.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-primary-900 border-primary-800 text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">
              {notice.type === 'error' ? 'error' : 'check_circle'}
            </span>
            <span>{notice.message}</span>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────
          3. Main Page Content
         ────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 pt-20 pb-6">
        {/* Breadcrumb & Top Action Block */}
        <div className="flex flex-col gap-2 pb-5 border-b border-stone-200/70 mb-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <nav className="flex items-center gap-1.5 text-stone-500 text-xs">
                <Link to="/author" className="hover:text-primary-600 flex items-center gap-1 transition-colors">
                  <span className="material-symbols-outlined text-[14px]">dashboard</span>
                  <span>Tác phẩm</span>
                </Link>
                <span className="text-stone-300 font-light">/</span>
                <Link to={`/author/novels/${novelId}`} className="hover:text-primary-600 transition-colors truncate max-w-[200px]">
                  {novelQuery.data?.title || 'Đang tải...'}
                </Link>
                <span className="text-stone-300 font-light">/</span>
                <span className="text-primary-600 font-semibold">Cẩm nang thế giới</span>
              </nav>

              <div className="flex items-center gap-3 pt-0.5">
                <h1 className="font-headline-sm text-[24px] leading-snug font-bold text-stone-900 tracking-tight">
                  Cẩm Nang Thế Giới (Story Bible)
                </h1>
                <Link
                  to={`/author/novels/${novelId}`}
                  className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-primary-600 transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                  <span>Quay lại Quản lý</span>
                </Link>
              </div>
            </div>

            {/* Quick Utility Actions */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary-50/80 text-primary-700 text-xs font-semibold border border-primary-100">
                <span className="material-symbols-outlined text-[15px] text-primary-600">auto_awesome</span>
                <span>{characters.length} hồ sơ đã nạp vào AI Copilot</span>
              </div>
              <button
                onClick={handleExportBible}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white hover:bg-stone-50 text-stone-700 font-medium text-xs border border-stone-200 shadow-2xs transition-colors"
                type="button"
                title="Tải toàn bộ Story Bible dưới dạng file JSON"
              >
                <span className="material-symbols-outlined text-[15px] text-stone-500">download</span>
                <span>Xuất file Bible</span>
              </button>
              <button
                onClick={handleSyncCopilot}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary-600 hover:bg-primary-700 text-white font-medium text-xs transition-colors"
                type="button"
              >
                <span className="material-symbols-outlined text-[15px]">sync</span>
                <span>✦ Đồng bộ AI Copilot</span>
              </button>
            </div>
          </div>
          <p className="text-xs text-stone-500 max-w-3xl">
            Quản lý hồ sơ nhân vật, thiết lập mối quan hệ tương hỗ và dòng thời gian nhằm đảm bảo tính nhất quán mạch lạc cho tác phẩm{' '}
            <strong className="text-stone-700 font-medium">"{novelQuery.data?.title || 'Hiện tại'}"</strong>.
          </p>
        </div>

        {/* ──────────────────────────────────────────
            4. Top Navigation Tabs Bar
           ────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-6 bg-stone-100/80 p-1 rounded-xl border border-stone-200/70 overflow-x-auto">
          <button
            onClick={() => setActiveTab('characters')}
            className={`flex items-center gap-2 py-2 px-3.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'characters'
                ? 'bg-white text-primary-700 shadow-2xs border border-stone-200/60'
                : 'text-stone-600 hover:text-stone-900 hover:bg-white/50'
            }`}
            type="button"
          >
            <span className="material-symbols-outlined text-[17px]">group</span>
            <span>Nhân vật</span>
            <span className="px-1.5 py-0.2 rounded-full bg-primary-100 text-primary-800 text-[11px] font-bold">
              {characters.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('relationships')}
            className={`flex items-center gap-2 py-2 px-3.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'relationships'
                ? 'bg-white text-primary-700 shadow-2xs border border-stone-200/60'
                : 'text-stone-600 hover:text-stone-900 hover:bg-white/50'
            }`}
            type="button"
          >
            <span className="material-symbols-outlined text-[17px]">hub</span>
            <span>Mối quan hệ</span>
            <span className="px-1.5 py-0.2 rounded-full bg-stone-200 text-stone-700 text-[11px] font-bold">
              {relationships.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex items-center gap-2 py-2 px-3.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'timeline'
                ? 'bg-white text-primary-700 shadow-2xs border border-stone-200/60'
                : 'text-stone-600 hover:text-stone-900 hover:bg-white/50'
            }`}
            type="button"
          >
            <span className="material-symbols-outlined text-[17px]">timeline</span>
            <span>Dòng thời gian (Timeline)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-stone-200 text-stone-700 text-[11px] font-bold">
              {timelineEvents.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('summaries')}
            className={`flex items-center gap-2 py-2 px-3.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'summaries'
                ? 'bg-white text-primary-700 shadow-2xs border border-stone-200/60'
                : 'text-stone-600 hover:text-stone-900 hover:bg-white/50'
            }`}
            type="button"
          >
            <span className="material-symbols-outlined text-[17px]">menu_book</span>
            <span>Tóm tắt hồi (Plot Summaries)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-stone-200 text-stone-700 text-[11px] font-bold">
              {plotSummaries.length}
            </span>
          </button>
        </div>

        {/* ──────────────────────────────────────────
            TAB 1: CHARACTERS WORKSPACE (Two Columns)
           ────────────────────────────────────────── */}
        {activeTab === 'characters' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Rail: Character Directory List (lg: col-span-4) */}
            <div className="lg:col-span-4 flex flex-col gap-3.5 bg-white rounded-xl p-4 border border-stone-200/80 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-stone-400">
                    search
                  </span>
                  <input
                    type="text"
                    value={characterSearch}
                    onChange={(e) => setCharacterSearch(e.target.value)}
                    placeholder="Tìm nhân vật, tính cách..."
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-stone-50 rounded-lg text-stone-800 placeholder:text-stone-400 border border-stone-200 focus:outline-none focus:border-primary-500 focus:bg-white transition-colors"
                  />
                </div>
                <button
                  onClick={() => {
                    setIsCreatingCharacter(true);
                    setSelectedCharacterId(null);
                    setCharacterCustomTitle('');
                    setCharacterForm(emptyCharacterForm);
                  }}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors shadow-2xs shrink-0"
                  title="Thêm nhân vật mới"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">person_add</span>
                </button>
              </div>

              {/* Role filter chips */}
              <div className="flex flex-wrap gap-1 text-[11px]">
                {(
                  [
                    { key: 'ALL', label: `Tất cả (${characters.length})` },
                    { key: 'PROTAGONIST', label: 'Tuyến chính' },
                    { key: 'SUPPORTING', label: 'Tuyến phụ' },
                    { key: 'ANTAGONIST', label: 'Phản diện' }
                  ] as { key: RoleFilter; label: string }[]
                ).map((rf) => (
                  <button
                    key={rf.key}
                    onClick={() => setRoleFilter(rf.key)}
                    type="button"
                    className={`px-2 py-0.5 rounded-full font-medium transition-colors ${
                      roleFilter === rf.key
                        ? 'bg-primary-600 text-white font-semibold'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {rf.label}
                  </button>
                ))}
              </div>

              {/* Characters List Cards */}
              <div className="flex flex-col gap-2 max-h-[750px] overflow-y-auto pr-0.5">
                {isCreatingCharacter && (
                  <div className="p-2.5 rounded-xl border border-dashed border-emerald-400 bg-emerald-50/70 shadow-2xs relative">
                    <div className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-emerald-600 rounded-r-full"></div>
                    <div className="flex items-center gap-3 pl-1">
                      <div className="w-11 h-12 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 border border-emerald-200">
                        <span className="material-symbols-outlined text-[20px]">person_add</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="text-[13px] font-bold text-emerald-950 truncate">
                            {characterForm.name || 'Nhân vật mới...'}
                          </span>
                          <span className="text-[11px] px-1.5 py-0.2 rounded bg-emerald-200 text-emerald-900 font-bold uppercase">
                            Đang tạo
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-700 truncate">
                          {characterCustomTitle || 'Chưa thiết lập thân phận'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {filteredCharacters.map((c: CharacterProfile, idx: number) => {
                  const isSelected = !isCreatingCharacter && c.characterId === selectedCharacterId;
                  const avatar = AVATAR_FALLBACKS[idx % AVATAR_FALLBACKS.length];
                  const { customTitle: cardCustomTitle } = parseCharacterDescription(c.description);
                  return (
                    <div
                      key={c.characterId}
                      onClick={() => {
                        setIsCreatingCharacter(false);
                        setSelectedCharacterId(c.characterId);
                      }}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer relative ${
                        isSelected
                          ? 'bg-primary-50/70 border-primary-300 shadow-2xs'
                          : 'bg-white border-stone-200/70 hover:bg-stone-50 hover:border-stone-300'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-primary-600 rounded-r-full"></div>
                      )}
                      <div className="flex items-center gap-3 pl-1">
                        <div className="w-11 h-12 rounded-lg overflow-hidden shrink-0 shadow-2xs bg-stone-100 border border-stone-200/50">
                          <img src={avatar} alt={c.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span
                              className={`text-[13px] font-semibold truncate ${
                                isSelected ? 'text-primary-900 font-bold' : 'text-stone-900'
                              }`}
                            >
                              {c.name}
                            </span>
                            <span
                              className={`text-[11px] px-1.5 py-0.2 rounded font-semibold max-w-[120px] truncate ${
                                c.role === 'PROTAGONIST'
                                  ? 'bg-primary-100 text-primary-800'
                                  : c.role === 'ANTAGONIST'
                                  ? 'bg-red-100 text-red-800'
                                  : c.role === 'SUPPORTING'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-stone-100 text-stone-600'
                              }`}
                              title={cardCustomTitle || c.role}
                            >
                              {cardCustomTitle || (c.role === 'PROTAGONIST' ? 'Chính' : c.role === 'ANTAGONIST' ? 'Đối đầu' : c.role === 'SUPPORTING' ? 'Phụ' : 'Then chốt')}
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-500 truncate">
                            {c.description ? c.description.replace(/^\[(?:Thân phận|Danh xưng|Vai trò cụ thể):[^\]]+\]\s*/, '') : (c.personality || 'Chưa có thông tin chi tiết')}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-stone-400">
                            <span className="flex items-center gap-0.5 text-primary-600 font-medium">
                              <span className="material-symbols-outlined text-[13px]">check_circle</span>
                              <span>Copilot Sync</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredCharacters.length === 0 && !isCreatingCharacter && (
                  <div className="p-8 text-center text-xs text-stone-400 border border-dashed border-stone-200 rounded-xl">
                    <span className="material-symbols-outlined text-[28px] text-stone-300 block mb-1">
                      person_off
                    </span>
                    <span>Không tìm thấy nhân vật phù hợp.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Editor: Detailed Character Inspector (lg: col-span-8) */}
            <div className="lg:col-span-8 flex flex-col gap-5 bg-white rounded-xl p-5 sm:p-7 border border-stone-200/80 shadow-xs">
              {/* Character Identity Header Card */}
              <div className="flex flex-col md:flex-row items-start justify-between gap-4 bg-stone-50/70 border border-stone-200/80 rounded-xl p-4">
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    <div className="w-16 h-20 rounded-lg overflow-hidden shadow-xs bg-stone-200 border border-stone-300/80">
                      <img
                        src={
                          !isCreatingCharacter && selectedCharacter
                            ? AVATAR_FALLBACKS[characters.indexOf(selectedCharacter) % AVATAR_FALLBACKS.length]
                            : AVATAR_FALLBACKS[0]
                        }
                        alt={characterForm.name || 'Hồ sơ mới'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-bold text-stone-900 leading-tight">
                        {characterForm.name || (isCreatingCharacter ? 'Tên nhân vật mới...' : 'Chưa đặt tên')}
                      </h2>
                      {isCreatingCharacter && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
                          Đang tạo mới
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs text-stone-500">
                      {characterCustomTitle ? (
                        <span className="px-2 py-0.5 rounded-full bg-primary-600 text-white font-bold text-[11px] shadow-2xs">
                          {characterCustomTitle}
                        </span>
                      ) : null}
                      <span className="px-2 py-0.5 rounded-full bg-primary-100 text-primary-800 font-semibold text-[11px]">
                        {characterRoles.find((r) => r.value === characterForm.role)?.label || characterForm.role}
                      </span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 text-primary-600 font-medium">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        <span>Đã nạp AI Copilot</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-start">
                  {isCreatingCharacter ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingCharacter(false);
                        if (characters.length > 0) {
                          setSelectedCharacterId(characters[0].characterId);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-semibold transition-colors"
                    >
                      Hủy tạo mới
                    </button>
                  ) : null}

                  {!isCreatingCharacter && selectedCharacterId && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedCharacterId);
                        showToast('Đã sao chép Character ID');
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors"
                      title="Sao chép ID nhân vật"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">content_copy</span>
                    </button>
                  )}
                  {!isCreatingCharacter && selectedCharacterId && (
                    <button
                      onClick={() => deleteCharacterMutation.mutate(selectedCharacterId)}
                      disabled={deleteCharacterMutation.isPending}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                      title="Lưu trữ / Xóa nhân vật này"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  )}
                  <button
                    onClick={() => characterMutation.mutate()}
                    disabled={characterMutation.isPending || !characterForm.name.trim()}
                    className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-white text-xs font-semibold transition-colors disabled:opacity-50 ${
                      isCreatingCharacter
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-primary-600 hover:bg-primary-700'
                    }`}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {isCreatingCharacter ? 'person_add' : 'save'}
                    </span>
                    <span>
                      {characterMutation.isPending
                        ? 'Đang lưu...'
                        : isCreatingCharacter
                        ? 'Tạo nhân vật'
                        : 'Lưu hồ sơ'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Form Section 1: Tổng quan & Vai trò */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-1.5 text-primary-700 font-semibold text-xs uppercase tracking-wider">
                  <span className="material-symbols-outlined text-[17px]">badge</span>
                  <span>1. Thông tin chung & Vai trò tác phẩm</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 bg-stone-50/70 p-4 rounded-xl border border-stone-200/70">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider">
                      Tên nhân vật *
                    </label>
                    <input
                      type="text"
                      value={characterForm.name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCharacterForm({ ...characterForm, name: e.target.value })}
                      placeholder="Ví dụ: Trần Hoàng Vũ, Lê Thu Thảo..."
                      className="p-2 text-xs rounded-lg bg-white border border-stone-200 focus:outline-none focus:border-primary-500 font-medium text-stone-900"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider">
                      Định vị vĩ mô cốt truyện *
                    </label>
                    <select
                      value={characterForm.role}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCharacterForm({ ...characterForm, role: e.target.value as CharacterRole })}
                      className="p-2 text-xs rounded-lg bg-white border border-stone-200 focus:outline-none focus:border-primary-500 font-medium text-stone-800"
                    >
                      {characterRoles.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Thân phận / Danh xưng cụ thể trong truyện */}
                  <div className="col-span-1 md:col-span-2 flex flex-col gap-1.5 pt-1 border-t border-stone-200/60 mt-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[15px] text-primary-600">verified</span>
                        <span>Danh xưng / Thân phận cụ thể trong truyện</span>
                        <span className="text-[11px] text-primary-600 font-normal lowercase">(nhập tự do hoặc click chọn gợi ý)</span>
                      </label>
                      {characterCustomTitle && (
                        <button
                          type="button"
                          onClick={() => setCharacterCustomTitle('')}
                          className="text-[11px] text-stone-400 hover:text-stone-600"
                        >
                          Xóa danh xưng
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={characterCustomTitle}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCharacterCustomTitle(e.target.value)}
                      placeholder="Ví dụ: Nam chính, Nữ chính, Sư phụ, Đại Boss, Quân sư, Kẻ thù truyền kiếp, Chưởng môn..."
                      className="p-2 text-xs rounded-lg bg-white border border-stone-200 focus:outline-none focus:border-primary-500 font-medium text-stone-900"
                    />

                    {/* Quick preset chips based on role */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="text-[11px] font-semibold text-stone-400">Gợi ý nhanh:</span>
                      {(ROLE_PRESET_TITLES[characterForm.role as CharacterRole] || []).map((title: string) => (
                        <button
                          key={title}
                          type="button"
                          onClick={() => setCharacterCustomTitle(title)}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors border ${
                            characterCustomTitle === title
                              ? 'bg-primary-600 text-white border-primary-600 font-bold'
                              : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100 hover:text-stone-900'
                          }`}
                        >
                          {title}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Section 2: Ngoại hình & Nhận dạng (description) */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-1.5 text-primary-700 font-semibold text-xs uppercase tracking-wider">
                  <span className="material-symbols-outlined text-[17px]">face</span>
                  <span>2. Ngoại hình, Tuổi tác & Đặc điểm nhận dạng</span>
                </div>
                <div className="bg-stone-50/70 p-4 rounded-xl border border-stone-200/70 flex flex-col gap-2">
                  <label className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider">
                    Mô tả diện mạo, y phục, thói quen đặc trưng
                  </label>
                  <textarea
                    rows={4}
                    value={characterForm.description ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCharacterForm({ ...characterForm, description: e.target.value })}
                    placeholder="Dáng người gầy cao, mắt sâu, bàn tay thon dài có vết mực. Thường mặc áo dạ màu xanh rêu, quàng khăn len mỡ gà..."
                    className="p-3 text-xs rounded-lg bg-white border border-stone-200 focus:outline-none focus:border-primary-500 text-stone-800 leading-relaxed"
                  />
                </div>
              </div>

              {/* Form Section 3: Tính cách & Tâm lý (personality) */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-1.5 text-primary-700 font-semibold text-xs uppercase tracking-wider">
                  <span className="material-symbols-outlined text-[17px]">psychology</span>
                  <span>3. Tính cách, Tâm lý & Mâu thuẫn nội tâm</span>
                </div>
                <div className="bg-stone-50/70 p-4 rounded-xl border border-stone-200/70 flex flex-col gap-2">
                  <label className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider">
                    Đặc tính bên ngoài & Xung đột nội tâm
                  </label>
                  <textarea
                    rows={4}
                    value={characterForm.personality ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCharacterForm({ ...characterForm, personality: e.target.value })}
                    placeholder="Trầm tĩnh, kiệm lời, lịch thiệp theo lối Tràng An cũ. Mặc cảm tội lỗi về biến cố năm xưa, dằn vặt giữa níu giữ quá khứ và đô thị hóa..."
                    className="p-3 text-xs rounded-lg bg-white border border-stone-200 focus:outline-none focus:border-primary-500 text-stone-800 leading-relaxed"
                  />
                </div>
              </div>

              {/* Form Section 4: Ghi chú ngữ cảnh cho AI Copilot (notes) */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-primary-700 font-semibold text-xs uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[17px]">smart_toy</span>
                    <span>4. Ghi chú quy tắc hành vi cho AI Copilot (Prompt Constraint Rules)</span>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 font-bold">
                    Nạp vào AI Copilot
                  </span>
                </div>
                <div className="bg-primary-50/50 p-4 rounded-xl border border-primary-100 flex flex-col gap-2">
                  <p className="text-[11px] text-stone-500">
                    Định hướng giọng văn, thói quen thoại và phản xạ hành động được nạp tự động vào Sidebar AI khi viết:
                  </p>
                  <textarea
                    rows={4}
                    value={characterForm.notes ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCharacterForm({ ...characterForm, notes: e.target.value })}
                    placeholder={`"Khi AI viết lời thoại của ${
                      characterForm.name || 'nhân vật'
                    }: Giữ nhịp điệu nói chậm rãi, từ ngữ gãy gọn cổ kính. Không để bộc phát cơn giận bằng la hét mà thể hiện qua cử chỉ bóp chặt mẩu phấn..."`}
                    className="p-3 text-xs rounded-lg bg-white border border-primary-200 focus:outline-none focus:border-primary-500 text-stone-800 leading-relaxed"
                  />
                </div>
              </div>

              {/* Footer Save Row */}
              <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                {isCreatingCharacter ? (
                  <button
                    onClick={() => {
                      setIsCreatingCharacter(false);
                      if (characters.length > 0) {
                        setSelectedCharacterId(characters[0].characterId);
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-semibold transition-colors"
                    type="button"
                  >
                    Hủy bỏ
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setIsCreatingCharacter(true);
                      setSelectedCharacterId(null);
                      setCharacterCustomTitle('');
                      setCharacterForm(emptyCharacterForm);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-50 hover:bg-primary-100 text-primary-700 text-xs font-bold transition-colors"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[16px]">person_add</span>
                    <span>Tạo nhân vật mới</span>
                  </button>
                )}
                <button
                  onClick={() => characterMutation.mutate()}
                  disabled={characterMutation.isPending || !characterForm.name.trim()}
                  className={`inline-flex items-center gap-2 px-6 py-2 rounded-md text-white text-xs font-semibold transition-colors disabled:opacity-50 ${
                    isCreatingCharacter
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-primary-600 hover:bg-primary-700'
                  }`}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[17px]">
                    {isCreatingCharacter ? 'person_add' : 'check'}
                  </span>
                  <span>
                    {characterMutation.isPending
                      ? 'Đang lưu...'
                      : isCreatingCharacter
                      ? 'Tạo nhân vật mới'
                      : 'Lưu hồ sơ nhân vật'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────
            TAB 2: RELATIONSHIPS WORKSPACE
           ────────────────────────────────────────── */}
        {activeTab === 'relationships' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Rail: Relationship List (lg: col-span-5) */}
            <div className="lg:col-span-5 flex flex-col gap-3.5 bg-white rounded-xl p-4 border border-stone-200/80 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                <div className="flex items-center gap-1.5 font-bold text-xs text-stone-800 uppercase tracking-wider">
                  <span className="material-symbols-outlined text-[17px] text-primary-600">hub</span>
                  <span>Mối quan hệ nhân vật ({relationships.length})</span>
                </div>
                <button
                  onClick={() => {
                    setIsCreatingRelationship(true);
                    setSelectedRelationshipId(null);
                    setRelationshipForm({
                      ...emptyRelationshipForm,
                      sourceCharacterId: characters[0]?.characterId || '',
                      targetCharacterId: characters[1]?.characterId || ''
                    });
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 font-semibold transition-colors"
                  type="button"
                >
                  + Thêm quan hệ
                </button>
              </div>

              <div className="flex flex-col gap-2.5 max-h-[700px] overflow-y-auto">
                {relationships.map((r: CharacterRelationship) => {
                  const isSelected = !isCreatingRelationship && r.relationshipId === selectedRelationshipId;
                  return (
                    <div
                      key={r.relationshipId}
                      onClick={() => {
                        setIsCreatingRelationship(false);
                        setSelectedRelationshipId(r.relationshipId);
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer relative ${
                        isSelected
                          ? 'bg-primary-50/70 border-primary-300 shadow-2xs'
                          : 'bg-white border-stone-200/70 hover:bg-stone-50 hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-stone-900 flex items-center gap-1.5">
                          <span>{r.sourceCharacterName}</span>
                          <span className="text-primary-600">➔</span>
                          <span>{r.targetCharacterName}</span>
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                          {r.relationshipType}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 line-clamp-2">
                        {r.description || 'Chưa có mô tả chi tiết quan hệ.'}
                      </p>
                    </div>
                  );
                })}

                {relationships.length === 0 && (
                  <div className="p-8 text-center text-xs text-stone-400 border border-dashed border-stone-200 rounded-xl">
                    <span>Chưa có mối quan hệ nào được thiết lập.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Form: Relationship Inspector (lg: col-span-7) */}
            <div className="lg:col-span-7 flex flex-col gap-4 bg-white rounded-xl p-5 border border-stone-200/80 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                <h3 className="font-bold text-sm text-stone-900">
                  {isCreatingRelationship || !selectedRelationshipId ? 'Thiết lập mối quan hệ mới' : 'Chỉnh sửa mối quan hệ'}
                </h3>
                {!isCreatingRelationship && selectedRelationshipId && (
                  <button
                    onClick={() => deleteRelationshipMutation.mutate(selectedRelationshipId)}
                    disabled={deleteRelationshipMutation.isPending}
                    className="text-xs text-red-600 hover:text-red-700 font-medium"
                    type="button"
                  >
                    Xóa mối quan hệ
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-stone-600 uppercase">Nhân vật nguồn *</label>
                  <select
                    value={relationshipForm.sourceCharacterId}
                    onChange={(e) => setRelationshipForm({ ...relationshipForm, sourceCharacterId: e.target.value })}
                    className="p-2 text-xs rounded-lg border border-stone-200 bg-stone-50 text-stone-800 font-medium"
                  >
                    <option value="">-- Chọn nhân vật --</option>
                    {characters.map((c) => (
                      <option key={c.characterId} value={c.characterId}>
                        {c.name} ({c.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-stone-600 uppercase">Nhân vật đích *</label>
                  <select
                    value={relationshipForm.targetCharacterId}
                    onChange={(e) => setRelationshipForm({ ...relationshipForm, targetCharacterId: e.target.value })}
                    className="p-2 text-xs rounded-lg border border-stone-200 bg-stone-50 text-stone-800 font-medium"
                  >
                    <option value="">-- Chọn nhân vật --</option>
                    {characters.map((c) => (
                      <option key={c.characterId} value={c.characterId}>
                        {c.name} ({c.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-stone-600 uppercase">Loại quan hệ *</label>
                <input
                  type="text"
                  value={relationshipForm.relationshipType}
                  onChange={(e) => setRelationshipForm({ ...relationshipForm, relationshipType: e.target.value })}
                  placeholder="Ví dụ: Bằng hữu tri kỷ, Kẻ thù truyền kiếp, Sư đồ, Kình địch thương trường..."
                  className="p-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 font-medium"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-stone-600 uppercase">Mô tả chi tiết & Mâu thuẫn</label>
                <textarea
                  rows={4}
                  value={relationshipForm.description ?? ''}
                  onChange={(e) => setRelationshipForm({ ...relationshipForm, description: e.target.value })}
                  placeholder="Mối quan hệ phát triển từ biến cố năm 1991, có sự tin cậy nhưng giấu kín bí mật về cuốn sổ..."
                  className="p-3 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 leading-relaxed"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => relationshipMutation.mutate()}
                  disabled={
                    relationshipMutation.isPending ||
                    !relationshipForm.sourceCharacterId ||
                    !relationshipForm.targetCharacterId ||
                    !relationshipForm.relationshipType.trim()
                  }
                  className="px-5 py-2 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                  type="button"
                >
                  {relationshipMutation.isPending ? 'Đang lưu...' : 'Lưu mối quan hệ'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────
            TAB 3: TIMELINE WORKSPACE
           ────────────────────────────────────────── */}
        {activeTab === 'timeline' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Rail: Timeline Events Feed (lg: col-span-5) */}
            <div className="lg:col-span-5 flex flex-col gap-3.5 bg-white rounded-xl p-4 border border-stone-200/80 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                <div className="flex items-center gap-1.5 font-bold text-xs text-stone-800 uppercase tracking-wider">
                  <span className="material-symbols-outlined text-[17px] text-primary-600">timeline</span>
                  <span>Các mốc sự kiện ({timelineEvents.length})</span>
                </div>
                <button
                  onClick={() => {
                    setIsCreatingTimeline(true);
                    setSelectedEventId(null);
                    setTimelineForm({
                      ...emptyTimelineForm,
                      eventOrder: timelineEvents.length + 1
                    });
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 font-semibold transition-colors"
                  type="button"
                >
                  + Thêm mốc sự kiện
                </button>
              </div>

              <div className="flex flex-col gap-2.5 max-h-[700px] overflow-y-auto">
                {timelineEvents
                  .slice()
                  .sort((a, b) => a.eventOrder - b.eventOrder)
                  .map((ev: StoryTimelineEvent) => {
                    const isSelected = !isCreatingTimeline && ev.eventId === selectedEventId;
                    return (
                      <div
                        key={ev.eventId}
                        onClick={() => {
                          setIsCreatingTimeline(false);
                          setSelectedEventId(ev.eventId);
                        }}
                        className={`p-3 rounded-xl border transition-all cursor-pointer relative ${
                          isSelected
                            ? 'bg-primary-50/70 border-primary-300 shadow-2xs'
                            : 'bg-white border-stone-200/70 hover:bg-stone-50 hover:border-stone-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs text-stone-900">
                            #{ev.eventOrder}: {ev.title}
                          </span>
                          {ev.chapterNumber && (
                            <span className="text-[11px] px-1.5 py-0.2 rounded bg-stone-100 text-stone-600">
                              Chương {ev.chapterNumber}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-500 line-clamp-2">{ev.summary}</p>
                      </div>
                    );
                  })}

                {timelineEvents.length === 0 && (
                  <div className="p-8 text-center text-xs text-stone-400 border border-dashed border-stone-200 rounded-xl">
                    <span>Chưa có mốc thời gian nào được ghi nhận.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Form: Timeline Event Inspector (lg: col-span-7) */}
            <div className="lg:col-span-7 flex flex-col gap-4 bg-white rounded-xl p-5 border border-stone-200/80 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                <h3 className="font-bold text-sm text-stone-900">
                  {isCreatingTimeline || !selectedEventId ? 'Thêm mốc sự kiện mới' : 'Chỉnh sửa sự kiện Timeline'}
                </h3>
                {!isCreatingTimeline && selectedEventId && (
                  <button
                    onClick={() => deleteTimelineMutation.mutate(selectedEventId)}
                    disabled={deleteTimelineMutation.isPending}
                    className="text-xs text-red-600 hover:text-red-700 font-medium"
                    type="button"
                  >
                    Xóa mốc sự kiện
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-[11px] font-semibold text-stone-600 uppercase">Tên sự kiện *</label>
                  <input
                    type="text"
                    value={timelineForm.title}
                    onChange={(e) => setTimelineForm({ ...timelineForm, title: e.target.value })}
                    placeholder="Ví dụ: Đêm giao thừa năm 1991, Gặp gỡ tại quán trà..."
                    className="p-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 font-medium"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-stone-600 uppercase">Thứ tự diễn tiến *</label>
                  <input
                    type="number"
                    value={timelineForm.eventOrder}
                    onChange={(e) => setTimelineForm({ ...timelineForm, eventOrder: parseInt(e.target.value, 10) || 1 })}
                    className="p-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 font-medium"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-stone-600 uppercase">Chương truyện tương ứng (Tùy chọn)</label>
                <select
                  value={timelineForm.chapterId ?? ''}
                  onChange={(e) => setTimelineForm({ ...timelineForm, chapterId: e.target.value || null })}
                  className="p-2 text-xs rounded-lg border border-stone-200 bg-stone-50 text-stone-800"
                >
                  <option value="">-- Không gắn chương cụ thể --</option>
                  {chapters.map((ch: Chapter) => (
                    <option key={ch.chapterId} value={ch.chapterId}>
                      Chương {ch.chapterNumber}: {ch.draft?.title ?? ch.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-stone-600 uppercase">Tóm tắt diễn biến sự kiện *</label>
                <textarea
                  rows={5}
                  value={timelineForm.summary}
                  onChange={(e) => setTimelineForm({ ...timelineForm, summary: e.target.value })}
                  placeholder="Mô tả sự kiện diễn ra ở đâu, ai tham gia, hậu quả hoặc bước ngoặt câu chuyện mang lại..."
                  className="p-3 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 leading-relaxed"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => timelineMutation.mutate()}
                  disabled={timelineMutation.isPending || !timelineForm.title.trim() || !timelineForm.summary.trim()}
                  className="px-5 py-2 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                  type="button"
                >
                  {timelineMutation.isPending ? 'Đang lưu...' : 'Lưu sự kiện Timeline'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────
            TAB 4: PLOT SUMMARIES WORKSPACE
           ────────────────────────────────────────── */}
        {activeTab === 'summaries' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Rail: Summaries List (lg: col-span-5) */}
            <div className="lg:col-span-5 flex flex-col gap-3.5 bg-white rounded-xl p-4 border border-stone-200/80 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                <div className="flex items-center gap-1.5 font-bold text-xs text-stone-800 uppercase tracking-wider">
                  <span className="material-symbols-outlined text-[17px] text-primary-600">menu_book</span>
                  <span>Tóm tắt hồi & Cốt truyện ({plotSummaries.length})</span>
                </div>
                <button
                  onClick={() => {
                    setIsCreatingSummary(true);
                    setSelectedSummaryId(null);
                    setSummaryForm(emptySummaryForm);
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 font-semibold transition-colors"
                  type="button"
                >
                  + Thêm tóm tắt
                </button>
              </div>

              <div className="flex flex-col gap-2.5 max-h-[700px] overflow-y-auto">
                {plotSummaries.map((s: PlotSummary) => {
                  const isSelected = !isCreatingSummary && s.summaryId === selectedSummaryId;
                  return (
                    <div
                      key={s.summaryId}
                      onClick={() => {
                        setIsCreatingSummary(false);
                        setSelectedSummaryId(s.summaryId);
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer relative ${
                        isSelected
                          ? 'bg-primary-50/70 border-primary-300 shadow-2xs'
                          : 'bg-white border-stone-200/70 hover:bg-stone-50 hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-stone-900">
                          {s.scope === 'NOVEL'
                            ? 'Tóm tắt toàn bộ truyện'
                            : s.scope === 'ARC'
                            ? `Hồi: ${s.arcName || 'Chưa đặt tên'}`
                            : `Chương ${s.chapterNumber}`}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 font-semibold border border-primary-100">
                          {s.scope}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 line-clamp-2">{s.summary}</p>
                    </div>
                  );
                })}

                {plotSummaries.length === 0 && (
                  <div className="p-8 text-center text-xs text-stone-400 border border-dashed border-stone-200 rounded-xl">
                    <span>Chưa có tóm tắt hồi nào.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Form: Summary Inspector (lg: col-span-7) */}
            <div className="lg:col-span-7 flex flex-col gap-4 bg-white rounded-xl p-5 border border-stone-200/80 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                <h3 className="font-bold text-sm text-stone-900">
                  {isCreatingSummary || !selectedSummaryId ? 'Thêm bản tóm tắt mới' : 'Chỉnh sửa bản tóm tắt'}
                </h3>
                {!isCreatingSummary && selectedSummaryId && (
                  <button
                    onClick={() => deleteSummaryMutation.mutate(selectedSummaryId)}
                    disabled={deleteSummaryMutation.isPending}
                    className="text-xs text-red-600 hover:text-red-700 font-medium"
                    type="button"
                  >
                    Xóa bản tóm tắt
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-stone-600 uppercase">Phạm vi tóm tắt *</label>
                <select
                  value={summaryForm.scope}
                  onChange={(e) => setSummaryForm({ ...summaryForm, scope: e.target.value as PlotSummaryScope })}
                  className="p-2 text-xs rounded-lg border border-stone-200 bg-stone-50 text-stone-800 font-medium"
                >
                  <option value="NOVEL">Toàn bộ tác phẩm (Novel Scope)</option>
                  <option value="ARC">Theo Hồi / Quyển (Arc Scope)</option>
                  <option value="CHAPTER">Theo từng chương (Chapter Scope)</option>
                </select>
              </div>

              {summaryForm.scope === 'ARC' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1 md:col-span-3">
                    <label className="text-[11px] font-semibold text-stone-600 uppercase">Tên Hồi / Quyển *</label>
                    <input
                      type="text"
                      value={summaryForm.arcName ?? ''}
                      onChange={(e) => setSummaryForm({ ...summaryForm, arcName: e.target.value })}
                      placeholder="Ví dụ: Hồi I - Mùa đông ngõ Yên Thái..."
                      className="p-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 font-medium"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-stone-600 uppercase">Từ chương số</label>
                    <input
                      type="number"
                      value={summaryForm.startChapterNumber ?? ''}
                      onChange={(e) =>
                        setSummaryForm({ ...summaryForm, startChapterNumber: parseInt(e.target.value, 10) || null })
                      }
                      className="p-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-800"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-stone-600 uppercase">Đến chương số</label>
                    <input
                      type="number"
                      value={summaryForm.endChapterNumber ?? ''}
                      onChange={(e) =>
                        setSummaryForm({ ...summaryForm, endChapterNumber: parseInt(e.target.value, 10) || null })
                      }
                      className="p-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-800"
                    />
                  </div>
                </div>
              )}

              {summaryForm.scope === 'CHAPTER' && (
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-stone-600 uppercase">Chọn chương *</label>
                  <select
                    value={summaryForm.chapterId ?? ''}
                    onChange={(e) => setSummaryForm({ ...summaryForm, chapterId: e.target.value || null })}
                    className="p-2 text-xs rounded-lg border border-stone-200 bg-stone-50 text-stone-800"
                  >
                    <option value="">-- Chọn chương --</option>
                    {chapters.map((ch: Chapter) => (
                      <option key={ch.chapterId} value={ch.chapterId}>
                        Chương {ch.chapterNumber}: {ch.draft?.title ?? ch.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-stone-600 uppercase">Nội dung tóm tắt *</label>
                <textarea
                  rows={6}
                  value={summaryForm.summary}
                  onChange={(e) => setSummaryForm({ ...summaryForm, summary: e.target.value })}
                  placeholder="Tóm tắt ngắn gọn các sự kiện trọng tâm, tâm lý nhân vật và sự chuyển biến của mạch truyện..."
                  className="p-3 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 leading-relaxed"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => summaryMutation.mutate()}
                  disabled={summaryMutation.isPending || !summaryForm.summary.trim()}
                  className="px-5 py-2 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                  type="button"
                >
                  {summaryMutation.isPending ? 'Đang lưu...' : 'Lưu bản tóm tắt'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ──────────────────────────────────────────
          5. Minimal Modern Footer
         ────────────────────────────────────────── */}
      <footer className="w-full bg-white border-t border-stone-200/70 py-6 mt-12 text-xs text-stone-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stone-800">Ephurin Reading</span>
            <span>•</span>
            <span>Nền tảng Sáng tác Văn học Số & Trợ lý Đồng sáng tác AI</span>
          </div>
          <div className="flex items-center gap-4 text-stone-400">
            <span>© 2026 Ephurin</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
