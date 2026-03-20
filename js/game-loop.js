import { CONFIG, SHOP_SPECIALS } from './config.js';
import { WorldState } from './world-state.js';
import { SaveSystem } from './save-system.js';
import { EventEngine } from './event-engine.js';
import { LobsterAgent } from './lobster-agent.js';
import { LLMClient } from './llm-client.js';

let tickTimer = null;
let onTickCallback = null;
let visitorsData = [];
let postcardsData = {};

export const GameLoop = {
  setOnTick(fn) { onTickCallback = fn; },

  async loadData() {
    try {
      const [vResp, pResp] = await Promise.all([
        fetch('./data/visitors.json'), fetch('./data/postcards.json'),
      ]);
      visitorsData = await vResp.json();
      postcardsData = await pResp.json();
    } catch { /* fallback: empty */ }
  },

  lastCatchUpReport: null,

  start() {
    this.lastCatchUpReport = this.catchUp();
    this._scheduleNextTick();
    document.addEventListener('visibilitychange', () => {
      if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; }
      if (!document.hidden) this.catchUp();
      this._scheduleNextTick();
    });
  },

  _scheduleNextTick() {
    if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; }
    const interval = document.hidden ? CONFIG.TICK_INTERVAL_MS * 2 : CONFIG.TICK_INTERVAL_MS;
    tickTimer = setTimeout(() => {
      this.tick(document.hidden);
      this._scheduleNextTick();
    }, interval);
  },

  stop() {
    if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; }
  },

  catchUp() {
    const last = WorldState.getRawState().lastTickAt;
    if (!last) return null;
    const elapsed = Date.now() - last;
    const missedTicks = Math.floor(elapsed / CONFIG.TICK_INTERVAL_MS);
    const toProcess = Math.min(missedTicks, CONFIG.CATCHUP_MAX_TICKS);
    if (toProcess <= 0) return null;

    const before = WorldState.getState();
    const beforeExp = before.lobster.exp;
    const beforeLevel = before.lobster.level;
    const beforeShells = before.shells || 0;
    const beforeEventCount = (before.eventLog || []).length;
    const beforeMemoryCount = (before.lobster.memory || []).length;

    for (let i = 0; i < toProcess; i++) this.tick(true);

    let bonusShells = 0;
    if ((WorldState.getInventory().golden_hourglass || 0) > 0) {
      bonusShells = Math.min(40, Math.max(4, Math.floor(toProcess * 2)));
      WorldState.addShells(bonusShells);
      WorldState.addEvent({ id: `golden_hourglass_${Date.now()}`, tick: WorldState.getWorld().tickCount, type: 'discovery', title: '黄金时计回响', description: `离线期间触发黄金时计，额外获得${bonusShells}贝壳。` });
      SaveSystem.save(WorldState.getRawState());
    }

    const after = WorldState.getState();
    const newEvents = (after.eventLog || []).slice(0, (after.eventLog || []).length - beforeEventCount);
    const eventsByType = {};
    for (const evt of newEvents) {
      eventsByType[evt.type] = (eventsByType[evt.type] || 0) + 1;
    }

    return {
      missedTicks: toProcess,
      durationMs: elapsed,
      expGained: (after.lobster.exp - beforeExp) + (after.lobster.level - beforeLevel) * 50,
      levelsGained: after.lobster.level - beforeLevel,
      shellsEarned: (after.shells || 0) - beforeShells,
      bonusShells,
      eventsByType,
      eventCount: newEvents.length,
      recentEvents: newEvents.slice(0, 20),
      recentActions: (after.lobster.memory || []).slice(0, (after.lobster.memory || []).length - beforeMemoryCount).slice(0, 15),
    };
  },

  tick(silent = false) {
    WorldState.advanceTime();
    WorldState.tickDebuffs();
    const world = WorldState.getWorld();
    const lobster = WorldState.getLobster();

    WorldState.modifyStat('hunger', CONFIG.HUNGER_PER_TICK);
    if (lobster.energy > 5) WorldState.modifyStat('energy', -3);
    const seasonMood = CONFIG.MOOD_SEASON_BASE[world.season] || 0;
    if (seasonMood) WorldState.modifyStat('mood', Math.round(seasonMood / 3));

    WorldState.growCrops();
    this._maybeRefreshShop(world);
    const festivalResult = this._checkFestival(world);

    const isTraveling = WorldState.isTraveling();
    let decision, eventResults = [], leveledUp = false, travelReturn = null, postcardGenerated = null;

    if (isTraveling) {
      const t = lobster.traveling;
      if (WorldState.isTravelComplete()) {
        const dest = postcardsData[t.destination];
        const souvenirPool = dest?.souvenirs || ['seashell'];
        const souvenir = souvenirPool[Math.floor(Math.random() * souvenirPool.length)];
        WorldState.addItem(souvenir, 1);
        WorldState.addExp(CONFIG.TRAVEL_EXP_BONUS);
        WorldState.addPreference(t.destination);
        WorldState.endTravel(souvenir);
        travelReturn = { destination: t.destination, souvenir };
        decision = { action: 'rest', detail: '旅行归来，好好休息', dialogue: `从${dest?.name || '远方'}回来了！带了${souvenir}作为纪念。`, moodDelta: 10, energyCost: 0 };
        WorldState.modifyStat('mood', 10);
      } else {
        postcardGenerated = this._generatePostcard(t.destination, lobster, world);
        decision = { action: 'travel', detail: `在${postcardsData[t.destination]?.name || '旅途中'}`, dialogue: '旅途愉快~', moodDelta: 3, energyCost: 2 };
        WorldState.modifyStat('mood', 3);
        WorldState.modifyStat('energy', -2);
      }
    } else {
      const events = EventEngine.selectEvents(WorldState.getState());
      for (const evt of events) {
        const { combatResult } = EventEngine.applyEffects(evt, WorldState);
        const logEntry = { id: evt.id, tick: world.tickCount, type: evt.type, title: evt.title, description: evt.description, combatResult };

        if (!silent && !combatResult && ['visitor', 'discovery', 'festival', 'travel'].includes(evt.type)) {
          this._tryNarrate(evt, lobster, world).then(narr => {
            if (narr) {
              logEntry.aiTitle = narr.title;
              logEntry.aiDescription = narr.description;
              logEntry.aiReaction = narr.lobsterReaction;
              if (narr.moodEffect) WorldState.modifyStat('mood', Math.max(-10, Math.min(15, narr.moodEffect)));
            }
          }).catch(() => {});
        }

        WorldState.addEvent(logEntry);
        eventResults.push(logEntry);
      }
      decision = LobsterAgent.decide(WorldState);
    }

    WorldState.addMemory({ action: decision.action, detail: decision.detail, tick: world.tickCount });
    WorldState.evolvePersonality(decision.action);
    const baseActionExp = { rest: 3, eat: 4, farm: 6, cook: 7, explore: 8, shop: 3, socialize: 5, travel: 5 };
    const result = WorldState.addExp(baseActionExp[decision.action] || 4);
    leveledUp = result.leveledUp;

    const diaryEntry = { id: `diary_${world.tickCount}`, tick: world.tickCount, type: 'diary', title: decision.detail, description: decision.dialogue };
    WorldState.addEvent(diaryEntry);

    const visitorResult = this._processVisitors(world, lobster);
    const storyResult = this._processStoryArc(world, lobster, decision);

    WorldState.clampStats();
    SaveSystem.save(WorldState.getRawState());

    if (onTickCallback && !silent) {
      onTickCallback({ events: eventResults, decision, diary: diaryEntry, leveledUp, travelReturn, postcardGenerated, visitorResult, festivalResult, storyResult });
    }
  },

  _maybeRefreshShop(world) {
    WorldState.resetFishingDaily(world.dayCount);
    const shop = WorldState.getShop();
    if (shop.refreshDay === world.dayCount) return;
    const items = [];
    const allPools = Object.values(CONFIG.SHOP_POOLS).flat();
    const used = new Set();
    for (let i = 0; i < CONFIG.SHOP_STOCK_SIZE; i++) {
      const candidates = allPools.filter(id => !used.has(id));
      if (candidates.length === 0) break;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      used.add(pick);
      items.push({ id: pick, price: this._getItemPrice(pick), sold: false });
    }
    const special = SHOP_SPECIALS[Math.floor(Math.random() * SHOP_SPECIALS.length)];
    const specialPrice = Math.round(this._getItemPrice(special) * (1.4 + Math.random() * 0.2));
    items.push({ id: special, price: specialPrice, sold: false, isSpecial: true });

    WorldState.refreshShop(items, world.dayCount);
  },

  _getItemPrice(id) {
    const prices = {
      seaweed_seed: 5, coral_rose_seed: 15, sun_kelp_seed: 12, amber_moss_seed: 18, frost_pearl_seed: 30,
      salt: 3, sugar: 5, kelp_flour: 6, plankton: 4, seaweed: 8,
      backpack: 20, snack_pack: 8, map: 15, compass: 25,
      lantern: 30, rock_garden: 25, wind_chime: 20, mini_lighthouse: 50,
      exp_book_s: 15, exp_book_m: 30, exp_book_l: 50,
      energy_potion: 20, mood_potion: 20,
      lucky_charm: 40, growth_potion: 45, weather_stone: 35, exp_accelerator: 55,
      skill_scroll_exploring: 30, skill_scroll_cooking: 30, skill_scroll_social: 30,
      rainbow_anemone_seed: 60,
    };
    return prices[id] || 10;
  },

  _checkFestival(world) {
    const seasonDay = ((world.dayCount - 1) % CONFIG.DAYS_PER_SEASON) + 1;
    const fest = CONFIG.FESTIVALS.find(f => f.season === world.season && f.day === seasonDay);
    if (!fest) return null;
    WorldState.addExp(fest.expBonus);
    WorldState.addShells(fest.shellBonus);
    if (fest.specialItem) WorldState.addItem(fest.specialItem, 1);
    WorldState.addEvent({ id: `festival_${fest.id}_${Date.now()}`, tick: world.tickCount, type: 'festival', title: `${fest.icon} ${fest.name}`, description: `今天是${fest.name}！获得了${fest.shellBonus}贝壳和特别礼物。` });
    return fest;
  },

  _processVisitors(world, lobster) {
    if (WorldState.isTraveling()) return null;
    const raw = WorldState.getRawState();

    if (raw.world.currentVisitor) {
      if (world.tickCount >= raw.world.visitorLeaveTick) {
        const v = WorldState.clearVisitor();
        if (v) {
          WorldState.addVisitorStamp(v.id);
          const stamps = WorldState.getCollections().visitorStamps || [];
          if (stamps.length >= 5 && (WorldState.getShop().discount || 0) < 0.1) {
            WorldState.setShopDiscount(0.1);
          }
          WorldState.addEvent({ id: `visitor_leave_${Date.now()}`, tick: world.tickCount, type: 'visitor', title: `${v.icon} ${v.name}离开了`, description: v.farewell || '访客离开了。' });
        }
        return { type: 'leave', visitor: v };
      }
      return null;
    }

    const socialSkill = lobster.skills?.social || 0;
    const chance = CONFIG.VISITOR_BASE_CHANCE + socialSkill * 0.005;
    if (Math.random() >= chance) return null;

    if (visitorsData.length === 0) return null;
    const totalWeight = visitorsData.reduce((s, v) => s + v.weight, 0);
    let roll = Math.random() * totalWeight;
    let picked = visitorsData[0];
    for (const v of visitorsData) { roll -= v.weight; if (roll <= 0) { picked = v; break; } }

    const stayTicks = 2 + Math.floor(Math.random() * 3);
    WorldState.setVisitor(picked, world.tickCount + stayTicks);
    WorldState.addEvent({ id: `visitor_arrive_${Date.now()}`, tick: world.tickCount, type: 'visitor', title: `${picked.icon} ${picked.name}来访`, description: picked.greeting || '有访客来了！' });
    return { type: 'arrive', visitor: picked };
  },

  _STORY_ARCS: [
    {
      id: 'mystery_shrimp_quest',
      name: '神秘虾的委托',
      minLevel: 5,
      steps: ['find_clue', 'gather_materials', 'deep_dive', 'confront_shadow', 'return_treasure'],
      stepTexts: [
        '神秘虾留下了一张藏宝图碎片...去探索找到更多线索吧',
        '收集到了线索！需要准备3份特殊材料（烹饪或种植获得）',
        '材料准备好了！潜入深海寻找宝藏的入口',
        '深海中有一个暗影守卫，需要战斗才能通过',
        '击败了暗影！带着宝藏回到农场，神秘虾正在等你',
      ],
      stepConditions: ['explore', 'cook_or_farm_3', 'explore', 'battle', 'return'],
      reward: { shells: 100, exp: 50, item: 'deep_sea_pearl', mood: 20 },
    },
    {
      id: 'coral_garden',
      name: '珊瑚花园复兴',
      minLevel: 3,
      steps: ['discover_garden', 'plant_corals', 'nurture_growth', 'attract_fish'],
      stepTexts: [
        '发现了一片荒芜的珊瑚花园，也许可以让它重新焕发生机',
        '在花园里种下珊瑚种子（种植2次）',
        '悉心照料珊瑚（浇水3次）',
        '珊瑚长大了！鱼群开始聚集，花园恢复了生机',
      ],
      stepConditions: ['explore', 'farm_2', 'water_3', 'auto'],
      reward: { shells: 50, exp: 30, mood: 15 },
    },
    {
      id: 'cooking_master',
      name: '海底厨神挑战',
      minLevel: 8,
      steps: ['invitation', 'practice', 'gather_rare', 'compete', 'victory'],
      stepTexts: [
        '章鱼厨师发来了海底厨艺大赛的邀请函！',
        '先练习烹饪提升技艺（烹饪2次）',
        '收集稀有食材准备参赛作品（探索获得）',
        '厨艺大赛开始了！展示你的料理',
        '恭喜获得海底厨神称号！',
      ],
      stepConditions: ['auto', 'cook_2', 'explore', 'cook', 'auto'],
      reward: { shells: 80, exp: 40, item: 'golden_cookware', mood: 25 },
    },
    {
      id: 'turtle_wisdom',
      name: '海龟长老的试炼',
      minLevel: 12,
      steps: ['summon', 'riddle_1', 'riddle_2', 'final_test'],
      stepTexts: [
        '海龟长老出现了，它说有一个古老的试炼等着你',
        '第一关：智慧之试（社交或探索）',
        '第二关：耐心之试（种植并收获）',
        '最终试炼：勇气之试（战斗）',
      ],
      stepConditions: ['auto', 'socialize_or_explore', 'harvest', 'battle'],
      reward: { shells: 120, exp: 60, mood: 20 },
    },
    {
      id: 'lost_treasure',
      name: '沉船宝藏之谜',
      minLevel: 6,
      steps: ['find_map', 'decode', 'dive', 'unlock'],
      stepTexts: [
        '在海底发现了一张古老的藏宝图！',
        '需要研究解读地图上的密码（探索）',
        '按照地图指引潜入深处（探索）',
        '找到了宝箱！用收集的钥匙打开它',
      ],
      stepConditions: ['explore', 'explore', 'explore', 'auto'],
      reward: { shells: 150, exp: 45, item: 'crystal', mood: 20 },
    },
  ],

  _processStoryArc(world, lobster, decision) {
    const arcs = WorldState.getStoryArcs();

    if (!arcs.active) {
      if (arcs.lastCheckDay >= world.dayCount) return null;
      WorldState.setStoryArcCheckDay(world.dayCount);

      if (Math.random() > 0.15) return null;

      const available = this._STORY_ARCS.filter(a =>
        lobster.level >= a.minLevel && !arcs.completed.includes(a.id)
      );
      if (available.length === 0) return null;

      const arc = available[Math.floor(Math.random() * available.length)];
      WorldState.setStoryArc({
        id: arc.id,
        name: arc.name,
        steps: arc.steps,
        stepTexts: arc.stepTexts,
        currentStep: arc.steps[0],
        stepsCompleted: 0,
        startDay: world.dayCount,
        reward: arc.reward,
        _conditions: arc.stepConditions,
        _progress: {},
      });
      return { type: 'start', arc: arc.name, text: arc.stepTexts[0] };
    }

    const active = arcs.active;
    const stepIdx = active.stepsCompleted || 0;
    const condition = active._conditions?.[stepIdx];
    if (!condition) return null;

    let advanced = false;
    const prog = active._progress || {};

    if (condition === 'auto') {
      advanced = true;
    } else if (condition === 'explore' && decision.action === 'explore') {
      advanced = true;
    } else if (condition === 'cook' && decision.action === 'cook') {
      advanced = true;
    } else if (condition === 'battle' && (decision.action === 'mud' || decision.action === 'dungeon')) {
      advanced = true;
    } else if (condition === 'farm_2') {
      if (decision.action === 'farm') prog.farm = (prog.farm || 0) + 1;
      if ((prog.farm || 0) >= 2) { advanced = true; prog.farm = 0; }
    } else if (condition === 'cook_2') {
      if (decision.action === 'cook') prog.cook = (prog.cook || 0) + 1;
      if ((prog.cook || 0) >= 2) { advanced = true; prog.cook = 0; }
    } else if (condition === 'water_3') {
      if (decision.action === 'farm') prog.water = (prog.water || 0) + 1;
      if ((prog.water || 0) >= 3) { advanced = true; prog.water = 0; }
    } else if (condition === 'cook_or_farm_3') {
      if (['cook', 'farm'].includes(decision.action)) prog.cf = (prog.cf || 0) + 1;
      if ((prog.cf || 0) >= 3) { advanced = true; prog.cf = 0; }
    } else if (condition === 'harvest') {
      if (decision.action === 'farm' && decision.detail?.includes('收获')) advanced = true;
    } else if (condition === 'socialize_or_explore') {
      if (['socialize', 'explore'].includes(decision.action)) advanced = true;
    } else if (condition === 'return') {
      advanced = true;
    }

    if (!advanced) {
      if (active._progress !== prog) {
        active._progress = prog;
        WorldState.setStoryArc(active);
      }
      return null;
    }

    const completed = WorldState.progressStoryArc(active.currentStep);
    if (completed) {
      const reward = active.reward;
      if (reward.shells) WorldState.addShells(reward.shells);
      if (reward.exp) WorldState.addExp(reward.exp);
      if (reward.item) WorldState.addItem(reward.item, 1);
      if (reward.mood) WorldState.modifyStat('mood', reward.mood);
      return { type: 'complete', arc: active.name, reward };
    }

    const newArcs = WorldState.getStoryArcs();
    const nextText = newArcs.active?.stepTexts?.[newArcs.active.stepsCompleted] || '';
    return { type: 'progress', arc: active.name, text: nextText, step: (active.stepsCompleted || 0) + 1 };
  },

  async _tryNarrate(evt, lobster, world) {
    const seasonMap = { spring: '春天', summer: '夏天', autumn: '秋天', winter: '冬天' };
    const weatherMap = { sunny: '晴天', rainy: '雨天', stormy: '暴风雨', cloudy: '多云', snowy: '下雪' };
    try {
      return await LLMClient.narrate(evt.title, evt.description, evt.type, {
        name: lobster.name,
        personality: lobster.personality,
        season: seasonMap[world.season] || '春天',
        weather: weatherMap[world.weather] || '晴天',
      });
    } catch { return null; }
  },

  _generatePostcard(destination, lobster, world) {
    const dest = postcardsData[destination];
    if (!dest) return null;
    const existing = (lobster.traveling?.postcards || []).length;
    if (existing >= 3) return null;
    if (Math.random() > 0.4) return null;

    const seasonMap = { spring: '春天', summer: '夏天', autumn: '秋天', winter: '冬天' };
    const ctx = { name: lobster.name, personality: lobster.personality, season: seasonMap[world.season] || '春天' };

    const makeTemplatePostcard = () => {
      if (!dest.templates || dest.templates.length === 0) return null;
      const template = dest.templates[Math.floor(Math.random() * dest.templates.length)];
      return {
        id: `pc_${Date.now()}`,
        destination,
        destinationName: dest.name,
        destinationIcon: dest.icon,
        day: world.dayCount,
        season: world.season,
        greeting: template.greeting,
        message: template.message.replace(/{{name}}/g, lobster.name),
        doodle: template.doodle,
        rarity: template.rarity || 'common',
      };
    };

    if (LLMClient.enabled) {
      LLMClient.generatePostcard(destination, dest.name || destination, ctx).then(aiCard => {
        if (aiCard) {
          WorldState.addPostcard({
            id: `pc_ai_${Date.now()}`,
            destination,
            destinationName: dest.name,
            destinationIcon: dest.icon,
            day: world.dayCount,
            season: world.season,
            greeting: aiCard.greeting,
            message: aiCard.message,
            doodle: aiCard.doodle,
            rarity: aiCard.rarity || 'common',
            aiGenerated: true,
          });
        } else {
          const fallback = makeTemplatePostcard();
          if (fallback) WorldState.addPostcard(fallback);
        }
      }).catch(() => {
        const fallback = makeTemplatePostcard();
        if (fallback) WorldState.addPostcard(fallback);
      });
      return null;
    }

    const postcard = makeTemplatePostcard();
    if (postcard) WorldState.addPostcard(postcard);
    return postcard;
  },
};
