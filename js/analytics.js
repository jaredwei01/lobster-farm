const ANALYTICS_ENDPOINT = '/lobster-farm/api/collect';
const HEARTBEAT_INTERVAL = 30_000;
const FLUSH_INTERVAL = 60_000;

function generateId() {
  const a = new Uint8Array(16);
  try { crypto.getRandomValues(a); } catch { for (let i = 0; i < 16; i++) a[i] = Math.random() * 256 | 0; }
  a[6] = (a[6] & 0x0f) | 0x40;
  a[8] = (a[8] & 0x3f) | 0x80;
  const h = [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

function uid() {
  let id = localStorage.getItem('lobster_uid');
  if (!id) { id = generateId(); localStorage.setItem('lobster_uid', id); }
  return id;
}

function today() { return new Date().toISOString().slice(0, 10); }

function getSessionMeta() {
  return {
    uid: uid(),
    ua: navigator.userAgent,
    screen: `${screen.width}x${screen.height}`,
    lang: navigator.language,
    ref: document.referrer || '',
    url: location.href,
  };
}

let sessionStart = Date.now();
let eventBuffer = [];
let heartbeatTimer = null;
let flushTimer = null;
let isVisible = true;
let activeSeconds = 0;
let lastActiveCheck = Date.now();

export const Analytics = {
  init() {
    this.track('session_start', getSessionMeta());
    setTimeout(() => this._flush(), 2000);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._accumulateActive();
        isVisible = false;
        this.track('tab_hidden', { activeSeconds });
      } else {
        isVisible = true;
        lastActiveCheck = Date.now();
        this.track('tab_visible');
      }
    });

    window.addEventListener('beforeunload', () => {
      this._accumulateActive();
      this.track('session_end', { duration: Math.round((Date.now() - sessionStart) / 1000), activeSeconds });
      this._flush(true);
    });

    heartbeatTimer = setInterval(() => {
      this._accumulateActive();
      this.track('heartbeat', { activeSeconds, duration: Math.round((Date.now() - sessionStart) / 1000) });
      this._flush();
    }, HEARTBEAT_INTERVAL);

    flushTimer = setInterval(() => this._flush(), FLUSH_INTERVAL);
  },

  track(event, data = {}) {
    eventBuffer.push({
      event,
      ts: Date.now(),
      day: today(),
      uid: uid(),
      ...data,
    });
    if (eventBuffer.length >= 20) this._flush();
  },

  trackInteraction(action, detail = {}) {
    this.track('interaction', { action, ...detail });
  },

  trackGameState(state) {
    this.track('game_state', {
      level: state.lobster?.level,
      personality: state.lobster?.personality,
      mood: state.lobster?.mood,
      energy: state.lobster?.energy,
      hunger: state.lobster?.hunger,
      shells: state.shells,
      goldenShard: state.inventory?.golden_shard || 0,
      goldenDrops: state.settings?.goldenDrops?.totalDrops || 0,
      tickCount: state.world?.tickCount,
      dayCount: state.world?.dayCount,
      season: state.world?.season,
    });
  },

  _accumulateActive() {
    if (isVisible) {
      activeSeconds += Math.round((Date.now() - lastActiveCheck) / 1000);
    }
    lastActiveCheck = Date.now();
  },

  _flush(sync = false) {
    if (eventBuffer.length === 0) return;
    const payload = JSON.stringify(eventBuffer);
    eventBuffer = [];

    if (sync && navigator.sendBeacon) {
      navigator.sendBeacon(ANALYTICS_ENDPOINT, payload);
      return;
    }

    fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    }).catch(() => {});
  },
};
