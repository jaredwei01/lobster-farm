import { CONFIG } from './config.js';

let allEvents = [];
let cooldowns = {};
let _combatResolver = null;
let _itemsData = null;

export const EventEngine = {
  async init() {
    const resp = await fetch('./data/events.json');
    allEvents = await resp.json();
  },

  setCombatResolver(fn) { _combatResolver = fn; },
  setItemsData(data) { _itemsData = data; },

  selectEvents(worldState) {
    const { lobster, world, farm } = worldState;
    const candidates = [];

    for (const evt of allEvents) {
      const pre = evt.prerequisites || {};
      if (pre.season && !pre.season.includes(world.season)) continue;
      if (pre.weather && !pre.weather.includes(world.weather)) continue;
      if (pre.minLevel && lobster.level < pre.minLevel) continue;
      if (pre.maxLevel && lobster.level > pre.maxLevel) continue;
      if (pre.location && lobster.location !== pre.location) continue;
      if (evt.type === 'travel' && lobster.traveling) continue;

      let weight = evt.baseWeight;

      const seasonMod = pre.season ? 1.5 : 1.0;
      weight *= seasonMod;

      const weatherMod = pre.weather ? 1.5 : 1.0;
      weight *= weatherMod;

      const pBonus = evt.modifiers?.personalityBonus?.[lobster.personality];
      if (pBonus) weight *= pBonus;

      const cd = cooldowns[evt.id] || 0;
      if (cd > 0) weight *= 0.1;

      candidates.push({ event: evt, weight });
    }

    const selected = [];
    const count = Math.min(CONFIG.MAX_EVENTS_PER_TICK, candidates.length);
    for (let i = 0; i < count; i++) {
      const pick = this._weightedPick(candidates);
      if (pick) {
        selected.push(pick.event);
        candidates.splice(candidates.indexOf(pick), 1);
      }
    }

    this._tickCooldowns();
    for (const evt of selected) {
      cooldowns[evt.id] = evt.modifiers?.cooldownTicks || 5;
    }

    return selected;
  },

  _weightedPick(candidates) {
    const total = candidates.reduce((s, c) => s + c.weight, 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) return c;
    }
    return candidates[candidates.length - 1];
  },

  _tickCooldowns() {
    for (const id of Object.keys(cooldowns)) {
      cooldowns[id]--;
      if (cooldowns[id] <= 0) delete cooldowns[id];
    }
  },

  applyEffects(event, ws) {
    const fx = event.effects;
    if (!fx) return { combatResult: null };
    if (fx.mood) ws.modifyStat('mood', fx.mood);
    if (fx.energy) ws.modifyStat('energy', fx.energy);
    if (fx.hunger) ws.modifyStat('hunger', fx.hunger);
    if (fx.exp) ws.addExp(fx.exp);
    if (fx.shells) ws.addShells(fx.shells);
    if (fx.items) {
      for (const [id, count] of Object.entries(fx.items)) ws.addItem(id, count);
    }
    if (fx.skills) {
      for (const [skill, delta] of Object.entries(fx.skills)) ws.modifySkill(skill, delta);
    }
    if (fx.crops === 'grow_all_one_stage') {
      const farm = ws.getFarm();
      farm.plots.forEach((p, i) => {
        if (p.crop && p.growthStage < p.maxGrowth) {
          ws.setPlot(i, { growthStage: p.growthStage + 1 });
        }
      });
    }
    if (fx.crops === 'damage_random_one') {
      const farm = ws.getFarm();
      const growing = farm.plots
        .map((p, i) => ({ ...p, idx: i }))
        .filter(p => p.crop && p.growthStage > 0);
      if (growing.length > 0) {
        const victim = growing[Math.floor(Math.random() * growing.length)];
        ws.setPlot(victim.idx, { growthStage: Math.max(0, victim.growthStage - 1) });
      }
    }
    if (fx.crops === 'need_extra_water') {
      const plots = ws.getFarm().plots || [];
      plots.filter(p => p.crop && p.watered).forEach(p => { p.watered = false; });
    }

    if (fx.debuff) {
      ws.addDebuff({ ...fx.debuff });
    }

    let combatResult = null;
    if (fx.combatCheck && _combatResolver) {
      combatResult = _combatResolver(fx.combatCheck, ws);
    }

    if (fx.loseRandomItem && _itemsData && combatResult && !combatResult.won) {
      const categories = fx.loseRandomItem.categories || ['souvenir', 'decoration'];
      const lost = ws.removeRandomItem(id => {
        const info = _itemsData[id];
        return info && categories.includes(info.category);
      });
      if (lost) combatResult.lostItem = lost;
    }

    return { combatResult };
  },
};
