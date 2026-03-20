import { CONFIG, GROWTH_STAGES } from './config.js';

function defaultState() {
  return {
    version: CONFIG.VERSION,
    createdAt: null,
    lastTickAt: null,
    lobster: {
      name: '',
      personality: '',
      favoriteFood: '',
      favoritePlace: '',
      birthSeason: '',
      level: 1,
      exp: 0,
      mood: 70,
      energy: 80,
      hunger: 20,
      skills: { farming: 0, cooking: 0, exploring: 0, social: 0 },
      memory: [],
      preferences: {},
      location: 'pond',
      traveling: null,
      buffs: [],
      debuffs: [],
    },
    farm: {
      plots: Array.from({ length: CONFIG.FARM_INITIAL_PLOTS }, (_, i) => ({
        id: i, crop: null, growthStage: 0, maxGrowth: 0, watered: false,
      })),
      decorations: [],
      upgrades: [],
    },
    house: {
      furniture: [],
      roofLevel: 0,
      trophies: [],
      harvestToday: 0,
      lastHarvestDay: 0,
    },
    world: {
      season: 'spring',
      weather: 'sunny',
      dayCount: 1,
      tickCount: 0,
      timeOfDay: 'morning',
      currentVisitor: null,
      visitorLeaveTick: 0,
      activeQuest: null,
    },
    shop: {
      dailyStock: [],
      refreshDay: 0,
      discount: 0,
    },
    inventory: { seaweed_seed: 4, salt: 2, plankton: 2, seaweed: 1 },
    shells: 30,
    collections: { postcards: [], recipes: ['seaweed_roll', 'ocean_tea'], visitorStamps: [], rareItems: [], seaLife: {} },
    checkin: { lastDay: null, streak: 0, history: [] },
    fishing: { attemptsToday: 0, lastFishDay: 0, totalCatch: 0 },
    achievements: {},
    stats: { totalFeeds: 0, totalPets: 0, totalHarvests: 0, totalFishCatches: 0, totalMudScenes: 0, combatWins: 0, coopCompleted: 0, goldenHarvests: 0, cropTypes: [] },
    milestones: [],
    p4: { crownCeremonyShown: false },
    bond: { score: 50, lastDecay: null },
    coopQuest: null,
    eventLog: [],
    settings: {
      tickSpeedMultiplier: 1,
      farmStrategy: 'balanced',
      goldenDrops: { pity: 0, totalDrops: 0, lastDropTick: 0 },
    },
  };
}

const listeners = new Set();
let state = defaultState();

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function expForLevel(level) {
  return Math.round(CONFIG.EXP_BASE * Math.pow(1 + level * CONFIG.EXP_GROWTH_FACTOR, 2));
}

function getStatTier(stat, value) {
  const tiers = CONFIG.STAT_TIERS[stat];
  if (!tiers) return null;
  for (const t of tiers) {
    if (value >= t.min && value <= t.max) return t;
  }
  return tiers[tiers.length - 1];
}

function getGrowthStage(level) {
  for (const s of GROWTH_STAGES) {
    if (level >= s.minLevel && level <= s.maxLevel) return s;
  }
  return GROWTH_STAGES[GROWTH_STAGES.length - 1];
}

function ensureCompat() {
  state.settings = state.settings || {};
  if (typeof state.settings.tickSpeedMultiplier !== 'number') state.settings.tickSpeedMultiplier = 1;
  if (!state.settings.farmStrategy) state.settings.farmStrategy = 'balanced';
  state.settings.goldenDrops = state.settings.goldenDrops || {};
  if (typeof state.settings.goldenDrops.pity !== 'number') state.settings.goldenDrops.pity = 0;
  if (typeof state.settings.goldenDrops.totalDrops !== 'number') state.settings.goldenDrops.totalDrops = 0;
  if (typeof state.settings.goldenDrops.lastDropTick !== 'number') state.settings.goldenDrops.lastDropTick = 0;
  if (!state.lobster.buffs) state.lobster.buffs = [];
  if (!Array.isArray(state.lobster.debuffs)) state.lobster.debuffs = [];
  if (!state.house) state.house = { furniture: [], roofLevel: 0, trophies: [], harvestToday: 0, lastHarvestDay: 0 };
  if (!Array.isArray(state.house.trophies)) state.house.trophies = [];
  if (typeof state.house.harvestToday !== 'number') state.house.harvestToday = 0;
  if (typeof state.house.lastHarvestDay !== 'number') state.house.lastHarvestDay = 0;
  if (!state.shop) state.shop = { dailyStock: [], refreshDay: 0, discount: 0 };
  if (!state.world.currentVisitor) state.world.currentVisitor = null;
  if (typeof state.world.visitorLeaveTick !== 'number') state.world.visitorLeaveTick = 0;
  if (!state.world.activeQuest) state.world.activeQuest = null;
  if (!state.dungeon) state.dungeon = { highestTier: 0, dailyAttempts: {}, totalWins: 0, totalLosses: 0, mudBossDefeats: {} };
  if (!state.collections) state.collections = { postcards: [], recipes: ['seaweed_roll', 'ocean_tea'], visitorStamps: [], rareItems: [] };
  if (!Array.isArray(state.collections.postcards)) state.collections.postcards = [];
  if (!Array.isArray(state.collections.visitorStamps)) state.collections.visitorStamps = [];
  if (!Array.isArray(state.collections.rareItems)) state.collections.rareItems = [];
  if (!Array.isArray(state.milestones)) state.milestones = [];
  if (!state.bond) state.bond = { score: 50, lastDecay: null };
  if (!state.lobster.favoriteFood) state.lobster.favoriteFood = '';
  if (!state.lobster.adoptedAt) state.lobster.adoptedAt = state.createdAt || new Date().toISOString();
  if (!state.lobster.personalityDrift) state.lobster.personalityDrift = {};
  if (!state.storyArcs) state.storyArcs = { active: null, completed: [], lastCheckDay: 0 };
  if (!state.dungeon.adaptiveMod) state.dungeon.adaptiveMod = 0;
  if (!state.checkin) state.checkin = { lastDay: null, streak: 0, history: [] };
  if (!state.collections.seaLife) state.collections.seaLife = {};
  if (!state.fishing) state.fishing = { attemptsToday: 0, lastFishDay: 0, totalCatch: 0 };
  if (!state.achievements) state.achievements = {};
  if (!state.stats) state.stats = { totalFeeds: 0, totalPets: 0, totalHarvests: 0, totalFishCatches: 0, totalMudScenes: 0, combatWins: 0, coopCompleted: 0, goldenHarvests: 0, cropTypes: [] };
  if (!Array.isArray(state.stats.cropTypes)) state.stats.cropTypes = [];
  if (!state.p4) state.p4 = { crownCeremonyShown: false };
  if (typeof state.p4.crownCeremonyShown !== 'boolean') state.p4.crownCeremonyShown = false;
}

function syncFarmPlots() {
  const stage = getGrowthStage(state.lobster.level);
  const target = stage.farmPlots || CONFIG.FARM_INITIAL_PLOTS;
  while (state.farm.plots.length < target && state.farm.plots.length < CONFIG.FARM_MAX_PLOTS) {
    state.farm.plots.push({ id: state.farm.plots.length, crop: null, growthStage: 0, maxGrowth: 0, watered: false });
  }
}

export const WorldState = {
  getState() { return JSON.parse(JSON.stringify(state)); },
  getLobster() { return { ...state.lobster, skills: { ...state.lobster.skills }, buffs: [...state.lobster.buffs] }; },
  getWorld() { return { ...state.world }; },
  getFarm() { return JSON.parse(JSON.stringify(state.farm)); },
  getHouse() { return JSON.parse(JSON.stringify(state.house)); },
  getInventory() { return { ...state.inventory }; },
  getShells() { return state.shells; },
  getEventLog() { return [...state.eventLog]; },
  getCollections() { return JSON.parse(JSON.stringify(state.collections)); },

  expForLevel,
  getStatTier,
  getGrowthStage,

  expToNextLevel() {
    return expForLevel(state.lobster.level);
  },

  expProgress() {
    const needed = expForLevel(state.lobster.level);
    return { current: state.lobster.exp, needed, pct: Math.min(1, state.lobster.exp / needed) };
  },

  getStatTiers() {
    const l = state.lobster;
    return {
      mood: getStatTier('mood', l.mood),
      energy: getStatTier('energy', l.energy),
      hunger: getStatTier('hunger', l.hunger),
    };
  },

  getExpMultiplier() {
    const tiers = this.getStatTiers();
    let mult = 1;
    if (tiers.mood) mult += (tiers.mood.expMult || 0);
    const accBuff = (state.lobster.buffs || []).find(b => b.type === 'exp_boost' && b.expiresAt > Date.now());
    if (accBuff) mult += (accBuff.value || 0);
    return mult;
  },

  getWinMultiplier() {
    const tiers = this.getStatTiers();
    let mult = 1;
    if (tiers.mood) mult += (tiers.mood.winMult || 0);
    const luckyBuff = (state.lobster.buffs || []).find(b => b.type === 'lucky_star' && b.usesLeft > 0);
    if (luckyBuff) mult += 0.30;
    return mult;
  },

  getActionEfficiency() {
    const tier = getStatTier('energy', state.lobster.energy);
    return tier ? (1 + (tier.efficiency || 0)) : 1;
  },

  getActionFailChance() {
    const tier = getStatTier('energy', state.lobster.energy);
    return tier ? (tier.actionFail || 0) : 0;
  },

  hasSkillMilestone(skill, milestone) {
    return (state.lobster.skills[skill] || 0) >= milestone;
  },

  addTrophy(trophy) {
    state.house.trophies.push(trophy);
    if (state.house.trophies.length > 8) state.house.trophies = state.house.trophies.slice(-8);
    this._notify();
  },

  incrementHarvest() {
    const day = state.world.dayCount;
    if (state.house.lastHarvestDay !== day) {
      state.house.harvestToday = 0;
      state.house.lastHarvestDay = day;
    }
    state.house.harvestToday++;
  },

  startTravel(destination, duration) {
    const tick = state.world.tickCount;
    state.lobster.traveling = { destination, departTick: tick, returnTick: tick + duration, postcards: [], souvenir: null };
    state.lobster.location = destination;
    this._notify();
  },

  endTravel(souvenir) {
    if (!state.lobster.traveling) return;
    state.lobster.traveling.souvenir = souvenir;
    state.lobster.traveling = null;
    state.lobster.location = 'pond';
    this._notify();
  },

  isTraveling() {
    return Boolean(state.lobster.traveling);
  },

  isTravelComplete() {
    return state.lobster.traveling && state.world.tickCount >= state.lobster.traveling.returnTick;
  },

  addPostcard(postcard) {
    state.collections.postcards.push(postcard);
    if (state.lobster.traveling) state.lobster.traveling.postcards.push(postcard);
    this._notify();
  },

  setVisitor(visitor, leaveTick) {
    state.world.currentVisitor = visitor;
    state.world.visitorLeaveTick = leaveTick;
    this._notify();
  },

  clearVisitor() {
    const v = state.world.currentVisitor;
    state.world.currentVisitor = null;
    state.world.visitorLeaveTick = 0;
    this._notify();
    return v;
  },

  addVisitorStamp(stampId) {
    if (!state.collections.visitorStamps.includes(stampId)) {
      state.collections.visitorStamps.push(stampId);
    }
  },

  addRareItem(itemId) {
    if (!state.collections.rareItems.includes(itemId)) {
      state.collections.rareItems.push(itemId);
    }
  },

  setQuest(quest) {
    state.world.activeQuest = quest;
    this._notify();
  },

  getShop() { return JSON.parse(JSON.stringify(state.shop)); },

  refreshShop(stock, day) {
    state.shop.dailyStock = stock;
    state.shop.refreshDay = day;
    this._notify();
  },

  setShopDiscount(d) { state.shop.discount = d; },

  buyFromShop(index) {
    const item = state.shop.dailyStock[index];
    if (!item || item.sold) return false;
    const price = Math.round(item.price * (1 - (state.shop.discount || 0)));
    if (state.shells < price) return false;
    state.shells -= price;
    state.inventory[item.id] = (state.inventory[item.id] || 0) + 1;
    state.shop.dailyStock[index].sold = true;
    this._notify();
    return true;
  },

  getPreferenceLabels() {
    const prefs = state.lobster.preferences || {};
    const labels = [];
    for (const [key, count] of Object.entries(prefs)) {
      if (count >= CONFIG.PREFERENCE_THRESHOLD_FOOD) labels.push({ type: 'food', key, label: `爱上了${key}` });
      else if (count >= CONFIG.PREFERENCE_THRESHOLD_PLACE) labels.push({ type: 'place', key, label: `热爱${key}` });
    }
    return labels.slice(0, 3);
  },

  addBuff(buff) {
    state.lobster.buffs = state.lobster.buffs.filter(b => b.type !== buff.type);
    state.lobster.buffs.push(buff);
    this._notify();
  },

  consumeLuckyStar() {
    const b = (state.lobster.buffs || []).find(b => b.type === 'lucky_star' && b.usesLeft > 0);
    if (b) { b.usesLeft--; if (b.usesLeft <= 0) state.lobster.buffs = state.lobster.buffs.filter(x => x !== b); }
  },

  addDebuff(debuff) {
    if (!Array.isArray(state.lobster.debuffs)) state.lobster.debuffs = [];
    state.lobster.debuffs.push(debuff);
    this._notify();
  },

  tickDebuffs() {
    if (!Array.isArray(state.lobster.debuffs)) return;
    for (const d of state.lobster.debuffs) {
      if (d.ticksLeft > 0) d.ticksLeft--;
    }
    state.lobster.debuffs = state.lobster.debuffs.filter(d => d.ticksLeft > 0);
  },

  getDebuffs() {
    return (state.lobster.debuffs || []).filter(d => d.ticksLeft > 0);
  },

  removeRandomItem(filterFn) {
    const candidates = [];
    for (const [id, count] of Object.entries(state.inventory)) {
      if (count <= 0) continue;
      if (filterFn && !filterFn(id)) continue;
      candidates.push(id);
    }
    if (candidates.length === 0) return null;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    this.removeItem(pick, 1);
    return pick;
  },

  hasActiveBuff(type) {
    return (state.lobster.buffs || []).some(b => {
      if (b.type !== type) return false;
      if (b.usesLeft !== undefined) return b.usesLeft > 0;
      if (b.expiresAt !== undefined) return b.expiresAt > Date.now();
      return true;
    });
  },

  getDungeon() {
    if (!state.dungeon) state.dungeon = { highestTier: 0, dailyAttempts: {}, totalWins: 0, totalLosses: 0, mudBossDefeats: {} };
    return JSON.parse(JSON.stringify(state.dungeon));
  },

  recordBossAttempt(bossId) {
    if (!state.dungeon) state.dungeon = { highestTier: 0, dailyAttempts: {}, totalWins: 0, totalLosses: 0, mudBossDefeats: {} };
    const today = new Date().toISOString().slice(0, 10);
    state.dungeon.dailyAttempts[bossId] = today;
    this._notify();
  },

  canAttemptBoss(bossId) {
    if (!state.dungeon) return true;
    const today = new Date().toISOString().slice(0, 10);
    return state.dungeon.dailyAttempts[bossId] !== today;
  },

  recordBossWin(bossId, tier) {
    if (!state.dungeon) state.dungeon = { highestTier: 0, dailyAttempts: {}, totalWins: 0, totalLosses: 0, mudBossDefeats: {} };
    state.dungeon.totalWins++;
    if (tier !== undefined && tier > state.dungeon.highestTier) state.dungeon.highestTier = tier;
    this._notify();
  },

  recordBossLoss() {
    if (!state.dungeon) state.dungeon = { highestTier: 0, dailyAttempts: {}, totalWins: 0, totalLosses: 0, mudBossDefeats: {} };
    state.dungeon.totalLosses++;
    this._notify();
  },

  recordMudBossDefeat(bossId) {
    if (!state.dungeon) state.dungeon = { highestTier: 0, dailyAttempts: {}, totalWins: 0, totalLosses: 0, mudBossDefeats: {} };
    state.dungeon.mudBossDefeats[bossId] = (state.dungeon.mudBossDefeats[bossId] || 0) + 1;
    this._notify();
  },

  update(path, value) {
    const keys = path.split('.');
    let obj = state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (obj[keys[i]] === undefined || obj[keys[i]] === null) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this._notify();
  },

  clampStats() {
    const l = state.lobster;
    l.mood = clamp(l.mood, 0, CONFIG.LOBSTER_MAX_STAT);
    l.energy = clamp(l.energy, 0, CONFIG.LOBSTER_MAX_STAT);
    l.hunger = clamp(l.hunger, 0, CONFIG.LOBSTER_MAX_STAT);
    l.level = clamp(l.level, 1, CONFIG.LOBSTER_MAX_LEVEL);
    for (const k of Object.keys(l.skills)) {
      l.skills[k] = clamp(l.skills[k], 0, CONFIG.LOBSTER_MAX_SKILL);
    }
  },

  addExp(amount) {
    const mult = this.getExpMultiplier();
    const actual = Math.round(amount * mult);
    state.lobster.exp += actual;
    let leveledUp = false;
    let needed = expForLevel(state.lobster.level);
    while (state.lobster.exp >= needed && state.lobster.level < CONFIG.LOBSTER_MAX_LEVEL) {
      state.lobster.exp -= needed;
      state.lobster.level++;
      leveledUp = true;
      syncFarmPlots();
      needed = expForLevel(state.lobster.level);
    }
    this._notify();
    return { actual, leveledUp };
  },

  modifyStat(stat, delta) {
    state.lobster[stat] = clamp(state.lobster[stat] + delta, 0, CONFIG.LOBSTER_MAX_STAT);
    this._notify();
  },

  modifySkill(skill, delta) {
    if (state.lobster.skills[skill] !== undefined) {
      state.lobster.skills[skill] = clamp(state.lobster.skills[skill] + delta, 0, CONFIG.LOBSTER_MAX_SKILL);
      this._notify();
    }
  },

  addItem(id, count = 1) {
    state.inventory[id] = (state.inventory[id] || 0) + count;
    this._notify();
  },

  removeItem(id, count = 1) {
    if (!state.inventory[id]) return false;
    state.inventory[id] -= count;
    if (state.inventory[id] <= 0) delete state.inventory[id];
    this._notify();
    return true;
  },

  addShells(n) { state.shells += n; this._notify(); },

  addEvent(event) {
    state.eventLog.unshift(event);
    if (state.eventLog.length > CONFIG.EVENT_LOG_MAX) state.eventLog.length = CONFIG.EVENT_LOG_MAX;
    this._notify();
  },

  addMemory(summary) {
    state.lobster.memory.unshift(summary);
    if (state.lobster.memory.length > CONFIG.MEMORY_SIZE) state.lobster.memory.length = CONFIG.MEMORY_SIZE;
  },

  addMilestone(type, text, extra = {}) {
    if (state.milestones.some(m => m.type === type)) return false;
    state.milestones.push({
      type,
      text,
      date: new Date().toISOString().slice(0, 10),
      day: state.world.dayCount,
      tick: state.world.tickCount,
      ...extra,
    });
    if (state.milestones.length > 30) state.milestones.length = 30;
    this._notify();
    return true;
  },

  getMilestones() { return [...state.milestones]; },

  getRecentMilestones(n = 3) {
    return state.milestones.slice(-n);
  },

  getBond() { return { ...state.bond }; },

  modifyBond(delta) {
    state.bond.score = Math.max(0, Math.min(100, (state.bond.score || 50) + delta));
    this._notify();
  },

  tickBond() {
    const today = new Date().toISOString().slice(0, 10);
    if (state.bond.lastDecay === today) return;
    state.bond.lastDecay = today;
    state.bond.score = Math.max(0, (state.bond.score || 50) - 1);
  },

  getAdoptedAt() { return state.lobster.adoptedAt || state.createdAt; },

  getCoopQuest() { return state.coopQuest ? { ...state.coopQuest } : null; },

  setCoopQuest(quest) {
    state.coopQuest = quest;
    this._notify();
  },

  progressCoopQuest(source, amount = 1) {
    if (!state.coopQuest || state.coopQuest.completed) return false;
    if (source === 'player') state.coopQuest.playerProgress = (state.coopQuest.playerProgress || 0) + amount;
    else state.coopQuest.lobsterProgress = (state.coopQuest.lobsterProgress || 0) + amount;

    const total = (state.coopQuest.playerProgress || 0) + (state.coopQuest.lobsterProgress || 0);
    if (total >= state.coopQuest.target) {
      state.coopQuest.completed = true;
    }
    this._notify();
    return state.coopQuest.completed;
  },

  addPreference(key) {
    state.lobster.preferences[key] = (state.lobster.preferences[key] || 0) + 1;
  },

  advanceTime() {
    const w = state.world;
    w.tickCount++;
    const tickInDay = (w.tickCount - 1) % CONFIG.TICKS_PER_DAY;
    w.timeOfDay = CONFIG.TIME_OF_DAY[tickInDay] || 'morning';

    if (w.tickCount % CONFIG.TICKS_PER_DAY === 0) w.dayCount++;

    if (w.tickCount % (CONFIG.TICKS_PER_DAY * 4) === 0) {
      const pool = CONFIG.WEATHER_POOLS[w.season];
      w.weather = pool[Math.floor(Math.random() * pool.length)];
    }

    const seasonIndex = Math.floor(((w.dayCount - 1) / CONFIG.DAYS_PER_SEASON)) % 4;
    w.season = CONFIG.SEASONS[seasonIndex];

    const hungerTier = getStatTier('hunger', state.lobster.hunger);
    if (hungerTier && hungerTier.moodTick) this.modifyStat('mood', hungerTier.moodTick);

    state.lastTickAt = Date.now();
    this._notify();
  },

  setPlot(index, data) {
    if (index >= 0 && index < state.farm.plots.length) {
      Object.assign(state.farm.plots[index], data);
      this._notify();
    }
  },

  setDecorations(decos) {
    state.farm.decorations = decos;
    this._notify();
  },

  isP4CrownCeremonyShown() {
    return Boolean(state.p4?.crownCeremonyShown);
  },

  markP4CrownCeremonyShown() {
    state.p4 = state.p4 || { crownCeremonyShown: false };
    state.p4.crownCeremonyShown = true;
    this._notify();
  },

  growCrops() {
    for (const plot of state.farm.plots) {
      if (plot.crop && plot.growthStage < plot.maxGrowth) {
        if (plot.watered) { plot.growthStage++; plot.watered = false; }
      }
    }
  },

  initNew(name, personality) {
    state = defaultState();
    state.createdAt = Date.now();
    state.lastTickAt = Date.now();
    state.lobster.name = name;
    state.lobster.personality = personality;
    state.lobster.birthSeason = state.world.season;
    const foods = ['seaweed_roll', 'coral_cake', 'shell_soup', 'kelp_salad', 'plankton_pie'];
    const places = ['pond', 'farm', 'kitchen', 'beach', 'mountain'];
    state.lobster.favoriteFood = foods[Math.floor(Math.random() * foods.length)];
    state.lobster.favoritePlace = places[Math.floor(Math.random() * places.length)];
    ensureCompat();
    syncFarmPlots();
    this._notify();
  },

  loadState(saved) {
    state = saved;
    ensureCompat();
    syncFarmPlots();
    this._notify();
  },

  getRawState() { return state; },

  evolvePersonality(action) {
    const drift = state.lobster.personalityDrift;
    const map = {
      explore: 'adventurous', rest: 'lazy', eat: 'gluttonous',
      cook: 'gluttonous', farm: 'scholarly', socialize: 'social',
      shop: 'social', mud: 'adventurous', dungeon: 'adventurous',
    };
    const target = map[action];
    if (!target) return;
    drift[target] = (drift[target] || 0) + 1;
    const traits = Object.keys(drift);
    if (traits.length > 6) {
      const sorted = traits.sort((a, b) => drift[a] - drift[b]);
      delete drift[sorted[0]];
    }
  },

  getPersonalityDrift() {
    return { ...(state.lobster.personalityDrift || {}) };
  },

  getEffectiveWeights() {
    const base = {};
    const drift = state.lobster.personalityDrift || {};
    const total = Object.values(drift).reduce((s, v) => s + v, 0) || 1;
    for (const [trait, count] of Object.entries(drift)) {
      base[trait] = count / total;
    }
    return base;
  },

  getStoryArcs() { return state.storyArcs ? { ...state.storyArcs } : { active: null, completed: [], lastCheckDay: 0 }; },

  setStoryArc(arc) {
    if (!state.storyArcs) state.storyArcs = { active: null, completed: [], lastCheckDay: 0 };
    state.storyArcs.active = arc;
    this._notify();
  },

  progressStoryArc(stepId) {
    if (!state.storyArcs?.active) return false;
    const arc = state.storyArcs.active;
    if (arc.currentStep !== stepId) return false;
    arc.stepsCompleted = (arc.stepsCompleted || 0) + 1;
    arc.currentStep = arc.steps[arc.stepsCompleted] || null;
    if (arc.stepsCompleted >= arc.steps.length) {
      state.storyArcs.completed.push(arc.id);
      state.storyArcs.active = null;
    }
    this._notify();
    return !state.storyArcs.active;
  },

  setStoryArcCheckDay(day) {
    if (!state.storyArcs) state.storyArcs = { active: null, completed: [], lastCheckDay: 0 };
    state.storyArcs.lastCheckDay = day;
  },

  getAdaptiveMod() { return state.dungeon?.adaptiveMod || 0; },

  updateAdaptiveDifficulty(won) {
    if (!state.dungeon) return;
    if (won) {
      state.dungeon.adaptiveMod = Math.min(15, (state.dungeon.adaptiveMod || 0) + 2);
    } else {
      state.dungeon.adaptiveMod = Math.max(-15, (state.dungeon.adaptiveMod || 0) - 3);
    }
    this._notify();
  },

  getCheckin() {
    if (!state.checkin) state.checkin = { lastDay: null, streak: 0, history: [] };
    return { ...state.checkin, history: [...state.checkin.history] };
  },

  doCheckin() {
    if (!state.checkin) state.checkin = { lastDay: null, streak: 0, history: [] };
    const today = new Date().toISOString().slice(0, 10);
    if (state.checkin.lastDay === today) return null;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    state.checkin.streak = (state.checkin.lastDay === yesterday) ? state.checkin.streak + 1 : 1;
    state.checkin.lastDay = today;
    state.checkin.history.push(today);
    if (state.checkin.history.length > 30) state.checkin.history = state.checkin.history.slice(-30);
    this._notify();
    return { streak: state.checkin.streak, day: today };
  },

  recordSeaCreature(type) {
    if (!state.collections.seaLife) state.collections.seaLife = {};
    const existing = state.collections.seaLife[type];
    if (existing) {
      existing.count++;
    } else {
      state.collections.seaLife[type] = { firstSeen: Date.now(), count: 1 };
    }
    this._notify();
    return !existing;
  },

  getSeaLife() {
    return { ...(state.collections.seaLife || {}) };
  },

  canFish() {
    const f = state.fishing;
    const day = state.world.dayCount;
    if (f.lastFishDay !== day) return true;
    return f.attemptsToday < 3;
  },

  recordFishCatch(quality) {
    const f = state.fishing;
    const day = state.world.dayCount;
    if (f.lastFishDay !== day) { f.attemptsToday = 0; f.lastFishDay = day; }
    f.attemptsToday++;
    if (quality !== 'miss') f.totalCatch++;
    state.stats.totalFishCatches = f.totalCatch;
    this._notify();
  },

  getFishing() { return { ...state.fishing }; },

  resetFishingDaily(dayCount) {
    if (state.fishing.lastFishDay !== dayCount) {
      state.fishing.attemptsToday = 0;
      state.fishing.lastFishDay = dayCount;
    }
  },

  incrementStat(key, val) {
    if (typeof val === 'undefined') val = 1;
    if (typeof state.stats[key] === 'number') state.stats[key] += val;
  },

  addCropType(cropId) {
    if (!state.stats.cropTypes.includes(cropId)) state.stats.cropTypes.push(cropId);
  },

  getStats() { return { ...state.stats, cropTypes: [...state.stats.cropTypes] }; },

  getAchievements() { return { ...state.achievements }; },

  checkAchievement(id, progress, target) {
    if (!state.achievements[id]) state.achievements[id] = { unlocked: false, progress: 0, unlockedAt: null };
    const a = state.achievements[id];
    a.progress = Math.max(a.progress, progress);
    if (!a.unlocked && a.progress >= target) {
      a.unlocked = true;
      a.unlockedAt = Date.now();
      this._notify();
      return true;
    }
    return false;
  },

  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  _notify() { for (const fn of listeners) fn(state); },
};
