import { LLMClient } from './llm-client.js';
import { WorldState } from './world-state.js';
import { SaveSystem } from './save-system.js';
import { GameLoop } from './game-loop.js';
import { CONFIG } from './config.js';

const CYCLE_MS = 30000;
const CHAT_PAUSE_MS = 10000;
const STORAGE_KEY = 'lobster_autopilot';

let _active = false;
let _timer = null;
let _running = false;
let _lastChatAt = 0;
let _onMessage = null;
let _onStateChange = null;
let _actionCtx = null;

export const AutoPilot = {
  get active() { return _active; },

  init(actionCtx) {
    _actionCtx = actionCtx;
    _active = localStorage.getItem(STORAGE_KEY) === '1';
    if (_active) this._startLoop();
  },

  toggle() {
    _active = !_active;
    localStorage.setItem(STORAGE_KEY, _active ? '1' : '0');
    if (_active) {
      this._startLoop();
      this._emit('🤖 自动驾驶启动！我来自己玩~');
    } else {
      this._stopLoop();
      this._emit('🤚 自动驾驶关闭，主人来操控吧！');
    }
    if (_onStateChange) _onStateChange(_active);
  },

  onMessage(fn) { _onMessage = fn; },
  onStateChange(fn) { _onStateChange = fn; },

  notifyChatActivity() { _lastChatAt = Date.now(); },

  _emit(text) {
    if (_onMessage) _onMessage(text);
  },

  _startLoop() {
    if (_timer) return;
    this._cycle();
    _timer = setInterval(() => this._cycle(), CYCLE_MS);
  },

  _stopLoop() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  },

  async _cycle() {
    if (!_active || _running) return;
    if (Date.now() - _lastChatAt < CHAT_PAUSE_MS) return;

    _running = true;
    try {
      await this._decide();
    } catch (e) {
      console.warn('[autopilot] cycle error:', e);
    }
    _running = false;
  },

  async _decide() {
    const snapshot = this._buildSnapshot();
    if (snapshot.validActions.length === 0) {
      this._emit('没什么可做的，歇一会儿...');
      return;
    }

    let decision = null;
    try {
      decision = await LLMClient.decideAction(snapshot);
    } catch { /* fallback below */ }

    if (!decision) {
      decision = this._fallbackDecision(snapshot);
    }

    await this._execute(decision, snapshot);
  },

  _buildSnapshot() {
    const raw = WorldState.getRawState();
    const l = raw.lobster;
    const inv = raw.inventory || {};
    const farm = raw.farm;
    const dungeon = WorldState.getDungeon();
    const ctx = _actionCtx || {};

    const plots = farm.plots || [];
    const ripe = plots.filter(p => p.crop && p.growthStage >= p.maxGrowth).length;
    const needsWater = plots.filter(p => p.crop && !p.watered && p.growthStage < p.maxGrowth).length;
    const empty = plots.filter(p => !p.crop).length;
    const farmParts = [];
    if (ripe) farmParts.push(`${ripe}块成熟待收`);
    if (needsWater) farmParts.push(`${needsWater}块需浇水`);
    if (empty) farmParts.push(`${empty}块空地`);
    const farmSummary = farmParts.length ? farmParts.join('，') : '农田都处理好了';

    const itemsData = ctx.itemsData || {};
    const recipesData = ctx.recipesData || {};
    const ingredients = [];
    const meals = [];
    for (const [id, count] of Object.entries(inv)) {
      if (count <= 0) continue;
      const info = itemsData[id];
      if (!info) continue;
      if (info.category === 'ingredient') ingredients.push(`${info.name}x${count}`);
      if (info.category === 'meal') meals.push(`${info.name}x${count}`);
    }

    const knownRecipes = raw.collections?.recipes || [];
    const cookable = [];
    for (const rid of knownRecipes) {
      const r = recipesData[rid];
      if (!r) continue;
      let canMake = true;
      for (const [ingId, need] of Object.entries(r.ingredients)) {
        if ((inv[ingId] || 0) < need) { canMake = false; break; }
      }
      if (canMake) cookable.push(r.name);
    }

    const mudReady = ctx.mudCooldown ? (ctx.mudCooldown <= Date.now() ? '冷却好了，可以冒险' : '冷却中') : '可以冒险';

    const dungeonBosses = ctx.dungeonBosses || [];
    const nextBoss = dungeonBosses.find(b => b.tier === dungeon.highestTier + 1);
    let dungeonSummary = '暂无可挑战Boss';
    if (nextBoss) {
      const power = ctx.calcCombatPower ? ctx.calcCombatPower(raw) : 0;
      const canAttempt = WorldState.canAttemptBoss(nextBoss.id) && l.level >= nextBoss.minLevel;
      dungeonSummary = canAttempt
        ? `战力${power} vs ${nextBoss.name}(难度${nextBoss.difficulty})，可挑战`
        : `下一个Boss: ${nextBoss.name}(需Lv.${nextBoss.minLevel}，难度${nextBoss.difficulty})`;
    }

    const validActions = [];
    validActions.push('rest', 'explore');
    if (ripe || needsWater || (empty && Object.keys(inv).some(k => k.endsWith('_seed') && inv[k] > 0))) validActions.push('farm');
    if (cookable.length > 0) validActions.push('cook');
    if (meals.length > 0 || ingredients.some(i => i.includes('海带') || i.includes('浮游生物'))) validActions.push('eat');
    if (raw.shells >= 5) validActions.push('shop');
    if (mudReady.includes('可以')) validActions.push('mud');
    if (nextBoss && WorldState.canAttemptBoss(nextBoss.id) && l.level >= nextBoss.minLevel) validActions.push('dungeon');

    return {
      name: l.name,
      personality: l.personality,
      level: l.level,
      mood: l.mood,
      energy: l.energy,
      hunger: l.hunger,
      shells: raw.shells,
      farmSummary,
      ingredientSummary: ingredients.length ? ingredients.join('、') : '无',
      cookableSummary: cookable.length ? cookable.join('、') : '没有可做的菜',
      mealSummary: meals.length ? meals.join('、') : '无',
      mudReady,
      dungeonSummary,
      validActions,
    };
  },

  _fallbackDecision(snapshot) {
    const s = snapshot;
    let action = 'rest';
    let narration = '歇一会儿吧~';

    if (s.hunger >= 60 && s.validActions.includes('eat')) {
      action = 'eat'; narration = '肚子好饿，先吃点东西！';
    } else if (s.energy < 25) {
      action = 'rest'; narration = '好累啊，休息一下...';
    } else if (s.farmSummary.includes('成熟')) {
      action = 'farm'; narration = '农田有作物成熟了，去收获！';
    } else if (s.farmSummary.includes('浇水')) {
      action = 'farm'; narration = '该给作物浇水了~';
    } else if (s.validActions.includes('cook')) {
      action = 'cook'; narration = '材料够了，做顿饭吧！';
    } else if (s.validActions.includes('mud')) {
      action = 'mud'; narration = '去冒险看看有什么好玩的！';
    } else if (s.validActions.includes('dungeon')) {
      action = 'dungeon'; narration = '挑战深海Boss去！';
    } else if (s.validActions.includes('explore')) {
      action = 'explore'; narration = '出去逛逛，说不定能找到好东西~';
    } else if (s.validActions.includes('farm')) {
      action = 'farm'; narration = '去农田看看~';
    } else if (s.validActions.includes('shop')) {
      action = 'shop'; narration = '去商店逛逛吧！';
    }

    return { action, reason: '', narration };
  },

  async _execute(decision, snapshot) {
    const { action, narration } = decision;
    if (narration) this._emit(narration);

    const ctx = _actionCtx || {};

    switch (action) {
      case 'farm':
        await this._doFarm(ctx);
        break;
      case 'cook':
        await this._doCook(ctx);
        break;
      case 'eat':
        await this._doEat(ctx);
        break;
      case 'rest':
        this._doRest();
        break;
      case 'explore':
        this._doExplore();
        break;
      case 'shop':
        this._doShop();
        break;
      case 'mud':
        await this._doMud(ctx, snapshot);
        break;
      case 'dungeon':
        await this._doDungeon(ctx, snapshot);
        break;
      default:
        this._doRest();
    }
  },

  async _doFarm(ctx) {
    const farm = WorldState.getFarm();
    const plots = farm.plots || [];

    const ripeIdx = plots.findIndex(p => p.crop && p.growthStage >= p.maxGrowth);
    if (ripeIdx >= 0 && ctx.harvestPlot) {
      ctx.harvestPlot(ripeIdx);
      this._emit('收获了一波作物，背包又满了一点~');
      return;
    }

    const waterIdx = plots.findIndex(p => p.crop && !p.watered && p.growthStage < p.maxGrowth);
    if (waterIdx >= 0 && ctx.waterPlot) {
      ctx.waterPlot(waterIdx);
      this._emit('给作物浇了浇水，快快长大吧！');
      return;
    }

    const emptyIdx = plots.findIndex(p => !p.crop);
    const inv = WorldState.getInventory();
    const seedId = Object.keys(inv).find(k => k.endsWith('_seed') && inv[k] > 0);
    if (emptyIdx >= 0 && seedId && ctx.plantSeed) {
      ctx.plantSeed(emptyIdx, seedId);
      this._emit('种下了一颗种子，期待它发芽~');
      return;
    }

    GameLoop.tick();
    this._emit('去农田转了一圈~');
  },

  async _doCook(ctx) {
    const raw = WorldState.getRawState();
    const inv = raw.inventory || {};
    const knownRecipes = raw.collections?.recipes || [];
    const recipesData = ctx.recipesData || {};

    for (const rid of knownRecipes) {
      const r = recipesData[rid];
      if (!r) continue;
      let canMake = true;
      for (const [ingId, need] of Object.entries(r.ingredients)) {
        if ((inv[ingId] || 0) < need) { canMake = false; break; }
      }
      if (canMake) {
        for (const [ingId, need] of Object.entries(r.ingredients)) {
          WorldState.removeItem(ingId, need);
        }
        WorldState.addItem(rid, 1);
        const isDouble = (inv.golden_cookware || 0) > 0 && Math.random() < 0.35;
        if (isDouble) WorldState.addItem(rid, 1);
        WorldState.modifyStat('mood', isDouble ? 8 : 6);
        WorldState.modifySkill('cooking', 1);
        WorldState.clampStats();
        SaveSystem.save(WorldState.getRawState());
        this._emit(isDouble ? `做了双份${r.name}！黄金厨具太给力了~` : `做了一份${r.name}，闻起来好香！`);
        return;
      }
    }
    this._emit('翻了翻材料，好像不够做菜...');
  },

  async _doEat(ctx) {
    const inv = WorldState.getInventory();
    const itemsData = ctx.itemsData || {};
    const edibles = ['seaweed_roll', 'coral_cake', 'shell_soup', 'plankton_pie', 'ocean_tea', 'seaweed', 'plankton'];
    for (const id of edibles) {
      if ((inv[id] || 0) > 0) {
        const info = itemsData[id] || {};
        const effects = ctx.recipesData?.[id]?.effects || {};
        const hungerRestore = Math.abs(effects.hunger || 25);
        const moodGain = effects.mood || 3;
        WorldState.removeItem(id, 1);
        WorldState.modifyStat('hunger', -hungerRestore);
        WorldState.modifyStat('mood', moodGain);
        WorldState.clampStats();
        SaveSystem.save(WorldState.getRawState());
        this._emit(`吃了${info.name || id}，饱饱的真幸福~`);
        return;
      }
    }
    this._emit('翻了翻背包，没有吃的了...');
  },

  _doRest() {
    WorldState.modifyStat('energy', CONFIG.ENERGY_REST_GAIN);
    WorldState.modifyStat('mood', 3);
    WorldState.clampStats();
    SaveSystem.save(WorldState.getRawState());
    this._emit('泡在水里休息，精力恢复中~');
  },

  _doExplore() {
    GameLoop.tick();
  },

  _doShop() {
    GameLoop.tick();
  },

  async _doMud(ctx, snapshot) {
    if (!ctx.triggerMudScene) {
      this._emit('MUD系统还没准备好...');
      return;
    }

    const sceneResult = ctx.triggerMudScene();
    if (!sceneResult || !sceneResult.scene) return;

    const scene = sceneResult.scene;
    const choices = scene.choices || [];
    if (choices.length === 0) return;

    await this._sleep(1500);

    let choiceIdx = 0;
    try {
      const lobster = WorldState.getLobster();
      const llmChoice = await LLMClient.decideChoice(
        scene.name,
        choices,
        { name: lobster.name, personality: lobster.personality, level: lobster.level }
      );
      if (llmChoice) {
        choiceIdx = llmChoice.choiceIndex;
        if (llmChoice.narration) this._emit(llmChoice.narration);
      }
    } catch { /* use default choice 0 */ }

    if (choiceIdx < 0 || choiceIdx >= choices.length) choiceIdx = 0;
    if (sceneResult.clickChoice) {
      sceneResult.clickChoice(choiceIdx);
    }
  },

  async _doDungeon(ctx, snapshot) {
    if (!ctx.dungeonBosses || !ctx.executeDungeonBattle) {
      this._emit('深海挑战还没准备好...');
      return;
    }

    const dungeon = WorldState.getDungeon();
    const boss = ctx.dungeonBosses.find(b => b.tier === dungeon.highestTier + 1);
    if (!boss || !WorldState.canAttemptBoss(boss.id)) {
      this._emit('今天已经挑战过了，明天再来！');
      return;
    }

    this._emit(`准备挑战${boss.name}...`);
    await this._sleep(1500);

    const choices = boss.choices || [];
    let choiceIdx = 0;
    try {
      const lobster = WorldState.getLobster();
      const llmChoice = await LLMClient.decideChoice(
        boss.name,
        choices,
        { name: lobster.name, personality: lobster.personality, level: lobster.level }
      );
      if (llmChoice) {
        choiceIdx = llmChoice.choiceIndex;
        if (llmChoice.narration) this._emit(llmChoice.narration);
      }
    } catch { /* use default choice 0 */ }

    const inv = WorldState.getInventory();
    const recipesData = ctx.recipesData || {};
    let bestFoodId = '';
    let bestBonus = 0;
    for (const [id, count] of Object.entries(inv)) {
      if (count <= 0) continue;
      const r = recipesData[id];
      if (r && r.battleBonus && r.battleBonus > bestBonus) {
        bestBonus = r.battleBonus;
        bestFoodId = id;
      }
    }

    if (bestFoodId) {
      this._emit(`先吃一份${recipesData[bestFoodId].name}增强战力！`);
    }

    await this._sleep(1000);

    if (choiceIdx < 0 || choiceIdx >= choices.length) choiceIdx = 0;
    const result = ctx.executeDungeonBattle(boss, choices[choiceIdx], bestFoodId);
    if (result) {
      if (result.won) {
        this._emit(`🏆 打败了${boss.name}！${result.rewardText || ''}`);
      } else {
        this._emit(`💔 惜败于${boss.name}...下次再来！`);
      }
    }
  },

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};
