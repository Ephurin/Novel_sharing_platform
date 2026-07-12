import { create } from 'zustand';
import { analyzeText, getSuggestions, getKB, overrideRelation, confirmKB } from '../services/api';

const useStore = create((set, get) => ({
  text: '',
  storyId: 'writing_session_' + Math.floor(Math.random() * 1000),
  entities: [],
  relations: [],
  pendingRelations: [],
  suggestions: [],
  isAnalyzing: false,
  isGettingSuggestion: false,
  isGettingSuggestion: false,
  // UI States (New Architecture)
  activity: 'story',
  sidebarOpen: true,
  aiOpen: true,
  aiTab: 'chat',
  selChapter: 'c3',
  expandedEnts: ['e1'],
  focusMode: false,

  // Legacy (can be cleaned up later)
  activeLeftView: 'wiki',
  drawerOpen: true,
  rightSidebarOpen: true,
  selectedEntity: null,
  mood: 'neutral',
  targetCharacter: '',
  lastAnalyzedAt: null,
  kbData: null,

  setText: (text) => set({ text }),
  setMood: (mood) => {
    set({ mood });
    get().fetchSuggestions();
  },
  setTargetCharacter: (char) => {
    set({ targetCharacter: char });
    if (char && get().text) {
      get().fetchSuggestions();
    }
  },
  setActivity: (activity) => set({ activity, sidebarOpen: true }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setAiOpen: (open) => set({ aiOpen: open }),
  setAiTab: (tab) => set({ aiTab: tab }),
  setSelChapter: (chapter) => set({ selChapter: chapter }),
  setExpandedEnts: (ents) => set({ expandedEnts: ents }),
  
  // Legacy setters
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
  setActiveLeftView: (view) => set({ activeLeftView: view, drawerOpen: true }),
  setFocusMode: (mode) => set({ focusMode: mode }),
  setSelectedEntity: (entity) => set({ selectedEntity: entity }),

  runAnalysis: async () => {
    const { text, storyId } = get();
    if (!text.trim()) return;

    set({ isAnalyzing: true });
    try {
      const data = await analyzeText(storyId, text);
      const newEntities = data.entities || [];
      
      set({ 
        entities: newEntities,
        relations: data.applied_relations || [],
        pendingRelations: data.suggested_relations || [],
        isAnalyzing: false,
        lastAnalyzedAt: new Date()
      });

      // Fetch full KB state to ensure graph and metadata are sync
      get().fetchKB();

      // Auto-select first character for suggestion if none selected
      const currentTarget = get().targetCharacter;
      if (!currentTarget && newEntities.length > 0) {
        const firstChar = newEntities.find(e => {
          const type = (e.entity_type || e.type || "").toUpperCase();
          return type === "PERSON" || type === "PER" || type === "UNKNOWN" || !type;
        });
        if (firstChar) {
          const name = firstChar.name || firstChar.resolved_name || firstChar.word;
          set({ targetCharacter: name });
          get().fetchSuggestions();
        }
      }
    } catch (error) {
      console.error("Analysis failed", error);
      set({ isAnalyzing: false });
    }
  },

  fetchSuggestions: async () => {
    const { storyId, targetCharacter, text, mood } = get();
    if (!targetCharacter || !text) return;

    set({ isGettingSuggestion: true });
    try {
      const data = await getSuggestions(storyId, targetCharacter, text, mood);
      set({ suggestions: data.suggestions || [], isGettingSuggestion: false });
    } catch (error) {
      console.error("Suggestion failed", error);
      set({ isGettingSuggestion: false });
    }
  },

  fetchKB: async () => {
    const { storyId } = get();
    try {
      const data = await getKB(storyId);
      set({ kbData: data });
    } catch (error) {
      console.error("KB Fetch failed", error);
    }
  },

  // HITL Actions
  approveRelation: async (relationObj) => {
    const { storyId } = get();
    try {
      // relationObj.relation has { subject, relation, object }
      await overrideRelation(
        storyId, 
        relationObj.relation.subject, 
        relationObj.relation.relation, 
        relationObj.relation.object
      );
      set((state) => ({
        pendingRelations: state.pendingRelations.filter(r => r !== relationObj),
      }));
      get().fetchKB();
    } catch (error) {
      console.error("Failed to approve relation", error);
    }
  },

  rejectRelation: (relationObj) => {
    set((state) => ({
      pendingRelations: state.pendingRelations.filter(r => r !== relationObj),
    }));
  },

  approveEntity: async (entity) => {
    const { storyId } = get();
    try {
      // confirmKB takes array of candidates
      await confirmKB(storyId, [entity]);
      set((state) => ({
        entities: state.entities.map(e => (e === entity ? { ...e, status: 'APPROVED' } : e))
      }));
      get().fetchKB();
    } catch (error) {
      console.error("Failed to approve entity", error);
    }
  },

  rejectEntity: (entity) => {
    set((state) => ({
      entities: state.entities.filter(e => e !== entity)
    }));
  }
}));

export default useStore;
