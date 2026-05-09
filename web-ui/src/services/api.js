import axios from 'axios';

const BASE_URL = 'http://localhost:8000';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const analyzeText = async (storyId, text) => {
  const response = await api.post('/v1/enhanced/process-interactions', {
    story_id: storyId,
    text: text,
  });
  return response.data;
};

export const getSuggestions = async (storyId, characterName, currentText, mood = 'neutral') => {
  const response = await api.post('/v1/ai/suggest-next', {
    story_id: storyId,
    character_name: characterName,
    current_text: currentText,
    mood: mood,
  });
  return response.data;
};

export const getKB = async (storyId) => {
  const response = await api.get(`/v1/enhanced/kb/${storyId}`);
  return response.data;
};

export default api;
