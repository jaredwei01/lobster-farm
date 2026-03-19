import { CONFIG } from './config.js';

const KEY_STORAGE = 'lobster_agent_key';
const API_BASE = '/lobster-farm/api/agent';

export const SaveSystem = {
  save(state) {
    try {
      localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(state));
    } catch { /* localStorage full or unavailable */ }
    return true;
  },

  load() {
    try {
      const raw = localStorage.getItem(CONFIG.SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version) return parsed;
      return null;
    } catch { return null; }
  },

  hasSave() {
    return !!localStorage.getItem(CONFIG.SAVE_KEY);
  },

  deleteSave() {
    localStorage.removeItem(CONFIG.SAVE_KEY);
    localStorage.removeItem(KEY_STORAGE);
  },

  getKey() {
    return localStorage.getItem(KEY_STORAGE) || '';
  },

  setKey(key) {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  },

  async loadFromServer(key) {
    if (!key) return null;
    try {
      const resp = await fetch(`${API_BASE}/state?key=${encodeURIComponent(key)}`);
      if (!resp.ok) return null;
      const data = await resp.json();
      if (data.ok && data.state && data.state.version) {
        this.setKey(key);
        this.save(data.state);
        return data.state;
      }
      return null;
    } catch { return null; }
  },

  async exportSave() {
    const state = this.load();
    if (!state) return null;
    return JSON.stringify({ state }, null, 2);
  },

  async importSave(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      const state = data.state || data;
      if (!state.lobster || !state.world || !state.farm) {
        throw new Error('Invalid save: missing required fields (lobster, world, farm)');
      }
      if (!state.version) return false;
      localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(state));
      return true;
    } catch { return false; }
  },
};
