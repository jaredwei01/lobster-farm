const STORAGE_KEY = 'lobster_empathy';
const API_BASE = '/lobster-farm/api/agent';
const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

let _key = '';
let _remoteReports = [];
let _refreshTimer = null;

function _today() {
  return new Date().toISOString().slice(0, 10);
}

function _loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function _saveLocal(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota */ }
}

function _ensureToday(data) {
  const today = _today();
  if (data.date !== today) {
    const prev = data.date || '';
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const wasYesterday = prev === yesterday;
    data.streak = wasYesterday ? (data.streak || 0) + 1 : 1;
    data.daysSinceLastVisit = prev ? Math.floor((Date.now() - new Date(prev + 'T00:00:00').getTime()) / 86400000) : 0;
    data.date = today;
    data.onlineMin = 0;
    data.chats = 0;
    data.actions = 0;
    data._sessionStart = Date.now();
  }
  if (!data._sessionStart) data._sessionStart = Date.now();
  return data;
}

async function _fetchRemote() {
  if (!_key) return;
  try {
    const resp = await fetch(`${API_BASE}/empathy?key=${encodeURIComponent(_key)}`);
    if (!resp.ok) return;
    const json = await resp.json();
    if (json.ok && Array.isArray(json.reports)) {
      _remoteReports = json.reports;
    }
  } catch { /* network error, keep stale data */ }
}

export const EmpathyTracker = {
  async init(key) {
    _key = key || '';
    const data = _ensureToday(_loadLocal());
    _saveLocal(data);

    if (_key) {
      await _fetchRemote();
      _refreshTimer = setInterval(() => _fetchRemote(), REFRESH_INTERVAL);
    }
  },

  recordChat() {
    const data = _ensureToday(_loadLocal());
    data.chats = (data.chats || 0) + 1;
    _saveLocal(data);
  },

  recordAction() {
    const data = _ensureToday(_loadLocal());
    data.actions = (data.actions || 0) + 1;
    _saveLocal(data);
  },

  recordBattle(won, bossName) {
    const data = _ensureToday(_loadLocal());
    if (!data.battles) data.battles = { wins: 0, losses: 0, bosses: [] };
    if (won) data.battles.wins++;
    else data.battles.losses++;
    if (bossName && !data.battles.bosses.includes(bossName)) {
      data.battles.bosses.push(bossName);
    }
    _saveLocal(data);
  },

  getBattleSummary() {
    const data = _ensureToday(_loadLocal());
    const b = data.battles;
    if (!b || (b.wins === 0 && b.losses === 0)) return '';
    let text = `Won ${b.wins}, Lost ${b.losses}.`;
    if (b.bosses && b.bosses.length > 0) text += ` Defeated: ${b.bosses.join(', ')}.`;
    return text;
  },

  async flushBattleReport() {
    if (!_key) return;
    const summary = this.getBattleSummary();
    if (!summary) return;
    try {
      await fetch(`${API_BASE}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: _key,
          date: _today(),
          summary: { battle_summary: summary },
        }),
      });
    } catch { /* network error */ }
  },

  getSummary() {
    const data = _ensureToday(_loadLocal());
    const elapsedMin = Math.floor((Date.now() - (data._sessionStart || Date.now())) / 60000);
    const onlineMin = (data.onlineMin || 0) + elapsedMin;

    const summary = {
      onlineMin,
      chats: data.chats || 0,
      actions: data.actions || 0,
      streak: data.streak || 1,
      daysSinceLastVisit: data.daysSinceLastVisit || 0,
    };

    const todayReport = _remoteReports.find(r => r.date === _today());
    if (todayReport) {
      summary.workMin = todayReport.work_minutes || 0;
      summary.taskCount = todayReport.task_count || 0;
      summary.skillCalls = todayReport.skill_calls || 0;
      summary.lastActiveTime = todayReport.last_active || '';
      summary.moodHint = todayReport.mood_hint || '';
    } else if (_remoteReports.length > 0) {
      const latest = _remoteReports[0];
      summary.workMin = latest.work_minutes || 0;
      summary.taskCount = latest.task_count || 0;
      summary.skillCalls = latest.skill_calls || 0;
      summary.lastActiveTime = latest.last_active || '';
      summary.moodHint = latest.mood_hint || '';
      summary._stale = true;
    }

    return summary;
  },

  flushOnlineTime() {
    const data = _ensureToday(_loadLocal());
    const now = Date.now();
    const elapsedMin = Math.floor((now - (data._sessionStart || now)) / 60000);
    data.onlineMin = (data.onlineMin || 0) + elapsedMin;
    data._sessionStart = now;
    _saveLocal(data);
  },

  destroy() {
    this.flushOnlineTime();
    this.flushBattleReport();
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
  },
};
