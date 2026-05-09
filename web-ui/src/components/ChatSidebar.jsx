import React, { useState } from 'react';
import { Send, Sparkles, MessageSquare, User } from 'lucide-react';

const ChatSidebar = ({ onGetSuggestion, suggestions, isGettingSuggestion }) => {
  const [characterName, setCharacterName] = useState('');
  const [mood, setMood] = useState('neutral');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!characterName) return;
    onGetSuggestion(characterName, mood);
  };

  return (
    <div className="flex flex-col h-full bg-slate-800/30 border-l border-slate-800 p-4 gap-4">
      <div className="flex items-center gap-2 text-primary border-b border-slate-800 pb-4">
        <Sparkles size={20} />
        <h2 className="font-bold uppercase tracking-wider text-sm">AI Copilot</h2>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-center space-y-2 opacity-50">
            <MessageSquare size={48} />
            <p className="text-sm">Enter a character and mood to get plot suggestions.</p>
          </div>
        ) : (
          suggestions.map((suggestion, idx) => (
            <div key={idx} className="bg-slate-800 border border-slate-700 p-3 rounded-lg text-sm leading-relaxed text-slate-300 animate-in fade-in slide-in-from-right-4 duration-300">
              {suggestion}
            </div>
          ))
        )}
        {isGettingSuggestion && (
          <div className="flex gap-2 p-3 bg-slate-800/50 rounded-lg animate-pulse">
            <div className="w-2 h-2 bg-primary rounded-full" />
            <div className="w-2 h-2 bg-primary rounded-full delay-75" />
            <div className="w-2 h-2 bg-primary rounded-full delay-150" />
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 mt-auto pt-4 border-t border-slate-800">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 flex items-center gap-1 uppercase">
            <User size={12} /> Target Character
          </label>
          <input
            type="text"
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            placeholder="e.g. Tiêu Viêm"
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Atmosphere (Mood)</label>
          <select 
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none"
          >
            <option value="neutral">Neutral</option>
            <option value="romantic">Romantic</option>
            <option value="tragic">Tragic</option>
            <option value="comedic">Comedic</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={isGettingSuggestion}
          className="w-full flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 py-2.5 rounded-md font-bold text-sm transition-all"
        >
          <Send size={16} /> Get Suggestion
        </button>
      </form>
    </div>
  );
};

export default ChatSidebar;
