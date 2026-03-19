import { CONFIG, ACTION_LABELS } from './config.js';

let personalities = {};
let items = {};
let recipes = {};

export const LobsterAgent = {
  async init() {
    const [pResp, iResp, rResp] = await Promise.all([
      fetch('./data/personalities.json'),
      fetch('./data/items.json'),
      fetch('./data/recipes.json'),
    ]);
    personalities = await pResp.json();
    items = await iResp.json();
    recipes = await rResp.json();
  },

  decide(ws) {
    const state = ws.getState();
    const lobster = state.lobster || {};
    const profile = personalities[lobster.personality];
    if (!profile) return this._fallback();

    if (ws.getActionFailChance() > 0 && Math.random() < ws.getActionFailChance()) {
      ws.modifyStat('mood', -2);
      ws.modifyStat('energy', -3);
      return { action: 'rest', detail: '太累了，什么都不想做', dialogue: '精力不够...先歇一歇...', moodDelta: -2, energyCost: 3 };
    }

    if (ws.isTraveling()) {
      return { action: 'travel', detail: '旅途中...', dialogue: '在路上，风景真好~', moodDelta: 2, energyCost: 2 };
    }

    const actions = ['rest', 'eat', 'farm', 'cook', 'explore', 'shop', 'socialize', 'travel'];
    const scores = {};

    for (const action of actions) {
      let score = (profile.actionWeights[action] || (action === 'travel' ? 0.6 : 1.0)) * 40;

      if (action === 'rest' && lobster.energy < 30) score += 60;
      if (action === 'rest' && lobster.energy < 15) score += 40;
      if (action === 'eat' && lobster.hunger > 60) score += 60;
      if (action === 'eat' && lobster.hunger > 80) score += 40;
      if (action === 'farm') {
        const plots = state.farm?.plots || [];
        const needsWater = plots.filter(p => p.crop && !p.watered && p.growthStage < p.maxGrowth).length;
        const emptyPlots = plots.filter(p => !p.crop).length;
        const ripe = plots.filter(p => p.crop && p.growthStage >= p.maxGrowth).length;
        score += needsWater * 10 + emptyPlots * 5 + ripe * 15;
      }
      if (action === 'cook') {
        const canCook = this._findCookableRecipe(state);
        score += canCook ? 25 : -30;
      }
      if (action === 'eat') {
        const hasFood = this._findEdibleItem(state);
        if (!hasFood) score -= 50;
      }
      if (action === 'travel') {
        const inv = state.inventory || {};
        const hasGear = CONFIG.TRAVEL_REQUIREMENTS.every(r => (inv[r] || 0) > 0);
        if (!hasGear || lobster.level < 6) score = 0;
        else score += lobster.energy > 50 ? 20 : -20;
      }

      const recentActions = lobster.memory.slice(0, 3).map(m => m.action);
      const repeatCount = recentActions.filter(a => a === action).length;
      score -= repeatCount * 25;

      const efficiency = ws.getActionEfficiency();
      score *= efficiency;

      score += (Math.random() - 0.5) * 30;
      scores[action] = Math.max(0, score);
    }

    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    const action = best[0];
    const result = this._executeAction(action, state, ws);
    return result;
  },

  _executeAction(action, state, ws) {
    const lobster = state.lobster || {};
    const profile = personalities[lobster.personality];
    const pKey = lobster.personality;
    let detail = '';
    let dialogue = '';
    let moodDelta = 0;
    let energyCost = 10;

    switch (action) {
      case 'rest': {
        ws.modifyStat('energy', CONFIG.ENERGY_REST_GAIN);
        energyCost = 0;
        moodDelta = 3;
        detail = '在池塘里泡澡';
        dialogue = this._restDialogue(pKey);
        ws.update('lobster.location', 'pond');
        break;
      }
      case 'eat': {
        const food = this._findEdibleItem(state);
        if (food) {
          ws.removeItem(food.id);
          const hungerRestore = food.hunger || 25;
          ws.modifyStat('hunger', -hungerRestore);
          const prefCount = (lobster.preferences || {})[food.id] || 0;
          const prefBonus = prefCount >= CONFIG.PREFERENCE_THRESHOLD_FOOD ? CONFIG.PREFERENCE_MOOD_BONUS : 0;
          moodDelta = 5 + prefBonus;
          energyCost = 5;
          detail = prefBonus > 0 ? `开心地吃了最爱的${food.name}` : `吃了${food.name}`;
          dialogue = this._eatDialogue(pKey, food.name);
          ws.addPreference(food.id);
        } else {
          detail = '翻了翻背包，什么吃的都没有';
          dialogue = '肚子好饿...但是什么都没有...';
          moodDelta = -5;
          energyCost = 3;
        }
        break;
      }
      case 'farm': {
        const plots = state.farm?.plots || [];
        const ripe = plots.findIndex(p => p.crop && p.growthStage >= p.maxGrowth);
        if (ripe >= 0) {
          const plot = plots[ripe];
          const cropItem = this._cropToItem(plot.crop);
          const isGoldenHarvest = plot.crop === 'golden_crop';
          ws.addItem(cropItem, isGoldenHarvest ? 2 : 1);
          if (isGoldenHarvest) ws.addShells(15);
          ws.setPlot(ripe, { crop: null, growthStage: 0, maxGrowth: 0, watered: false });
          detail = `收获了${items[cropItem]?.name || plot.crop}`;
          dialogue = this._farmDialogue(pKey, 'harvest');
          moodDelta = isGoldenHarvest ? 12 : 8;
          ws.modifySkill('farming', 1);
        } else {
          const needsWater = plots.findIndex(p => p.crop && !p.watered && p.growthStage < p.maxGrowth);
          if (needsWater >= 0) {
            const boostGrowth = ((state.inventory || {}).golden_watering_can || 0) > 0 ? 1 : 0;
            const nextGrowth = Math.min(plots[needsWater].maxGrowth, plots[needsWater].growthStage + boostGrowth);
            ws.setPlot(needsWater, { watered: true });
            if (boostGrowth > 0) ws.setPlot(needsWater, { growthStage: nextGrowth });
            detail = '给作物浇了水';
            dialogue = this._farmDialogue(pKey, 'water');
            moodDelta = boostGrowth > 0 ? 3 : 2;
            ws.modifySkill('farming', 1);
          } else {
            const empty = plots.findIndex(p => !p.crop);
            const inv = state.inventory || {};
            const seedIds = Object.keys(inv).filter(k => k.endsWith('_seed') && inv[k] > 0);
            const seedId = seedIds.includes('golden_seed') && Math.random() < 0.55 ? 'golden_seed' : seedIds[0];
            if (empty >= 0 && seedId) {
              ws.removeItem(seedId, 1);
              const cropName = seedId === 'golden_seed' ? 'golden_crop' : seedId.replace('_seed', '');
              const seedItem = items[seedId];
              const growthTicks = seedItem?.growthTicks || 5;
              ws.setPlot(empty, { crop: cropName, growthStage: 0, maxGrowth: growthTicks, watered: false });
              detail = `种下了${seedItem?.name || cropName}`;
              dialogue = this._farmDialogue(pKey, 'plant');
              moodDelta = 4;
              ws.modifySkill('farming', 1);
            } else {
              detail = '看了看农田，没什么可做的';
              dialogue = '田里一切都好。';
              moodDelta = 1;
            }
          }
        }
        ws.update('lobster.location', 'farm');
        energyCost = 12;
        break;
      }
      case 'cook': {
        const recipe = this._findCookableRecipe(state);
        if (recipe) {
          for (const [ingId, count] of Object.entries(recipe.ingredients)) {
            ws.removeItem(ingId, count);
          }
          const mealId = recipe.id;
          ws.addItem(mealId, 1);
          const isDoubleCook = ((state.inventory || {}).golden_cookware || 0) > 0 && Math.random() < 0.35;
          if (isDoubleCook) ws.addItem(mealId, 1);
          detail = isDoubleCook ? `做了双份${recipe.name}` : `做了一份${recipe.name}`;
          dialogue = this._cookDialogue(pKey, recipe.name);
          moodDelta = isDoubleCook ? 8 : 6;
          ws.modifySkill('cooking', 1);
        } else {
          detail = '翻了翻厨房，材料不够';
          dialogue = '缺材料了...下次再做吧。';
          moodDelta = -2;
        }
        ws.update('lobster.location', 'kitchen');
        energyCost = 10;
        break;
      }
      case 'explore': {
        const exploreSkill = lobster.skills.exploring || 0;
        const rareBonus = exploreSkill >= 15 ? 0.15 : (exploreSkill >= 5 ? 0.08 : 0);
        const finds = [
          { item: 'seashell', name: '贝壳', chance: 0.35 - rareBonus * 0.5 },
          { item: 'sea_glass', name: '海玻璃', chance: 0.20 + rareBonus * 0.3 },
          { item: 'salt', name: '海盐', chance: 0.25 },
          { item: 'crystal', name: '水晶', chance: 0.05 + rareBonus },
          { item: 'golden_shard', name: '金色碎片', chance: exploreSkill >= 25 ? 0.06 : 0.02 },
          { item: null, name: null, chance: Math.max(0.02, 0.13 - rareBonus * 0.8) },
        ];
        const roll = Math.random();
        let cumulative = 0;
        let found = finds[finds.length - 1];
        for (const f of finds) {
          cumulative += f.chance;
          if (roll <= cumulative) { found = f; break; }
        }
        if (found.item) {
          ws.addItem(found.item, 1);
          detail = `探索时发现了${found.name}`;
          dialogue = this._exploreDialogue(pKey, found.name);
          moodDelta = 7;
        } else {
          detail = '四处逛了逛，什么也没找到';
          dialogue = '今天运气不太好，不过散步也不错。';
          moodDelta = 2;
        }
        ws.modifySkill('exploring', 1);
        energyCost = 15;
        break;
      }
      case 'shop': {
        if (state.shells >= 10) {
          const buyable = ['seaweed_seed', 'salt', 'sugar', 'plankton', 'kelp_flour'];
          const pick = buyable[Math.floor(Math.random() * buyable.length)];
          const price = items[pick]?.buyPrice || 5;
          if (state.shells >= price) {
            ws.addShells(-price);
            ws.addItem(pick, 1);
            detail = `买了${items[pick]?.name || pick}`;
            dialogue = `花了${price}贝壳，值！`;
            moodDelta = 3;
          }
        } else {
          detail = '逛了逛商店，买不起';
          dialogue = '口袋空空...';
          moodDelta = -2;
        }
        ws.update('lobster.location', 'shop');
        energyCost = 5;
        break;
      }
      case 'socialize': {
        detail = '和路过的小鱼聊了会天';
        dialogue = this._socialDialogue(profile);
        moodDelta = 8;
        ws.modifySkill('social', 1);
        energyCost = 8;
        break;
      }
      case 'travel': {
        const dests = Object.entries(CONFIG.DESTINATIONS).filter(([, d]) => lobster.level >= d.minLevel);
        if (dests.length === 0) { detail = '还不够强，暂时不能旅行'; dialogue = '等我再长大一点...'; moodDelta = -2; energyCost = 3; break; }
        const canGo = CONFIG.TRAVEL_REQUIREMENTS.every(r => (state.inventory[r] || 0) > 0);
        if (!canGo) { detail = '缺少旅行装备'; dialogue = '需要背包和零食才能出发...'; moodDelta = -1; energyCost = 2; break; }
        for (const r of CONFIG.TRAVEL_REQUIREMENTS) ws.removeItem(r, 1);
        const [destId, destInfo] = dests[Math.floor(Math.random() * dests.length)];
        const duration = 6 + Math.floor(Math.random() * 7);
        ws.startTravel(destId, duration);
        ws.addPreference(destId);
        detail = `出发前往${destInfo.name}`;
        dialogue = `${destInfo.icon} 出发啦！${destInfo.name}，我来了！`;
        moodDelta = 12;
        energyCost = 15;
        ws.modifySkill('exploring', 1);
        break;
      }
    }

    ws.modifyStat('mood', moodDelta);
    ws.modifyStat('energy', -energyCost);
    ws.clampStats();

    return { action, detail, dialogue, moodDelta, energyCost };
  },

  _findEdibleItem(state) {
    const edibles = {
      seaweed_roll: { name: '海苔卷', hunger: 30 },
      coral_cake: { name: '珊瑚蛋糕', hunger: 40 },
      ocean_tea: { name: '海洋茶', hunger: 10 },
      shell_soup: { name: '贝壳汤', hunger: 50 },
      plankton_pie: { name: '浮游生物派', hunger: 35 },
      seaweed: { name: '海带', hunger: 15 },
      plankton: { name: '浮游生物', hunger: 10 },
    };
    const inv = state.inventory || {};
    for (const [id, info] of Object.entries(edibles)) {
      if (inv[id] > 0) return { id, ...info };
    }
    return null;
  },

  _findCookableRecipe(state) {
    const known = state.collections?.recipes || [];
    const inv = state.inventory || {};
    for (const recipeId of known) {
      const recipe = recipes[recipeId];
      if (!recipe) continue;
      let canMake = true;
      for (const [ingId, count] of Object.entries(recipe.ingredients)) {
        if ((inv[ingId] || 0) < count) { canMake = false; break; }
      }
      if (canMake) return { id: recipeId, ...recipe };
    }
    return null;
  },

  _cropToItem(cropName) {
    const map = {
      seaweed: 'seaweed', coral_rose: 'coral_fragment', sun_kelp: 'sun_kelp',
      amber_moss: 'amber_moss', frost_pearl: 'frost_pearl',
    };
    return map[cropName] || cropName;
  },

  _restDialogue(pKey) {
    const lines = {
      adventurous: ['休息一下，为下次冒险充电！', '泡在水里，想着远方...'],
      lazy: ['啊...这才是生活...', '再睡五分钟...不，五小时...', 'zzz...'],
      gluttonous: ['吃饱了就想睡...', '梦里有好多好吃的...'],
      scholarly: ['闭目养神，整理一下思绪。', '安静的时光最适合思考。'],
      social: ['一个人待着有点无聊...', '休息好了才能更好地招待客人！'],
      mischievous: ['假装睡觉，其实在偷偷观察...', '嘿嘿，趁没人注意偷个懒~'],
    };
    const arr = lines[pKey] || lines.lazy;
    return arr[Math.floor(Math.random() * arr.length)];
  },

  _eatDialogue(pKey, foodName) {
    const styles = {
      gluttonous: `${foodName}！！太好吃了！！还有吗！！`,
      scholarly: `${foodName}的口感很有层次，值得记录。`,
      lazy: `嗯...${foodName}...好吃...不想动了...`,
      adventurous: `吃饱了才有力气去探索！${foodName}真不错。`,
      social: `要是能和朋友一起吃${foodName}就好了。`,
      mischievous: `偷偷把最好吃的部分藏起来，嘿嘿~`,
    };
    return styles[pKey] || `${foodName}，味道还行。`;
  },

  _farmDialogue(pKey, type) {
    if (type === 'harvest') return '收获的感觉真好！';
    if (type === 'water') return '浇浇水，希望它们快快长大。';
    if (type === 'plant') return '种下一颗种子，种下一份希望。';
    return '田里的一切都在慢慢生长。';
  },

  _cookDialogue(pKey, recipeName) {
    const styles = {
      gluttonous: `${recipeName}做好了！闻起来太香了，口水都要流下来了！`,
      scholarly: `按照食谱精确操作，${recipeName}完成。`,
      mischievous: `偷偷加了点秘密调料，嘿嘿~`,
    };
    return styles[pKey] || `${recipeName}做好啦！`;
  },

  _exploreDialogue(pKey, itemName) {
    const styles = {
      adventurous: `太棒了！发现了${itemName}！这趟没白跑！`,
      scholarly: `有趣的发现——${itemName}。要好好研究一下。`,
      mischievous: `嘿嘿，${itemName}到手！谁也别想抢走！`,
    };
    return styles[pKey] || `找到了${itemName}，运气不错。`;
  },

  _socialDialogue() {
    const lines = [
      '和邻居聊了聊最近的天气，很开心。',
      '听小鱼讲了一个有趣的故事。',
      '交了一个新朋友！',
      '大家一起晒太阳，真惬意。',
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  },

  _fallback() {
    return { action: 'rest', detail: '发呆中', dialogue: '...', moodDelta: 0, energyCost: 0 };
  },
};
