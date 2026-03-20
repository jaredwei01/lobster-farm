import { CONFIG, PERSONALITY_LABELS, GROWTH_STAGES } from './config.js';
import { WorldState } from './world-state.js';
import { SaveSystem } from './save-system.js';
import { SFX } from './sfx.js';

let itemsData = {};
let inventoryFilter = 'all';
let lastInventorySnapshot = {};
let diaryFilter = 'all';
let lastDiarySnapshot = [];
let lastFarmSnapshot = null;
let selectedPlotIndex = null;
let farmStrategy = 'balanced';
let actionTimer = null;
let _seaCloudTimer = null;
let _seaShipTimer = null;
let _seaSnowTimer = null;
const _isMobile = /Mobi|Android/i.test(navigator.userAgent) || (window.matchMedia && matchMedia('(pointer:coarse)').matches);
const ACTION_CLASSES = ['action-rest', 'action-eat', 'action-farm', 'action-cook', 'action-explore', 'action-shop', 'action-travel', 'action-socialize'];
const DIARY_FILTER_ORDER = ['all', 'story', 'weather', 'wisdom', 'horoscope', 'funny'];
const FARM_STRATEGIES = {
  balanced: {
    label: '稳健收益',
    desc: '优先收获成熟作物，再浇水，最后补种高性价比种子。',
  },
  growth: {
    label: '快速成长',
    desc: '优先浇水和补种，保持农田运转速度，成熟后立即轮作。',
  },
  saver: {
    label: '省资源',
    desc: '优先照料已有作物，谨慎补种，尽量消耗低成本种子。',
  },
};
const HOUSE_HOTSPOT_IDS = [
  'slot-bookshelf',
  'slot-decor',
  'slot-table',
  'slot-fireplace',
  'house-lobster',
  'trophy-shelf',
  'skill-wall',
];

export const UIRenderer = {
  async init() {
    const resp = await fetch('./data/items.json');
    itemsData = await resp.json();
    this._bindInventoryFilters();
    this._bindDiaryFilters();
    this._bindDiarySwipeGesture();
    this._bindMobileGestures();
    this._bindFarmStrategyControls();
    this._bindHouseHotspots();
    this._bindSeaInteractions();
  },

  destroy() {
    [this._seaBubbleTimer, this._seaCreatureTimer, _seaCloudTimer, _seaShipTimer, _seaSnowTimer, this._microActionTimer, this._rareEventTimer, this._emotionTimer, this._farCreatureTimer].forEach(id => {
      if (id) clearInterval(id);
    });
    this._seaBubbleTimer = this._seaCreatureTimer = this._microActionTimer = this._rareEventTimer = this._emotionTimer = this._farCreatureTimer = null;
    _seaCloudTimer = _seaShipTimer = _seaSnowTimer = null;
    this._seaBubblesInited = false;
  },

  renderAll(state) {
    this.renderHeader(state.world, state.shells);
    this.renderScene(state.world, state.lobster);
    this.renderStatusStrip(state);
    this.renderLobsterCard(state.lobster);
    this.renderSeaWindow(state);
    this.renderHouse(state);
    this.renderFarm(state.farm);
    this.renderInventory(state.inventory);
    this.renderDiary(state.eventLog);
    this.renderFooter(state.world);
  },

  renderScene(world, lobster) {
    document.body.dataset.time = world.timeOfDay;
    document.body.dataset.weather = world.weather;
    document.body.dataset.season = world.season;
    document.body.dataset.personality = lobster.personality || '';

    const moodClass = lobster.mood >= 70 ? 'mood-great' : lobster.mood >= 40 ? 'mood-ok' : 'mood-low';
    const lobsterCard = document.getElementById('lobster-card');
    lobsterCard.classList.remove('mood-great', 'mood-ok', 'mood-low');
    lobsterCard.classList.add(moodClass);
  },

  _seaBubblesInited: false,
  _seaBubbleTimer: null,

  renderSeaWindow(state) {
    const lobster = state.lobster;
    const el = document.getElementById('sea-lobster');
    if (!el) return;

    const lastAction = (lobster.memory && lobster.memory[0]?.action) || 'rest';
    const awayActions = new Set(['explore', 'shop', 'socialize', 'travel']);
    const isAway = Boolean(lobster.traveling) || awayActions.has(lastAction);

    const stageClasses = ['sea-stage-juvenile', 'sea-stage-teen', 'sea-stage-adult', 'sea-stage-elder'];
    el.classList.remove(...stageClasses);
    const lv = lobster.level || 1;
    if (lv >= 36) el.classList.add('sea-stage-elder');
    else if (lv >= 16) el.classList.add('sea-stage-adult');
    else if (lv >= 6) el.classList.add('sea-stage-teen');
    else el.classList.add('sea-stage-juvenile');

    const poses = ['pose-idle', 'pose-swim', 'pose-rock', 'pose-walk', 'pose-away'];
    el.classList.remove(...poses);

    if (isAway) {
      el.classList.add('pose-away');
    } else {
      const tick = state.world.tickCount || 0;
      const posePool = this._seaPoseForAction(lastAction, lobster, tick);
      el.classList.add(posePool);
    }

    const goldenEl = document.getElementById('sea-golden');
    if (goldenEl) {
      const inv = state.inventory || {};
      const hasGolden = (inv.golden_shard || 0) > 0 || (inv.golden_watering_can || 0) > 0 || (inv.golden_cookware || 0) > 0 || (inv.golden_charm || 0) > 0 || (inv.golden_hourglass || 0) > 0;
      goldenEl.classList.toggle('hidden', !hasGolden);
      if (hasGolden) {
        const icons = [];
        if (inv.golden_shard) icons.push('✨');
        if (inv.golden_watering_can) icons.push('🚿');
        if (inv.golden_cookware) icons.push('🍳');
        if (inv.golden_charm) icons.push('🍀');
        if (inv.golden_hourglass) icons.push('⏳');
        goldenEl.textContent = icons[state.world.tickCount % icons.length] || '✨';
      }
    }

    this._renderDecorations(state.farm.decorations || []);
    this._updateLobsterEmotion(lobster);

    if (!this._seaBubblesInited) {
      this._seaBubblesInited = true;
      this._startSeaBubbles();
      this._startSeaCreatures();
      this._startSkyClouds();
      this._startSkyShips();
      this._startSnowflakes();
      this._startMicroActions(state.lobster.personality);
      this._startRareEvents();
      this._startWaterClickRipples();
      this._startNightPlankton();
      this._startFarCreatures();
      this._positionMoonPath();
      this._startSurfaceGlints();
      this._startUnderwaterCurrents();
    }
  },

  _lastDecoHash: '',
  _renderDecorations(decorations) {
    const hash = JSON.stringify(decorations.map(d => ({ id: d.id, x: d.x, y: d.y })));
    if (hash === this._lastDecoHash) return;
    this._lastDecoHash = hash;

    const container = document.getElementById('sea-decorations');
    if (!container) return;
    container.innerHTML = '';

    const DECO_VISUALS = {
      lantern: { emoji: '🏮', bottom: '30px', left: '12%' },
      rock_garden: { emoji: '🪨', bottom: '26px', left: '78%' },
      wind_chime: { emoji: '🎐', bottom: '65%', left: '8%' },
      mini_lighthouse: { emoji: '🗼', bottom: '28px', left: '88%' },
      coral_flower: { emoji: '🌺', bottom: '28px', left: '25%' },
      shell_necklace: { emoji: '📿', bottom: '32px', left: '60%' },
    };

    const DECO_INTERACT = {
      lantern: { sfx: 'click', text: '灯笼摇曳着温暖的光~' },
      rock_garden: { sfx: 'click', text: '石头下面好像有东西...', reward: true },
      wind_chime: { sfx: 'harvest', text: '叮铃~ 风铃发出清脆的声响' },
      mini_lighthouse: { sfx: 'click', text: '灯塔的光束旋转着照亮海底' },
      coral_flower: { sfx: 'click', text: '珊瑚花轻轻摇摆' },
      shell_necklace: { sfx: 'click', text: '贝壳项链闪闪发光' },
    };

    for (const deco of decorations) {
      const vis = DECO_VISUALS[deco.id];
      if (!vis) continue;
      const el = document.createElement('div');
      el.className = 'sea-deco-item';
      el.dataset.decoId = deco.id;
      el.textContent = vis.emoji;
      el.style.left = vis.left;
      el.style.bottom = vis.bottom;

      const interact = DECO_INTERACT[deco.id];
      if (interact) {
        el.style.cursor = 'pointer';
        el.title = '点击互动';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (el.classList.contains('deco-click-anim')) return;
          el.classList.add('deco-click-anim');
          setTimeout(() => el.classList.remove('deco-click-anim'), 500);
          window.dispatchEvent(new CustomEvent('sea:deco-interact', {
            detail: { id: deco.id, text: interact.text, sfx: interact.sfx, reward: interact.reward },
          }));
        });
      }

      container.appendChild(el);
    }
  },

  _seaPoseForAction(action, lobster, tick) {
    if (lobster.energy <= 18) return 'pose-idle';
    const cycle = tick % 5;
    const p = lobster.personality;

    if (action === 'farm' || action === 'cook') return cycle <= 2 ? 'pose-walk' : 'pose-idle';
    if (action === 'eat') return p === 'gluttonous' ? 'pose-munch' : 'pose-rock';
    if (action === 'rest') return p === 'lazy' ? 'pose-idle' : (cycle <= 1 ? 'pose-idle' : 'pose-rock');

    if (p === 'adventurous') return cycle <= 2 ? 'pose-swim' : cycle === 3 ? 'pose-walk' : 'pose-idle';
    if (p === 'lazy') return cycle <= 3 ? 'pose-idle' : 'pose-rock';
    if (p === 'gluttonous') return cycle <= 1 ? 'pose-munch' : cycle <= 3 ? 'pose-idle' : 'pose-walk';
    if (p === 'scholarly') return cycle <= 2 ? 'pose-think' : cycle === 3 ? 'pose-idle' : 'pose-rock';
    if (p === 'social') return cycle <= 1 ? 'pose-swim' : cycle <= 3 ? 'pose-walk' : 'pose-idle';
    if (p === 'mischievous') return cycle <= 1 ? 'pose-bounce' : cycle <= 3 ? 'pose-swim' : 'pose-walk';

    return cycle === 0 ? 'pose-idle' : cycle <= 2 ? 'pose-swim' : cycle === 3 ? 'pose-rock' : 'pose-walk';
  },

  _startSeaBubbles() {
    const container = document.getElementById('sea-bubbles');
    if (!container) return;

    const maxBubbles = _isMobile ? 8 : 18;
    const spawnOne = (baseLeft, baseBottom) => {
      if (container.childElementCount > maxBubbles) return;
      const b = document.createElement('div');
      b.className = 'sea-bubble';
      const size = 2 + Math.random() * 6;
      b.style.width = `${size}px`;
      b.style.height = `${size}px`;
      b.style.left = `${baseLeft + (Math.random() - 0.5) * 6}%`;
      b.style.bottom = `${baseBottom + Math.random() * 15}%`;
      const dur = 3 + Math.random() * 4;
      b.style.setProperty('--dur', `${dur}s`);
      b.style.setProperty('--delay', '0s');
      if (size > 5) b.style.opacity = '0.35';
      container.appendChild(b);
      b.addEventListener('animationiteration', () => b.remove());
      setTimeout(() => { if (b.parentNode) b.remove(); }, (dur + 2) * 1000);
    };

    const spawn = () => {
      const left = 8 + Math.random() * 84;
      const bottom = Math.random() * 25;
      spawnOne(left, bottom);
      if (Math.random() < 0.35) {
        const count = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
          setTimeout(() => spawnOne(left, bottom), i * 200);
        }
      }
    };

    const initCount = _isMobile ? 2 : 5;
    for (let i = 0; i < initCount; i++) setTimeout(spawn, i * 600);
    this._seaBubbleTimer = setInterval(spawn, _isMobile ? 3000 + Math.random() * 2000 : 1200 + Math.random() * 1500);
  },

  _seaCreatureTimer: null,
  _CREATURE_TYPES: [
    { type: 'fish-school', weight: 28, anim: 'swimLeftToRight', dur: [8, 12], yRange: [15, 60], nightOk: false, clickEvent: 'fish_school' },
    { type: 'fish-school', weight: 18, anim: 'swimRightToLeft', dur: [9, 13], yRange: [20, 55], nightOk: false, clickEvent: 'fish_school' },
    { type: 'big-fish', weight: 16, anim: 'swimRightToLeft', dur: [10, 16], yRange: [20, 65], nightOk: true, clickEvent: 'big_fish' },
    { type: 'big-fish', weight: 10, anim: 'swimLeftToRight', dur: [11, 15], yRange: [25, 60], nightOk: true, clickEvent: 'big_fish' },
    { type: 'jellyfish', weight: 14, anim: 'jellyfishFloat', dur: [12, 18], yRange: [0, 0], nightOk: true, clickEvent: 'jellyfish' },
    { type: 'starfish', weight: 9, anim: 'crawlLeftToRight', dur: [18, 28], yRange: [0, 0], nightOk: true, clickEvent: 'starfish' },
    { type: 'crab', weight: 11, anim: 'crawlRightToLeft', dur: [14, 22], yRange: [0, 0], nightOk: true, clickEvent: 'crab' },
    { type: 'turtle', weight: 5, anim: 'turtleSwim', dur: [14, 20], yRange: [30, 55], nightOk: false, clickEvent: 'turtle' },
    { type: 'seahorse', weight: 12, anim: 'jellyfishFloat', dur: [14, 20], yRange: [0, 0], nightOk: true, clickEvent: 'seahorse' },
    { type: 'pufferfish', weight: 10, anim: 'swimLeftToRight', dur: [12, 16], yRange: [25, 55], nightOk: true, clickEvent: 'pufferfish' },
    { type: 'eel', weight: 8, anim: 'swimRightToLeft', dur: [9, 14], yRange: [50, 75], nightOk: true, clickEvent: 'eel' },
    { type: 'manta', weight: 4, anim: 'swimLeftToRight', dur: [16, 22], yRange: [15, 40], nightOk: false, clickEvent: 'manta' },
    { type: 'clownfish', weight: 15, anim: 'swimRightToLeft', dur: [7, 11], yRange: [30, 60], nightOk: false, clickEvent: 'clownfish' },
    { type: 'octopus', weight: 6, anim: 'crawlLeftToRight', dur: [16, 24], yRange: [0, 0], nightOk: true, clickEvent: 'octopus' },
    { type: 'whale', weight: 2, anim: 'swimLeftToRight', dur: [20, 28], yRange: [10, 30], nightOk: true, clickEvent: 'whale' },
    { type: 'anglerfish', weight: 7, anim: 'swimRightToLeft', dur: [12, 18], yRange: [40, 70], nightOk: true, nightOnly: true, clickEvent: 'anglerfish' },
  ],

  _CREATURE_CLICK_RESULTS: {
    fish_school: [
      { text: '鱼群被你吓跑了，散落了几枚贝壳！', reward: 'shells', value: 3 },
      { text: '鱼群好奇地围着龙虾转了一圈~', reward: 'mood', value: 3 },
    ],
    big_fish: [
      { text: '大鱼甩了甩尾巴，溅起一串水花', reward: 'mood', value: 2 },
      { text: '大鱼嘴里叼着什么东西...是一颗珍珠！', reward: 'shells', value: 8 },
    ],
    jellyfish: [
      { text: '水母轻轻碰了你一下，有点麻麻的', reward: 'exp', value: 2 },
      { text: '水母发出柔和的光芒，好治愈~', reward: 'mood', value: 5 },
    ],
    starfish: [
      { text: '海星慢悠悠地挥了挥触手', reward: 'mood', value: 2 },
      { text: '海星下面藏着一枚闪亮的贝壳！', reward: 'shells', value: 5 },
    ],
    crab: [
      { text: '螃蟹举起钳子示威，但看起来很可爱', reward: 'mood', value: 3 },
      { text: '螃蟹丢下了一块小石头就跑了', reward: 'exp', value: 3 },
    ],
    turtle: [
      { text: '海龟缓缓回头看了你一眼，充满智慧', reward: 'exp', value: 8 },
      { text: '海龟背上长满了漂亮的海藻花纹', reward: 'mood', value: 5 },
    ],
    seahorse: [
      { text: '海马害羞地躲到海草后面去了', reward: 'mood', value: 3 },
      { text: '海马跳了一支小舞蹈！', reward: 'mood', value: 6 },
    ],
    pufferfish: [
      { text: '河豚受惊膨胀成了一个圆球！好可爱', reward: 'mood', value: 5 },
      { text: '河豚鼓着腮帮子瞪着你', reward: 'mood', value: 2 },
    ],
    eel: [
      { text: '鳗鱼从石缝中探出头来，又缩了回去', reward: 'exp', value: 3 },
      { text: '鳗鱼身上的花纹在水中闪闪发光', reward: 'mood', value: 3 },
    ],
    manta: [
      { text: '蝠鲼优雅地从头顶掠过，像一架飞机', reward: 'mood', value: 8 },
      { text: '蝠鲼翻了个身，露出白色的肚皮', reward: 'exp', value: 5 },
    ],
    clownfish: [
      { text: '小丑鱼在海葵间穿梭，色彩斑斓', reward: 'mood', value: 4 },
      { text: '小丑鱼好像在跟龙虾打招呼！', reward: 'mood', value: 3 },
    ],
    octopus: [
      { text: '章鱼喷了一团墨汁就溜了！', reward: 'exp', value: 4 },
      { text: '章鱼用触手递过来一个小贝壳', reward: 'shells', value: 6 },
    ],
    whale: [
      { text: '鲸鱼的歌声在海底回荡，龙虾听得入迷', reward: 'mood', value: 12 },
      { text: '鲸鱼庞大的身影从远处掠过，太壮观了！', reward: 'exp', value: 10 },
    ],
    anglerfish: [
      { text: '灯笼鱼头顶的光球在黑暗中摇曳', reward: 'mood', value: 4 },
      { text: '灯笼鱼照亮了一小片海底，发现了宝贝！', reward: 'shells', value: 10 },
    ],
  },

  _startSeaCreatures() {
    const container = document.getElementById('sea-creatures');
    if (!container) return;

    const spawn = () => {
      if (container.childElementCount >= 8) return;
      const time = document.body.dataset.time || 'morning';
      const weather = document.body.dataset.weather || 'sunny';
      if (weather === 'stormy' && Math.random() < 0.5) return;

      const isNight = time === 'night';
      const pool = this._CREATURE_TYPES.filter(c => {
        if (c.nightOnly && !isNight) return false;
        return isNight ? c.nightOk : true;
      });
      const totalWeight = pool.reduce((s, c) => s + c.weight, 0);
      let r = Math.random() * totalWeight;
      let chosen = pool[0];
      for (const c of pool) { r -= c.weight; if (r <= 0) { chosen = c; break; } }

      const el = document.createElement('div');
      el.className = `sea-creature sea-${chosen.type}`;
      el.dataset.clickEvent = chosen.clickEvent || '';

      if (chosen.type === 'fish-school' || chosen.type === 'clownfish') {
        const count = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
          const dot = document.createElement('div');
          dot.className = chosen.type === 'clownfish' ? 'clown-dot' : 'fish-dot';
          el.appendChild(dot);
        }
      }

      const dur = chosen.dur[0] + Math.random() * (chosen.dur[1] - chosen.dur[0]);

      if (chosen.type === 'jellyfish' || chosen.type === 'seahorse') {
        el.style.left = `${10 + Math.random() * 80}%`;
        el.style.bottom = '10%';
      } else if (['starfish', 'crab', 'octopus'].includes(chosen.type)) {
        el.style.bottom = `${24 + Math.random() * 6}px`;
      } else {
        const y = chosen.yRange[0] + Math.random() * (chosen.yRange[1] - chosen.yRange[0]);
        el.style.top = `${y}%`;
      }

      el.style.animation = `${chosen.anim} ${dur}s linear forwards`;
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';

      const depthY = parseFloat(el.style.top) || (100 - parseFloat(el.style.bottom || '30'));
      const depthFactor = 0.6 + (depthY / 100) * 0.4;
      if (depthY < 30) {
        el.style.opacity = `${0.35 + Math.random() * 0.15}`;
        if (!_isMobile) el.style.filter = `blur(0.5px) brightness(1.1)`;
        el.style.transform = `scale(${0.7 + Math.random() * 0.1})`;
      } else if (depthY > 65) {
        el.style.opacity = `${0.5 + Math.random() * 0.2}`;
        if (!_isMobile) el.style.filter = `brightness(${0.8 + depthFactor * 0.1})`;
      }

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this._onCreatureClick(chosen.clickEvent, el);
      }, { once: true });

      container.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
      setTimeout(() => { if (el.parentNode) el.remove(); }, (dur + 2) * 1000);

      this._lobsterReactToCreature(chosen.type, dur);
    };

    setTimeout(spawn, 1500);
    this._seaCreatureTimer = setInterval(spawn, _isMobile ? 8000 + Math.random() * 6000 : 4000 + Math.random() * 4000);
  },

  _lastEmotionState: '',
  _emotionTimer: null,
  _updateLobsterEmotion(lobster) {
    const el = document.getElementById('sea-lobster');
    if (!el) return;

    let emotionKey = 'neutral';
    if (lobster.mood >= 81) emotionKey = 'ecstatic';
    else if (lobster.mood >= 51) emotionKey = 'happy';
    else if (lobster.mood <= 20) emotionKey = 'sad';
    if (lobster.hunger >= 61) emotionKey = 'hungry';
    if (lobster.energy <= 15) emotionKey = 'tired';

    if (emotionKey === this._lastEmotionState) return;
    this._lastEmotionState = emotionKey;

    el.querySelectorAll('.lobster-glow').forEach(g => g.remove());
    if (this._emotionTimer) clearInterval(this._emotionTimer);
    this._emotionTimer = null;

    const em = _isMobile ? 1.8 : 1;
    if (emotionKey === 'ecstatic') {
      const glow = document.createElement('div');
      glow.className = 'lobster-glow lobster-glow-happy';
      el.appendChild(glow);
      this._emotionTimer = setInterval(() => this._spawnEmotionParticle(el, '💕'), 4000 * em);
    } else if (emotionKey === 'happy') {
      this._emotionTimer = setInterval(() => {
        if (Math.random() < 0.5) this._spawnEmotionParticle(el, ['♪', '♫', '~'][Math.floor(Math.random() * 3)]);
      }, 5000 * em);
    } else if (emotionKey === 'hungry') {
      this._emotionTimer = setInterval(() => this._spawnEmotionParticle(el, '💭'), 4500 * em);
    } else if (emotionKey === 'tired') {
      const glow = document.createElement('div');
      glow.className = 'lobster-glow lobster-glow-tired';
      el.appendChild(glow);
      this._emotionTimer = setInterval(() => this._spawnEmotionParticle(el, '💤'), 3500 * em);
    } else if (emotionKey === 'sad') {
      this._emotionTimer = setInterval(() => this._spawnEmotionParticle(el, '😢'), 5000 * em);
    }
  },

  _spawnEmotionParticle(parent, emoji) {
    const p = document.createElement('div');
    p.className = 'lobster-emotion';
    p.textContent = emoji;
    p.style.left = `${45 + Math.random() * 10}%`;
    parent.appendChild(p);
    setTimeout(() => p.remove(), 2500);
  },

  _lastReactTime: 0,
  _lobsterReactToCreature(creatureType, dur) {
    const now = Date.now();
    if (now - this._lastReactTime < 6000) return;
    if (Math.random() > 0.4) return;
    this._lastReactTime = now;

    const lobsterEl = document.getElementById('sea-lobster');
    if (!lobsterEl || lobsterEl.classList.contains('pose-away')) return;

    const personality = document.body.dataset.personality || '';
    const big = ['whale', 'manta', 'turtle'];
    const small = ['fish-school', 'clownfish', 'seahorse'];
    const scary = ['eel', 'anglerfish'];
    const friendly = ['crab', 'octopus', 'starfish'];

    let reaction = null;

    if (big.includes(creatureType)) {
      if (personality === 'adventurous') reaction = { cls: 'react-chase', emoji: '✨', dur: 2000 };
      else reaction = { cls: 'react-flinch', emoji: '😮', dur: 1200 };
    } else if (scary.includes(creatureType)) {
      if (personality === 'mischievous') reaction = { cls: 'react-chase', emoji: '😈', dur: 1500 };
      else reaction = { cls: 'react-flinch', emoji: '😰', dur: 1000 };
    } else if (small.includes(creatureType) && personality === 'gluttonous') {
      reaction = { cls: 'react-chase', emoji: '🤤', dur: 1800 };
    } else if (friendly.includes(creatureType)) {
      if (personality === 'social') reaction = { cls: 'react-approach', emoji: '👋', dur: 2000 };
      else if (Math.random() < 0.5) reaction = { cls: 'react-stare', emoji: '👀', dur: 1500 };
    } else if (Math.random() < 0.3) {
      reaction = { cls: 'react-stare', emoji: '👀', dur: 1200 };
    }

    if (!reaction) return;

    lobsterEl.classList.add(reaction.cls);
    const bubble = document.createElement('div');
    bubble.className = 'lobster-react-bubble';
    bubble.textContent = reaction.emoji;
    lobsterEl.appendChild(bubble);

    setTimeout(() => {
      lobsterEl.classList.remove(reaction.cls);
      bubble.remove();
    }, reaction.dur);
  },

  _microActionTimer: null,
  _startMicroActions(personality) {
    const lobsterEl = document.getElementById('sea-lobster');
    if (!lobsterEl) return;

    const MICRO_WEIGHTS = {
      adventurous: { bubble: 2, yawn: 1, wave: 3, look: 4 },
      lazy:        { bubble: 3, yawn: 5, wave: 1, look: 1 },
      gluttonous:  { bubble: 2, yawn: 3, wave: 2, look: 3 },
      scholarly:   { bubble: 4, yawn: 2, wave: 1, look: 3 },
      social:      { bubble: 2, yawn: 1, wave: 4, look: 3 },
      mischievous: { bubble: 3, yawn: 1, wave: 3, look: 3 },
    };
    const weights = MICRO_WEIGHTS[personality] || MICRO_WEIGHTS.social;
    const pool = [];
    for (const [act, w] of Object.entries(weights)) for (let i = 0; i < w; i++) pool.push(act);

    const doAction = () => {
      const act = pool[Math.floor(Math.random() * pool.length)];
      if (act === 'bubble') {
        const b = document.createElement('div');
        b.className = 'lobster-micro-bubble';
        b.textContent = '💭';
        lobsterEl.appendChild(b);
        setTimeout(() => b.remove(), 2000);
      } else if (act === 'yawn') {
        lobsterEl.classList.add('micro-yawn');
        setTimeout(() => lobsterEl.classList.remove('micro-yawn'), 1200);
      } else if (act === 'wave') {
        lobsterEl.classList.add('micro-wave');
        setTimeout(() => lobsterEl.classList.remove('micro-wave'), 1000);
      } else if (act === 'look') {
        lobsterEl.classList.add('micro-look');
        setTimeout(() => lobsterEl.classList.remove('micro-look'), 1500);
      }
    };

    const schedule = () => {
      const delay = _isMobile ? 14000 + Math.random() * 10000 : 8000 + Math.random() * 7000;
      this._microActionTimer = setTimeout(() => { doAction(); schedule(); }, delay);
    };
    schedule();
  },

  _rareEventTimer: null,
  _startRareEvents() {
    const waterEl = document.querySelector('.sea-water');
    if (!waterEl) return;

    const tryEvent = () => {
      const roll = Math.random();
      if (roll < 0.08) this._rareWhalePass(waterEl);
      else if (roll < 0.14) this._rareJellyBloom(waterEl);
      else if (roll < 0.20) this._rareTreasureChest(waterEl);
      else if (roll < 0.24) this._rareRainbow();
    };

    this._rareEventTimer = setInterval(tryEvent, _isMobile ? 50000 + Math.random() * 40000 : 30000 + Math.random() * 30000);
  },

  _rareWhalePass(container) {
    const el = document.createElement('div');
    el.className = 'sea-whale-pass';
    el.textContent = '🐋';
    container.appendChild(el);
    setTimeout(() => el.remove(), 16000);
    this.showNotification('🐋 远处有鲸鱼经过...', 3000);
  },

  _rareJellyBloom(container) {
    const wrap = document.createElement('div');
    wrap.className = 'sea-jelly-bloom';
    wrap.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3;';
    const count = 8 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const j = document.createElement('div');
      j.className = 'jelly-bloom-item';
      j.textContent = '🪼';
      j.style.left = `${5 + Math.random() * 90}%`;
      j.style.bottom = `${10 + Math.random() * 60}%`;
      j.style.setProperty('--jb-dur', `${6 + Math.random() * 4}s`);
      j.style.setProperty('--jb-delay', `${Math.random() * 2}s`);
      wrap.appendChild(j);
    }
    container.appendChild(wrap);
    setTimeout(() => wrap.remove(), 14000);
    this.showNotification('🪼 水母大爆发！', 3000);
  },

  _rareTreasureChest(container) {
    const el = document.createElement('div');
    el.className = 'sea-treasure-chest';
    el.textContent = '🧰';
    el.style.left = `${20 + Math.random() * 60}%`;
    el.addEventListener('click', () => {
      const reward = 5 + Math.floor(Math.random() * 10);
      window.dispatchEvent(new CustomEvent('sea:treasure-found', { detail: { shells: reward } }));
      el.style.transition = 'transform 0.3s, opacity 0.3s';
      el.style.transform = 'scale(1.5)';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    }, { once: true });
    container.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 12000);
    this.showNotification('✨ 海底出现了一个宝箱！快点击！', 3000);
  },

  _rareRainbow() {
    const surface = document.querySelector('.sea-surface');
    if (!surface) return;
    const weather = document.body.dataset.weather;
    if (weather !== 'rainy' && weather !== 'breezy' && Math.random() > 0.3) return;
    const el = document.createElement('div');
    el.className = 'sea-rainbow';
    surface.appendChild(el);
    setTimeout(() => el.remove(), 9000);
    this.showNotification('🌈 彩虹出现了！', 3000);
  },

  _startWaterClickRipples() {
    const waterEl = document.querySelector('.sea-water');
    if (!waterEl) return;
    waterEl.addEventListener('click', (e) => {
      const rect = waterEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (waterEl.querySelectorAll('.sea-ripple-group').length >= 3) return;

      const group = document.createElement('div');
      group.className = 'sea-ripple-group';
      group.style.left = `${x}px`;
      group.style.top = `${y}px`;

      for (let i = 0; i < 3; i++) {
        const ring = document.createElement('div');
        ring.className = 'sea-ripple-ring';
        group.appendChild(ring);
      }

      const distort = document.createElement('div');
      distort.className = 'sea-ripple-distort';
      group.appendChild(distort);

      const splashCount = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < splashCount; i++) {
        const splash = document.createElement('div');
        splash.className = 'sea-ripple-splash';
        const angle = (Math.PI * 2 * i) / splashCount + (Math.random() - 0.5) * 0.5;
        const dist = 8 + Math.random() * 14;
        splash.style.setProperty('--sx', `${Math.cos(angle) * dist}px`);
        splash.style.setProperty('--sy', `${Math.sin(angle) * dist}px`);
        splash.style.setProperty('--sdelay', `${Math.random() * 0.15}s`);
        group.appendChild(splash);
      }

      waterEl.appendChild(group);
      setTimeout(() => group.remove(), 2000);
    });
  },

  _startNightPlankton() {
    const container = document.getElementById('sea-bio-plankton');
    if (!container) return;
    const count = _isMobile ? 8 : 20;
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('div');
      dot.className = 'sea-plankton-dot';
      dot.style.left = `${3 + Math.random() * 94}%`;
      dot.style.top = `${5 + Math.random() * 85}%`;
      const size = 1.5 + Math.random() * 2;
      dot.style.setProperty('--ps', `${size}px`);
      dot.style.setProperty('--pdur', `${10 + Math.random() * 12}s`);
      dot.style.setProperty('--pdelay', `${-Math.random() * 15}s`);
      dot.style.setProperty('--px1', `${(Math.random() - 0.5) * 16}px`);
      dot.style.setProperty('--py1', `${(Math.random() - 0.5) * 12}px`);
      dot.style.setProperty('--px2', `${(Math.random() - 0.5) * 14}px`);
      dot.style.setProperty('--py2', `${(Math.random() - 0.5) * 10}px`);
      dot.style.setProperty('--px3', `${(Math.random() - 0.5) * 18}px`);
      dot.style.setProperty('--py3', `${(Math.random() - 0.5) * 14}px`);
      container.appendChild(dot);
    }
  },

  _farCreatureTimer: null,
  _FAR_CREATURES: ['🐋', '🦈', '🐙', '🐢', '🐬'],
  _startFarCreatures() {
    const container = document.getElementById('sea-creatures-far');
    if (!container) return;

    const spawn = () => {
      if (container.childElementCount >= 2) return;
      const emoji = this._FAR_CREATURES[Math.floor(Math.random() * this._FAR_CREATURES.length)];
      const el = document.createElement('div');
      el.className = 'sea-far-creature';
      el.textContent = emoji;
      const goRight = Math.random() > 0.5;
      const dur = 35 + Math.random() * 20;
      const y = 15 + Math.random() * 50;
      el.style.top = `${y}%`;
      el.style.animation = `${goRight ? 'farCreatureSwim' : 'farCreatureSwimReverse'} ${dur}s linear forwards`;
      el.style.opacity = `${0.06 + Math.random() * 0.06}`;
      container.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
      setTimeout(() => { if (el.parentNode) el.remove(); }, (dur + 2) * 1000);
    };

    setTimeout(spawn, 8000);
    this._farCreatureTimer = setInterval(spawn, _isMobile ? 40000 + Math.random() * 30000 : 25000 + Math.random() * 20000);
  },

  _positionMoonPath() {
    const moonPath = document.getElementById('sea-moon-path');
    const moon = document.getElementById('sea-moon');
    if (!moonPath || !moon) return;
    const updatePos = () => {
      const moonRect = moon.getBoundingClientRect();
      const waterEl = document.querySelector('.sea-water');
      if (!waterEl) return;
      const waterRect = waterEl.getBoundingClientRect();
      moonPath.style.left = `${moonRect.left - waterRect.left + moonRect.width / 2 - 20}px`;
    };
    updatePos();
    setInterval(updatePos, _isMobile ? 15000 : 5000);
  },

  _startSurfaceGlints() {
    const container = document.getElementById('sea-surface-glints');
    if (!container) return;
    const glintCount = _isMobile ? 5 : 12;
    for (let i = 0; i < glintCount; i++) {
      const g = document.createElement('div');
      g.className = 'sea-glint';
      g.style.left = `${2 + Math.random() * 96}%`;
      g.style.top = `${Math.random() * 10}px`;
      g.style.setProperty('--gdur', `${1.5 + Math.random() * 2.5}s`);
      g.style.setProperty('--gdelay', `${-Math.random() * 4}s`);
      if (Math.random() > 0.6) {
        g.style.width = '3px';
        g.style.height = '1px';
        g.style.borderRadius = '1px';
      }
      container.appendChild(g);
    }
  },

  _startUnderwaterCurrents() {
    if (_isMobile) return;
    const waterEl = document.querySelector('.sea-water');
    if (!waterEl) return;
    const container = document.createElement('div');
    container.className = 'sea-currents';
    container.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden;';
    for (let i = 0; i < 4; i++) {
      const line = document.createElement('div');
      line.className = 'sea-current-line';
      line.style.top = `${20 + i * 18 + Math.random() * 8}%`;
      line.style.setProperty('--cdur', `${18 + Math.random() * 12}s`);
      line.style.setProperty('--cdelay', `${-Math.random() * 15}s`);
      container.appendChild(line);
    }
    waterEl.insertBefore(container, waterEl.firstChild);
  },

  _onCreatureClick(eventType, el) {
    const results = this._CREATURE_CLICK_RESULTS[eventType];
    if (!results || results.length === 0) return;

    el.style.pointerEvents = 'none';
    el.style.transition = 'opacity 0.3s, transform 0.3s';
    el.style.opacity = '0.3';
    el.style.transform += ' scale(1.3)';

    const result = results[Math.floor(Math.random() * results.length)];

    window.dispatchEvent(new CustomEvent('sea:creature-interact', {
      detail: { eventType, text: result.text, reward: result.reward, value: result.value },
    }));
  },

  _startSkyClouds() {
    const container = document.getElementById('sea-clouds');
    if (!container) return;

    const spawnCloud = () => {
      if (container.childElementCount >= 5) return;
      const cloud = document.createElement('div');
      cloud.className = 'sea-cloud';
      const w = 20 + Math.random() * 25;
      const h = 6 + Math.random() * 6;
      cloud.style.width = `${w}px`;
      cloud.style.height = `${h}px`;
      cloud.style.top = `${4 + Math.random() * 16}px`;
      const dur = 30 + Math.random() * 25;
      cloud.style.animation = `cloudDrift ${dur}s linear forwards`;
      container.appendChild(cloud);
      cloud.addEventListener('animationend', () => cloud.remove());
      setTimeout(() => { if (cloud.parentNode) cloud.remove(); }, (dur + 2) * 1000);
    };

    spawnCloud();
    setTimeout(spawnCloud, 5000);
    _seaCloudTimer = setInterval(spawnCloud, 12000 + Math.random() * 10000);
  },

  _startSkyShips() {
    const container = document.getElementById('sea-sky-fx');
    if (!container) return;

    const spawnShip = () => {
      const time = document.body.dataset.time || 'morning';
      if (time === 'night' && Math.random() < 0.7) return;
      if (container.querySelectorAll('.sea-ship').length >= 2) return;

      const ship = document.createElement('div');
      ship.className = 'sea-ship';
      ship.innerHTML = '<div class="sea-ship-hull"></div><div class="sea-ship-sail"></div>';
      const dur = 18 + Math.random() * 12;
      ship.style.animation = `sailAcross ${dur}s linear forwards`;
      container.appendChild(ship);
      ship.addEventListener('animationend', () => ship.remove());
      setTimeout(() => { if (ship.parentNode) ship.remove(); }, (dur + 2) * 1000);
    };

    setTimeout(spawnShip, 10000);
    _seaShipTimer = setInterval(spawnShip, 30000 + Math.random() * 20000);
  },

  _startSnowflakes() {
    const container = document.getElementById('sea-sky-fx');
    if (!container) return;

    _seaSnowTimer = setInterval(() => {
      const weather = document.body.dataset.weather || 'sunny';
      if (weather !== 'snowy') return;
      const maxSnow = _isMobile ? 5 : 10;
      if (container.querySelectorAll('.sea-snowflake').length >= maxSnow) return;

      const flake = document.createElement('div');
      flake.className = 'sea-snowflake';
      const size = 2 + Math.random() * 2;
      flake.style.width = `${size}px`;
      flake.style.height = `${size}px`;
      flake.style.left = `${Math.random() * 100}%`;
      flake.style.top = '0';
      const dur = 3 + Math.random() * 3;
      flake.style.animation = `snowflakeFall ${dur}s linear forwards`;
      container.appendChild(flake);
      flake.addEventListener('animationend', () => flake.remove());
      setTimeout(() => { if (flake.parentNode) flake.remove(); }, (dur + 1) * 1000);
    }, 400);
  },

  _bindSeaInteractions() {
    const lobster = document.getElementById('sea-lobster');
    if (lobster) {
      lobster.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('lobster:pet-request'));
      });
    }

    const rockL = document.getElementById('sea-rock-left');
    const rockR = document.getElementById('sea-rock-right');
    const rockClick = () => {
      window.dispatchEvent(new CustomEvent('mud:trigger'));
    };
    if (rockL) rockL.addEventListener('click', rockClick);
    if (rockR) rockR.addEventListener('click', rockClick);

    const golden = document.getElementById('sea-golden');
    if (golden) {
      golden.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('sea:golden-click'));
      });
    }
  },

  renderHeader(world, shells) {
    const weatherLabel = CONFIG.WEATHER_LABELS[world.weather] || world.weather;
    const seasonLabel = CONFIG.SEASON_LABELS[world.season] || world.season;
    const dayInSeason = ((world.dayCount - 1) % CONFIG.DAYS_PER_SEASON) + 1;

    document.getElementById('weather-display').textContent = weatherLabel;
    document.getElementById('season-display').textContent = `${seasonLabel} 第${dayInSeason}天`;
    document.getElementById('shells-display').textContent = `🐚 ${shells}`;
  },

  renderStatusStrip(state) {
    const lobster = state.lobster;
    const farm = state.farm;
    const stage = GROWTH_STAGES.find((s) => lobster.level >= s.minLevel && lobster.level <= s.maxLevel) || GROWTH_STAGES[0];
    const plantedCount = farm.plots.filter((plot) => Boolean(plot.crop)).length;

    const tiers = CONFIG.STAT_TIERS;
    const moodTier = tiers.mood.find(t => lobster.mood >= t.min && lobster.mood <= t.max) || tiers.mood[1];
    const energyTier = tiers.energy.find(t => lobster.energy >= t.min && lobster.energy <= t.max) || tiers.energy[2];

    document.getElementById('badge-growth').textContent = `Lv.${lobster.level} ${stage.name}`;
    document.getElementById('badge-mood').textContent = `${moodTier.emoji} ${moodTier.name}`;
    document.getElementById('badge-energy').textContent = `${energyTier.emoji} ${energyTier.name}`;
    document.getElementById('badge-farm').textContent = `${plantedCount}/${farm.plots.length} 已种`;
  },

  renderHouse(state) {
    const lobster = state.lobster;
    const house = state.house || {};

    const lastAction = (lobster.memory && lobster.memory[0]?.action) || 'rest';
    const awayActions = new Set(['explore', 'shop', 'socialize', 'travel']);
    const isAway = Boolean(lobster.traveling) || awayActions.has(lastAction);

    const stageMap = { 1: 'stage-juvenile', 6: 'stage-teen', 16: 'stage-adult', 36: 'stage-elder' };
    let stageClass = 'stage-juvenile';
    for (const [minLv, cls] of Object.entries(stageMap)) {
      if (lobster.level >= Number(minLv)) stageClass = cls;
    }

    const sprite = document.getElementById('house-lobster-sprite');
    if (sprite) {
      const poseClass = this._resolveHousePose(lastAction, lobster, state.world.tickCount, isAway);
      sprite.className = `ph-lobster-sprite ${stageClass} ${poseClass} ${isAway ? 'is-away' : ''}`;
    }

    const foodTray = document.getElementById('house-food-tray');
    if (foodTray) {
      if (lastAction === 'eat' && !isAway) foodTray.textContent = '🍽️';
      else if (lastAction === 'cook' && !isAway) foodTray.textContent = '🍳';
      else foodTray.textContent = '';
    }

    const awayNote = document.getElementById('house-away-note');
    const noteText = document.getElementById('away-note-text');
    const noteItem = document.getElementById('away-note-item');
    const awayFootprints = document.getElementById('away-footprints');
    const awayPostcard = document.getElementById('away-postcard');
    if (awayNote) {
      if (isAway) {
        awayNote.classList.remove('hidden');
        const notes = {
          explore: ['出去探索了~', '去冒险了，别担心', '寻宝去了！'],
          shop: ['去逛街了~', '出门购物中', '去集市了！'],
          socialize: ['找朋友玩去了', '出门串门了~', '去聊天了！'],
          travel: ['去远方旅行了', '寄明信片中…', '已踏上旅途！'],
        };
        const pool = notes[lastAction] || ['出门了~'];
        if (noteText) noteText.textContent = pool[Math.floor(state.world.tickCount * 7 % pool.length)];
        const leftItems = ['🍵', '🍪', '📖', '🧣', '🪶'];
        if (noteItem) noteItem.textContent = leftItems[state.world.tickCount % leftItems.length];
        if (awayFootprints) {
          const trails = ['👣 👣', '👣  🫧  👣', '🐾 👣'];
          awayFootprints.textContent = trails[state.world.tickCount % trails.length];
        }
        if (awayPostcard) awayPostcard.textContent = this._latestPostcardPreview(state);
      } else {
        awayNote.classList.add('hidden');
        if (awayPostcard) awayPostcard.textContent = '';
      }
    }

    const labelEl = document.getElementById('house-action-label');
    const actionLabels = { rest: '💤 休息中', eat: '🍽️ 进食中', cook: '🍳 做饭中', farm: '🌱 务农中', explore: '🔍 探索中', shop: '🏪 逛街中', socialize: '💬 聊天中', travel: '🧳 旅行中' };
    if (labelEl) labelEl.textContent = isAway ? '🚪 外出中' : (actionLabels[lastAction] || '');

    const statusBar = document.getElementById('house-status-bar');
    if (statusBar) {
      const day = state.world.dayCount || 1;
      const tCount = (house.trophies || []).length;
      const roofNames = ['茅草', '木板', '石板', '水晶'];
      const roofLv = lobster.level >= 36 ? 3 : lobster.level >= 16 ? 2 : lobster.level >= 6 ? 1 : 0;
      const topSkill = Object.entries(lobster.skills || {}).sort((a, b) => b[1] - a[1])[0];
      const skillText = topSkill ? `${this._skillLabel(topSkill[0])} Lv.${topSkill[1]}` : '';
      statusBar.textContent = `第${day}天 | 纪念品 ${tCount}件 | ${skillText} | 屋顶：${roofNames[roofLv]}`;
    }
  },

  _skillLabel(skill) {
    const map = { farming: '农耕', cooking: '烹饪', exploring: '探索', social: '社交' };
    return map[skill] || skill;
  },

  _resolveHousePose(action, lobster, tickCount, isAway) {
    if (isAway) return 'pose-away';
    if (lobster.energy <= 18) return 'pose-sleep';
    if (lobster.hunger >= 78) return 'pose-prone';
    const cycle = tickCount % 4;
    if (action === 'farm') return cycle <= 1 ? 'pose-work' : 'pose-walk';
    if (action === 'explore' || action === 'travel') return 'pose-walk';
    if (action === 'socialize') return cycle % 2 === 0 ? 'pose-look' : 'pose-sit';
    if (action === 'eat') return 'pose-prone';
    if (action === 'cook') return cycle % 2 === 0 ? 'pose-look' : 'pose-sit';
    if (action === 'shop') return 'pose-walk';
    return cycle === 0 ? 'pose-look' : cycle === 1 ? 'pose-sit' : cycle === 2 ? 'pose-prone' : 'pose-sit';
  },

  _latestPostcardPreview(state) {
    const postcards = state.collections?.postcards || [];
    if (!postcards.length) return '📮 暂无新明信片，等它回家带故事。';
    const latest = postcards[postcards.length - 1];
    const icon = latest.destinationIcon || '🏝️';
    const name = latest.destinationName || latest.destination || '远方';
    return `📮 ${icon} 来自${name}的明信片`;
  },

  setFarmStrategy(strategy) {
    if (!FARM_STRATEGIES[strategy]) return;
    farmStrategy = strategy;
    this._syncFarmStrategyUI();

    if (lastFarmSnapshot) {
      if (selectedPlotIndex === null) this._renderEmptyFarmInspector();
      else {
        const selected = lastFarmSnapshot.plots?.[selectedPlotIndex];
        if (selected) this._showFarmInspector(selected, selectedPlotIndex, lastFarmSnapshot.plots.length);
        else this._renderEmptyFarmInspector();
      }
    }
  },

  renderLobsterCard(lobster) {
    const stage = GROWTH_STAGES.find((s) => lobster.level >= s.minLevel && lobster.level <= s.maxLevel) || GROWTH_STAGES[0];

    document.getElementById('lobster-name-display').textContent = lobster.name;
    document.getElementById('lobster-personality-display').textContent =
      PERSONALITY_LABELS[lobster.personality] || lobster.personality;

    const expNeeded = Math.round(CONFIG.EXP_BASE * Math.pow(1 + lobster.level * CONFIG.EXP_GROWTH_FACTOR, 2));
    const expPct = Math.min(100, Math.round((lobster.exp / expNeeded) * 100));
    document.getElementById('lobster-level-display').textContent =
      `等级${lobster.level} ${stage.name}`;

    const expBar = document.getElementById('exp-bar');
    const expLabel = document.getElementById('exp-label');
    if (expBar) expBar.style.width = `${expPct}%`;
    if (expLabel) expLabel.textContent = `${lobster.exp}/${expNeeded}`;

    const tiers = CONFIG.STAT_TIERS;
    const moodTier = tiers.mood.find(t => lobster.mood >= t.min && lobster.mood <= t.max) || tiers.mood[1];
    const energyTier = tiers.energy.find(t => lobster.energy >= t.min && lobster.energy <= t.max) || tiers.energy[2];
    const hungerTier = tiers.hunger.find(t => lobster.hunger >= t.min && lobster.hunger <= t.max) || tiers.hunger[0];

    const fullness = CONFIG.LOBSTER_MAX_STAT - lobster.hunger;
    document.getElementById('mood-bar').style.width = `${lobster.mood}%`;
    document.getElementById('mood-value').textContent = `${moodTier.emoji} ${lobster.mood}`;
    document.getElementById('energy-bar').style.width = `${lobster.energy}%`;
    document.getElementById('energy-value').textContent = `${energyTier.emoji} ${lobster.energy}`;
    document.getElementById('hunger-bar').style.width = `${fullness}%`;
    document.getElementById('hunger-value').textContent = `${hungerTier.emoji} ${fullness}`;

    const avatar = document.getElementById('lobster-avatar');
    avatar.classList.remove('mood-great', 'mood-ok', 'mood-low');
    if (lobster.mood >= 70) avatar.classList.add('mood-great');
    else if (lobster.mood >= 40) avatar.classList.add('mood-ok');
    else avatar.classList.add('mood-low');
  },

  playAction(action) {
    const avatar = document.getElementById('lobster-avatar');
    if (!avatar) return;

    avatar.classList.remove(...ACTION_CLASSES);
    const actionClass = `action-${action}`;
    if (!ACTION_CLASSES.includes(actionClass)) return;

    if (actionTimer) clearTimeout(actionTimer);
    avatar.classList.add(actionClass);
    actionTimer = setTimeout(() => {
      avatar.classList.remove(actionClass);
      actionTimer = null;
    }, 950);
  },

  renderFarm(farm) {
    lastFarmSnapshot = JSON.parse(JSON.stringify(farm));
    const container = document.getElementById('farm-plots');
    container.innerHTML = '';

    for (const [plotIndex, plot] of farm.plots.entries()) {
      const div = document.createElement('div');
      div.className = 'farm-plot';
      div.dataset.plotIndex = String(plotIndex);
      if (selectedPlotIndex === plotIndex) div.classList.add('selected');

      if (plot.crop) {
        div.classList.add('has-crop');
        const isRipe = plot.growthStage >= plot.maxGrowth;
        if (isRipe) div.classList.add('ripe');

        const cropEmojis = {
          seaweed: ['🌱', '🌿', '🥬'],
          coral_rose: ['🌱', '🌸', '🌺'],
          sun_kelp: ['🌱', '☀️', '🌾'],
          amber_moss: ['🌱', '🍂', '🍁'],
          frost_pearl: ['🌱', '❄️', '💎'],
        };
        const emojis = cropEmojis[plot.crop] || ['🌱', '🌿', '🌾'];
        const emojiIndex = isRipe
          ? emojis.length - 1
          : Math.min(Math.floor(plot.growthStage / (plot.maxGrowth / emojis.length)), emojis.length - 2);

        div.innerHTML = `
          <span class="plot-emoji">${emojis[emojiIndex]}</span>
          <span class="plot-label">${this._cropName(plot.crop)}</span>
          <span class="plot-progress">${isRipe ? '✅ 可收获' : `${plot.growthStage}/${plot.maxGrowth}${plot.watered ? ' 💧' : ''}`}</span>
        `;
      } else {
        div.innerHTML = `
          <span class="plot-emoji">⬜</span>
          <span class="plot-label">空地</span>
        `;
      }

      const inspect = () => this._showFarmInspector(plot, plotIndex, farm.plots.length);
      div.addEventListener('mouseenter', inspect);
      div.addEventListener('click', inspect);
      div.addEventListener('touchstart', inspect, { passive: true });
      container.appendChild(div);
    }

    if (selectedPlotIndex === null) {
      this._renderEmptyFarmInspector();
    } else {
      const selected = farm.plots[selectedPlotIndex];
      if (selected) this._showFarmInspector(selected, selectedPlotIndex, farm.plots.length);
      else this._renderEmptyFarmInspector();
    }
  },

  _showFarmInspector(plot, plotIndex, totalPlots) {
    selectedPlotIndex = plotIndex;
    document.querySelectorAll('.farm-plot').forEach((el) => {
      el.classList.toggle('selected', Number(el.dataset.plotIndex) === plotIndex);
    });

    const panel = document.getElementById('farm-inspector');
    if (!panel) return;

    const title = `🧭 地块 ${plotIndex + 1}/${totalPlots}`;
    if (!plot.crop) {
      const suggestText = this._getSuggestionText(plot);
      panel.innerHTML = `
        <div class="inspector-title">${title}</div>
        <div class="inspector-body">这块地目前是空地。你可以用「🌱 种植」在这里播种。</div>
        <div class="inspector-suggestion">建议：${this._escapeHtml(suggestText)}</div>
        <div class="inspector-actions">
          <button class="inspector-btn" data-farm-action="harvest" data-plot-index="${plotIndex}" disabled>可收获</button>
          <button class="inspector-btn" data-farm-action="water" data-plot-index="${plotIndex}" disabled>可浇水</button>
          <button class="inspector-btn primary" data-farm-action="suggest" data-plot-index="${plotIndex}">建议行动</button>
        </div>
      `;
      this._bindFarmInspectorActions();
      return;
    }

    const progressPercent = plot.maxGrowth > 0 ? Math.min(100, Math.round((plot.growthStage / plot.maxGrowth) * 100)) : 0;
    const stageText = plot.growthStage >= plot.maxGrowth ? '可收获' : '生长中';
    const wateredText = plot.watered ? '已浇水，下一回合可继续生长。' : '尚未浇水。';
    const canHarvest = plot.growthStage >= plot.maxGrowth;
    const canWater = plot.growthStage < plot.maxGrowth && !plot.watered;
    const suggestText = this._getSuggestionText(plot);

    panel.innerHTML = `
      <div class="inspector-title">${title} · ${this._escapeHtml(this._cropName(plot.crop))}</div>
      <div class="inspector-body">
        状态：${stageText}（${plot.growthStage}/${plot.maxGrowth}，${progressPercent}%）<br>
        水分：${wateredText}
      </div>
      <div class="inspector-suggestion">建议：${this._escapeHtml(suggestText)}</div>
      <div class="inspector-actions">
        <button class="inspector-btn ${canHarvest ? 'ready' : ''}" data-farm-action="harvest" data-plot-index="${plotIndex}" ${canHarvest ? '' : 'disabled'}>可收获</button>
        <button class="inspector-btn ${canWater ? 'ready' : ''}" data-farm-action="water" data-plot-index="${plotIndex}" ${canWater ? '' : 'disabled'}>可浇水</button>
        <button class="inspector-btn primary" data-farm-action="suggest" data-plot-index="${plotIndex}">建议行动</button>
      </div>
    `;
    this._bindFarmInspectorActions();
  },

  _renderEmptyFarmInspector() {
    const panel = document.getElementById('farm-inspector');
    if (!panel) return;
    panel.innerHTML = `
      <div class="inspector-title">🧭 农田面板</div>
      <div class="inspector-body">把鼠标移到地块上，或在手机上点一下地块查看详情。</div>
      <div class="inspector-actions">
        <button class="inspector-btn" data-farm-action="harvest" data-plot-index="-1" disabled>可收获</button>
        <button class="inspector-btn" data-farm-action="water" data-plot-index="-1" disabled>可浇水</button>
        <button class="inspector-btn primary" data-farm-action="suggest" data-plot-index="-1">建议行动</button>
      </div>
    `;
    this._bindFarmInspectorActions();
  },

  renderInventory(inventory) {
    lastInventorySnapshot = { ...inventory };
    const container = document.getElementById('inventory-grid');
    container.innerHTML = '';
    const allEntries = Object.entries(inventory).filter(([, c]) => c > 0);
    const filteredEntries = allEntries.filter(([id]) => this._matchInventoryFilter(id, inventoryFilter));

    const countText = inventoryFilter === 'all'
      ? `(${allEntries.length}种)`
      : `(${filteredEntries.length}/${allEntries.length}种)`;
    document.getElementById('inventory-count').textContent = countText;

    if (filteredEntries.length === 0) {
      container.innerHTML = '<span style="color:var(--text-dim);font-size:12px;">当前筛选下暂无物品</span>';
      this._clearInventoryPreview();
      return;
    }

    for (const [id, count] of filteredEntries) {
      const item = itemsData[id] || {};
      const name = item.name || id;
      const category = item.category || 'unknown';
      const rarity = this._getRarity(id, item);
      const rarityLabel = this._rarityLabel(rarity);
      const categoryLabel = this._categoryLabel(category);

      const div = document.createElement('div');
      div.className = `inv-item rarity-${rarity}`;
      div.title = `${name}（${rarityLabel}）`;
      div.innerHTML = `
        <span class="inv-main">
          <span class="inv-name">${name}</span>
          <span class="inv-meta">${categoryLabel} · ${rarityLabel}</span>
        </span>
        <span class="inv-count">×${count}</span>
      `;

      if (item.useEffect) {
        const useBtn = document.createElement('button');
        useBtn.className = 'inv-use-btn';
        useBtn.textContent = '使用';
        useBtn.addEventListener('click', (e) => { e.stopPropagation(); if (window.useConsumable) window.useConsumable(id); });
        div.appendChild(useBtn);
      }

      div.addEventListener('mouseenter', () => this._showInventoryPreview(id, item, count, rarityLabel, categoryLabel));
      div.addEventListener('mouseleave', () => this._clearInventoryPreview());
      div.addEventListener('click', () => this._showInventoryPreview(id, item, count, rarityLabel, categoryLabel));

      let pressTimer = null;
      div.addEventListener('touchstart', (e) => {
        pressTimer = setTimeout(() => {
          e.preventDefault();
          this._showItemContextMenu(id, item, count, div);
        }, 500);
      }, { passive: false });
      div.addEventListener('touchend', () => clearTimeout(pressTimer));
      div.addEventListener('touchmove', () => clearTimeout(pressTimer));
      div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this._showItemContextMenu(id, item, count, div);
      });

      container.appendChild(div);
    }
  },

  _showItemContextMenu(id, item, count, anchor) {
    let menu = document.getElementById('inv-context-menu');
    if (menu) menu.remove();

    menu = document.createElement('div');
    menu.id = 'inv-context-menu';
    menu.className = 'inv-context-menu';

    const actions = [];
    if (item.useEffect) actions.push({ label: '使用', action: 'use' });
    if (item.sellPrice && item.sellPrice > 0) actions.push({ label: `卖出 (${item.sellPrice}🐚)`, action: 'sell' });
    actions.push({ label: '丢弃', action: 'discard' });

    for (const act of actions) {
      const btn = document.createElement('button');
      btn.className = 'inv-ctx-btn';
      btn.textContent = act.label;
      btn.addEventListener('click', () => {
        menu.remove();
        if (act.action === 'use' && window.useConsumable) window.useConsumable(id);
        else if (act.action === 'sell') window.dispatchEvent(new CustomEvent('inv:sell', { detail: { id } }));
        else if (act.action === 'discard') window.dispatchEvent(new CustomEvent('inv:discard', { detail: { id } }));
      });
      menu.appendChild(btn);
    }

    const rect = anchor.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left}px`;
    document.body.appendChild(menu);

    const dismiss = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', dismiss); } };
    setTimeout(() => document.addEventListener('click', dismiss), 50);
  },

  renderDiary(eventLog) {
    lastDiarySnapshot = [...eventLog];
    const container = document.getElementById('diary-log');
    container.innerHTML = '';
    const filtered = eventLog.filter((entry) => this._matchDiaryFilter(entry, diaryFilter));
    const recent = filtered.slice(0, 30);

    if (recent.length === 0) {
      container.innerHTML = '<div class="diary-empty">这个分类暂时还没有记录，换个筛选看看吧。</div>';
      return;
    }

    for (const entry of recent) {
      const div = document.createElement('div');
      div.className = `diary-entry ${entry.type}`;
      const typeIcons = {
        diary: '🦞',
        weather: '🌤️',
        visitor: '👋',
        discovery: '🔍',
        farm: '🌱',
        travel: '✈️',
        festival: '🎉',
        social: '💬',
        wisdom: '📜',
        horoscope: '🔮',
        funny: '😂',
        event: '📌',
      };
      const icon = typeIcons[entry.type] || '📌';
      div.innerHTML = `
        <div class="entry-header">
          <span class="entry-title">${icon} ${entry.title}</span>
          <span class="entry-tick">回合${entry.tick}</span>
        </div>
        <div class="entry-body">${entry.description}</div>
      `;
      container.appendChild(div);
    }
  },

  renderFooter(world) {
    const timeLabel = CONFIG.TIME_LABELS[world.timeOfDay] || world.timeOfDay;
    document.getElementById('tick-info').textContent = `回合 ${world.tickCount}`;
    document.getElementById('time-display').textContent = timeLabel;
  },

  updateSpeech(text) {
    window.dispatchEvent(new CustomEvent('lobster:speech', { detail: { text } }));
  },

  showNotification(text, duration = 3000) {
    SFX.playNotificationDebounced();
    const el = document.getElementById('notification');
    el.textContent = text;
    el.classList.remove('hidden');
    el.classList.add('show');
    setTimeout(() => {
      el.classList.add('hidden');
      el.classList.remove('show');
    }, duration);
  },

  _bindInventoryFilters() {
    const toolbar = document.getElementById('inventory-toolbar');
    if (!toolbar) return;

    const buttons = toolbar.querySelectorAll('.inv-filter');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        inventoryFilter = btn.dataset.filter || 'all';
        buttons.forEach((item) => item.classList.remove('active'));
        btn.classList.add('active');
        this.renderInventory(lastInventorySnapshot);
      });
    });
  },

  _bindDiaryFilters() {
    const container = document.getElementById('diary-filters');
    if (!container) return;

    const buttons = container.querySelectorAll('.diary-filter');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        diaryFilter = btn.dataset.diaryFilter || 'all';
        buttons.forEach((item) => item.classList.remove('active'));
        btn.classList.add('active');
        this.renderDiary(lastDiarySnapshot);
      });
    });
  },

  _bindDiarySwipeGesture() {
    const target = document.getElementById('diary-log');
    if (!target) return;

    let touchStartX = 0;
    let touchStartY = 0;
    target.addEventListener('touchstart', (e) => {
      const t = e.changedTouches?.[0];
      if (!t) return;
      touchStartX = t.clientX;
      touchStartY = t.clientY;
    }, { passive: true });

    target.addEventListener('touchend', (e) => {
      const t = e.changedTouches?.[0];
      if (!t) return;
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
      this._cycleDiaryFilter(dx < 0 ? 'next' : 'prev');
    }, { passive: true });
  },

  _cycleDiaryFilter(direction = 'next') {
    const currentIndex = DIARY_FILTER_ORDER.indexOf(diaryFilter);
    if (currentIndex < 0) return;

    const nextIndex = direction === 'next'
      ? (currentIndex + 1) % DIARY_FILTER_ORDER.length
      : (currentIndex - 1 + DIARY_FILTER_ORDER.length) % DIARY_FILTER_ORDER.length;
    diaryFilter = DIARY_FILTER_ORDER[nextIndex];

    const buttons = document.querySelectorAll('#diary-filters .diary-filter');
    buttons.forEach((btn) => {
      btn.classList.toggle('active', (btn.dataset.diaryFilter || 'all') === diaryFilter);
    });
    this.renderDiary(lastDiarySnapshot);
  },

  _bindMobileGestures() {
    const avatar = document.getElementById('lobster-avatar');
    if (!avatar) return;

    avatar.addEventListener('dblclick', () => this._requestPetByGesture());

    let lastTapAt = 0;
    avatar.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTapAt < 300) {
        e.preventDefault();
        this._requestPetByGesture();
      }
      lastTapAt = now;
    }, { passive: false });
  },

  _bindFarmStrategyControls() {
    const container = document.getElementById('farm-strategy-options');
    if (!container) return;

    container.querySelectorAll('[data-farm-strategy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const strategy = btn.dataset.farmStrategy || 'balanced';
        this._emitFarmStrategyChange(strategy);
      });
    });

    this._syncFarmStrategyUI();
  },

  _bindHouseHotspots() {
    HOUSE_HOTSPOT_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.dataset.houseBound === '1') return;
      el.dataset.houseBound = '1';
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');

      const emit = () => {
        el.classList.remove('hotspot-pressed');
        // Restart small click feedback animation on repeated clicks.
        void el.offsetWidth;
        el.classList.add('hotspot-pressed');
        setTimeout(() => el.classList.remove('hotspot-pressed'), 240);
        window.dispatchEvent(new CustomEvent('house:interact', {
          detail: { hotspot: el.dataset.hotspot || id },
        }));
      };

      el.addEventListener('click', emit);
      el.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        emit();
      });
    });
  },

  _emitFarmStrategyChange(strategy) {
    window.dispatchEvent(new CustomEvent('farm:strategy-change', {
      detail: { strategy },
    }));
  },

  _syncFarmStrategyUI() {
    const container = document.getElementById('farm-strategy-options');
    const desc = document.getElementById('farm-strategy-desc');
    if (container) {
      container.querySelectorAll('[data-farm-strategy]').forEach((btn) => {
        btn.classList.toggle('active', (btn.dataset.farmStrategy || 'balanced') === farmStrategy);
      });
    }
    if (desc) {
      desc.textContent = FARM_STRATEGIES[farmStrategy]?.desc || FARM_STRATEGIES.balanced.desc;
    }
  },

  _requestPetByGesture() {
    window.dispatchEvent(new CustomEvent('lobster:pet-request'));
  },

  _bindFarmInspectorActions() {
    const panel = document.getElementById('farm-inspector');
    if (!panel) return;

    panel.querySelectorAll('[data-farm-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.farmAction || '';
        const plotIndex = Number(btn.dataset.plotIndex ?? -1);
        this._emitFarmAction(action, Number.isNaN(plotIndex) ? -1 : plotIndex);
      });
    });
  },

  _emitFarmAction(action, plotIndex) {
    window.dispatchEvent(new CustomEvent('farm:panel-action', {
      detail: { action, plotIndex },
    }));
  },

  _getSuggestionText(plot) {
    if (farmStrategy === 'growth') {
      if (!plot.crop) return '快速成长策略：优先补种，保持地块运转。';
      if (plot.growthStage >= plot.maxGrowth) return '快速成长策略：收获后会尽快轮作。';
      if (!plot.watered) return '快速成长策略：立刻浇水，推进成长进度。';
      return '快速成长策略：状态良好，等待下一回合继续成长。';
    }

    if (farmStrategy === 'saver') {
      if (!plot.crop) return '省资源策略：空地会谨慎补种，优先低成本种子。';
      if (plot.growthStage >= plot.maxGrowth) return '省资源策略：优先收获，回收资源。';
      if (!plot.watered) return '省资源策略：先浇水，不额外消耗种子。';
      return '省资源策略：维持现状，减少额外投入。';
    }

    if (!plot.crop) return '稳健收益策略：可自动挑一粒高性价比种子播种。';
    if (plot.growthStage >= plot.maxGrowth) return '稳健收益策略：优先收获，避免占格子。';
    if (!plot.watered) return '稳健收益策略：先浇水，下一回合会继续成长。';
    return '稳健收益策略：状态良好，等下一回合成长。';
  },

  _showInventoryPreview(id, item, count, rarityLabel, categoryLabel) {
    const panel = document.getElementById('inventory-preview');
    if (!panel) return;

    const name = this._escapeHtml(item.name || id);
    const desc = this._escapeHtml(item.description || '暂无描述');
    panel.innerHTML = `
      <div class="preview-title">${name}</div>
      <div class="preview-meta">${categoryLabel} · ${rarityLabel} · 数量 ×${count}</div>
      <div class="preview-desc">${desc}</div>
    `;
    panel.classList.remove('hidden');
  },

  _clearInventoryPreview() {
    const panel = document.getElementById('inventory-preview');
    if (!panel) return;
    panel.classList.add('hidden');
    panel.innerHTML = '';
  },

  _matchDiaryFilter(entry, filter) {
    if (filter === 'all') return true;
    if (filter === 'story') {
      return ['diary', 'event', 'visitor', 'discovery', 'farm', 'travel', 'festival', 'social'].includes(entry.type);
    }
    return entry.type === filter;
  },

  _matchInventoryFilter(id, filter) {
    if (filter === 'all') return true;
    const item = itemsData[id] || {};
    const category = item.category || 'unknown';
    const rarity = this._getRarity(id, item);
    if (filter === 'rare') return rarity === 'epic' || rarity === 'legend';
    return category === filter;
  },

  _getRarity(id, item) {
    const price = item.sellPrice || 0;
    if (id.includes('legend') || id.includes('rainbow') || id.includes('golden') || price >= 50) return 'legend';
    if (price >= 25) return 'epic';
    if (price >= 12) return 'rare';
    if (price >= 6) return 'uncommon';
    return 'common';
  },

  _rarityLabel(rarity) {
    const map = {
      common: '普通',
      uncommon: '精良',
      rare: '稀有',
      epic: '史诗',
      legend: '传说',
    };
    return map[rarity] || '普通';
  },

  _categoryLabel(category) {
    const map = {
      seed: '种子',
      ingredient: '食材',
      meal: '料理',
      souvenir: '收藏',
      travel: '旅行',
      special: '特殊',
      decoration: '装饰',
      consumable: '消耗品',
    };
    return map[category] || category;
  },

  _cropName(crop) {
    const names = {
      seaweed: '海带',
      coral_rose: '珊瑚玫瑰',
      sun_kelp: '阳光海藻',
      amber_moss: '琥珀苔藓',
      frost_pearl: '霜珍珠',
      golden_crop: '黄金作物',
    };
    return names[crop] || crop;
  },

  _escapeHtml(text) {
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  },
};
