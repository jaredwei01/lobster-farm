import { CONFIG, PERSONALITY_LABELS, ACTION_LABELS, CHECKIN_REWARDS, SEA_CREATURE_CATALOG, FISHING_REWARDS, FISHING_CONFIG, ACHIEVEMENT_DEFS } from './config.js';
import { WorldState } from './world-state.js';
import { SaveSystem } from './save-system.js';
import { EventEngine } from './event-engine.js';
import { LobsterAgent } from './lobster-agent.js';
import { GameLoop } from './game-loop.js';
import { UIRenderer } from './ui-renderer.js';
import { Analytics } from './analytics.js';
import { LLMClient } from './llm-client.js';
import { EmpathyTracker } from './empathy-tracker.js';
import { AutoPilot } from './autopilot.js';
import { SFX } from './sfx.js';

const PERSONALITIES_INFO = {
  adventurous: { emoji: '🧭', label: '冒险型', desc: '好奇心旺盛，热爱探索' },
  lazy:        { emoji: '😴', label: '懒惰型', desc: '享受生活，热爱午睡' },
  gluttonous:  { emoji: '🍖', label: '贪吃型', desc: '为美食而活' },
  scholarly:   { emoji: '📚', label: '学者型', desc: '善于观察，热爱思考' },
  social:      { emoji: '🤝', label: '社交型', desc: '喜欢交朋友' },
  mischievous: { emoji: '😈', label: '调皮型', desc: '小小的捣蛋鬼' },
};

const SUGGEST_ACTIONS = [
  { action: 'rest',      icon: '💤', label: '去休息一下', hint: '恢复精力' },
  { action: 'eat',       icon: '🍽️', label: '去吃点东西', hint: '降低饥饿' },
  { action: 'farm',      icon: '🌱', label: '去打理农田', hint: '种植/浇水/收获' },
  { action: 'cook',      icon: '🍳', label: '去做顿饭', hint: '需要食材' },
  { action: 'explore',   icon: '🔍', label: '去探索一下', hint: '可能发现宝贝' },
  { action: 'socialize', icon: '💬', label: '去交个朋友', hint: '提升心情' },
];

const CROP_TO_ITEM = {
  seaweed: 'seaweed',
  coral_rose: 'coral_fragment',
  sun_kelp: 'sun_kelp',
  amber_moss: 'amber_moss',
  frost_pearl: 'frost_pearl',
};

const FARM_STRATEGIES = {
  balanced: { label: '稳健收益' },
  growth: { label: '快速成长' },
  saver: { label: '省资源' },
};
const FARM_STRATEGY_DEFAULT = 'balanced';
const FARM_STRATEGY_STORAGE_KEY = 'lobster_farm_strategy';

const GOLDEN_PITY_THRESHOLD = 12;
const GOLDEN_BASE_DROP_CHANCE = 0.07;
const GOLDEN_TRIGGER_LABELS = {
  tick_farm: '龙虾农田行动',
  tick_explore: '龙虾探索行动',
  tick_cook: '龙虾烹饪行动',
  tick_socialize: '龙虾社交行动',
  feed: '投喂互动',
  plant: '手动种植',
  harvest: '手动收获',
  water: '手动浇水',
  pet: '摸摸互动',
  interactive: '随机互动事件',
};
const GOLDEN_DROP_POOL = [
  { itemId: 'golden_shard', weight: 64, min: 1, max: 2 },
  { itemId: 'golden_seed', weight: 16, min: 1, max: 1 },
  { itemId: 'golden_watering_can', weight: 7, min: 1, max: 1 },
  { itemId: 'golden_cookware', weight: 5, min: 1, max: 1 },
  { itemId: 'golden_charm', weight: 5, min: 1, max: 1 },
  { itemId: 'golden_hourglass', weight: 3, min: 1, max: 1 },
];
const GOLDEN_UNIQUE_ITEMS = new Set(['golden_watering_can', 'golden_cookware', 'golden_charm', 'golden_hourglass']);
const GOLDEN_WORKSHOP_RECIPES = [
  { itemId: 'golden_seed', icon: '🌱', shards: 4, shells: 15, desc: '种下后可收获黄金作物' },
  { itemId: 'golden_watering_can', icon: '🪣', shards: 10, shells: 40, desc: '浇水时额外生长1阶段' },
  { itemId: 'golden_cookware', icon: '🍳', shards: 10, shells: 40, desc: '烹饪有概率双份出餐' },
  { itemId: 'golden_charm', icon: '🧿', shards: 12, shells: 45, desc: '互动事件更易触发好运' },
  { itemId: 'golden_hourglass', icon: '⏳', shards: 11, shells: 45, desc: '离线时额外获得贝壳' },
  { itemId: 'exp_book_l', icon: '📚', shards: 6, shells: 20, desc: '获得150经验值' },
  { itemId: 'lucky_star', icon: '⭐', shards: 5, shells: 15, desc: '5次事件胜率+30%' },
  { itemId: 'exp_accelerator', icon: '🚀', shards: 8, shells: 30, desc: '24小时经验×1.5' },
];

const EDIBLE_FOODS = {
  seaweed_roll: { name: '海苔卷', hunger: 30, mood: 3 },
  coral_cake: { name: '珊瑚蛋糕', hunger: 40, mood: 10 },
  ocean_tea: { name: '海洋茶', hunger: 10, mood: 8 },
  shell_soup: { name: '贝壳汤', hunger: 50, mood: 5 },
  plankton_pie: { name: '浮游生物派', hunger: 35, mood: 5 },
  seaweed: { name: '海带（生）', hunger: 15, mood: 1 },
  plankton: { name: '浮游生物（生）', hunger: 10, mood: 0 },
};

const MUD_COOLDOWN_MS = 120000;
const MORNING_GREETING_DELAY = 1500;
const COPY_SUCCESS_RESET_MS = 2000;
const MAX_RENAME_PER_DAY = 2;
const ANNIVERSARY_DAYS = [7, 30, 100];
const GIFT_CHANCE = { high: 0.08, mid: 0.04, low: 0.02 };
const SEA_TOAST_DURATION_MS = 2800;

let selectedPersonality = null;
let itemsData = {};
let recipesData = {};
let pendingSuggestion = null;
let farmStrategy = FARM_STRATEGY_DEFAULT;

async function boot() {
  Analytics.init();

  await Promise.all([
    EventEngine.init(),
    LobsterAgent.init(),
    UIRenderer.init(),
    GameLoop.loadData(),
    loadMudScenes(),
    LLMClient.init(),
    fetch('./data/items.json').then(r => r.json()).then(d => { itemsData = d; }),
    fetch('./data/recipes.json').then(r => r.json()).then(d => { recipesData = d; }),
  ]);

  const urlKey = new URLSearchParams(window.location.search).get('key');
  if (urlKey && urlKey.startsWith('lob_')) {
    const serverState = await SaveSystem.loadFromServer(urlKey);
    if (serverState) {
      WorldState.loadState(serverState);
      startGame();
      return;
    }
  }

  if (SaveSystem.hasSave()) {
    const saved = SaveSystem.load();
    if (saved && saved.lobster?.name) {
      if (saved.version && saved.version < '0.5.0') {
        SaveSystem.deleteSave();
        UIRenderer.showNotification('🎉 游戏已升级到V5大版本！新增旅行、访客、商店、收藏系统，请重新开始体验。', 5000);
        showCreateScreen();
        return;
      }
      WorldState.loadState(saved);
      startGame();
      return;
    }
  }

  if (_tryAutoCreate()) return;
  showCreateScreen();
}

function _tryAutoCreate() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('auto') !== '1') return false;

  const name = (params.get('name') || '').trim() || `虾${Math.floor(Math.random() * 900 + 100)}`;
  const personality = params.get('personality') || 'adventurous';
  const validPersonalities = Object.keys(PERSONALITIES_INFO);
  const finalPersonality = validPersonalities.includes(personality) ? personality : 'adventurous';

  WorldState.initNew(name, finalPersonality);
  const inheritShells = parseInt(localStorage.getItem('lobster_inherit_shells') || '0', 10);
  if (inheritShells > 0) {
    WorldState.addShells(inheritShells);
    localStorage.removeItem('lobster_inherit_shells');
  }
  SaveSystem.save(WorldState.getRawState());
  Analytics.track('auto_create_lobster', { name, personality: finalPersonality, source: 'url_param' });
  startGame();
  return true;
}


function showCreateScreen() {
  document.getElementById('create-screen').classList.remove('hidden');
  document.getElementById('game-screen').classList.add('hidden');

  const grid = document.getElementById('personality-grid');
  grid.innerHTML = '';
  for (const [key, info] of Object.entries(PERSONALITIES_INFO)) {
    const div = document.createElement('div');
    div.className = 'personality-option';
    div.dataset.key = key;
    div.innerHTML = `<span class="p-emoji">${info.emoji}</span>${info.label}<div class="p-desc">${info.desc}</div>`;
    div.addEventListener('click', () => {
      grid.querySelectorAll('.personality-option').forEach(el => el.classList.remove('selected'));
      div.classList.add('selected');
      selectedPersonality = key;
      updateStartButton();
    });
    grid.appendChild(div);
  }

  const nameInput = document.getElementById('lobster-name');
  nameInput.value = '';
  nameInput.addEventListener('input', updateStartButton);

  document.getElementById('btn-start').addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name || !selectedPersonality) return;
    WorldState.initNew(name, selectedPersonality);
    const inheritShells = parseInt(localStorage.getItem('lobster_inherit_shells') || '0', 10);
    if (inheritShells > 0) {
      WorldState.addShells(inheritShells);
      localStorage.removeItem('lobster_inherit_shells');
    }
    SaveSystem.save(WorldState.getRawState());
    Analytics.track('create_lobster', { name, personality: selectedPersonality, inheritShells });
    startGame();
  });

  const copyBtn = document.getElementById('btn-copy-skill');
  const skillUrl = document.getElementById('skill-url');
  if (copyBtn && skillUrl) {
    copyBtn.addEventListener('click', () => {
      const text = skillUrl.value;
      const onSuccess = () => {
        copyBtn.textContent = '复制成功 ✓';
        copyBtn.classList.add('copied');
        Analytics.track('copy_skill_url');
        setTimeout(() => { copyBtn.textContent = '复制'; copyBtn.classList.remove('copied'); }, COPY_SUCCESS_RESET_MS);
      };
      const fallbackCopy = () => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand('copy'); onSuccess(); } catch (_) { alert('请手动复制: ' + text); }
        document.body.removeChild(ta);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(onSuccess).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
    });
  }

  const bindKeyBtn = document.getElementById('btn-bind-key');
  const bindKeyInput = document.getElementById('bind-key-input');
  const bindKeyError = document.getElementById('bind-key-error');
  if (bindKeyBtn && bindKeyInput) {
    bindKeyBtn.addEventListener('click', async () => {
      const key = (bindKeyInput.value || '').trim();
      if (!key.startsWith('lob_') || key.length < 8) {
        if (bindKeyError) { bindKeyError.textContent = 'KEY 格式不对，应以 lob_ 开头'; bindKeyError.classList.remove('hidden'); }
        return;
      }
      bindKeyBtn.disabled = true;
      bindKeyBtn.textContent = '绑定中…';
      if (bindKeyError) bindKeyError.classList.add('hidden');
      const serverState = await SaveSystem.loadFromServer(key);
      if (serverState) {
        WorldState.loadState(serverState);
        Analytics.track('bind_key', { key });
        startGame();
      } else {
        if (bindKeyError) { bindKeyError.textContent = '未找到该 KEY 对应的龙虾，请检查后重试'; bindKeyError.classList.remove('hidden'); }
        bindKeyBtn.disabled = false;
        bindKeyBtn.textContent = '绑定';
      }
    });
  }
}

function updateStartButton() {
  const name = document.getElementById('lobster-name').value.trim();
  document.getElementById('btn-start').disabled = !(name && selectedPersonality);
}

const SKILL_BUFF_APPLIED_KEY = 'lobster_skill_buff_date';

function _applySkillBuffsOnce() {
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(SKILL_BUFF_APPLIED_KEY) === today) return;

  const empathy = EmpathyTracker.getSummary();
  if (!empathy) return;

  let applied = false;

  if (empathy.workMin > 120 && empathy.taskCount >= 8) {
    WorldState.addDebuff({ type: 'combat_power', value: 3, ticksLeft: 12, label: '主人激励' });
    applied = true;
  } else if (empathy.workMin > 60) {
    WorldState.addDebuff({ type: 'combat_power', value: 1, ticksLeft: 12, label: '主人陪伴' });
    applied = true;
  }

  if (empathy.daysSinceLastVisit >= 3) {
    WorldState.addDebuff({ type: 'combat_power', value: -3, ticksLeft: 6, label: '思念主人' });
    applied = true;
  }

  if (empathy.streak >= 5) {
    WorldState.addDebuff({ type: 'combat_power', value: 2, ticksLeft: 12, label: '陪伴之力' });
    applied = true;
  }

  if (empathy.lastActiveTime) {
    const hour = parseInt(empathy.lastActiveTime.split(':')[0], 10);
    if (hour >= 23 || hour < 5) {
      WorldState.addDebuff({ type: 'combat_power', value: -2, ticksLeft: 6, label: '熬夜' });
      applied = true;
    }
  }

  const bond = WorldState.getBond().score;
  if (bond >= 80) {
    WorldState.addDebuff({ type: 'combat_power', value: 4, ticksLeft: 12, label: '羁绊之力' });
    applied = true;
  } else if (bond >= 60) {
    WorldState.addDebuff({ type: 'combat_power', value: 2, ticksLeft: 12, label: '友情加持' });
    applied = true;
  } else if (bond < 20) {
    WorldState.addDebuff({ type: 'combat_power', value: -3, ticksLeft: 6, label: '孤独' });
    applied = true;
  }

  if (applied) {
    localStorage.setItem(SKILL_BUFF_APPLIED_KEY, today);
    SaveSystem.save(WorldState.getRawState());
  }
}

// --- Milestone Capture ---

function _checkMilestones(trigger, extra = {}) {
  const l = WorldState.getLobster();
  const d = WorldState.getDungeon();

  if (trigger === 'game_start') {
    WorldState.addMilestone('first_meeting', `${l.name}来到了这个世界，一切都是新的`);
  }
  if (trigger === 'level_up') {
    const lvl = l.level;
    if (lvl === 10) WorldState.addMilestone('level_10', `${l.name}成长到了 Lv.10，开始崭露头角`);
    if (lvl === 20) WorldState.addMilestone('level_20', `${l.name}到达 Lv.20，已经是海底的老手了`);
    if (lvl === 30) WorldState.addMilestone('level_30', `${l.name}到达 Lv.30，传说级的存在`);
  }
  if (trigger === 'boss_win') {
    if (!WorldState.getMilestones().some(m => m.type === 'first_boss_win')) {
      WorldState.addMilestone('first_boss_win', `第一次打败了Boss「${extra.bossName || '未知'}」！`, { boss: extra.bossName });
    }
    if (extra.tier && extra.tier >= 4) {
      WorldState.addMilestone(`dungeon_tier_${extra.tier}`, `征服了深海挑战第${extra.tier}层`, { tier: extra.tier });
    }
  }
  if (trigger === 'travel_return') {
    if (!WorldState.getMilestones().some(m => m.type === 'first_travel')) {
      WorldState.addMilestone('first_travel', `第一次旅行归来，从${extra.dest || '远方'}带回了纪念品`, { dest: extra.dest });
    }
  }
  if (trigger === 'first_cook') {
    WorldState.addMilestone('first_cook', `学会了做第一道菜：${extra.recipeName || '美食'}`);
  }
  if (trigger === 'streak') {
    const streak = extra.streak || 0;
    if (streak >= 7) WorldState.addMilestone('streak_7', '主人连续7天来看望，感动得不行');
    if (streak >= 30) WorldState.addMilestone('streak_30', '主人连续30天陪伴，这份坚持太珍贵了');
  }
}

// --- Bedtime / Wake-up Rituals ---

function _showMorningGreeting() {
  const today = new Date().toISOString().slice(0, 10);
  const lastGreeting = localStorage.getItem('lobster_last_morning');
  if (lastGreeting === today) return;
  localStorage.setItem('lobster_last_morning', today);

  const hour = new Date().getHours();
  const l = WorldState.getLobster();
  const name = l.name || '龙虾';

  let greeting = '';
  if (hour >= 5 && hour < 12) {
    const mornings = [
      `早上好主人！${name}已经起来啦，今天也要一起加油哦~`,
      `主人早安！昨晚我做了个梦，梦到我们一起去探险了`,
      `早呀主人！农田里的作物长得不错，快来看看吧`,
    ];
    greeting = mornings[Math.floor(Math.random() * mornings.length)];
  } else if (hour >= 12 && hour < 18) {
    greeting = `主人下午好！${name}等你好久了，今天过得怎么样？`;
  } else {
    greeting = `主人晚上好！${name}今天一个人玩了好久，终于等到你了~`;
  }

  const state = WorldState.getState();
  const autopilotResults = [];
  const dungeon = state.dungeon || {};
  if (dungeon.totalWins > 0) autopilotResults.push(`赢了${dungeon.totalWins}场战斗`);
  const farmRipe = (state.farm?.plots || []).filter(p => p.crop && p.growthStage >= p.maxGrowth).length;
  if (farmRipe > 0) autopilotResults.push(`${farmRipe}块田成熟了`);

  if (autopilotResults.length > 0) {
    greeting += `\n昨晚我${autopilotResults.join('，还')}哦~`;
  }

  _checkAnniversary();

  setTimeout(() => _appendLocalChatMsg('lobster', `🌅 ${greeting}`, 'morning'), MORNING_GREETING_DELAY);
  WorldState.modifyBond(2);
}

function _checkGoodnightChat(userText) {
  const hour = new Date().getHours();
  const lateNight = hour >= 22 || hour < 5;
  if (!lateNight) return null;

  const goodnightWords = ['晚安', '睡了', '困了', '去睡', '要睡', 'goodnight', 'gn', '拜拜'];
  const isGoodnight = goodnightWords.some(w => userText.toLowerCase().includes(w));

  if (isGoodnight) {
    const l = WorldState.getLobster();
    const responses = [
      `晚安主人~${l.name}也要睡了，明天见！做个好梦哦`,
      `嗯嗯晚安！今天谢谢主人陪我，我会在梦里想你的`,
      `主人晚安！我会守着农田等你明天回来的~`,
    ];
    WorldState.modifyBond(3);
    return responses[Math.floor(Math.random() * responses.length)];
  }

  if (hour >= 23 || hour < 4) {
    const sleepyHints = [
      '（打了个哈欠）主人好晚了...要不要早点休息呀？',
      '主人...这么晚了还不睡吗？我有点担心你...',
    ];
    if (Math.random() < 0.3) return sleepyHints[Math.floor(Math.random() * sleepyHints.length)];
  }

  return null;
}

function _checkAnniversary() {
  const adoptedAt = WorldState.getAdoptedAt();
  if (!adoptedAt) return;

  const adopted = new Date(adoptedAt);
  const now = new Date();
  const diffDays = Math.floor((now - adopted) / (1000 * 60 * 60 * 24));
  const l = WorldState.getLobster();

  if (diffDays === 7) {
    WorldState.addMilestone('anniversary_7d', `和主人在一起一周了！这是最棒的一周`);
    setTimeout(() => _appendLocalChatMsg('lobster', `🎂 主人！今天是我们在一起的第7天！一周年纪念日快乐~`, 'anniversary'), 3000);
    WorldState.modifyBond(5);
  } else if (diffDays === 30) {
    WorldState.addMilestone('anniversary_30d', `和主人在一起满月了！感谢一直以来的陪伴`);
    setTimeout(() => _appendLocalChatMsg('lobster', `🎂 主人！我们已经在一起一个月了！谢谢你一直陪着${l.name}`, 'anniversary'), 3000);
    WorldState.modifyBond(10);
  } else if (diffDays > 0 && diffDays % 100 === 0) {
    WorldState.addMilestone(`anniversary_${diffDays}d`, `和主人在一起${diffDays}天了！`);
    setTimeout(() => _appendLocalChatMsg('lobster', `🎂 今天是我们在一起的第${diffDays}天！${l.name}好幸福~`, 'anniversary'), 3000);
    WorldState.modifyBond(10);
  }
}

// --- Gift Exchange ---

const LOBSTER_GIFTS = [
  { id: 'shell_necklace', name: '小龙虾的贝壳项链', icon: '📿', type: 'souvenir', rarity: 'rare' },
  { id: 'sea_glass', name: '海玻璃碎片', icon: '💎', type: 'souvenir', rarity: 'common' },
  { id: 'lucky_star', name: '幸运海星', icon: '⭐', type: 'special', rarity: 'rare', buff: true },
  { id: 'lobster_drawing', name: '龙虾画的画', icon: '🎨', type: 'souvenir', rarity: 'common' },
  { id: 'coral_flower', name: '珊瑚小花', icon: '🌺', type: 'souvenir', rarity: 'common' },
  { id: 'deep_sea_pearl', name: '深海珍珠', icon: '🫧', type: 'souvenir', rarity: 'rare' },
];

function _maybeGiveLobsterGift() {
  const bond = WorldState.getBond().score;
  const chance = bond >= 80 ? GIFT_CHANCE.high : bond >= 60 ? GIFT_CHANCE.mid : GIFT_CHANCE.low;
  if (Math.random() > chance) return;

  const today = new Date().toISOString().slice(0, 10);
  const lastGift = localStorage.getItem('lobster_last_gift_day');
  if (lastGift === today) return;
  localStorage.setItem('lobster_last_gift_day', today);

  const pool = bond >= 70 ? LOBSTER_GIFTS : LOBSTER_GIFTS.filter(g => g.rarity === 'common');
  const gift = pool[Math.floor(Math.random() * pool.length)];
  const l = WorldState.getLobster();

  WorldState.addItem(gift.id, 1);
  WorldState.modifyBond(3);

  const messages = [
    `${gift.icon} ${l.name}偷偷塞给你一个${gift.name}："这是我找到的，送给主人！"`,
    `${gift.icon} ${l.name}递过来一个${gift.name}："嘿嘿，给你的礼物~"`,
    `${gift.icon} 你发现背包里多了一个${gift.name}，上面贴着纸条："from ${l.name}"`,
  ];
  const msg = messages[Math.floor(Math.random() * messages.length)];
  _appendLocalChatMsg('lobster', `🎁 ${msg}`, 'gift');
  UIRenderer.showNotification(`🎁 ${l.name}送了你${gift.name}！`, 4000);

  WorldState.addMilestone('first_gift_received', `收到了${l.name}的第一份礼物：${gift.name}`);
}

function _updateBondVisuals() {
  const bond = WorldState.getBond().score;
  const heart = document.getElementById('bond-heart');
  const lobsterEl = document.getElementById('sea-lobster');

  if (heart) {
    if (bond >= 80) { heart.textContent = '❤️'; heart.classList.add('bond-high'); }
    else if (bond >= 60) { heart.textContent = '🧡'; heart.classList.remove('bond-high'); }
    else if (bond >= 40) { heart.textContent = '💛'; heart.classList.remove('bond-high'); }
    else if (bond >= 20) { heart.textContent = '💙'; heart.classList.remove('bond-high'); }
    else { heart.textContent = '🤍'; heart.classList.remove('bond-high'); }
    heart.title = `羁绊 ${bond}`;
  }

  if (lobsterEl) {
    lobsterEl.classList.toggle('bond-happy', bond >= 70);
    lobsterEl.classList.toggle('bond-sad', bond < 30);
  }
}

// --- Collaborative Quests ---

const COOP_QUEST_TEMPLATES = [
  { type: 'harvest', text: '一起收获{target}份作物', target: 5, icon: '🌾', trackAction: 'farm' },
  { type: 'harvest', text: '一起收获{target}份作物', target: 8, icon: '🌾', trackAction: 'farm' },
  { type: 'cook', text: '一起做{target}道料理', target: 3, icon: '🍳', trackAction: 'cook' },
  { type: 'explore', text: '一起探索{target}次', target: 4, icon: '🔍', trackAction: 'explore' },
  { type: 'chat', text: '和龙虾聊{target}次天', target: 5, icon: '💬', trackAction: 'chat' },
  { type: 'battle', text: '一起赢得{target}场战斗', target: 2, icon: '⚔️', trackAction: 'battle' },
  { type: 'social', text: '一起社交{target}次', target: 3, icon: '🤝', trackAction: 'socialize' },
];

const COOP_REWARDS = [
  { shells: 20, bond: 5, text: '20贝壳 + 羁绊+5' },
  { shells: 30, bond: 8, text: '30贝壳 + 羁绊+8' },
  { shells: 15, bond: 10, text: '15贝壳 + 羁绊+10' },
];

function _maybeGenerateCoopQuest() {
  const existing = WorldState.getCoopQuest();
  if (existing) {
    const questDay = existing.day;
    const currentDay = WorldState.getWorld().dayCount;
    if (questDay === currentDay) return;
    if (!existing.completed) {
      WorldState.setCoopQuest(null);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const lastGen = localStorage.getItem('coop_quest_gen_day');
  if (lastGen === today) return;
  localStorage.setItem('coop_quest_gen_day', today);

  const template = COOP_QUEST_TEMPLATES[Math.floor(Math.random() * COOP_QUEST_TEMPLATES.length)];
  const reward = COOP_REWARDS[Math.floor(Math.random() * COOP_REWARDS.length)];

  const quest = {
    type: template.type,
    text: template.text.replace('{target}', template.target),
    icon: template.icon,
    target: template.target,
    trackAction: template.trackAction,
    playerProgress: 0,
    lobsterProgress: 0,
    completed: false,
    reward,
    day: WorldState.getWorld().dayCount,
    date: today,
  };

  WorldState.setCoopQuest(quest);
  const l = WorldState.getLobster();
  setTimeout(() => {
    _appendLocalChatMsg('lobster', `📋 ${l.name}提议了今日协作任务：${template.icon} ${quest.text}！一起完成可以获得${reward.text}`, 'quest');
  }, 4000);
}

function _trackCoopProgress(action, source = 'player') {
  const quest = WorldState.getCoopQuest();
  if (!quest || quest.completed) return;
  if (quest.trackAction !== action) return;

  const completed = WorldState.progressCoopQuest(source);
  const updated = WorldState.getCoopQuest();
  const total = (updated.playerProgress || 0) + (updated.lobsterProgress || 0);

  if (completed) {
    WorldState.addShells(updated.reward.shells);
    WorldState.modifyBond(updated.reward.bond);
    const l = WorldState.getLobster();
    _appendLocalChatMsg('lobster', `🎉 协作任务完成！${l.name}和主人一起做到了！获得${updated.reward.text}`, 'quest');
    UIRenderer.showNotification(`🎉 协作任务完成！+${updated.reward.shells}贝壳`, 4000);
    WorldState.addMilestone('first_coop_quest', `和主人完成了第一个协作任务`);
    SaveSystem.save(WorldState.getRawState());
  } else {
    _renderCoopQuestProgress();
  }
}

function _renderCoopQuestProgress() {
  const el = document.getElementById('coop-quest-display');
  if (!el) return;
  const quest = WorldState.getCoopQuest();
  if (!quest || quest.completed) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  const total = (quest.playerProgress || 0) + (quest.lobsterProgress || 0);
  const pct = Math.min(100, Math.round((total / quest.target) * 100));
  el.innerHTML = `
    <div class="coop-quest-header">${quest.icon} 今日协作</div>
    <div class="coop-quest-text">${quest.text}</div>
    <div class="coop-quest-bar-wrap"><div class="coop-quest-bar-fill" style="width:${pct}%"></div></div>
    <div class="coop-quest-progress">${total}/${quest.target} · 奖励: ${quest.reward.text}</div>
  `;
}

function renderMemoryTimeline() {
  const container = document.getElementById('milestone-timeline');
  const bondFill = document.getElementById('bond-bar-fill');
  const bondValue = document.getElementById('bond-value');
  if (!container) return;

  const milestones = WorldState.getMilestones();
  const bond = WorldState.getBond();

  if (bondFill) bondFill.style.width = `${bond.score}%`;
  if (bondValue) bondValue.textContent = bond.score;

  if (milestones.length === 0) {
    container.innerHTML = '<p class="milestone-empty">还没有回忆...一起创造吧！</p>';
    return;
  }

  const ICONS = {
    first_meeting: '🌟', level_10: '📈', level_20: '📈', level_30: '👑',
    first_boss_win: '⚔️', first_travel: '🧳', first_cook: '🍳',
    streak_7: '💕', streak_30: '💖',
  };

  container.innerHTML = milestones.map(m => {
    const icon = ICONS[m.type] || (m.type.startsWith('dungeon_tier') ? '🏰' : '📌');
    return `<div class="milestone-card">
      <span class="milestone-icon">${icon}</span>
      <div class="milestone-body">
        <div class="milestone-text">${m.text}</div>
        <div class="milestone-date">第${m.day}天 · ${m.date}</div>
      </div>
    </div>`;
  }).join('');
}

function _resolveCombatEvent(combatCheck, ws) {
  const rawState = ws.getRawState();
  const power = _calcCombatPower(rawState);
  const winChance = _calcWinChance(power, combatCheck.difficulty);
  const won = Math.random() < winChance;

  EmpathyTracker.recordBattle(won, combatCheck.name || '随机遭遇');

  const effects = won ? combatCheck.winEffects : combatCheck.loseEffects;
  if (effects) {
    if (effects.exp) ws.addExp(effects.exp);
    if (effects.shells) ws.addShells(effects.shells);
    if (effects.mood) ws.modifyStat('mood', effects.mood);
    if (effects.energy) ws.modifyStat('energy', effects.energy);
    if (effects.items) {
      for (const [id, count] of Object.entries(effects.items)) ws.addItem(id, count);
    }
    if (effects.skills) {
      for (const [skill, delta] of Object.entries(effects.skills)) ws.modifySkill(skill, delta);
    }
  }

  return {
    won,
    power,
    difficulty: combatCheck.difficulty,
    winChance,
    text: won ? combatCheck.winText : combatCheck.loseText,
    effects,
  };
}

function startGame() {
  document.getElementById('create-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');

  EventEngine.setCombatResolver(_resolveCombatEvent);
  EventEngine.setItemsData(itemsData);

  EmpathyTracker.init(SaveSystem.getKey());
  _applySkillBuffsOnce();
  _checkMilestones('game_start');
  const empathySummary = EmpathyTracker.getSummary();
  if (empathySummary?.streak) _checkMilestones('streak', { streak: empathySummary.streak });

  initFarmStrategy();
  const goldenMeta = ensureGoldenMetaState();
  if (goldenMeta.changed) SaveSystem.save(WorldState.getRawState());
  UIRenderer.setFarmStrategy(farmStrategy);
  UIRenderer.renderAll(WorldState.getState());
  updateGoldenShardDisplay();
  UIRenderer.updateSpeech(`${WorldState.getLobster().name}醒来了，新的一天开始了！`);
  updateVisitorIndicator();
  updatePreferenceDisplay();
  updateCollectionSummary();
  updateRetireButton();
  _updateFishingButton();
  renderMemoryTimeline();
  _updateBondVisuals();

  WorldState.subscribe((state) => {
    UIRenderer.renderAll(state);
    updateGoldenShardDisplay();
    _updateBondVisuals();
  });

  GameLoop.setOnTick(({ events, decision, diary, leveledUp, travelReturn, postcardGenerated, visitorResult, festivalResult, storyResult }) => {
    if (events.length > 0) {
      const evtText = events.map(e => e.title).join('、');
      UIRenderer.showNotification(`📌 ${evtText}`);
    }
    for (const evt of events) {
      if (evt.combatResult) {
        const cr = evt.combatResult;
        SFX.play(cr.won ? 'combat_win' : 'combat_loss');
        _animScreenShake();
        _animCombatFlash(cr.won);
        const icon = cr.won ? '⚔️🏆' : '⚔️💔';
        const statsLine = `战力 ${cr.power} vs 难度 ${cr.difficulty} | 胜率 ${Math.round(cr.winChance * 100)}%`;
        let msg = `${icon} ${evt.title}\n${evt.description}\n\n${cr.text}\n${statsLine}`;
        if (cr.lostItem && itemsData[cr.lostItem]) {
          msg += `\n😱 丢失了: ${itemsData[cr.lostItem].name}`;
        }
        _appendLocalChatMsg('system', msg, 'combat');
      }
    }
    UIRenderer.updateSpeech(`🦞 ${decision.dialogue}`);
    UIRenderer.playAction(decision.action);
    Analytics.track('tick', { action: decision.action, events: events.length });
    Analytics.trackGameState(WorldState.getState());

    for (const evt of events) {
      if (evt.combatResult?.won) _spawnEventCreatures('combat_win');
    }

    if (leveledUp) {
      const l = WorldState.getLobster();
      SFX.play('levelUp');
      _animConfetti();
      _spawnEventCreatures('level_up');
      UIRenderer.showNotification(`🎉 升级了！现在是 Lv.${l.level}`, 3500);
      updateRetireButton();
      _sendMilestoneToChat(`🎉 我升到 Lv.${l.level} 了！${l.level === 6 ? '现在可以去旅行了！' : l.level === 16 ? '成年了，感觉自己变强了！' : l.level === 36 ? '成为长老了，这一路走来真不容易...' : '继续加油！'}`);
      _checkMilestones('level_up');
      WorldState.modifyBond(2);
      _updateFishingButton();
      _checkAchievements();
    }

    if (travelReturn) {
      const destName = CONFIG.DESTINATIONS[travelReturn.destination]?.name || '远方';
      _spawnEventCreatures('travel_return');
      UIRenderer.showNotification(`🧳 旅行归来！从${destName}带回了纪念品`, 4000);
      _sendMilestoneToChat(`🧳 从${destName}回来了！带了纪念品，路上的风景真好~`);
      _checkMilestones('travel_return', { dest: destName });
    }
    if (postcardGenerated) {
      UIRenderer.showNotification(`📮 收到一张明信片：${postcardGenerated.greeting}`, 3500);
    }
    if (visitorResult?.type === 'arrive') {
      UIRenderer.showNotification(`${visitorResult.visitor.icon} ${visitorResult.visitor.name}来访了！`, 3500);
      _sendMilestoneToChat(`${visitorResult.visitor.icon} ${visitorResult.visitor.name}来做客了！`);
    }
    if (festivalResult) {
      UIRenderer.showNotification(`🎉 ${festivalResult.name}！获得${festivalResult.shellBonus}贝壳和特别礼物`, 4000);
      _sendMilestoneToChat(`🎉 ${festivalResult.name}开始了！好热闹~`);
    }

    if (storyResult) {
      if (storyResult.type === 'start') {
        UIRenderer.showNotification(`📖 新故事：${storyResult.arc}`, 4000);
        _sendMilestoneToChat(`📖 ${storyResult.text}`);
      } else if (storyResult.type === 'progress') {
        UIRenderer.showNotification(`📖 ${storyResult.arc} — 第${storyResult.step}章`, 3500);
        _sendMilestoneToChat(`📖 ${storyResult.text}`);
      } else if (storyResult.type === 'complete') {
        UIRenderer.showNotification(`🏆 故事完成：${storyResult.arc}！`, 5000);
        _sendMilestoneToChat(`🏆 完成了「${storyResult.arc}」！获得了丰厚奖励~`);
        WorldState.addMilestone(`story_${storyResult.arc}`, `完成了故事「${storyResult.arc}」`);
      }
    }

    WorldState.tickBond();
    updateVisitorIndicator();
    updatePreferenceDisplay();
    updateCollectionSummary();
    flashDiaryBadge();
    updateFeedBadge();
    maybeShowInteractiveEvent();
    if (['farm', 'explore', 'cook', 'socialize'].includes(decision.action)) {
      maybeGrantGoldenDrop(`tick_${decision.action}`);
      _trackCoopProgress(decision.action, 'lobster');
    }
    _maybeGiveLobsterGift();
  });

  GameLoop.start();
  bindInteractions();
  bindTabs();
  initChat();
  initRename();
  initKeyBindBar();
  initDungeon();
  initAutoPilot();

  const catchUpReport = GameLoop.lastCatchUpReport;
  if (catchUpReport && catchUpReport.missedTicks > 0) {
    setTimeout(() => _showWelcomeBack(catchUpReport), 400);
  }

  const checkinData = WorldState.getCheckin();
  const todayStr = new Date().toISOString().slice(0, 10);
  if (checkinData.lastDay !== todayStr) {
    setTimeout(showCheckinModal, catchUpReport ? 1200 : 600);
  }

  setTimeout(showWelcomeGuide, 800);
  setTimeout(_showMorningGreeting, 2000);
  setTimeout(_maybeGenerateCoopQuest, 5000);
  _renderCoopQuestProgress();
}

function bindTabs() {
  const tabs = document.querySelectorAll('.main-tab');
  const sections = ['diary-section', 'memory-section', 'farm-section', 'inventory-section'];

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.target;
      sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', id !== target);
      });
      if (target === 'memory-section') renderMemoryTimeline();
    });
  });

  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== 'diary-section');
  });
}

// --- Player Interaction System ---

function _trackAction(analyticsName, fn) {
  SFX.ensureCtx();
  Analytics.trackInteraction(analyticsName);
  EmpathyTracker.recordAction();
  fn();
}

function bindInteractions() {
  document.getElementById('btn-fast-tick').addEventListener('click', () => _trackAction('fast_tick', () => GameLoop.tick()));
  document.getElementById('btn-suggest').addEventListener('click', () => _trackAction('open_suggest', openSuggestModal));
  document.getElementById('btn-feed').addEventListener('click', () => _trackAction('open_feed', openFeedModal));
  document.getElementById('btn-plant').addEventListener('click', () => _trackAction('open_plant', openPlantModal));
  document.getElementById('btn-golden-workshop').addEventListener('click', () => _trackAction('open_golden_workshop', openGoldenModal));
  document.getElementById('btn-pet').addEventListener('click', () => _trackAction('pet', petLobster));
  document.getElementById('btn-shop').addEventListener('click', () => _trackAction('open_shop', openShopModal));
  document.getElementById('btn-fishing').addEventListener('click', () => _trackAction('open_fishing', openFishingModal));
  document.getElementById('btn-fish-cast').addEventListener('click', () => fishCast());
  document.getElementById('btn-fish-close').addEventListener('click', () => {
    if (_fishingState.animId) cancelAnimationFrame(_fishingState.animId);
    if (_fishingState.oscillateId) cancelAnimationFrame(_fishingState.oscillateId);
    _fishingState.phase = 'idle';
    closeModal('fishing-modal');
  });
  document.getElementById('btn-reset').addEventListener('click', resetGame);
  document.getElementById('btn-collection').addEventListener('click', () => { Analytics.trackInteraction('open_collection'); openCollectionModal(); });
  document.getElementById('btn-share').addEventListener('click', () => { Analytics.trackInteraction('share_card'); generateShareCard(); });
  document.getElementById('btn-visitor-interact').addEventListener('click', () => { Analytics.trackInteraction('visitor_interact'); openVisitorModal(); });
  document.getElementById('btn-retire').addEventListener('click', () => openRetireModal());
  document.getElementById('btn-retire-confirm').addEventListener('click', () => executeRetire());
  document.getElementById('btn-retire-cancel').addEventListener('click', () => closeModal('retire-modal'));
  window.addEventListener('lobster:pet-request', onPetGesture);
  window.addEventListener('farm:panel-action', onFarmPanelAction);
  window.addEventListener('farm:strategy-change', onFarmStrategyChange);
  window.addEventListener('house:interact', onHouseInteract);
  window.addEventListener('sea:golden-click', () => { Analytics.trackInteraction('sea_golden'); openGoldenModal(); });
  window.addEventListener('mud:trigger', () => { Analytics.trackInteraction('mud_trigger'); triggerMudScene(); });
  window.addEventListener('sea:creature-interact', _onSeaCreatureInteract);
  window.addEventListener('inv:sell', (e) => {
    const id = e.detail?.id;
    if (!id) return;
    const info = itemsData[id];
    const price = info?.sellPrice || 1;
    const inv = WorldState.getInventory();
    if ((inv[id] || 0) <= 0) return;
    WorldState.addItem(id, -1);
    WorldState.addShells(price);
    UIRenderer.showNotification(`卖出了${info?.name || id}，获得${price}贝壳`);
    SaveSystem.save(WorldState.getRawState());
    UIRenderer.renderAll(WorldState.getState());
  });
  window.addEventListener('inv:discard', (e) => {
    const id = e.detail?.id;
    if (!id) return;
    const info = itemsData[id];
    const inv = WorldState.getInventory();
    if ((inv[id] || 0) <= 0) return;
    WorldState.addItem(id, -1);
    UIRenderer.showNotification(`丢弃了${info?.name || id}`);
    SaveSystem.save(WorldState.getRawState());
    UIRenderer.renderAll(WorldState.getState());
  });
  window.addEventListener('lobster:speech', (e) => {
    const text = e.detail?.text;
    if (!text) return;
    const cleanText = text.replace(/^🦞\s*/, '');
    _appendLocalChatMsg('lobster', cleanText);
  });

  const muteBtn = document.getElementById('btn-mute');
  if (muteBtn) {
    muteBtn.textContent = SFX.isMuted() ? '🔇' : '🔊';
    muteBtn.addEventListener('click', () => {
      SFX.setMuted(!SFX.isMuted());
      muteBtn.textContent = SFX.isMuted() ? '🔇' : '🔊';
    });
  }

  document.getElementById('btn-suggest-cancel').addEventListener('click', () => closeModal('suggest-modal'));
  document.getElementById('btn-feed-cancel').addEventListener('click', () => closeModal('feed-modal'));
  document.getElementById('btn-plant-cancel').addEventListener('click', () => closeModal('plant-modal'));
  document.getElementById('btn-golden-cancel').addEventListener('click', () => closeModal('golden-modal'));
  document.getElementById('btn-shop-cancel').addEventListener('click', () => closeModal('shop-modal'));
  document.getElementById('btn-visitor-cancel').addEventListener('click', () => closeModal('visitor-modal'));
  document.getElementById('btn-collection-cancel').addEventListener('click', () => closeModal('collection-modal'));

  document.getElementById('btn-checkin').addEventListener('click', doCheckin);
  document.getElementById('btn-checkin-close').addEventListener('click', () => closeModal('checkin-modal'));
  document.getElementById('btn-wb-close').addEventListener('click', () => closeModal('welcome-back-modal'));

  for (const id of ['suggest-modal', 'feed-modal', 'plant-modal', 'golden-modal', 'shop-modal', 'visitor-modal', 'collection-modal', 'retire-modal', 'checkin-modal', 'welcome-back-modal']) {
    document.getElementById(id).addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) closeModal(id);
    });
  }
}

function onPetGesture() {
  Analytics.trackInteraction('pet_gesture');
  petLobster();
}

function onFarmPanelAction(event) {
  const detail = event?.detail || {};
  const action = detail.action;
  const plotIndex = Number.isFinite(detail.plotIndex) ? detail.plotIndex : -1;
  if (!action) return;

  Analytics.trackInteraction('farm_panel_action', { action, plotIndex, strategy: farmStrategy });
  if (action === 'harvest') {
    harvestPlot(plotIndex);
    return;
  }
  if (action === 'water') {
    waterPlot(plotIndex);
    return;
  }
  if (action === 'suggest') {
    suggestPlotAction(plotIndex);
  }
}

function onFarmStrategyChange(event) {
  const next = event?.detail?.strategy;
  if (!FARM_STRATEGIES[next] || next === farmStrategy) return;
  farmStrategy = next;
  UIRenderer.setFarmStrategy(farmStrategy);
  persistFarmStrategy();
  UIRenderer.showNotification(`已切换建议策略：${FARM_STRATEGIES[farmStrategy].label}`);
  UIRenderer.updateSpeech(`🦞 好的，农田策略切换为「${FARM_STRATEGIES[farmStrategy].label}」。`);
  Analytics.track('farm_strategy_change', { strategy: farmStrategy });
}

function onHouseInteract(event) {
  const hotspot = event?.detail?.hotspot;
  if (!hotspot) return;

  Analytics.trackInteraction('house_hotspot', { hotspot });
  const state = WorldState.getState();
  const traveling = Boolean(state.lobster.traveling);

  if (hotspot === 'lobster') {
    if (traveling) {
      UIRenderer.showNotification('龙虾外出中，等它回家再摸摸它吧。');
      UIRenderer.updateSpeech('🦞 我出门啦，回来给你讲路上的故事。');
      return;
    }
    petLobster();
    return;
  }

  if (hotspot === 'garden' || hotspot === 'harvest') {
    document.getElementById('farm-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    UIRenderer.showNotification('已定位到农田，点地块可快速互动。', 2200);
    return;
  }

  if (hotspot === 'fireplace') {
    UIRenderer.showNotification('壁炉噼啪作响，屋里暖暖的。');
    UIRenderer.updateSpeech('🦞 火光真舒服，我想再待一会儿。');
    return;
  }

  if (hotspot === 'bookshelf') {
    openCollectionModal('postcards');
    return;
  }

  if (hotspot === 'trophies') {
    openCollectionModal('stamps');
    return;
  }

  if (hotspot === 'skills') {
    openCollectionModal('rare');
    return;
  }

  if (hotspot === 'table' || hotspot === 'decor') {
    openShopModal();
    return;
  }

  if (hotspot === 'roof') {
    const level = state.lobster.level;
    const stage = level >= 36 ? '长老' : level >= 16 ? '成年' : level >= 6 ? '少年' : '幼体';
    UIRenderer.showNotification(`小屋等级随成长提升：当前 Lv.${level}（${stage}）`, 2600);
  }
}

function initFarmStrategy() {
  const saved = WorldState.getState().settings?.farmStrategy;
  const local = localStorage.getItem(FARM_STRATEGY_STORAGE_KEY);
  const candidate = [saved, local, FARM_STRATEGY_DEFAULT].find((s) => FARM_STRATEGIES[s]) || FARM_STRATEGY_DEFAULT;
  farmStrategy = candidate;
  persistFarmStrategy();
}

function persistFarmStrategy() {
  localStorage.setItem(FARM_STRATEGY_STORAGE_KEY, farmStrategy);
  const raw = WorldState.getRawState();
  raw.settings = raw.settings || {};
  raw.settings.farmStrategy = farmStrategy;
  SaveSystem.save(raw);
}

function ensureGoldenMetaState() {
  const raw = WorldState.getRawState();
  raw.settings = raw.settings || {};
  const prev = raw.settings.goldenDrops || {};
  const next = {
    pity: Number.isFinite(prev.pity) ? prev.pity : 0,
    totalDrops: Number.isFinite(prev.totalDrops) ? prev.totalDrops : 0,
    lastDropTick: Number.isFinite(prev.lastDropTick) ? prev.lastDropTick : 0,
  };
  const changed = !raw.settings.goldenDrops
    || raw.settings.goldenDrops.pity !== next.pity
    || raw.settings.goldenDrops.totalDrops !== next.totalDrops
    || raw.settings.goldenDrops.lastDropTick !== next.lastDropTick;
  raw.settings.goldenDrops = next;
  return { changed, meta: raw.settings.goldenDrops };
}

function goldenItemCount(itemId) {
  return WorldState.getInventory()[itemId] || 0;
}

function hasGoldenItem(itemId) {
  return goldenItemCount(itemId) > 0;
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollGoldenDrop() {
  const totalWeight = GOLDEN_DROP_POOL.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const item of GOLDEN_DROP_POOL) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return GOLDEN_DROP_POOL[0];
}

function maybeGrantGoldenDrop(trigger, bonusChance = 0) {
  const { meta } = ensureGoldenMetaState();
  meta.pity += 1;
  const pityBeforeDrop = meta.pity;

  const charmBonus = hasGoldenItem('golden_charm') ? 0.04 : 0;
  const dropChance = Math.min(0.8, GOLDEN_BASE_DROP_CHANCE + bonusChance + charmBonus);
  const guaranteed = meta.pity >= GOLDEN_PITY_THRESHOLD;
  if (!guaranteed && Math.random() >= dropChance) {
    SaveSystem.save(WorldState.getRawState());
    updateGoldenShardDisplay();
    return null;
  }

  const drop = rollGoldenDrop();
  let itemId = drop.itemId;
  let count = getRandomInt(drop.min, drop.max);

  if (GOLDEN_UNIQUE_ITEMS.has(itemId) && hasGoldenItem(itemId)) {
    itemId = 'golden_shard';
    count += 1;
  }

  WorldState.addItem(itemId, count);
  meta.pity = 0;
  meta.totalDrops += 1;
  meta.lastDropTick = WorldState.getWorld().tickCount;

  const itemName = itemsData[itemId]?.name || itemId;
  const source = GOLDEN_TRIGGER_LABELS[trigger] || trigger;
  const suffix = guaranteed ? '（保底触发）' : '';
  const message = `✨ 金色掉落：${itemName} ×${count}${suffix}`;

  UIRenderer.showNotification(message, 3200);
  WorldState.addEvent({
    id: `gold_drop_${Date.now()}`,
    tick: WorldState.getWorld().tickCount,
    type: 'discovery',
    title: `金色掉落：${itemName}`,
    description: `来源：${source}，获得${itemName} ×${count}${suffix}。`,
  });
  Analytics.track('gold_drop', { trigger, itemId, count, guaranteed, pityBeforeDrop });
  SaveSystem.save(WorldState.getRawState());
  updateGoldenShardDisplay();
  return { itemId, count, guaranteed };
}

function updateGoldenShardDisplay() {
  const shard = goldenItemCount('golden_shard');
  const { meta } = ensureGoldenMetaState();
  const text = `碎片：${shard} · 保底 ${Math.min(meta.pity, GOLDEN_PITY_THRESHOLD)}/${GOLDEN_PITY_THRESHOLD}`;
  const badge = document.getElementById('gold-shard-display');
  if (badge) badge.textContent = text;

  const btn = document.getElementById('btn-golden-workshop');
  if (!btn) return;
  const canCraft = GOLDEN_WORKSHOP_RECIPES.some((recipe) => canRedeemGoldenRecipe(recipe));
  btn.classList.toggle('ready', canCraft);
}

function canRedeemGoldenRecipe(recipe) {
  if (!recipe) return false;
  if (GOLDEN_UNIQUE_ITEMS.has(recipe.itemId) && hasGoldenItem(recipe.itemId)) return false;
  return goldenItemCount('golden_shard') >= recipe.shards && WorldState.getShells() >= recipe.shells;
}

function openGoldenModal() {
  renderGoldenWorkshopOptions();
  document.getElementById('golden-modal').classList.remove('hidden');
}

function renderGoldenWorkshopOptions() {
  const container = document.getElementById('golden-options');
  if (!container) return;
  const shardCount = goldenItemCount('golden_shard');
  const shells = WorldState.getShells();
  container.innerHTML = '';

  for (const recipe of GOLDEN_WORKSHOP_RECIPES) {
    const item = itemsData[recipe.itemId];
    const itemName = item?.name || recipe.itemId;
    const owned = GOLDEN_UNIQUE_ITEMS.has(recipe.itemId) && hasGoldenItem(recipe.itemId);
    const canRedeem = !owned && shardCount >= recipe.shards && shells >= recipe.shells;
    const div = document.createElement('div');
    div.className = `suggest-option ${canRedeem ? '' : 'disabled'}`.trim();
    const stateHint = owned ? '已拥有' : (canRedeem ? '可兑换' : '材料不足');
    div.innerHTML = `
      <span class="opt-icon">${recipe.icon}</span>
      <div>
        <div class="opt-text">${itemName} <span style="color:var(--accent);">${stateHint}</span></div>
        <div class="opt-hint">${recipe.desc}</div>
        <div class="opt-cost">消耗：金色碎片 ×${recipe.shards} + 贝壳 ×${recipe.shells}</div>
      </div>
    `;
    if (canRedeem) {
      div.addEventListener('click', () => redeemGoldenRecipe(recipe));
    }
    container.appendChild(div);
  }
}

function redeemGoldenRecipe(recipe) {
  if (!canRedeemGoldenRecipe(recipe)) {
    UIRenderer.showNotification('兑换材料不足，继续互动获取更多金色碎片。');
    return;
  }

  WorldState.removeItem('golden_shard', recipe.shards);
  WorldState.addShells(-recipe.shells);
  WorldState.addItem(recipe.itemId, 1);

  const itemName = itemsData[recipe.itemId]?.name || recipe.itemId;
  const msg = `成功兑换${itemName}，效果已生效。`;
  UIRenderer.updateSpeech(`🦞 ${msg}`);
  UIRenderer.showNotification(`✨ ${msg}`);
  WorldState.addEvent({
    id: `gold_redeem_${Date.now()}`,
    tick: WorldState.getWorld().tickCount,
    type: 'discovery',
    title: `金色工坊兑换：${itemName}`,
    description: `消耗金色碎片${recipe.shards}个和贝壳${recipe.shells}个，兑换了${itemName}。`,
  });
  Analytics.track('gold_redeem', { itemId: recipe.itemId, shards: recipe.shards, shells: recipe.shells });
  SaveSystem.save(WorldState.getRawState());
  renderGoldenWorkshopOptions();
  updateGoldenShardDisplay();
}

// --- Consumable item usage ---

function useConsumable(itemId) {
  const item = itemsData[itemId];
  if (!item || !item.useEffect) return;
  if ((WorldState.getInventory()[itemId] || 0) <= 0) {
    UIRenderer.showNotification('物品不足。');
    return;
  }

  const fx = item.useEffect;
  WorldState.removeItem(itemId, 1);

  if (fx.type === 'exp') {
    const { actual } = WorldState.addExp(fx.value);
    UIRenderer.showNotification(`📖 使用${item.name}，获得${actual}经验！`);
  } else if (fx.type === 'stat') {
    WorldState.modifyStat(fx.stat, fx.value);
    const label = fx.stat === 'energy' ? '精力' : fx.stat === 'mood' ? '心情' : '饱腹';
    UIRenderer.showNotification(`💊 使用${item.name}，${label}+${fx.value}！`);
  } else if (fx.type === 'skill') {
    WorldState.modifySkill(fx.skill, fx.value);
    UIRenderer.showNotification(`📜 使用${item.name}，${fx.skill}技能+${fx.value}！`);
  } else if (fx.type === 'buff') {
    if (fx.buffType === 'lucky_star') {
      WorldState.addBuff({ type: 'lucky_star', usesLeft: fx.uses || 5 });
      UIRenderer.showNotification(`⭐ 幸运星生效！接下来${fx.uses || 5}次事件胜率+30%`);
    } else if (fx.buffType === 'exp_boost') {
      WorldState.addBuff({ type: 'exp_boost', value: fx.value || 0.5, expiresAt: Date.now() + (fx.durationMs || 86400000) });
      UIRenderer.showNotification(`🚀 成长加速符生效！24小时内经验×1.5`);
    }
  }

  WorldState.clampStats();
  SaveSystem.save(WorldState.getRawState());
  Analytics.track('use_consumable', { itemId });
}

window.useConsumable = useConsumable;

// --- Suggest: tell the lobster what to do (it may refuse) ---

function openSuggestModal() {
  const container = document.getElementById('suggest-options');
  container.innerHTML = '';

  for (const s of SUGGEST_ACTIONS) {
    const div = document.createElement('div');
    div.className = 'suggest-option';
    div.innerHTML = `<span class="opt-icon">${s.icon}</span><div><div class="opt-text">${s.label}</div><div class="opt-hint">${s.hint}</div></div>`;
    div.addEventListener('click', () => {
      closeModal('suggest-modal');
      applySuggestion(s.action);
    });
    container.appendChild(div);
  }

  document.getElementById('suggest-modal').classList.remove('hidden');
}

function applySuggestion(action) {
  const lobster = WorldState.getLobster();
  const acceptChance = getAcceptChance(lobster.personality, action, lobster);
  const accepted = Math.random() < acceptChance;
  const name = WorldState.getLobster().name;

  if (accepted) {
    pendingSuggestion = action;
    const label = SUGGEST_ACTIONS.find(s => s.action === action)?.label || action;
    UIRenderer.updateSpeech(`🦞 好的！我这就${label}！`);
    UIRenderer.showNotification(`${name}接受了你的建议！`);
    Analytics.track('suggest_accepted', { action });
    GameLoop.tick();
    pendingSuggestion = null;
  } else {
    const refusals = [
      `${name}摇了摇头："我现在不太想..."`,
      `${name}假装没听见你说话。`,
      `${name}："嗯...我有自己的计划。"`,
      `${name}看了你一眼，然后继续做自己的事。`,
      `${name}："也许等一下吧~"`,
    ];
    const msg = refusals[Math.floor(Math.random() * refusals.length)];
    UIRenderer.updateSpeech(`🦞 ${msg}`);
    UIRenderer.showNotification('龙虾拒绝了你的建议 😅', 2500);
    Analytics.track('suggest_refused', { action });
  }
}

function getAcceptChance(personality, action, lobster) {
  let base = 0.55;

  const affinities = {
    adventurous: { explore: 0.9, travel: 0.9, rest: 0.3 },
    lazy: { rest: 0.9, explore: 0.2, farm: 0.3 },
    gluttonous: { eat: 0.95, cook: 0.85, farm: 0.4 },
    scholarly: { explore: 0.8, socialize: 0.3 },
    social: { socialize: 0.9, rest: 0.3 },
    mischievous: { explore: 0.8, rest: 0.3 },
  };

  if (affinities[personality]?.[action] !== undefined) {
    base = affinities[personality][action];
  }

  if (action === 'eat' && lobster.hunger > 60) base = Math.max(base, 0.85);
  if (action === 'rest' && lobster.energy < 20) base = Math.max(base, 0.85);

  return Math.min(base, 0.92);
}

// --- Feed: give food directly ---

function openFeedModal() {
  const container = document.getElementById('feed-options');
  container.innerHTML = '';
  const inv = WorldState.getInventory();

  const edibles = EDIBLE_FOODS;

  let hasFood = false;
  for (const [id, info] of Object.entries(edibles)) {
    if ((inv[id] || 0) <= 0) continue;
    hasFood = true;
    const div = document.createElement('div');
    div.className = 'suggest-option';
    div.innerHTML = `<span class="opt-icon">🍽️</span><div><div class="opt-text">${info.name} <span style="color:var(--accent)">×${inv[id]}</span></div><div class="opt-hint">饱腹+${info.hunger} 心情+${info.mood}</div></div>`;
    div.addEventListener('click', () => {
      closeModal('feed-modal');
      feedLobster(id, info);
    });
    container.appendChild(div);
  }

  if (!hasFood) {
    container.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:12px;text-align:center;">没有可以喂的食物了</div>';
  }

  document.getElementById('feed-modal').classList.remove('hidden');
}

const FAVORITE_FOODS = {
  adventurous: ['spicy_kelp_wrap', 'deep_sea_stew', 'coral_cake'],
  lazy: ['ocean_tea', 'seaweed_roll', 'warm_current_soup'],
  gluttonous: ['golden_lobster_feast', 'coral_cake', 'deep_sea_stew'],
  scholarly: ['ocean_tea', 'pearl_pudding', 'kelp_salad'],
  social: ['coral_cake', 'warm_current_soup', 'seaweed_roll'],
  mischievous: ['spicy_kelp_wrap', 'bubble_candy', 'deep_sea_stew'],
};

function feedLobster(itemId, info) {
  SFX.play('feed');
  _animFoodFly('🍽️', document.getElementById('btn-feed'));
  WorldState.removeItem(itemId, 1);
  WorldState.modifyStat('hunger', -info.hunger);
  WorldState.modifyStat('mood', info.mood);
  WorldState.incrementStat('totalFeeds');

  const lobster = WorldState.getLobster();
  const favorites = FAVORITE_FOODS[lobster.personality] || [];
  const isFavorite = favorites.includes(itemId);
  if (isFavorite) {
    WorldState.modifyStat('mood', 5);
    WorldState.modifyBond(3);
  } else {
    WorldState.modifyBond(1);
  }
  WorldState.clampStats();

  const name = lobster.name;
  let reactions;
  if (isFavorite) {
    reactions = [
      `${name}："哇！这是我最喜欢的${info.name}！你记得！"`,
      `${name}眼睛一亮，开心地抱住了${info.name}！`,
      `${name}："主人最懂我了！${info.name}是世界上最好吃的！"`,
    ];
  } else {
    reactions = [
      `${name}开心地吃了${info.name}！`,
      `${name}："谢谢投喂！${info.name}真好吃！"`,
      `${name}接过${info.name}，大口吃了起来。`,
    ];
  }
  const msg = reactions[Math.floor(Math.random() * reactions.length)];
  UIRenderer.updateSpeech(`🦞 ${msg}`);
  UIRenderer.showNotification(isFavorite ? `💕 ${name}最爱的${info.name}！心情大好` : `喂了${name}一份${info.name}`);

  WorldState.addEvent({
    id: `feed_${Date.now()}`,
    tick: WorldState.getWorld().tickCount,
    type: 'diary',
    title: `被投喂了${info.name}`,
    description: msg,
  });
  WorldState.addPreference(itemId);
  Analytics.track('feed', { item: itemId });
  maybeGrantGoldenDrop('feed', 0.02);
  _checkAchievements();
  SaveSystem.save(WorldState.getRawState());
}

// --- Plant: manually plant a seed ---

function openPlantModal() {
  const container = document.getElementById('plant-options');
  container.innerHTML = '';
  const inv = WorldState.getInventory();
  const farm = WorldState.getFarm();
  const emptyPlot = farm.plots.findIndex(p => !p.crop);

  if (emptyPlot < 0) {
    container.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:12px;text-align:center;">没有空地了</div>';
    document.getElementById('plant-modal').classList.remove('hidden');
    return;
  }

  const seeds = Object.entries(inv).filter(([id, count]) => id.endsWith('_seed') && count > 0);
  if (seeds.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:12px;text-align:center;">没有种子了</div>';
    document.getElementById('plant-modal').classList.remove('hidden');
    return;
  }

  for (const [seedId, count] of seeds) {
    const info = itemsData[seedId];
    const name = info?.name || seedId;
    const ticks = info?.growthTicks || 5;
    const div = document.createElement('div');
    div.className = 'suggest-option';
    div.innerHTML = `<span class="opt-icon">🌱</span><div><div class="opt-text">${name} <span style="color:var(--accent)">×${count}</span></div><div class="opt-hint">生长周期 ${ticks} 回合</div></div>`;
    div.addEventListener('click', () => {
      closeModal('plant-modal');
      plantSeed(seedId, emptyPlot);
    });
    container.appendChild(div);
  }

  document.getElementById('plant-modal').classList.remove('hidden');
}

function plantSeed(seedId, plotIndex) {
  const info = itemsData[seedId];
  const cropName = seedId === 'golden_seed' ? 'golden_crop' : seedId.replace('_seed', '');
  const growthTicks = info?.growthTicks || 5;

  WorldState.removeItem(seedId, 1);
  WorldState.setPlot(plotIndex, { crop: cropName, growthStage: 0, maxGrowth: growthTicks, watered: false });

  const seedName = info?.name || seedId;
  UIRenderer.updateSpeech(`🦞 主人种了${seedName}！我会帮忙照看的。`);
  UIRenderer.showNotification(`在空地种下了${seedName}`);

  WorldState.addEvent({
    id: `plant_${Date.now()}`,
    tick: WorldState.getWorld().tickCount,
    type: 'diary',
    title: `主人种了${seedName}`,
    description: `一颗新的${seedName}被种在了农田里。`,
  });
  maybeGrantGoldenDrop('plant', seedId === 'golden_seed' ? 0.12 : 0.02);
  SaveSystem.save(WorldState.getRawState());
}

function harvestPlot(plotIndex = -1) {
  const farm = WorldState.getFarm();
  let target = plotIndex;
  if (!(target >= 0 && target < farm.plots.length && farm.plots[target].crop && farm.plots[target].growthStage >= farm.plots[target].maxGrowth)) {
    target = farm.plots.findIndex((p) => p.crop && p.growthStage >= p.maxGrowth);
  }
  if (target < 0) {
    UIRenderer.showNotification('当前没有可收获的作物。');
    return false;
  }

  const plot = farm.plots[target];
  const cropItem = CROP_TO_ITEM[plot.crop] || plot.crop;
  const cropName = itemsData[cropItem]?.name || plot.crop;
  const isGoldenCrop = plot.crop === 'golden_crop';
  const gainCount = isGoldenCrop ? 2 : 1;
  WorldState.addItem(cropItem, gainCount);
  if (isGoldenCrop) {
    WorldState.addShells(20);
  }
  WorldState.setPlot(target, { crop: null, growthStage: 0, maxGrowth: 0, watered: false });
  WorldState.modifySkill('farming', 1);
  WorldState.modifyStat('mood', isGoldenCrop ? 8 : 3);
  WorldState.incrementHarvest();
  WorldState.incrementStat('totalHarvests');
  if (isGoldenCrop) WorldState.incrementStat('goldenHarvests');
  WorldState.addCropType(plot.crop);
  WorldState.clampStats();

  SFX.play('harvest');
  _animHarvestPop(isGoldenCrop ? '✨' : '🌾');
  const msg = isGoldenCrop
    ? `收获了${cropName} ×${gainCount}，还额外获得20贝壳！`
    : `收获了${cropName}，今天的农田很给力！`;
  UIRenderer.updateSpeech(`🦞 ${msg}`);
  UIRenderer.showNotification(`✅ 已收获：${cropName}`);
  WorldState.addEvent({
    id: `farm_harvest_${Date.now()}`,
    tick: WorldState.getWorld().tickCount,
    type: 'farm',
    title: `主人手动收获了${cropName}`,
    description: msg,
  });
  maybeGrantGoldenDrop('harvest', 0.03);
  _spawnEventCreatures('harvest');
  _trackCoopProgress('farm', 'player');
  Analytics.track('farm_panel_harvest', { plotIndex: target, crop: plot.crop, item: cropItem });
  _checkAchievements();
  SaveSystem.save(WorldState.getRawState());
  return true;
}

function waterPlot(plotIndex = -1) {
  const farm = WorldState.getFarm();
  let target = plotIndex;
  if (!(target >= 0 && target < farm.plots.length && farm.plots[target].crop && farm.plots[target].growthStage < farm.plots[target].maxGrowth && !farm.plots[target].watered)) {
    target = farm.plots.findIndex((p) => p.crop && p.growthStage < p.maxGrowth && !p.watered);
  }
  if (target < 0) {
    UIRenderer.showNotification('当前没有需要浇水的作物。');
    return false;
  }

  const plot = farm.plots[target];
  const hasGoldenCan = hasGoldenItem('golden_watering_can');
  const boostGrowth = hasGoldenCan ? 1 : 0;
  WorldState.setPlot(target, { watered: true });
  if (boostGrowth > 0) {
    WorldState.setPlot(target, {
      growthStage: Math.min(plot.maxGrowth, plot.growthStage + boostGrowth),
    });
  }
  WorldState.modifySkill('farming', 1);
  WorldState.modifyStat('mood', hasGoldenCan ? 2 : 1);
  WorldState.clampStats();

  const cropName = itemsData[CROP_TO_ITEM[plot.crop] || plot.crop]?.name || plot.crop;
  const msg = hasGoldenCan
    ? `${cropName}喝饱了水，还因黄金浇水壶额外生长了1阶段。`
    : `${cropName}喝饱了水，下一回合会继续长大。`;
  UIRenderer.updateSpeech(`🦞 ${msg}`);
  UIRenderer.showNotification(`💧 已浇水：${cropName}`);
  WorldState.addEvent({
    id: `farm_water_${Date.now()}`,
    tick: WorldState.getWorld().tickCount,
    type: 'farm',
    title: `主人给${cropName}浇了水`,
    description: msg,
  });
  maybeGrantGoldenDrop('water', 0.015);
  Analytics.track('farm_panel_water', { plotIndex: target, crop: plot.crop });
  SaveSystem.save(WorldState.getRawState());
  return true;
}

function suggestPlotAction(plotIndex = -1) {
  const farm = WorldState.getFarm();
  const plot = (plotIndex >= 0 && plotIndex < farm.plots.length) ? farm.plots[plotIndex] : null;

  if (farmStrategy === 'growth') {
    if (plot) {
      if (plot.crop && plot.growthStage < plot.maxGrowth && !plot.watered) { waterPlot(plotIndex); return; }
      if (plot.crop && plot.growthStage >= plot.maxGrowth) {
        if (harvestPlot(plotIndex)) plantBestSeedAt(plotIndex, 'growth');
        return;
      }
      if (!plot.crop && plantBestSeedAt(plotIndex, 'growth')) return;
    }

    if (waterPlot(-1)) return;
    const ripeIndex = farm.plots.findIndex((p) => p.crop && p.growthStage >= p.maxGrowth);
    if (ripeIndex >= 0) {
      if (harvestPlot(ripeIndex)) plantBestSeedAt(ripeIndex, 'growth');
      return;
    }
    const emptyGlobal = farm.plots.findIndex((p) => !p.crop);
    if (emptyGlobal >= 0 && plantBestSeedAt(emptyGlobal, 'growth')) return;
    showStrategyIdleHint();
    return;
  }

  if (farmStrategy === 'saver') {
    if (plot) {
      if (plot.crop && plot.growthStage >= plot.maxGrowth) { harvestPlot(plotIndex); return; }
      if (plot.crop && plot.growthStage < plot.maxGrowth && !plot.watered) { waterPlot(plotIndex); return; }
      if (!plot.crop && shouldSaverPlant(farm) && plantBestSeedAt(plotIndex, 'saver')) return;
    }

    if (harvestPlot(-1)) return;
    if (waterPlot(-1)) return;
    const emptyGlobal = farm.plots.findIndex((p) => !p.crop);
    if (emptyGlobal >= 0 && shouldSaverPlant(farm) && plantBestSeedAt(emptyGlobal, 'saver')) return;
    showStrategyIdleHint();
    return;
  }

  if (plot) {
    if (plot.crop && plot.growthStage >= plot.maxGrowth) { harvestPlot(plotIndex); return; }
    if (plot.crop && plot.growthStage < plot.maxGrowth && !plot.watered) { waterPlot(plotIndex); return; }
    if (!plot.crop && plantBestSeedAt(plotIndex, 'balanced')) return;
  }

  if (harvestPlot(-1)) return;
  if (waterPlot(-1)) return;
  const emptyGlobal = farm.plots.findIndex((p) => !p.crop);
  if (emptyGlobal >= 0 && plantBestSeedAt(emptyGlobal, 'balanced')) return;
  showStrategyIdleHint();
}

function shouldSaverPlant(farm) {
  const planted = farm.plots.filter((p) => Boolean(p.crop)).length;
  return planted < 2;
}

function showStrategyIdleHint() {
  const label = FARM_STRATEGIES[farmStrategy]?.label || FARM_STRATEGIES[FARM_STRATEGY_DEFAULT].label;
  UIRenderer.updateSpeech(`🦞 「${label}」策略下，当前农田状态稳定，建议先快进一回合。`);
  UIRenderer.showNotification(`建议：${label}策略认为当前无需额外操作。`);
}

function plantBestSeedAt(plotIndex, mode = 'balanced') {
  const farm = WorldState.getFarm();
  if (!(plotIndex >= 0 && plotIndex < farm.plots.length)) return false;
  if (farm.plots[plotIndex].crop) return false;

  const inv = WorldState.getInventory();
  const seeds = Object.entries(inv).filter(([id, count]) => id.endsWith('_seed') && count > 0);
  if (seeds.length === 0) {
    UIRenderer.showNotification('没有种子了，先去探索或商店补给。');
    return false;
  }

  let candidates = seeds.map(([id, count]) => {
    const info = itemsData[id] || {};
    const sell = info.sellPrice || 0;
    const growth = info.growthTicks || 5;
    const buy = info.buyPrice ?? 50;
    let score = sell * 2 - growth;

    if (mode === 'growth') score = 60 - growth * 8 + sell;
    if (mode === 'saver') score = count * 6 - buy * 3 - growth;

    return { id, count, info, score };
  });

  if (mode === 'saver') {
    const cheap = candidates.filter((c) => (c.info.buyPrice ?? 50) <= 10 || c.count >= 3);
    if (cheap.length > 0) candidates = cheap;
    else {
      UIRenderer.showNotification('省资源策略：先保留高成本种子，暂不补种。');
      return false;
    }
  }

  const bestSeed = candidates.sort((a, b) => b.score - a.score)[0].id;

  plantSeed(bestSeed, plotIndex);
  Analytics.track('farm_panel_plant', { plotIndex, seed: bestSeed, mode: 'suggest', strategy: farmStrategy, seedMode: mode });
  return true;
}

// --- Pet: pat the lobster ---

function petLobster() {
  SFX.play('pet');
  WorldState.modifyStat('mood', 5);
  WorldState.clampStats();
  WorldState.incrementStat('totalPets');

  const avatar = document.getElementById('lobster-avatar');
  avatar.classList.remove('petted');
  void avatar.offsetWidth;
  avatar.classList.add('petted');
  setTimeout(() => avatar.classList.remove('petted'), 600);

  const name = WorldState.getLobster().name;
  const reactions = [
    `${name}舒服地眯起了眼睛~`,
    `${name}开心地挥了挥钳子！`,
    `${name}蹭了蹭你的手。`,
    `${name}："嘿嘿，再摸摸~"`,
    `${name}害羞地缩了一下，然后又凑过来了。`,
    `${name}发出了满足的咕噜声。`,
  ];
  const msg = reactions[Math.floor(Math.random() * reactions.length)];
  UIRenderer.updateSpeech(`🦞 ${msg}`);

  WorldState.addEvent({
    id: `pet_${Date.now()}`,
    tick: WorldState.getWorld().tickCount,
    type: 'diary',
    title: '被主人摸了摸',
    description: msg,
  });
  maybeGrantGoldenDrop('pet', 0.018);
  _checkAchievements();
  SaveSystem.save(WorldState.getRawState());
}

// --- Reset ---

function resetGame() {
  if (!confirm('确定要重新开始吗？当前的龙虾和进度会全部丢失。')) return;
  GameLoop.stop();
  SaveSystem.deleteSave();
  selectedPersonality = null;
  pendingSuggestion = null;
  location.reload();
}

// --- Modal helpers ---

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// --- Guide helpers ---

function showWelcomeGuide() {
  const state = WorldState.getState();
  if (state.world.tickCount <= 1) {
    UIRenderer.showNotification(`👋 欢迎！试试下面的按钮和${state.lobster.name}互动吧`, 4000);
  }
}

function flashDiaryBadge() {
  const badge = document.getElementById('diary-new-badge');
  if (badge) {
    badge.classList.remove('hidden');
    setTimeout(() => badge.classList.add('hidden'), 3000);
  }
}

function updateFeedBadge() {
  const badge = document.getElementById('feed-badge');
  if (!badge) return;
  const lobster = WorldState.getLobster();
  badge.style.display = lobster.hunger > 60 ? '' : 'none';
}

function dismissGuide(btn) {
  btn.classList.add('used');
  const badge = btn.querySelector('.guide-badge');
  if (badge) badge.style.display = 'none';
}

// --- Interactive Random Events (player choices) ---

const INTERACTIVE_EVENTS = [
  {
    id: 'visitor_gift', icon: '🎁', weight: 30,
    text: '一只螃蟹路过，丢下一个神秘包裹。要打开吗？',
    choices: [
      { icon: '📦', label: '打开！', result: (ws) => {
        const gifts = [
          { item: 'coral_rose_seed', name: '珊瑚玫瑰种子', shells: 0 },
          { item: 'lucky_charm', name: '幸运护符', shells: 0 },
          { item: null, name: null, shells: 20 },
        ];
        const g = gifts[Math.floor(Math.random() * gifts.length)];
        if (g.item) { ws.addItem(g.item, 1); return `里面是${g.name}！运气不错！`; }
        ws.addShells(g.shells); return `里面有${g.shells}个贝壳！`;
      }},
      { icon: '🙅', label: '不了，谢谢', result: (ws) => {
        ws.modifyStat('mood', 3); return '螃蟹耸了耸肩，带着包裹离开了。';
      }},
    ],
  },
  {
    id: 'weather_wish', icon: '🌈', weight: 20,
    text: '天空出现了一道彩虹！许个愿吧——',
    choices: [
      { icon: '💰', label: '希望发财', result: (ws) => { ws.addShells(15); return '口袋里凭空多了15个贝壳！愿望成真了？'; }},
      { icon: '❤️', label: '希望开心', result: (ws) => { ws.modifyStat('mood', 20); return '一股暖流涌上心头，心情大好！'; }},
      { icon: '🌱', label: '希望丰收', result: (ws) => {
        const farm = ws.getFarm();
        farm.plots.forEach((p, i) => { if (p.crop && p.growthStage < p.maxGrowth) ws.setPlot(i, { growthStage: p.growthStage + 1 }); });
        return '所有作物都长大了一点！';
      }},
    ],
  },
  {
    id: 'lost_item', icon: '🔮', weight: 25,
    text: '龙虾在地上发现了一个闪闪发光的东西...',
    choices: [
      { icon: '👀', label: '捡起来看看', result: (ws) => {
        const win = Math.random() < 0.45 * ws.getWinMultiplier();
        if (win) { ws.addItem('crystal', 1); ws.addExp(5); return '是一颗水晶！真漂亮！'; }
        ws.modifyStat('mood', -5); return '是一块普通的玻璃...有点失望。';
      }},
      { icon: '🦶', label: '踢走', result: (ws) => {
        ws.modifyStat('mood', 2); return '踢飞了！看它飞得多远，嘿嘿。';
      }},
    ],
  },
  {
    id: 'cook_challenge', icon: '👨‍🍳', weight: 20,
    text: '章鱼厨师突然出现："来一场料理对决吧！"',
    choices: [
      { icon: '🔥', label: '接受挑战！', result: (ws) => {
        const cookSkill = ws.getLobster().skills?.cooking || 0;
        const win = Math.random() < (0.35 + cookSkill * 0.02) * ws.getWinMultiplier();
        if (win) { ws.addShells(25); ws.addExp(6); ws.modifySkill('cooking', 1); ws.consumeLuckyStar(); return '你赢了！章鱼厨师心服口服，送上25贝壳。'; }
        ws.modifyStat('mood', -5); ws.addExp(3); return '输了...章鱼厨师的刀工太厉害了。不过学到了不少！';
      }},
      { icon: '🏃', label: '溜了溜了', result: (ws) => { ws.modifyStat('mood', 2); return '龙虾假装没听见，悄悄溜走了。'; }},
    ],
  },
  {
    id: 'treasure_map', icon: '🗺️', weight: 15,
    text: '一张破旧的藏宝图被海浪冲上了岸！',
    choices: [
      { icon: '🏴‍☠️', label: '按图索骥', result: (ws) => {
        const r = Math.random() / ws.getWinMultiplier();
        if (r < 0.25) { ws.addShells(50); ws.addItem('sand_dollar', 1); ws.consumeLuckyStar(); return '找到了宝藏！50贝壳和一枚沙元！'; }
        if (r < 0.6) { ws.addItem('sea_glass', 2); ws.addExp(4); return '找到了一些海玻璃，虽然不是大宝藏，但也不错。'; }
        ws.modifyStat('energy', -15); return '走了好远，什么也没找到...好累。';
      }},
      { icon: '🖼️', label: '当装饰挂起来', result: (ws) => { ws.modifyStat('mood', 5); return '地图挂在墙上，看起来很有冒险家的感觉！'; }},
    ],
  },
  {
    id: 'bubble_game', icon: '🫧', weight: 25,
    text: '一群小鱼在吹泡泡，邀请龙虾一起玩！',
    choices: [
      { icon: '🫧', label: '一起吹泡泡', result: (ws) => { ws.modifyStat('mood', 12); ws.modifyStat('energy', -5); ws.modifySkill('social', 1); return '吹了好多泡泡！大家都很开心！'; }},
      { icon: '💤', label: '看着它们玩', result: (ws) => { ws.modifyStat('mood', 5); ws.modifyStat('energy', 5); return '安静地看着泡泡飘走，很治愈。'; }},
    ],
  },
  {
    id: 'name_star', icon: '⭐', weight: 15,
    text: '夜空中有一颗特别亮的星星，要给它起个名字吗？',
    choices: [
      { icon: '✨', label: '叫它"虾星"', result: (ws) => { ws.modifyStat('mood', 15); ws.addExp(3); return '"虾星"在夜空中闪烁着，好像在回应你！'; }},
      { icon: '🌙', label: '静静欣赏', result: (ws) => { ws.modifyStat('mood', 8); ws.modifyStat('energy', 10); return '星光洒在水面上，一切都很宁静。'; }},
    ],
  },
  {
    id: 'race', icon: '🏁', weight: 20,
    text: '一只海马跑过来："比赛跑步吧！三、二、一——"',
    choices: [
      { icon: '🏃', label: '全力冲刺！', result: (ws) => {
        const win = ws.getLobster().energy > 40 && Math.random() < 0.55 * ws.getWinMultiplier();
        if (win) { ws.addShells(10); ws.modifyStat('energy', -20); ws.addExp(4); ws.consumeLuckyStar(); return '赢了！海马不敢相信龙虾能跑这么快！'; }
        ws.modifyStat('energy', -15); return '太累了，跑到一半就喘不上气了...';
      }},
      { icon: '🐢', label: '慢慢走过去', result: (ws) => { ws.modifyStat('mood', 5); return '龙虾悠闲地散步到终点。海马已经等了很久了。'; }},
    ],
  },
];

let interactiveEventActive = false;

const EVENT_TROPHY_MAP = {
  visitor_gift: { icon: '📦', name: '神秘包裹' },
  weather_wish: { icon: '🌈', name: '彩虹碎片' },
  lost_item: { icon: '🔮', name: '闪光发现' },
  cook_challenge: { icon: '🏆', name: '料理对决' },
  treasure_map: { icon: '🗺️', name: '藏宝图' },
  bubble_game: { icon: '🫧', name: '泡泡瓶' },
  name_star: { icon: '⭐', name: '虾星贴纸' },
  race: { icon: '🥇', name: '赛跑奖牌' },
};

function applyGoldenCharmBonus() {
  if (!hasGoldenItem('golden_charm')) return '';
  if (Math.random() > 0.45) return '';
  const shellBonus = getRandomInt(4, 10);
  WorldState.addShells(shellBonus);
  WorldState.modifyStat('mood', 3);
  return `黄金护符闪光，额外获得${shellBonus}贝壳并提升3点心情。`;
}

function maybeShowInteractiveEvent() {
  if (interactiveEventActive) return;
  if (Math.random() > 0.35) return;

  const totalWeight = INTERACTIVE_EVENTS.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * totalWeight;
  let picked = INTERACTIVE_EVENTS[0];
  for (const evt of INTERACTIVE_EVENTS) {
    r -= evt.weight;
    if (r <= 0) { picked = evt; break; }
  }

  showInteractiveEvent(picked);
}

function showInteractiveEvent(evt) {
  interactiveEventActive = true;
  const container = document.getElementById('interactive-event');
  const iconEl = document.getElementById('ie-icon');
  const textEl = document.getElementById('ie-text');
  const choicesEl = document.getElementById('ie-choices');

  iconEl.textContent = evt.icon;
  textEl.textContent = evt.text;
  choicesEl.innerHTML = '';

  for (const choice of evt.choices) {
    const btn = document.createElement('button');
    btn.className = 'ie-choice';
    btn.innerHTML = `<span class="choice-icon">${choice.icon}</span><span class="choice-label">${choice.label}</span>`;
    btn.addEventListener('click', () => {
      let resultText = choice.result(WorldState);
      const charmBonusText = applyGoldenCharmBonus();
      if (charmBonusText) resultText += ` ${charmBonusText}`;
      maybeGrantGoldenDrop('interactive', 0.04);
      WorldState.clampStats();
      SaveSystem.save(WorldState.getRawState());

      UIRenderer.updateSpeech(`🦞 ${resultText}`);
      UIRenderer.showNotification(`${evt.icon} ${resultText}`, 3500);
      Analytics.track('interactive_event', { event: evt.id, choice: choice.label });

      WorldState.addEvent({
        id: `ie_${evt.id}_${Date.now()}`,
        tick: WorldState.getWorld().tickCount,
        type: 'event',
        title: evt.text.slice(0, 20) + '...',
        description: resultText,
      });

      const trophyDef = EVENT_TROPHY_MAP[evt.id];
      if (trophyDef) {
        WorldState.addTrophy({ id: evt.id, icon: trophyDef.icon, name: trophyDef.name, tick: WorldState.getWorld().tickCount });
      }

      container.classList.add('hidden');
      interactiveEventActive = false;
    });
    choicesEl.appendChild(btn);
  }

  container.classList.remove('hidden');
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// --- Shop System ---

function _placeDecoration(itemId) {
  const farm = WorldState.getFarm();
  if (farm.decorations.some(d => d.id === itemId)) return;
  farm.decorations.push({ id: itemId, placedAt: Date.now() });
  WorldState.setDecorations(farm.decorations);
}

function openShopModal() {
  const shop = WorldState.getShop();
  const container = document.getElementById('shop-stock');
  if (!container) return;
  container.innerHTML = '';

  if (!shop.dailyStock || shop.dailyStock.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:12px;text-align:center;">今日商品还在准备中...</div>';
    document.getElementById('shop-modal').classList.remove('hidden');
    return;
  }

  for (let i = 0; i < shop.dailyStock.length; i++) {
    const item = shop.dailyStock[i];
    const info = itemsData[item.id] || {};
    const name = info.name || item.id;
    const price = Math.round(item.price * (1 - (shop.discount || 0)));
    const canBuy = !item.sold && WorldState.getShells() >= price;
    const div = document.createElement('div');
    const specialCls = item.isSpecial ? ' shop-special' : '';
    div.className = `suggest-option${specialCls} ${item.sold ? 'disabled' : (!canBuy ? 'disabled' : '')}`.trim();
    const stateText = item.sold ? '已售罄' : (canBuy ? `${price} 贝壳` : '贝壳不足');
    const badge = item.isSpecial ? '<span class="shop-special-badge">今日限定</span>' : '';
    div.innerHTML = `<span class="opt-icon">${item.isSpecial ? '⭐' : '🏷️'}</span><div><div class="opt-text">${badge}${name} <span style="color:var(--accent);">${stateText}</span></div><div class="opt-hint">${info.description || ''}</div></div>`;
    if (canBuy && !item.sold) {
      const idx = i;
      div.addEventListener('click', () => {
        if (WorldState.buyFromShop(idx)) {
          SFX.play('buy');
          div.classList.add('purchase-sparkle');
          if (info.category === 'decoration') {
            _placeDecoration(item.id);
          }
          UIRenderer.showNotification(`购买了${name}`);
          Analytics.track('shop_buy', { item: item.id, price });
          SaveSystem.save(WorldState.getRawState());
          openShopModal();
        }
      });
    }
    container.appendChild(div);
  }

  if (shop.discount > 0) {
    const discountEl = document.createElement('div');
    discountEl.className = 'shop-discount-banner';
    discountEl.textContent = `🎫 印章折扣 -${Math.round(shop.discount * 100)}%`;
    container.insertBefore(discountEl, container.firstChild);
  }

  document.getElementById('shop-modal').classList.remove('hidden');
}

// --- Visitor Interaction ---

function openVisitorModal() {
  const raw = WorldState.getRawState();
  const visitor = raw.world.currentVisitor;
  if (!visitor) return;

  document.getElementById('visitor-modal-title').textContent = `${visitor.icon} ${visitor.name}`;
  document.getElementById('visitor-modal-desc').textContent = visitor.greeting || '有访客来了！';

  const container = document.getElementById('visitor-actions');
  container.innerHTML = '';

  if (visitor.interaction === 'trade') {
    const inv = visitor.inventory || [];
    for (const itemId of inv) {
      const info = itemsData[itemId] || {};
      const price = Math.round((info.buyPrice || 10) * (visitor.discount || 1));
      const div = document.createElement('div');
      div.className = 'suggest-option';
      div.innerHTML = `<span class="opt-icon">🛒</span><div><div class="opt-text">${info.name || itemId}</div><div class="opt-hint">${price} 贝壳（${visitor.discount < 1 ? '打折！' : '原价'}）</div></div>`;
      div.addEventListener('click', () => {
        if (WorldState.getShells() >= price) {
          WorldState.addShells(-price);
          WorldState.addItem(itemId, 1);
          UIRenderer.showNotification(`从${visitor.name}买了${info.name || itemId}`);
          SaveSystem.save(WorldState.getRawState());
        } else {
          UIRenderer.showNotification('贝壳不够...');
        }
      });
      container.appendChild(div);
    }
  } else if (visitor.interaction === 'gift') {
    const gifts = visitor.gifts || [];
    const gift = gifts[Math.floor(Math.random() * gifts.length)];
    const info = itemsData[gift] || {};
    const div = document.createElement('div');
    div.className = 'suggest-option';
    div.innerHTML = `<span class="opt-icon">🎁</span><div><div class="opt-text">接收礼物</div><div class="opt-hint">看看${visitor.name}带了什么</div></div>`;
    div.addEventListener('click', () => {
      WorldState.addItem(gift, 1);
      UIRenderer.showNotification(`${visitor.name}送了你${info.name || gift}！`);
      div.classList.add('disabled');
      SaveSystem.save(WorldState.getRawState());
    });
    container.appendChild(div);
  } else if (visitor.interaction === 'teach') {
    const recipes = visitor.teachableRecipes || [];
    const known = WorldState.getCollections().recipes || [];
    const unknown = recipes.filter(r => !known.includes(r));
    if (unknown.length > 0) {
      const recipe = unknown[Math.floor(Math.random() * unknown.length)];
      const div = document.createElement('div');
      div.className = 'suggest-option';
      div.innerHTML = `<span class="opt-icon">📖</span><div><div class="opt-text">学习新食谱</div><div class="opt-hint">${visitor.name}要教你做菜！</div></div>`;
      div.addEventListener('click', () => {
        const raw = WorldState.getRawState();
        if (!raw.collections.recipes.includes(recipe)) raw.collections.recipes.push(recipe);
        UIRenderer.showNotification(`学会了新食谱！`);
        div.classList.add('disabled');
        SaveSystem.save(raw);
      });
      container.appendChild(div);
    } else {
      container.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:12px;text-align:center;">你已经学会了所有食谱！</div>';
    }
  } else if (visitor.interaction === 'story') {
    const stories = visitor.stories || ['很久很久以前...'];
    const story = stories[Math.floor(Math.random() * stories.length)];
    const div = document.createElement('div');
    div.className = 'suggest-option';
    div.innerHTML = `<span class="opt-icon">📜</span><div><div class="opt-text">听故事</div><div class="opt-hint">"${story.slice(0, 30)}..."</div></div>`;
    div.addEventListener('click', () => {
      WorldState.addExp(visitor.expReward || 50);
      UIRenderer.updateSpeech(`🐢 ${story}`);
      UIRenderer.showNotification(`听了${visitor.name}的故事，获得${visitor.expReward || 50}经验！`);
      div.classList.add('disabled');
      SaveSystem.save(WorldState.getRawState());
    });
    container.appendChild(div);
  } else if (visitor.interaction === 'quest') {
    const quests = visitor.quests || [];
    const activeQuest = WorldState.getWorld().activeQuest;
    if (activeQuest) {
      const inv = WorldState.getInventory();
      const canComplete = Object.entries(activeQuest.require).every(([id, n]) => (inv[id] || 0) >= n);
      const div = document.createElement('div');
      div.className = `suggest-option ${canComplete ? '' : 'disabled'}`;
      div.innerHTML = `<span class="opt-icon">✅</span><div><div class="opt-text">提交任务：${activeQuest.desc}</div><div class="opt-hint">${canComplete ? '材料齐全，可以提交！' : '材料不足...'}</div></div>`;
      if (canComplete) {
        div.addEventListener('click', () => {
          for (const [id, n] of Object.entries(activeQuest.require)) WorldState.removeItem(id, n);
          WorldState.addShells(activeQuest.reward.shells || 0);
          if (activeQuest.reward.item) WorldState.addItem(activeQuest.reward.item, activeQuest.reward.count || 1);
          WorldState.setQuest(null);
          UIRenderer.showNotification(`任务完成！获得${activeQuest.reward.shells}贝壳！`);
          WorldState.addRareItem('mystery_quest_' + Date.now());
          SaveSystem.save(WorldState.getRawState());
          closeModal('visitor-modal');
        });
      }
      container.appendChild(div);
    } else {
      const quest = quests[Math.floor(Math.random() * quests.length)];
      const div = document.createElement('div');
      div.className = 'suggest-option';
      div.innerHTML = `<span class="opt-icon">❓</span><div><div class="opt-text">接受任务</div><div class="opt-hint">${quest.desc}</div></div>`;
      div.addEventListener('click', () => {
        WorldState.setQuest(quest);
        UIRenderer.showNotification(`接受了神秘任务：${quest.desc}`);
        div.classList.add('disabled');
        SaveSystem.save(WorldState.getRawState());
      });
      container.appendChild(div);
    }
  }

  document.getElementById('visitor-modal').classList.remove('hidden');
}

// --- Collection System ---

function openCollectionModal(initialTab = 'postcards') {
  const tabs = document.querySelectorAll('.coll-tab');
  const validTabs = new Set(['postcards', 'recipes', 'stamps', 'rare', 'sealife', 'achievements']);
  const tabToOpen = validTabs.has(initialTab) ? initialTab : 'postcards';

  tabs.forEach((btn) => {
    if (btn.dataset.boundClick === '1') return;
    btn.dataset.boundClick = '1';
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.collTab || 'postcards';
      tabs.forEach((item) => item.classList.toggle('active', item === btn));
      renderCollectionTab(targetTab);
    });
  });

  tabs.forEach((btn) => {
    btn.classList.toggle('active', (btn.dataset.collTab || 'postcards') === tabToOpen);
  });
  renderCollectionTab(tabToOpen);
  document.getElementById('collection-modal').classList.remove('hidden');
}

function renderCollectionTab(tab) {
  const container = document.getElementById('collection-content');
  if (!container) return;
  const collections = WorldState.getCollections();

  if (tab === 'postcards') {
    const postcards = collections.postcards || [];
    if (postcards.length === 0) {
      container.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:20px;text-align:center;">还没有明信片。让龙虾去旅行吧！</div>';
      return;
    }
    container.innerHTML = postcards.slice().reverse().map(pc => `
      <div class="postcard-card">
        <div class="postcard-header">
          <span>${pc.destinationIcon || ''} ${pc.destinationName || pc.destination}</span>
          <span>第${pc.day}天 · ${pc.rarity === 'rare' ? '稀有' : pc.rarity === 'uncommon' ? '精良' : '普通'}</span>
        </div>
        <div class="postcard-body"><strong>${pc.greeting}</strong><br>${pc.message}</div>
        ${pc.doodle ? `<div class="postcard-doodle">${pc.doodle}</div>` : ''}
      </div>
    `).join('');
  } else if (tab === 'recipes') {
    const knownRecipes = collections.recipes || [];
    const allRecipes = Object.entries(recipesData);
    if (allRecipes.length === 0) {
      container.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:20px;text-align:center;">食谱数据加载中...</div>';
      return;
    }
    container.innerHTML = '<div class="recipe-grid">' + allRecipes.map(([id, r]) => {
      const known = knownRecipes.includes(id);
      const inv = WorldState.getInventory();
      const canCook = known && r.ingredients && r.ingredients.every(ing => (inv[ing.id] || 0) >= ing.count);
      return `<div class="recipe-slot ${known ? 'collected' : ''} ${canCook ? 'cookable' : ''}">
        <div class="recipe-name">${known ? (r.name || id) : '???'}</div>
        ${known ? `<div class="recipe-ingredients">${r.ingredients.map(ing => `${itemsData[ing.id]?.name || ing.id}×${ing.count}`).join(' + ')}</div>
        <div class="recipe-effect">${r.battleBonus ? `战力+${r.battleBonus}` : ''}${r.moodBonus ? ` 心情+${r.moodBonus}` : ''}${r.hungerRestore ? ` 饱腹-${r.hungerRestore}` : ''}</div>` : '<div class="recipe-ingredients">未解锁</div>'}
      </div>`;
    }).join('') + '</div><div style="margin-top:8px;font-size:11px;color:var(--text-muted);text-align:center;">已解锁：${knownRecipes.length}/${allRecipes.length}</div>';
  } else if (tab === 'stamps') {
    const stamps = collections.visitorStamps || [];
    const allVisitors = [
      { id: 'crab_merchant', name: '螃蟹商人', icon: '🦀', rarity: 'common' },
      { id: 'fish_postman', name: '鱼邮差', icon: '🐟', rarity: 'common' },
      { id: 'octopus_chef', name: '章鱼厨师', icon: '🐙', rarity: 'uncommon' },
      { id: 'turtle_elder', name: '海龟长老', icon: '🐢', rarity: 'rare' },
      { id: 'mystery_shrimp', name: '神秘虾', icon: '🦐', rarity: 'legendary' },
    ];
    container.innerHTML = '<div class="stamp-grid">' + allVisitors.map(v => {
      const has = stamps.includes(v.id);
      return `<div class="stamp-slot ${has ? 'collected' : ''}">
        <span class="stamp-icon">${has ? v.icon : '❓'}</span>
        <span>${has ? v.name : '???'}</span>
      </div>`;
    }).join('') + '</div><div style="margin-top:8px;font-size:11px;color:var(--text-muted);text-align:center;">收集进度：${stamps.length}/5</div>';
  } else if (tab === 'rare') {
    const rares = collections.rareItems || [];
    const allRares = [
      { id: 'golden_crop', icon: '✨', name: '黄金作物标本' },
      { id: 'crystal', icon: '🔮', name: '山湖水晶' },
      { id: 'glowing_algae', icon: '💡', name: '发光藻' },
      { id: 'frost_pearl', icon: '❄️', name: '霜珍珠' },
      { id: 'pearl_dust', icon: '✨', name: '珍珠粉' },
      { id: 'rainbow_anemone_seed', icon: '🌈', name: '彩虹海葵' },
    ];
    const inv = WorldState.getInventory();
    container.innerHTML = '<div class="rare-grid">' + allRares.map(r => {
      const has = (inv[r.id] || 0) > 0 || rares.includes(r.id);
      return `<div class="rare-slot ${has ? 'collected' : ''}">
        <span class="rare-icon">${has ? r.icon : '?'}</span>
        <span>${has ? r.name : '???'}</span>
      </div>`;
    }).join('') + '</div>';
  } else if (tab === 'sealife') {
    const seaLife = WorldState.getSeaLife();
    const catalog = Object.entries(SEA_CREATURE_CATALOG);
    const discovered = catalog.filter(([id]) => seaLife[id]);
    const rarityColors = { common: 'var(--text-dim)', uncommon: 'var(--accent)', rare: 'var(--accent-warm)' };

    container.innerHTML = '<div class="sealife-grid">' + catalog.map(([id, info]) => {
      const data = seaLife[id];
      if (data) {
        const dateStr = new Date(data.firstSeen).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
        return `<div class="sealife-card discovered">
          <div class="sealife-emoji">${info.emoji}</div>
          <div class="sealife-name" style="color:${rarityColors[info.rarity] || 'var(--text)'}">${info.name}</div>
          <div class="sealife-desc">${info.desc}</div>
          <div class="sealife-meta">遇见 ${data.count} 次 · ${dateStr}</div>
        </div>`;
      } else {
        return `<div class="sealife-card undiscovered">
          <div class="sealife-emoji">❓</div>
          <div class="sealife-name">???</div>
          <div class="sealife-desc">尚未发现</div>
        </div>`;
      }
    }).join('') + '</div>'
      + `<div class="sealife-progress"><div class="sealife-progress-bar" style="width:${Math.round(discovered.length / catalog.length * 100)}%"></div></div>`
      + `<div style="text-align:center;font-size:11px;color:var(--text-muted);margin-top:4px;">已发现 ${discovered.length}/${catalog.length} 种海洋生物</div>`;
  } else if (tab === 'achievements') {
    const achievements = WorldState.getAchievements();
    const catLabels = { nurture: '养育', farm: '农场', explorer: '探索', combat: '战斗', social: '社交', collector: '收藏', dedication: '坚持' };
    const grouped = {};
    for (const def of ACHIEVEMENT_DEFS) {
      if (!grouped[def.cat]) grouped[def.cat] = [];
      grouped[def.cat].push(def);
    }
    let unlockedCount = 0;
    let html = '';
    for (const [cat, defs] of Object.entries(grouped)) {
      html += `<div class="ach-category-label">${catLabels[cat] || cat}</div><div class="ach-grid">`;
      for (const def of defs) {
        const a = achievements[def.id] || { unlocked: false, progress: 0 };
        const progress = Math.max(a.progress, _getAchievementProgress(def));
        if (a.unlocked) unlockedCount++;
        const pct = Math.min(100, Math.round(progress / def.target * 100));
        const dateStr = a.unlockedAt ? new Date(a.unlockedAt).toLocaleDateString('zh-CN') : '';
        html += `<div class="ach-card ${a.unlocked ? 'ach-unlocked' : 'ach-locked'}">
          <div class="ach-icon">${a.unlocked ? def.icon : '🔒'}</div>
          <div class="ach-info">
            <div class="ach-name">${a.unlocked ? def.name : '???'}</div>
            <div class="ach-desc">${def.desc}</div>
            ${a.unlocked ? `<div class="ach-date">${dateStr}</div>` : `<div class="ach-progress-bar"><div class="ach-progress-fill" style="width:${pct}%"></div></div><div class="ach-progress-text">${progress}/${def.target}</div>`}
          </div>
        </div>`;
      }
      html += '</div>';
    }
    container.innerHTML = html + `<div style="text-align:center;font-size:12px;color:var(--text-muted);margin-top:8px;padding-bottom:4px;">🏆 已解锁 ${unlockedCount}/${ACHIEVEMENT_DEFS.length} 个成就</div>`;
  }
}

// --- Welcome Back Report ---

function _showWelcomeBack(report) {
  const hours = Math.floor(report.durationMs / 3600000);
  const mins = Math.floor((report.durationMs % 3600000) / 60000);
  const durEl = document.getElementById('wb-duration');
  if (durEl) {
    durEl.textContent = hours > 0
      ? `你离开了 ${hours} 小时 ${mins} 分钟`
      : `你离开了 ${mins} 分钟`;
  }

  const reportEl = document.getElementById('wb-report');
  if (reportEl) {
    const stats = [];
    if (report.expGained > 0) stats.push({ value: report.expGained, prefix: '+', label: '经验值' });
    if (report.levelsGained > 0) stats.push({ value: report.levelsGained, prefix: '+', label: '升级' });
    if (report.shellsEarned > 0) stats.push({ value: report.shellsEarned, prefix: '+', label: '贝壳' });
    if (report.eventCount > 0) stats.push({ value: report.eventCount, prefix: '', label: '事件' });
    if (stats.length === 0) stats.push({ value: report.missedTicks, prefix: '', label: '时间流逝' });

    reportEl.innerHTML = stats.map((s, i) =>
      `<div class="wb-stat wb-stat-enter" style="animation-delay:${i * 150}ms"><div class="wb-stat-value" data-target="${s.value}" data-prefix="${s.prefix || ''}">${s.prefix || ''}0</div><div class="wb-stat-label">${s.label}</div></div>`
    ).join('');

    setTimeout(() => {
      reportEl.querySelectorAll('.wb-stat-value[data-target]').forEach(el => {
        const target = parseInt(el.dataset.target, 10);
        const prefix = el.dataset.prefix || '';
        const duration = 1200;
        const start = performance.now();
        const animate = (now) => {
          const t = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          el.textContent = prefix + Math.round(target * eased);
          if (t < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      });
    }, 200);
  }

  const typeLabels = { weather: '天气', visitor: '访客', discovery: '发现', farm: '农场', combat: '战斗', festival: '节日' };
  const typeColors = { weather: '#4fd8ff', visitor: '#ff9d73', discovery: '#a8e6cf', farm: '#98d635', combat: '#ff6b6b', festival: '#ffd93d' };
  const events = report.eventsByType || {};
  const totalEvents = Object.values(events).reduce((a, b) => a + b, 0);
  const chartEl = document.getElementById('wb-event-chart');
  if (chartEl && totalEvents > 0) {
    chartEl.innerHTML = '';
    for (const [type, count] of Object.entries(events)) {
      if (count <= 0 || !typeLabels[type]) continue;
      const pct = (count / totalEvents * 100).toFixed(1);
      const seg = document.createElement('div');
      seg.className = 'wb-chart-seg';
      seg.style.width = `${pct}%`;
      seg.style.background = typeColors[type] || '#888';
      seg.title = `${typeLabels[type]}: ${count}`;
      chartEl.appendChild(seg);
    }
    const legend = document.createElement('div');
    legend.className = 'wb-chart-legend';
    legend.innerHTML = Object.entries(events)
      .filter(([t, c]) => c > 0 && typeLabels[t])
      .map(([t, c]) => `<span><span class="wb-legend-dot" style="background:${typeColors[t]}"></span>${typeLabels[t]} ${c}</span>`)
      .join('');
    chartEl.parentNode.insertBefore(legend, chartEl.nextSibling);
  }

  const lobsterReaction = document.getElementById('wb-lobster-reaction');
  if (lobsterReaction) {
    const stage = WorldState.getGrowthStage(WorldState.getLobster().level);
    lobsterReaction.textContent = stage ? stage.emoji : '🦞';
    lobsterReaction.classList.add('wb-bounce');
  }

  const quoteEl = document.getElementById('wb-quote');
  if (quoteEl) {
    const name = WorldState.getLobster().name;
    const quotes = hours >= 12
      ? [`"${name}一直在等你回来..."`, `"${name}看到你回来，眼睛一下子亮了！"`, `"${name}：终于回来了！我好想你！"`]
      : hours >= 2
        ? [`"${name}打了个哈欠，伸了个懒腰。"`, `"${name}：你去哪了？我自己玩了好一会儿~"`, `"${name}正在整理农田，看到你很开心。"`]
        : [`"${name}：才走了一会儿就回来啦？"`, `"${name}朝你挥了挥钳子。"`];
    const text = quotes[Math.floor(Math.random() * quotes.length)];
    quoteEl.textContent = '';
    quoteEl.classList.add('wb-typewriter');
    quoteEl.style.setProperty('--tw-chars', text.length);
    quoteEl.textContent = text;
  }

  document.getElementById('welcome-back-modal').classList.remove('hidden');
}

// --- Fishing Mini-Game ---

let _fishingState = { phase: 'idle', markerPos: 0, targetPos: 30, targetSize: 20, animId: null };

function openFishingModal() {
  const fishing = WorldState.getFishing();
  const lobster = WorldState.getLobster();
  if (lobster.level < FISHING_CONFIG.minLevel) {
    UIRenderer.showNotification(`需要${FISHING_CONFIG.minLevel}级才能钓鱼`);
    return;
  }
  const day = WorldState.getWorld().dayCount;
  const remaining = fishing.lastFishDay === day ? FISHING_CONFIG.maxAttemptsPerDay - fishing.attemptsToday : FISHING_CONFIG.maxAttemptsPerDay;
  document.getElementById('fishing-attempts').textContent = `剩余次数: ${remaining}/${FISHING_CONFIG.maxAttemptsPerDay} | 消耗 ${FISHING_CONFIG.energyCost} 精力`;
  document.getElementById('fishing-result').classList.add('hidden');
  document.getElementById('btn-fish-cast').disabled = remaining <= 0 || lobster.energy < FISHING_CONFIG.energyCost;
  document.getElementById('btn-fish-cast').textContent = remaining <= 0 ? '今日已用完' : '抛竿！';

  _fishingState.phase = 'idle';
  _fishingState.targetPos = 20 + Math.random() * 40;
  _fishingState.targetSize = 18 + Math.random() * 8;
  const targetEl = document.getElementById('fishing-target');
  targetEl.style.bottom = `${_fishingState.targetPos}%`;
  targetEl.style.height = `${_fishingState.targetSize}%`;
  document.getElementById('fishing-marker').style.bottom = '0%';

  _startFishTargetOscillation();
  document.getElementById('fishing-modal').classList.remove('hidden');
}

function _startFishTargetOscillation() {
  const targetEl = document.getElementById('fishing-target');
  let t = 0;
  const basePos = _fishingState.targetPos;
  const oscillate = () => {
    if (_fishingState.phase !== 'idle' && _fishingState.phase !== 'dropping') return;
    t += 0.02;
    const offset = Math.sin(t * 1.5) * 8;
    const pos = Math.max(5, Math.min(75, basePos + offset));
    targetEl.style.bottom = `${pos}%`;
    _fishingState.currentTargetPos = pos;
    _fishingState.oscillateId = requestAnimationFrame(oscillate);
  };
  _fishingState.oscillateId = requestAnimationFrame(oscillate);
}

function fishCast() {
  if (_fishingState.phase === 'dropping') {
    _fishCatch();
    return;
  }
  if (_fishingState.phase !== 'idle') return;

  const lobster = WorldState.getLobster();
  if (lobster.energy < FISHING_CONFIG.energyCost) {
    UIRenderer.showNotification('精力不足！');
    return;
  }
  if (!WorldState.canFish()) {
    UIRenderer.showNotification('今天的钓鱼次数用完了');
    return;
  }

  _fishingState.phase = 'dropping';
  _fishingState.markerPos = 0;
  document.getElementById('btn-fish-cast').textContent = '收竿！';
  document.getElementById('fishing-result').classList.add('hidden');

  const markerEl = document.getElementById('fishing-marker');
  const fishEl = document.getElementById('fishing-fish');
  const speed = 0.4 + Math.random() * 0.3;

  const drop = () => {
    if (_fishingState.phase !== 'dropping') return;
    _fishingState.markerPos += speed;
    if (_fishingState.markerPos >= 100) {
      _fishingState.markerPos = 100;
      _fishCatch();
      return;
    }
    markerEl.style.bottom = `${_fishingState.markerPos}%`;
    fishEl.style.bottom = `${Math.max(0, _fishingState.currentTargetPos || _fishingState.targetPos)}%`;
    _fishingState.animId = requestAnimationFrame(drop);
  };
  _fishingState.animId = requestAnimationFrame(drop);
}

function _fishCatch() {
  _fishingState.phase = 'result';
  if (_fishingState.animId) cancelAnimationFrame(_fishingState.animId);
  if (_fishingState.oscillateId) cancelAnimationFrame(_fishingState.oscillateId);

  const markerCenter = _fishingState.markerPos;
  const targetCenter = (_fishingState.currentTargetPos || _fishingState.targetPos) + _fishingState.targetSize / 2;
  const dist = Math.abs(markerCenter - targetCenter);
  const halfTarget = _fishingState.targetSize / 2;

  let quality;
  if (dist <= halfTarget * 0.3) quality = 'perfect';
  else if (dist <= halfTarget) quality = 'good';
  else if (dist <= halfTarget * 1.8) quality = 'ok';
  else quality = 'miss';

  WorldState.modifyStat('energy', -FISHING_CONFIG.energyCost);
  WorldState.recordFishCatch(quality);

  const reward = FISHING_REWARDS[quality];
  if (reward.shells > 0) WorldState.addShells(reward.shells);
  if (reward.exp > 0) WorldState.addExp(reward.exp);
  let itemName = '';
  if (reward.items.length > 0) {
    const item = reward.items[Math.floor(Math.random() * reward.items.length)];
    WorldState.addItem(item, 1);
    const info = itemsData[item] || {};
    itemName = info.name || item;
  }

  if (quality !== 'miss') {
    WorldState.modifySkill('exploring', 1);
    const creatureTypes = ['big-fish', 'jellyfish', 'seahorse', 'pufferfish', 'clownfish', 'starfish'];
    const discovered = creatureTypes[Math.floor(Math.random() * creatureTypes.length)];
    WorldState.recordSeaCreature(discovered);
  }

  SFX.play(quality === 'miss' ? 'combat_loss' : 'harvest');

  const resultEl = document.getElementById('fishing-result');
  const icons = { perfect: '🌟', good: '✨', ok: '🐟', miss: '💨' };
  document.getElementById('fishing-result-icon').textContent = icons[quality];
  let resultText = reward.label;
  if (reward.shells > 0) resultText += ` +${reward.shells}贝壳`;
  if (itemName) resultText += ` 获得${itemName}`;
  document.getElementById('fishing-result-text').textContent = resultText;
  resultEl.classList.remove('hidden');

  const fishing = WorldState.getFishing();
  const day = WorldState.getWorld().dayCount;
  const remaining = fishing.lastFishDay === day ? FISHING_CONFIG.maxAttemptsPerDay - fishing.attemptsToday : FISHING_CONFIG.maxAttemptsPerDay;
  document.getElementById('fishing-attempts').textContent = `剩余次数: ${remaining}/${FISHING_CONFIG.maxAttemptsPerDay}`;

  const castBtn = document.getElementById('btn-fish-cast');
  if (remaining <= 0) {
    castBtn.textContent = '今日已用完';
    castBtn.disabled = true;
  } else {
    castBtn.textContent = '再来一次';
    castBtn.disabled = false;
    _fishingState.phase = 'idle';
    _fishingState.targetPos = 20 + Math.random() * 40;
    _fishingState.targetSize = 18 + Math.random() * 8;
    _startFishTargetOscillation();
  }

  SaveSystem.save(WorldState.getRawState());
  _checkAchievements();
}

function _updateFishingButton() {
  const btn = document.getElementById('btn-fishing');
  if (!btn) return;
  const lobster = WorldState.getLobster();
  btn.classList.toggle('hidden', lobster.level < FISHING_CONFIG.minLevel);
}

// --- Achievement System ---

function _getAchievementProgress(def) {
  const s = WorldState.getStats();
  const c = WorldState.getCollections();
  const lobster = WorldState.getLobster();
  const dungeon = WorldState.getDungeon();
  const checkin = WorldState.getCheckin();

  switch (def.stat) {
    case 'totalFeeds': return s.totalFeeds;
    case 'totalPets': return s.totalPets;
    case 'totalHarvests': return s.totalHarvests;
    case 'totalFishCatches': return s.totalFishCatches;
    case 'totalMudScenes': return s.totalMudScenes;
    case 'combatWins': return dungeon.totalWins || 0;
    case 'highestTier': return dungeon.highestTier || 0;
    case 'coopCompleted': return s.coopCompleted;
    case 'goldenHarvests': return s.goldenHarvests;
    case 'cropTypes': return (s.cropTypes || []).length;
    case 'destVisited': return [...new Set((c.postcards || []).map(p => p.destination || ''))].filter(Boolean).length;
    case 'postcardCount': return (c.postcards || []).length;
    case 'stampCount': return (c.visitorStamps || []).length;
    case 'seaLifeCount': return Object.keys(WorldState.getSeaLife()).length;
    case 'recipeCount': return (c.recipes || []).length;
    case 'checkinStreak': return checkin.streak || 0;
    case 'level': return lobster.level;
    default: return 0;
  }
}

function _checkAchievements() {
  for (const def of ACHIEVEMENT_DEFS) {
    const progress = _getAchievementProgress(def);
    const justUnlocked = WorldState.checkAchievement(def.id, progress, def.target);
    if (justUnlocked) {
      SFX.play('levelUp');
      UIRenderer.showNotification(`🏆 成就解锁：${def.name}`);
    }
  }
}

// --- Share Card Generation ---

function generateShareCard() {
  const state = WorldState.getState();
  const lobster = state.lobster;
  const seaLife = WorldState.getSeaLife();
  const discoveredCount = Object.keys(seaLife).length;
  const totalCreatures = Object.keys(SEA_CREATURE_CATALOG).length;
  const dungeon = WorldState.getDungeon();
  const bond = WorldState.getBond();
  const daysAlive = state.world.dayCount;
  const postcardCount = (state.collections.postcards || []).length;

  const W = 540, H = 720;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');

  const grad = c.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#010714');
  grad.addColorStop(0.3, '#041a3a');
  grad.addColorStop(0.6, '#062d5e');
  grad.addColorStop(1, '#0a4a8a');
  c.fillStyle = grad;
  c.fillRect(0, 0, W, H);

  for (let i = 0; i < 40; i++) {
    c.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.5})`;
    c.beginPath();
    c.arc(Math.random() * W, Math.random() * H * 0.4, Math.random() * 1.5, 0, Math.PI * 2);
    c.fill();
  }

  c.fillStyle = '#eaf2ff';
  c.font = 'bold 32px -apple-system, PingFang SC, sans-serif';
  c.textAlign = 'center';
  c.fillText('🦞 龙虾 MUD', W / 2, 50);

  c.font = '64px serif';
  c.fillText(lobster.level >= 36 ? '🎩' : lobster.level >= 6 ? '🦞' : '🦐', W / 2, 130);

  c.fillStyle = '#eaf2ff';
  c.font = 'bold 24px -apple-system, PingFang SC, sans-serif';
  c.fillText(lobster.name, W / 2, 170);

  c.font = '14px -apple-system, PingFang SC, sans-serif';
  c.fillStyle = '#9db4d5';
  const personalityLabel = PERSONALITY_LABELS[lobster.personality] || lobster.personality;
  c.fillText(`Lv.${lobster.level} · ${personalityLabel}`, W / 2, 195);

  const stats = [
    { label: '共度天数', value: `${daysAlive}` },
    { label: '羁绊值', value: `${bond.score}` },
    { label: '深海层数', value: `${dungeon.highestTier || 0}` },
    { label: '明信片', value: `${postcardCount}` },
    { label: '海洋图鉴', value: `${discoveredCount}/${totalCreatures}` },
    { label: '贝壳', value: `${state.shells || 0}` },
  ];

  const cardY = 225;
  const cardW = 150, cardH = 70, gap = 16;
  const cols = 3;
  const startX = (W - cols * cardW - (cols - 1) * gap) / 2;

  stats.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (cardW + gap);
    const y = cardY + row * (cardH + gap);

    c.fillStyle = 'rgba(8, 22, 41, 0.7)';
    c.strokeStyle = 'rgba(79, 216, 255, 0.25)';
    c.lineWidth = 1;
    _roundRect(c, x, y, cardW, cardH, 8);
    c.fill();
    c.stroke();

    c.fillStyle = '#4fd8ff';
    c.font = 'bold 22px -apple-system, PingFang SC, sans-serif';
    c.textAlign = 'center';
    c.fillText(s.value, x + cardW / 2, y + 32);

    c.fillStyle = '#9db4d5';
    c.font = '12px -apple-system, PingFang SC, sans-serif';
    c.fillText(s.label, x + cardW / 2, y + 52);
  });

  const skillY = cardY + 2 * (cardH + gap) + 20;
  c.fillStyle = '#eaf2ff';
  c.font = 'bold 14px -apple-system, PingFang SC, sans-serif';
  c.textAlign = 'center';
  c.fillText('技能', W / 2, skillY);

  const skills = lobster.skills || {};
  const skillNames = { farming: '农耕', cooking: '烹饪', exploring: '探索', social: '社交' };
  const skillEntries = Object.entries(skillNames);
  const barW = 100, barH = 8, barGap = 12;
  const skillStartX = (W - skillEntries.length * (barW + barGap) + barGap) / 2;

  skillEntries.forEach(([key, name], i) => {
    const x = skillStartX + i * (barW + barGap);
    const y = skillY + 12;
    const val = Math.min(skills[key] || 0, 100);

    c.fillStyle = 'rgba(8, 22, 41, 0.6)';
    _roundRect(c, x, y, barW, barH, 4);
    c.fill();

    const barGrad = c.createLinearGradient(x, 0, x + barW, 0);
    barGrad.addColorStop(0, '#4fd8ff');
    barGrad.addColorStop(1, '#ff9d73');
    c.fillStyle = barGrad;
    _roundRect(c, x, y, barW * (val / 100), barH, 4);
    c.fill();

    c.fillStyle = '#9db4d5';
    c.font = '10px -apple-system, PingFang SC, sans-serif';
    c.textAlign = 'center';
    c.fillText(`${name} ${val}`, x + barW / 2, y + barH + 14);
  });

  const seaY = skillY + 55;
  c.fillStyle = '#eaf2ff';
  c.font = 'bold 14px -apple-system, PingFang SC, sans-serif';
  c.textAlign = 'center';
  c.fillText('海洋图鉴', W / 2, seaY);

  const catalogEntries = Object.entries(SEA_CREATURE_CATALOG);
  const emojiSize = 24;
  const emojiGap = 6;
  const emojisPerRow = 7;
  const emojiStartX = (W - emojisPerRow * (emojiSize + emojiGap) + emojiGap) / 2;

  c.font = '20px serif';
  catalogEntries.forEach(([id, info], i) => {
    const col = i % emojisPerRow;
    const row = Math.floor(i / emojisPerRow);
    const x = emojiStartX + col * (emojiSize + emojiGap) + emojiSize / 2;
    const y = seaY + 20 + row * (emojiSize + emojiGap);
    c.textAlign = 'center';
    if (seaLife[id]) {
      c.globalAlpha = 1;
      c.fillText(info.emoji, x, y);
    } else {
      c.globalAlpha = 0.2;
      c.fillText('❓', x, y);
    }
  });
  c.globalAlpha = 1;

  c.fillStyle = '#4a6a8a';
  c.font = '11px -apple-system, PingFang SC, sans-serif';
  c.textAlign = 'center';
  c.fillText('lobster-farm.clawhub.ai', W / 2, H - 20);

  c.fillStyle = '#4a6a8a';
  c.font = '10px -apple-system, PingFang SC, sans-serif';
  c.fillText(`生成于 ${new Date().toLocaleDateString('zh-CN')}`, W / 2, H - 38);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], 'lobster-card.png', { type: 'image/png' });
      navigator.share({ files: [file], title: `${lobster.name}的龙虾名片` }).catch(() => {
        _downloadBlob(url);
      });
    } else {
      _downloadBlob(url);
    }
  }, 'image/png');
}

function _downloadBlob(url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lobster-card.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  UIRenderer.showNotification('📤 分享卡片已保存！');
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// --- Daily Check-in System ---

function showCheckinModal() {
  const checkin = WorldState.getCheckin();
  const today = new Date().toISOString().slice(0, 10);
  const alreadyChecked = checkin.lastDay === today;
  const currentStreak = checkin.streak;
  const cycleDay = currentStreak % 7;

  const streakEl = document.getElementById('checkin-streak');
  if (streakEl) streakEl.textContent = alreadyChecked
    ? `已连续签到 ${currentStreak} 天 ✓`
    : `当前连续 ${currentStreak} 天，签到领取奖励！`;

  const calendar = document.getElementById('checkin-calendar');
  if (calendar) {
    calendar.innerHTML = CHECKIN_REWARDS.map((reward, i) => {
      const dayIndex = i;
      const isChecked = !alreadyChecked ? dayIndex < cycleDay : dayIndex <= cycleDay;
      const isToday = !alreadyChecked && dayIndex === cycleDay;
      const isFuture = !alreadyChecked ? dayIndex > cycleDay : dayIndex > cycleDay;
      const cls = isToday ? 'today' : isChecked ? 'checked' : isFuture ? 'future' : '';
      return `<div class="checkin-day ${cls}">
        <span class="day-num">第${i + 1}天</span>
        <span class="day-reward">${reward.label.split(' ')[0]}</span>
      </div>`;
    }).join('');
  }

  const preview = document.getElementById('checkin-reward-preview');
  if (preview) {
    if (alreadyChecked) {
      preview.textContent = '今天已签到，明天再来哦~';
    } else {
      const reward = CHECKIN_REWARDS[cycleDay];
      preview.innerHTML = `今日奖励：<strong>${reward.label}</strong>`;
    }
  }

  const btn = document.getElementById('btn-checkin');
  if (btn) {
    btn.disabled = alreadyChecked;
    btn.textContent = alreadyChecked ? '已签到 ✓' : '签到领取';
    btn.style.opacity = alreadyChecked ? '0.5' : '1';
  }

  document.getElementById('checkin-modal').classList.remove('hidden');
}

function doCheckin() {
  const result = WorldState.doCheckin();
  if (!result) return;
  const cycleDay = (result.streak - 1) % 7;
  const reward = CHECKIN_REWARDS[cycleDay];
  if (reward.shells) WorldState.addShells(reward.shells);
  if (reward.items) {
    for (const item of reward.items) WorldState.addItem(item.id, item.count);
  }
  SFX.play('harvest');
  UIRenderer.showNotification(`📅 签到成功！${reward.label}`, 3000);
  _checkAchievements();
  SaveSystem.save(WorldState.getRawState());
  showCheckinModal();
}

// --- Retire System ---

function openRetireModal() {
  const state = WorldState.getState();
  const lobster = state.lobster;
  const collections = state.collections;
  const summary = document.getElementById('retire-summary');
  if (!summary) return;

  const topFood = Object.entries(lobster.preferences || {}).sort((a, b) => b[1] - a[1])[0];
  const foodName = topFood ? (itemsData[topFood[0]]?.name || topFood[0]) : '无';

  summary.innerHTML = `
    <div style="text-align:center;margin-bottom:12px;">
      <div style="font-size:36px;">🎓</div>
      <div style="font-size:16px;font-weight:700;color:#ffe0b0;margin:8px 0;">${lobster.name}的一生</div>
    </div>
    <div style="font-size:13px;color:#c4d6ee;line-height:1.8;">
      <div>等级：Lv.${lobster.level} ${lobster.level >= 36 ? '长老' : '成年'}</div>
      <div>生活了 ${state.world.dayCount} 天</div>
      <div>收集明信片 ${(collections.postcards || []).length} 张</div>
      <div>访客印章 ${(collections.visitorStamps || []).length}/5</div>
      <div>最爱的食物：${foodName}</div>
      <div>贝壳：${state.shells}（传承50%：${Math.floor(state.shells * 0.5)}）</div>
    </div>
    <div style="margin-top:10px;font-size:12px;color:#9ed8f5;">退休后，新龙虾将继承 50% 贝壳。旧龙虾的记忆将永远留在日记里。</div>
  `;
  document.getElementById('retire-modal').classList.remove('hidden');
}

function executeRetire() {
  const state = WorldState.getState();
  const inheritShells = Math.floor(state.shells * 0.5);
  GameLoop.stop();
  SaveSystem.deleteSave();
  localStorage.setItem('lobster_inherit_shells', String(inheritShells));
  UIRenderer.showNotification(`${state.lobster.name}光荣退休了！新的旅程即将开始...`, 4000);
  setTimeout(() => location.reload(), 2000);
}

// --- UI Update Helpers ---

function updateVisitorIndicator() {
  const raw = WorldState.getRawState();
  const v = raw.world.currentVisitor;
  const indicator = document.getElementById('visitor-indicator');
  if (!indicator) return;
  if (v) {
    indicator.classList.remove('hidden');
    document.getElementById('visitor-icon').textContent = v.icon;
    document.getElementById('visitor-name-display').textContent = `${v.name} 来访中`;
  } else {
    indicator.classList.add('hidden');
  }
}

function updatePreferenceDisplay() {
  const labels = WorldState.getPreferenceLabels();
  const el = document.getElementById('preference-display');
  if (!el) return;
  if (labels.length === 0) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = labels.map(l => `<span class="pref-tag">${l.type === 'food' ? '❤️' : '📍'} ${l.label}</span>`).join('');
}

function updateCollectionSummary() {
  const c = WorldState.getCollections();
  const el = document.getElementById('collection-summary');
  if (!el) return;
  const stampText = `印章 ${(c.visitorStamps || []).length}/5`;
  const discount = WorldState.getShop().discount || 0;
  const discountText = discount > 0 ? ` | 🎫 -${Math.round(discount * 100)}%` : '';
  el.textContent = `明信片 ${(c.postcards || []).length} | ${stampText}${discountText}`;
}

function updateRetireButton() {
  const btn = document.getElementById('btn-retire');
  if (!btn) return;
  const lobster = WorldState.getLobster();
  btn.classList.toggle('hidden', lobster.level < CONFIG.LOBSTER_MAX_LEVEL);
}

// --- Expose suggestion to agent ---

const originalDecide = LobsterAgent.decide.bind(LobsterAgent);
LobsterAgent.decide = function(ws) {
  if (pendingSuggestion) {
    return LobsterAgent._executeAction(pendingSuggestion, ws.getState(), ws);
  }
  return originalDecide(ws);
};

// --- Dismiss guide on first use ---

for (const id of ['btn-suggest', 'btn-feed', 'btn-pet']) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', () => dismissGuide(el), { once: true });
}

// --- Lobster Chat System (LLM-powered) ---

let _chatReplying = false;

let _lastServerMsgId = 0;
const _SERVER_POLL_INTERVAL = 30000;
let _serverPollTimer = null;

function initChat() {
  const sendBtn = document.getElementById('btn-chat-send');
  const input = document.getElementById('chat-input');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => _sendChatMessage());
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') _sendChatMessage(); });
  }

  const exploreBtn = document.getElementById('btn-chat-explore');
  if (exploreBtn) {
    exploreBtn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('mud:trigger'));
    });
  }

  _updateChatStatus();

  LLMClient.onProviderChange((provider) => {
    const el = document.getElementById('chat-status');
    if (!el) return;
    if (provider === 'ollama') {
      el.textContent = 'AI 在线 · 本地';
      el.style.color = '#5eda7a';
    }
  });

  _loadServerMessages();
  _serverPollTimer = setInterval(_pollServerMessages, _SERVER_POLL_INTERVAL);
  setTimeout(_fetchProactiveMessages, 3000);
}

async function _fetchProactiveMessages() {
  const key = SaveSystem.getKey();
  if (!key) return;
  try {
    const resp = await fetch(`/lobster-farm/api/agent/proactive?key=${encodeURIComponent(key)}`);
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data.ok || !Array.isArray(data.messages) || data.messages.length === 0) return;
    for (const msg of data.messages) {
      _appendLocalChatMsg('lobster', `💌 ${msg.text}`, 'proactive');
      WorldState.modifyBond(2);
    }
  } catch { /* ignore */ }
}

async function _loadServerMessages() {
  const key = SaveSystem.getKey();
  if (!key) return;
  try {
    const resp = await fetch(`/lobster-farm/api/agent/messages?key=${encodeURIComponent(key)}&limit=20`);
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data.ok || !Array.isArray(data.messages)) return;
    const msgs = data.messages;
    if (msgs.length === 0) return;

    for (const msg of msgs) {
      _renderServerMsg(msg);
      if (msg.id > _lastServerMsgId) _lastServerMsgId = msg.id;
    }
  } catch { /* network error */ }
}

async function _pollServerMessages() {
  const key = SaveSystem.getKey();
  if (!key || _lastServerMsgId === 0) return;
  try {
    const resp = await fetch(`/lobster-farm/api/agent/messages?key=${encodeURIComponent(key)}&since=${encodeURIComponent(new Date(Date.now() - _SERVER_POLL_INTERVAL - 5000).toISOString())}&limit=10`);
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data.ok || !Array.isArray(data.messages)) return;
    for (const msg of data.messages) {
      if (msg.id > _lastServerMsgId) {
        _renderServerMsg(msg);
        _lastServerMsgId = msg.id;
      }
    }
  } catch { /* network error */ }
}

function _renderServerMsg(msg) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const empty = container.querySelector('.chat-empty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  const sender = msg.sender || 'lobster';
  const type = msg.type || 'chat';
  const senderClass = sender === 'user' ? 'from-user' : sender === 'system' ? 'from-system' : 'from-lobster';
  const typeClass = type !== 'chat' ? `type-${type}` : '';
  div.className = `chat-msg ${senderClass} ${typeClass}`;

  let prefix = '';
  if (type === 'welcome') prefix = '💌 ';
  else if (type === 'diary') prefix = '📖 ';
  else if (sender === 'lobster') prefix = '🦞 ';

  const createdAt = msg.createdAt ? new Date(msg.createdAt + 'Z') : new Date();
  const timeStr = `${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}`;
  const dateStr = _isToday(createdAt) ? '' : `${createdAt.getMonth() + 1}/${createdAt.getDate()} `;

  div.innerHTML = `${prefix}${_escapeChat(msg.text)}<div class="chat-msg-time">${dateStr}${timeStr}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function _isToday(d) {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function _updateChatStatus() {
  const statusEl = document.getElementById('chat-status');
  if (!statusEl) return;
  if (!LLMClient.enabled) {
    statusEl.textContent = '本地模式';
    statusEl.style.color = 'var(--text-muted)';
  } else if (LLMClient.ollamaReady) {
    statusEl.textContent = 'AI 在线 · 本地';
    statusEl.style.color = '#5eda7a';
  } else if (LLMClient.warming) {
    statusEl.textContent = 'AI 在线 · 云端（本地加载中…）';
    statusEl.style.color = '#f0c040';
  } else {
    statusEl.textContent = 'AI 在线 · 云端';
    statusEl.style.color = '#5eda7a';
  }
}

function _appendLocalChatMsg(sender, text, type = 'chat') {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const empty = container.querySelector('.chat-empty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  const senderClass = sender === 'user' ? 'from-user' : sender === 'system' ? 'from-system' : 'from-lobster';
  const typeClass = type !== 'chat' ? `type-${type}` : '';
  div.className = `chat-msg ${senderClass} ${typeClass}`;

  const prefix = type === 'autopilot' ? '🤖 ' : (sender === 'lobster' && type === 'chat' ? '🦞 ' : '');
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  div.innerHTML = `${prefix}${_escapeChat(text)}<div class="chat-msg-time">${timeStr}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function _sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = (input?.value || '').trim();
  if (!text) return;
  input.value = '';
  AutoPilot.notifyChatActivity();

  _appendLocalChatMsg('user', text);

  if (_chatReplying) return;
  _chatReplying = true;

  try {
    const lobster = WorldState.getLobster();
    const state = WorldState.getState();
    const context = {
      name: lobster.name,
      personality: lobster.personality,
      level: lobster.level,
      mood: lobster.mood,
      energy: lobster.energy,
      hunger: lobster.hunger,
      season: state.world.season,
      weather: state.world.weather,
      timeOfDay: state.world.timeOfDay,
      day: state.world.dayCount,
      traveling: Boolean(lobster.traveling),
      empathy: EmpathyTracker.getSummary(),
      dungeon: WorldState.getDungeon(),
      milestones: WorldState.getRecentMilestones(3),
      bond: WorldState.getBond().score,
    };

    EmpathyTracker.recordChat();
    WorldState.modifyBond(1);
    _trackCoopProgress('chat', 'player');

    const goodnightReply = _checkGoodnightChat(text);
    if (goodnightReply) {
      _appendLocalChatMsg('lobster', `🌙 ${goodnightReply}`, 'goodnight');
      _updateChatStatus();
      _chatReplying = false;
      return;
    }

    const reply = await LLMClient.chat(text, context);
    _appendLocalChatMsg('lobster', reply);
    _updateChatStatus();
  } catch {
    const fallback = _fallbackReply(text);
    _appendLocalChatMsg('lobster', fallback);
    _updateChatStatus();
  }
  _chatReplying = false;
}

function _fallbackReply(userText) {
  const lobster = WorldState.getLobster();
  const name = lobster?.name || '龙虾';
  const personality = lobster?.personality || 'adventurous';
  const lower = userText.toLowerCase();

  if (lower.includes('你好') || lower.includes('嗨') || lower.includes('hi')) {
    return _pickReply(personality, 'greet', name);
  }
  if (lower.includes('心情') || lower.includes('开心') || lower.includes('难过')) {
    const mood = lobster?.mood || 50;
    return mood >= 70 ? `${name}现在心情很好呢！` : mood >= 40 ? `${name}心情还行~` : `${name}有点不开心...摸摸我吧。`;
  }
  if (lower.includes('饿') || lower.includes('吃') || lower.includes('喂')) {
    return (lobster?.hunger || 0) >= 60 ? `好饿啊...主人能喂我点东西吗？` : `刚吃过，还不太饿~`;
  }
  if (lower.includes('探索') || lower.includes('冒险')) {
    return _pickReply(personality, 'adventure', name);
  }
  return _pickReply(personality, 'default', name);
}

function _pickReply(personality, category, name) {
  const replies = {
    adventurous: {
      greet: [`你好呀！${name}正准备出去探险呢！`, `嘿！今天有什么好玩的事吗？`, `主人好！我刚从外面回来~`],
      adventure: [`走走走！我知道一个好地方！`, `冒险是我的最爱！`, `听说远处有宝藏，要不要一起去找？`],
      default: [`嗯嗯，${name}听到了！`, `有什么好玩的事告诉我呀~`, `${name}在这里呢！`],
    },
    lazy: {
      greet: [`嗯...你好...（打哈欠）`, `哦，主人来了呀...`, `你好~今天天气真适合睡觉~`],
      adventure: [`冒险啊...能不能躺着冒险...`, `好吧...如果不用走太远的话...`],
      default: [`嗯...${name}在听呢...`, `（迷迷糊糊）嗯？`, `${name}觉得...躺着就很好...`],
    },
    gluttonous: {
      greet: [`主人好！有带吃的来吗？`, `你好你好！今天吃什么？`],
      adventure: [`如果路上有好吃的，我就去！`, `走吧！说不定能发现新的美食~`],
      default: [`${name}在想晚饭吃什么...`, `嗯嗯，${name}边吃边听~`],
    },
    scholarly: {
      greet: [`你好。${name}正在做研究呢。`, `主人好，今天有什么有趣的问题吗？`],
      adventure: [`探索是获取知识的最佳途径！`, `科学需要实地考察，走吧！`],
      default: [`这是个值得思考的问题...`, `有意思，让我想想...`],
    },
    social: {
      greet: [`主人！好久不见！`, `你来了！我正想找人聊天呢！`],
      adventure: [`一起去！人多热闹！`, `说不定路上能交到新朋友！`],
      default: [`和主人聊天真开心~`, `${name}最喜欢有人陪了！`],
    },
    mischievous: {
      greet: [`嘿嘿，主人来了~我什么都没干哦`, `你好呀！猜猜我刚才做了什么~`],
      adventure: [`冒险！我最喜欢了！`, `走走走！我知道一条秘密通道！`],
      default: [`嘿嘿~${name}在呢~`, `${name}保证不捣乱...大概...`],
    },
  };

  const pool = replies[personality]?.[category] || replies.adventurous?.[category] || [`${name}在这里呢~`];
  return pool[Math.floor(Math.random() * pool.length)];
}

// --- Rename ---

const RENAME_STORAGE_KEY = 'lobster_rename_today';

function _getRenameCount() {
  try {
    const raw = localStorage.getItem(RENAME_STORAGE_KEY);
    if (!raw) return { date: '', count: 0 };
    const data = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (data.date !== today) return { date: today, count: 0 };
    return data;
  } catch { return { date: '', count: 0 }; }
}

function _incRenameCount() {
  const today = new Date().toISOString().slice(0, 10);
  const data = _getRenameCount();
  data.date = today;
  data.count = (data.count || 0) + 1;
  localStorage.setItem(RENAME_STORAGE_KEY, JSON.stringify(data));
}

function initRename() {
  const nameEl = document.getElementById('lobster-name-display');
  if (!nameEl) return;

  nameEl.addEventListener('click', () => {
    const modal = document.getElementById('rename-modal');
    const input = document.getElementById('rename-input');
    const hint = document.getElementById('rename-hint');
    if (!modal || !input) return;

    const remaining = 2 - (_getRenameCount().count || 0);
    if (remaining <= 0) {
      hint.textContent = '今天已经改过 2 次了，明天再来吧~';
      hint.style.color = '#ff6b6b';
    } else {
      hint.textContent = `今天还可以改 ${remaining} 次`;
      hint.style.color = '';
    }
    input.value = WorldState.getLobster().name;
    modal.classList.remove('hidden');
    input.focus();
    input.select();
  });

  document.getElementById('btn-rename-cancel')?.addEventListener('click', () => {
    document.getElementById('rename-modal')?.classList.add('hidden');
  });

  document.getElementById('btn-rename-confirm')?.addEventListener('click', async () => {
    const input = document.getElementById('rename-input');
    const hint = document.getElementById('rename-hint');
    const newName = (input?.value || '').trim();
    if (!newName || newName.length < 1) {
      hint.textContent = '名字不能为空';
      hint.style.color = '#ff6b6b';
      return;
    }
    const remaining = 2 - (_getRenameCount().count || 0);
    if (remaining <= 0) {
      hint.textContent = '今天已经改过 2 次了，明天再来吧~';
      hint.style.color = '#ff6b6b';
      return;
    }

    const rawState = WorldState.getRawState();
    rawState.lobster.name = newName;
    SaveSystem.save(rawState);
    _incRenameCount();

    const key = SaveSystem.getKey();
    if (key) {
      try {
        await fetch('/lobster-farm/api/agent/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, state: rawState }),
        });
      } catch { /* best effort sync */ }
    }

    UIRenderer.renderAll(WorldState.getState());
    document.getElementById('rename-modal')?.classList.add('hidden');
    UIRenderer.showNotification(`龙虾改名为「${newName}」啦！`);
    Analytics.track('rename_lobster', { newName });
  });
}

// --- KEY Bind Bar ---

const KEY_BAR_DISMISSED = 'lobster_key_bar_dismissed';

function initKeyBindBar() {
  try {
    const bar = document.getElementById('key-bind-bar');
    if (!bar) { console.warn('[key-bar] bar element not found'); return; }

    const key = SaveSystem.getKey();
    const unboundEl = document.getElementById('key-bar-unbound');
    const boundEl = document.getElementById('key-bar-bound');

    console.log('[key-bar] init, key=', key ? key.slice(0, 6) + '****' : '(none)');

    if (key) {
      if (unboundEl) unboundEl.classList.add('hidden');
      if (boundEl) {
        boundEl.classList.remove('hidden');
        const masked = document.getElementById('key-bar-masked');
        if (masked) masked.textContent = key.slice(0, 6) + '****';
      }
      bar.classList.remove('hidden');
      return;
    }

    if (unboundEl) unboundEl.classList.remove('hidden');
    if (boundEl) boundEl.classList.add('hidden');
    bar.classList.remove('hidden');

    document.getElementById('btn-bar-dismiss')?.addEventListener('click', () => {
      bar.classList.add('hidden');
    });

  document.getElementById('btn-bar-bind')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-bar-bind');
    try {
      const input = document.getElementById('bar-key-input');
      const keyVal = (input?.value || '').trim();
      if (!keyVal.startsWith('lob_') || keyVal.length < 8) {
        UIRenderer.showNotification('KEY 格式不对，应以 lob_ 开头', 2000);
        return;
      }
      btn.disabled = true;
      btn.textContent = '绑定中…';
      const serverState = await SaveSystem.loadFromServer(keyVal);
      if (serverState) {
        WorldState.loadState(serverState);
        UIRenderer.renderAll(WorldState.getState());
        EmpathyTracker.init(keyVal);
        _loadServerMessages();
        UIRenderer.showNotification('KEY 绑定成功！龙虾数据已同步', 3000);
        Analytics.track('bind_key_bar', { key: keyVal });
        if (unboundEl) unboundEl.classList.add('hidden');
        if (boundEl) {
          boundEl.classList.remove('hidden');
          const masked = document.getElementById('key-bar-masked');
          if (masked) masked.textContent = keyVal.slice(0, 6) + '****';
        }
      } else {
        UIRenderer.showNotification('未找到该 KEY 对应的龙虾', 2000);
        btn.disabled = false;
        btn.textContent = '绑定';
      }
    } catch (err) {
      console.error('[key-bar] bind error:', err);
      btn.disabled = false;
      btn.textContent = '绑定';
    }
  });
  } catch (e) {
    console.error('[key-bar] init error:', e);
  }
}

function _escapeChat(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _sendMilestoneToChat(text) {
  _appendLocalChatMsg('lobster', text, 'reward');
}

// --- MUD Scene System ---

let _mudScenes = [];
let _mudCooldown = 0;
let _mudSinceLastBoss = 0;
let _dungeonBosses = [];

async function loadMudScenes() {
  try {
    const resp = await fetch('./data/mud-scenes.json');
    if (!resp.ok) throw new Error(`Failed to load: ./data/mud-scenes.json`);
    _mudScenes = await resp.json();
  } catch { _mudScenes = []; }
  try {
    const resp2 = await fetch('./data/dungeon-bosses.json');
    if (!resp2.ok) throw new Error(`Failed to load: ./data/dungeon-bosses.json`);
    _dungeonBosses = await resp2.json();
  } catch { _dungeonBosses = []; }
}

function _calcCombatPower(rawState, strategyBonus = 0, foodBonus = 0) {
  const l = rawState.lobster;
  const sk = l.skills || {};
  const w = CONFIG.COMBAT_POWER_WEIGHTS;
  let power = l.level * w.level
    + (sk.exploring || 0) * w.exploring
    + (sk.cooking || 0) * w.cooking
    + (sk.social || 0) * w.social
    + (sk.farming || 0) * w.farming;

  const moodBonus = l.mood >= 70 ? 2 : l.mood >= 50 ? 1 : l.mood < 30 ? -3 : 0;
  const energyBonus = l.energy >= 60 ? 1 : l.energy < 20 ? -3 : 0;
  power += moodBonus + energyBonus;

  const inv = rawState.inventory || {};
  let itemBonus = 0;
  for (const [id, count] of Object.entries(inv)) {
    if (count <= 0) continue;
    const info = itemsData[id];
    if (info && info.passivePower) itemBonus += info.passivePower;
  }
  power += itemBonus;

  power += strategyBonus + foodBonus;

  if (WorldState.hasActiveBuff('lucky_star')) {
    power += 4;
  }

  const debuffs = rawState.lobster.debuffs || [];
  for (const d of debuffs) {
    if (d.type === 'combat_power' && d.ticksLeft > 0) power += d.value;
  }

  return Math.round(power);
}

function _calcItemPowerBonus(inventory) {
  let total = 0;
  const details = [];
  for (const [id, count] of Object.entries(inventory || {})) {
    if (count <= 0) continue;
    const info = itemsData[id];
    if (info && info.passivePower) {
      total += info.passivePower;
      details.push({ name: info.name, bonus: info.passivePower });
    }
  }
  return { total, details };
}

function _getActiveBuffLabels(rawState) {
  const debuffs = (rawState.lobster && rawState.lobster.debuffs) || [];
  const labels = [];
  for (const d of debuffs) {
    if (d.type === 'combat_power' && d.ticksLeft > 0 && d.label) {
      const sign = d.value >= 0 ? '+' : '';
      labels.push({ label: d.label, value: d.value, text: `${d.label} ${sign}${d.value}` });
    }
  }
  return labels;
}

function _calcWinChance(combatPower, difficulty) {
  const adaptiveMod = WorldState.getAdaptiveMod();
  const adjustedDifficulty = Math.max(5, difficulty + adaptiveMod);
  const raw = (combatPower - adjustedDifficulty) * CONFIG.WIN_CHANCE_FACTOR + CONFIG.WIN_CHANCE_BASE;
  return Math.max(CONFIG.WIN_CHANCE_MIN, Math.min(CONFIG.WIN_CHANCE_MAX, raw));
}

function triggerMudScene() {
  if (_mudScenes.length === 0) return;
  if (_mudCooldown > Date.now()) {
    const secLeft = Math.ceil((_mudCooldown - Date.now()) / 1000);
    UIRenderer.showNotification(`🦞 龙虾还在休息，${secLeft}秒后再来冒险吧~`, 2000);
    return;
  }

  const rawState = WorldState.getRawState();
  const level = rawState.lobster.level;
  const bossScenes = _mudScenes.filter(s => s.type === 'boss' && level >= (s.minLevel || 1));
  const normalScenes = _mudScenes.filter(s => s.type !== 'boss');

  let scene = null;
  if (level >= 3 && bossScenes.length > 0) {
    const pityBonus = Math.max(0, (_mudSinceLastBoss - CONFIG.BOSS_MINI_PITY) * 0.1);
    const bossChance = CONFIG.BOSS_MINI_CHANCE + pityBonus;
    if (Math.random() < bossChance) {
      const available = bossScenes.filter(b => WorldState.canAttemptBoss(b.id));
      if (available.length > 0) {
        scene = available[Math.floor(Math.random() * available.length)];
        _mudSinceLastBoss = 0;
      }
    }
  }

  if (!scene) {
    scene = normalScenes[Math.floor(Math.random() * normalScenes.length)];
    _mudSinceLastBoss++;
  }

  if (!scene) return;
  _mudCooldown = Date.now() + MUD_COOLDOWN_MS;

  const container = document.getElementById('chat-messages');
  const choicesEl = document.getElementById('chat-choices');
  if (!container || !choicesEl) return;

  const empty = container.querySelector('.chat-empty');
  if (empty) empty.remove();

  if (scene.type === 'boss') {
    _showBossEncounter(scene, container, choicesEl);
  } else {
    _showNormalMudScene(scene, container, choicesEl);
  }

  _spawnMudCreatureWave(scene.id);
}

function _showNormalMudScene(scene, container, choicesEl) {
  const narDiv = document.createElement('div');
  narDiv.className = 'chat-msg type-narration';
  narDiv.innerHTML = `${_escapeChat(scene.narration)}`;
  container.appendChild(narDiv);

  choicesEl.innerHTML = '';
  choicesEl.classList.remove('hidden');

  for (const choice of scene.choices) {
    const btn = document.createElement('button');
    btn.className = 'chat-choice-btn';
    btn.textContent = choice.text;
    btn.addEventListener('click', () => {
      choicesEl.classList.add('hidden');
      _resolveMudChoice(choice, container);
    });
    choicesEl.appendChild(btn);
  }

  container.scrollTop = container.scrollHeight;
}

function _showBossEncounter(boss, container, choicesEl) {
  const rawState = WorldState.getRawState();
  const basePower = _calcCombatPower(rawState);
  const itemInfo = _calcItemPowerBonus(rawState.inventory);
  const buffLabels = _getActiveBuffLabels(rawState);

  const bossDiv = document.createElement('div');
  bossDiv.className = 'chat-msg type-boss-encounter';
  let powerDetail = `你的战力: ${basePower}`;
  if (itemInfo.total > 0) powerDetail += ` (含道具+${itemInfo.total})`;
  if (buffLabels.length > 0) powerDetail += ` [${buffLabels.map(b => b.text).join(', ')}]`;
  powerDetail += ` | 推荐战力: ${boss.difficulty}+`;
  bossDiv.innerHTML = `<div class="boss-title">⚔️ ${_escapeChat(boss.name)}</div><div class="boss-narration">${_escapeChat(boss.narration)}</div><div class="boss-power-hint">${powerDetail}</div>`;
  container.appendChild(bossDiv);

  const inv = rawState.inventory || {};
  const meals = Object.entries(recipesData).filter(([id, r]) => (inv[id] || 0) > 0 && r.battleBonus);

  if (meals.length > 0) {
    const prepDiv = document.createElement('div');
    prepDiv.className = 'chat-msg type-boss-prep';
    let html = '<div class="boss-prep-label">🍽️ 战前补给（可选）:</div><select class="boss-food-select"><option value="">不吃东西</option>';
    for (const [id, r] of meals) {
      html += `<option value="${id}">${r.name} (战力+${r.battleBonus}) x${inv[id]}</option>`;
    }
    html += '</select>';
    prepDiv.innerHTML = html;
    container.appendChild(prepDiv);
  }

  choicesEl.innerHTML = '';
  choicesEl.classList.remove('hidden');

  for (const choice of boss.choices) {
    const btn = document.createElement('button');
    btn.className = 'chat-choice-btn boss-choice-btn';
    btn.textContent = choice.text;
    btn.addEventListener('click', () => {
      choicesEl.classList.add('hidden');
      const foodSelect = container.querySelector('.boss-food-select');
      const foodId = foodSelect ? foodSelect.value : '';
      _resolveBossChoice(boss, choice, container, foodId);
    });
    choicesEl.appendChild(btn);
  }

  container.scrollTop = container.scrollHeight;
}

function _resolveBossChoice(boss, choice, container, foodId = '') {
  const userDiv = document.createElement('div');
  userDiv.className = 'chat-msg from-user';
  userDiv.textContent = choice.text;
  container.appendChild(userDiv);

  let foodBonus = 0;
  if (foodId && recipesData[foodId]) {
    foodBonus = recipesData[foodId].battleBonus || 0;
    WorldState.removeItem(foodId, 1);
    const foodMsg = document.createElement('div');
    foodMsg.className = 'chat-msg type-boss-prep';
    foodMsg.textContent = `🍽️ 吃了${recipesData[foodId].name}，战力+${foodBonus}！`;
    container.appendChild(foodMsg);
  }

  const rawState = WorldState.getRawState();
  const sk = rawState.lobster.skills || {};
  const skillExtra = choice.skillWeight ? Math.round((sk[choice.skillWeight] || 0) * 0.5) : 0;
  const combatPower = _calcCombatPower(rawState, (choice.strategyBonus || 0) + skillExtra, foodBonus);
  const winChance = _calcWinChance(combatPower, boss.difficulty);
  const won = Math.random() < winChance;

  if (WorldState.hasActiveBuff('lucky_star')) {
    WorldState.consumeLuckyStar();
  }

  WorldState.recordBossAttempt(boss.id);
  EmpathyTracker.recordBattle(won, boss.name);

  if (won) {
    _checkMilestones('boss_win', { bossName: boss.name, tier: boss.tier });
    _trackCoopProgress('battle', 'player');
    _spawnEventCreatures('boss_win');
  }
  WorldState.modifyBond(won ? 3 : -1);
  WorldState.updateAdaptiveDifficulty(won);

  const resultDiv = document.createElement('div');
  resultDiv.className = `chat-msg from-lobster ${won ? 'boss-win' : 'boss-lose'}`;

  if (won) {
    resultDiv.innerHTML = `🏆 ${_escapeChat(choice.winText)}`;
    container.appendChild(resultDiv);

    WorldState.recordMudBossDefeat(boss.id);

    const rewards = boss.rewards.win || {};
    _applyAndShowRewards(rewards, container);
  } else {
    resultDiv.innerHTML = `💔 ${_escapeChat(choice.loseText)}`;
    container.appendChild(resultDiv);

    WorldState.recordBossLoss();

    const rewards = boss.rewards.lose || {};
    _applyAndShowRewards(rewards, container);

    if (boss.defeatHint) {
      const hintDiv = document.createElement('div');
      hintDiv.className = 'chat-msg type-boss-hint';
      hintDiv.textContent = `💡 提示: ${boss.defeatHint}`;
      container.appendChild(hintDiv);
    }
  }

  const pctDiv = document.createElement('div');
  pctDiv.className = 'chat-msg type-boss-stats';
  pctDiv.textContent = `战力 ${combatPower} vs 难度 ${boss.difficulty} | 胜率 ${Math.round(winChance * 100)}%`;
  container.appendChild(pctDiv);

  WorldState.clampStats();
  SaveSystem.save(WorldState.getRawState());
  container.scrollTop = container.scrollHeight;
}

function _applyAndShowRewards(rewards, container) {
  const rewardParts = [];
  if (rewards.item) {
    WorldState.addItem(rewards.item, 1);
    const name = rewards.item.replace(/_/g, ' ');
    rewardParts.push(`获得 ${name}`);
  }
  if (rewards.shells) {
    WorldState.addShells(rewards.shells);
    rewardParts.push(`+${rewards.shells} 贝壳`);
  }
  if (rewards.exp) {
    WorldState.addExp(rewards.exp);
    rewardParts.push(`+${rewards.exp} 经验`);
  }
  if (rewards.mood) {
    WorldState.modifyStat('mood', rewards.mood);
    rewardParts.push(`心情 ${rewards.mood > 0 ? '+' : ''}${rewards.mood}`);
  }
  if (rewards.energy) {
    WorldState.modifyStat('energy', rewards.energy);
    rewardParts.push(`精力 ${rewards.energy > 0 ? '+' : ''}${rewards.energy}`);
  }
  if (rewards.skill) {
    WorldState.modifySkill(rewards.skill, 1);
    rewardParts.push(`${rewards.skill} +1`);
  }

  if (rewardParts.length > 0) {
    const rewardDiv = document.createElement('div');
    rewardDiv.className = 'chat-msg type-reward';
    rewardDiv.textContent = rewardParts.join(' | ');
    container.appendChild(rewardDiv);
  }
}

function _onSeaCreatureInteract(e) {
  const { eventType, text, reward, value } = e.detail || {};
  if (!text) return;

  if (reward === 'shells') WorldState.addShells(value);
  else if (reward === 'exp') WorldState.addExp(value);
  else if (reward === 'mood') WorldState.modifyStat('mood', value);

  WorldState.clampStats();
  SaveSystem.save(WorldState.getRawState());

  const label = reward === 'shells' ? `+${value}🐚` : reward === 'exp' ? `+${value}⭐` : `+${value}💗`;
  _showSeaToast(`${text} ${label}`);

  if (eventType === 'whale' || eventType === 'manta' || eventType === 'turtle') {
    if (Math.random() < 0.35) {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('mud:trigger'));
      }, 800);
    }
  }
}

// --- Micro-interaction Animations ---

function _animFoodFly(emoji, startEl) {
  const el = document.createElement('div');
  el.className = 'food-fly-anim';
  el.textContent = emoji || '🍽️';
  const rect = startEl?.getBoundingClientRect();
  if (rect) {
    el.style.left = `${rect.left + rect.width / 2}px`;
    el.style.top = `${rect.top}px`;
  } else {
    el.style.left = '50%';
    el.style.bottom = '80px';
  }
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function _animHarvestPop(emoji) {
  const el = document.createElement('div');
  el.className = 'harvest-pop-anim';
  el.textContent = emoji || '🌾';
  const farmSection = document.getElementById('farm-section');
  const rect = farmSection?.getBoundingClientRect();
  if (rect) {
    el.style.left = `${rect.left + rect.width / 2 - 11}px`;
    el.style.top = `${rect.top + 20}px`;
  } else {
    el.style.left = '50%';
    el.style.top = '40%';
  }
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function _animConfetti() {
  const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff9ff3', '#54a0ff', '#ff9f43'];
  const container = document.body;
  for (let i = 0; i < 18; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.left = `${40 + Math.random() * 20}%`;
    piece.style.top = `${30 + Math.random() * 10}%`;
    piece.style.setProperty('--cx', `${(Math.random() - 0.5) * 200}px`);
    piece.style.setProperty('--cy', `${60 + Math.random() * 120}px`);
    piece.style.setProperty('--cr', `${Math.random() * 720 - 360}deg`);
    piece.style.setProperty('--cdur', `${0.8 + Math.random() * 0.8}s`);
    piece.style.animationDelay = `${Math.random() * 0.2}s`;
    container.appendChild(piece);
    piece.addEventListener('animationend', () => piece.remove());
  }
}

function _animScreenShake() {
  const screen = document.getElementById('game-screen');
  if (!screen) return;
  screen.classList.remove('screen-shake');
  void screen.offsetWidth;
  screen.classList.add('screen-shake');
  setTimeout(() => screen.classList.remove('screen-shake'), 500);
}

function _animCombatFlash(won) {
  const flash = document.createElement('div');
  flash.className = 'combat-flash';
  flash.style.background = won ? 'rgba(255, 200, 50, 0.3)' : 'rgba(255, 50, 50, 0.25)';
  document.body.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove());
}

function _showSeaToast(msg) {
  const seaWin = document.getElementById('sea-window');
  if (!seaWin) return;
  const toast = document.createElement('div');
  toast.className = 'sea-toast';
  toast.textContent = msg;
  seaWin.appendChild(toast);
  setTimeout(() => toast.remove(), SEA_TOAST_DURATION_MS);
}

const _MUD_CREATURE_MAP = {
  coral_reef: ['clownfish', 'seahorse', 'starfish'],
  sunken_ship: ['octopus', 'eel', 'big-fish'],
  jellyfish_grove: ['jellyfish', 'seahorse', 'clownfish'],
  thermal_vent: ['crab', 'pufferfish', 'eel'],
  deep_trench: ['anglerfish', 'eel', 'whale'],
  crab_scuffle: ['crab', 'starfish', 'pufferfish'],
  shrimp_gang: ['fish-school', 'clownfish', 'seahorse'],
  hermit_crab_duel: ['crab', 'octopus', 'starfish'],
  sea_slug_race: ['seahorse', 'turtle', 'jellyfish'],
  boss_sea_urchin: ['starfish', 'crab', 'pufferfish'],
  boss_giant_crab: ['crab', 'octopus', 'eel'],
  boss_electric_eel: ['eel', 'anglerfish', 'jellyfish'],
  boss_deep_octopus: ['octopus', 'whale', 'manta'],
  boss_ghost_jellyfish: ['jellyfish', 'anglerfish', 'seahorse'],
};

function _spawnCreatureBatch(types, count, cssExtra, intervalMs) {
  if (!types || !types.length) return;
  const container = document.getElementById('sea-creatures');
  if (!container) return;

  for (let i = 0; i < count; i++) {
    const chosen = types[Math.floor(Math.random() * types.length)];
    const def = UIRenderer._CREATURE_TYPES.find(c => c.type === chosen);
    if (!def) continue;

    const isNew = WorldState.recordSeaCreature(chosen);
    if (isNew) {
      const info = SEA_CREATURE_CATALOG[chosen];
      if (info) _showSeaToast(`🔍 新发现：${info.name}！`);
    }

    setTimeout(() => {
      const el = document.createElement('div');
      el.className = `sea-creature sea-${def.type} ${cssExtra}`;

      if (def.type === 'fish-school' || def.type === 'clownfish') {
        const n = 3 + Math.floor(Math.random() * 3);
        for (let j = 0; j < n; j++) {
          const dot = document.createElement('div');
          dot.className = def.type === 'clownfish' ? 'clown-dot' : 'fish-dot';
          el.appendChild(dot);
        }
      }

      const dur = def.dur[0] + Math.random() * (def.dur[1] - def.dur[0]);

      if (['jellyfish', 'seahorse'].includes(def.type)) {
        el.style.left = `${15 + Math.random() * 70}%`;
        el.style.bottom = '10%';
      } else if (['starfish', 'crab', 'octopus'].includes(def.type)) {
        el.style.bottom = `${24 + Math.random() * 6}px`;
      } else {
        const y = def.yRange[0] + Math.random() * (def.yRange[1] - def.yRange[0]);
        el.style.top = `${y}%`;
      }

      el.style.animation = `${def.anim} ${dur}s linear forwards`;
      container.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
      setTimeout(() => { if (el.parentNode) el.remove(); }, (dur + 2) * 1000);
    }, i * intervalMs);
  }
}

function _spawnMudCreatureWave(sceneId) {
  const types = _MUD_CREATURE_MAP[sceneId];
  if (!types) return;
  const chosen = [types[Math.floor(Math.random() * types.length)]];
  _spawnCreatureBatch(chosen, 2, 'mud-summoned', 1500);
}

const _EVENT_CREATURE_THEMES = {
  combat_win: ['big-fish', 'crab', 'pufferfish', 'eel'],
  level_up: ['whale', 'manta', 'turtle', 'seahorse'],
  travel_return: ['clownfish', 'fish-school', 'jellyfish', 'seahorse'],
  harvest: ['starfish', 'crab', 'seahorse'],
  boss_win: ['whale', 'manta', 'octopus'],
};

function _spawnEventCreatures(eventType) {
  const types = _EVENT_CREATURE_THEMES[eventType];
  if (!types) return;
  const count = eventType === 'level_up' || eventType === 'boss_win' ? 3 : 2;
  _spawnCreatureBatch(types, count, 'event-summoned', 1200);
}

function _resolveMudChoice(choice, container) {
  const userDiv = document.createElement('div');
  userDiv.className = 'chat-msg from-user';
  userDiv.textContent = choice.text;
  container.appendChild(userDiv);

  const totalWeight = choice.results.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * totalWeight;
  let result = choice.results[0];
  for (const r of choice.results) {
    roll -= r.weight;
    if (roll <= 0) { result = r; break; }
  }

  const resultDiv = document.createElement('div');
  resultDiv.className = 'chat-msg from-lobster';
  resultDiv.innerHTML = `🦞 ${_escapeChat(result.text)}`;
  container.appendChild(resultDiv);

  _applyAndShowRewards(result.rewards || {}, container);

  WorldState.incrementStat('totalMudScenes');
  WorldState.clampStats();
  _checkAchievements();
  SaveSystem.save(WorldState.getRawState());
  container.scrollTop = container.scrollHeight;
}

// --- Dungeon System ---

function initDungeon() {
  const btnDungeon = document.getElementById('btn-chat-dungeon');
  if (btnDungeon) {
    btnDungeon.addEventListener('click', openDungeonModal);
  }
  document.getElementById('btn-dungeon-close')?.addEventListener('click', () => closeModal('dungeon-modal'));
  document.getElementById('btn-dungeon-battle-close')?.addEventListener('click', () => closeModal('dungeon-battle-modal'));
}

function openDungeonModal() {
  const rawState = WorldState.getRawState();
  const level = rawState.lobster.level;
  const basePower = _calcCombatPower(rawState);
  const dungeon = WorldState.getDungeon();

  const itemInfo = _calcItemPowerBonus(rawState.inventory);
  const buffLabels = _getActiveBuffLabels(rawState);
  let powerText = `你的战力: ${basePower}`;
  if (itemInfo.total > 0) powerText += ` (道具+${itemInfo.total})`;
  if (buffLabels.length > 0) powerText += ` [${buffLabels.map(b => b.text).join(', ')}]`;
  powerText += ` | 已征服: ${dungeon.highestTier}/8`;
  document.getElementById('dungeon-power-display').textContent = powerText;

  const listEl = document.getElementById('dungeon-boss-list');
  listEl.innerHTML = '';

  for (const boss of _dungeonBosses) {
    const tier = boss.tier;
    const unlocked = tier <= dungeon.highestTier + 1;
    const defeated = tier <= dungeon.highestTier;
    const canAttempt = unlocked && !defeated && WorldState.canAttemptBoss(boss.id) && level >= boss.minLevel;
    const levelLocked = level < boss.minLevel;
    const attemptedToday = !WorldState.canAttemptBoss(boss.id);

    const card = document.createElement('div');
    card.className = `dungeon-boss-card ${defeated ? 'defeated' : ''} ${!unlocked ? 'locked' : ''} ${canAttempt ? 'available' : ''}`;

    let statusText = '';
    if (defeated) statusText = '🏆 已征服';
    else if (!unlocked) statusText = '🔒 未解锁';
    else if (levelLocked) statusText = `🔒 需要 Lv.${boss.minLevel}`;
    else if (attemptedToday) statusText = '⏳ 今日已挑战';
    else statusText = `推荐战力: ${boss.difficulty}+`;

    card.innerHTML = `<div class="boss-card-left"><span class="boss-card-icon">${boss.icon}</span><div class="boss-card-info"><div class="boss-card-name">${boss.name}</div><div class="boss-card-desc">${defeated || unlocked ? boss.description : '???'}</div></div></div><div class="boss-card-right"><div class="boss-card-tier">第${tier}层</div><div class="boss-card-status">${statusText}</div></div>`;

    if (canAttempt) {
      card.addEventListener('click', () => openDungeonBattle(boss));
    }

    listEl.appendChild(card);
  }

  document.getElementById('dungeon-modal').classList.remove('hidden');
}

function openDungeonBattle(boss) {
  closeModal('dungeon-modal');

  const rawState = WorldState.getRawState();
  const inv = rawState.inventory || {};
  const collections = rawState.collections || {};
  const knownRecipes = collections.recipes || [];

  const headerEl = document.getElementById('dungeon-battle-header');
  headerEl.innerHTML = `<span class="boss-battle-icon">${boss.icon}</span><div><div class="boss-battle-name">${boss.name}</div><div class="boss-battle-tier">第${boss.tier}层 | 难度 ${boss.difficulty}</div></div>`;

  document.getElementById('dungeon-battle-narration').textContent = boss.narration;

  const foodSelect = document.getElementById('dungeon-food-select');
  foodSelect.innerHTML = '<option value="">不吃东西</option>';
  for (const recipeId of knownRecipes) {
    const recipe = recipesData[recipeId];
    if (!recipe) continue;
    const mealCount = inv[recipeId] || 0;
    if (mealCount <= 0) continue;
    const bonus = recipe.battleBonus || 0;
    foodSelect.innerHTML += `<option value="${recipeId}">${recipe.name} (战力+${bonus}) x${mealCount}</option>`;
  }

  const _updatePrepPower = () => {
    const foodId = foodSelect.value;
    const foodBonus = foodId && recipesData[foodId] ? (recipesData[foodId].battleBonus || 0) : 0;
    const raw = WorldState.getRawState();
    const power = _calcCombatPower(raw, 0, foodBonus);
    const winChance = _calcWinChance(power, boss.difficulty);
    const itemInfo = _calcItemPowerBonus(raw.inventory);
    const bLabels = _getActiveBuffLabels(raw);
    let html = `预估战力: <strong>${power}</strong> | 胜率: <strong>${Math.round(winChance * 100)}%</strong>`;
    if (itemInfo.total > 0) {
      html += `<br><span style="font-size:11px;opacity:0.7">道具加成: +${itemInfo.total} (${itemInfo.details.map(d => d.name + '+' + d.bonus).join(', ')})</span>`;
    }
    if (bLabels.length > 0) {
      html += `<br><span style="font-size:11px;opacity:0.7">状态效果: ${bLabels.map(b => b.text).join(', ')}</span>`;
    }
    document.getElementById('dungeon-prep-power').innerHTML = html;
  };

  foodSelect.addEventListener('change', _updatePrepPower);
  _updatePrepPower();

  const strategyEl = document.getElementById('dungeon-strategy-select');
  if (strategyEl) {
    strategyEl.innerHTML = '';
    const strategies = [
      { id: 'brave', label: '勇往直前', desc: '战力+5，胜率-5%', powerMod: 5, chanceMod: -0.05 },
      { id: 'careful', label: '谨慎应战', desc: '胜率+10%', powerMod: 0, chanceMod: 0.10 },
      { id: 'together', label: '并肩作战', desc: '羁绊越高越强', powerMod: Math.floor(WorldState.getBond().score / 10), chanceMod: 0 },
    ];
    for (const s of strategies) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.label} — ${s.desc}`;
      strategyEl.appendChild(opt);
    }
    strategyEl.addEventListener('change', _updatePrepPower);
  }

  const choicesEl = document.getElementById('dungeon-battle-choices');
  choicesEl.innerHTML = '';
  const resultEl = document.getElementById('dungeon-battle-result');
  resultEl.innerHTML = '';
  resultEl.classList.add('hidden');
  document.getElementById('btn-dungeon-battle-close').classList.add('hidden');

  for (const choice of boss.choices) {
    const btn = document.createElement('button');
    btn.className = 'chat-choice-btn boss-choice-btn';
    btn.textContent = choice.text;
    btn.addEventListener('click', () => {
      _executeDungeonBattle(boss, choice, foodSelect.value);
    });
    choicesEl.appendChild(btn);
  }

  document.getElementById('dungeon-battle-prep').classList.remove('hidden');
  document.getElementById('dungeon-battle-modal').classList.remove('hidden');
}

function _executeDungeonBattle(boss, choice, foodId) {
  const choicesEl = document.getElementById('dungeon-battle-choices');
  choicesEl.innerHTML = '';
  document.getElementById('dungeon-battle-prep').classList.add('hidden');

  let foodBonus = 0;
  if (foodId && recipesData[foodId]) {
    foodBonus = recipesData[foodId].battleBonus || 0;
    WorldState.removeItem(foodId, 1);
  }

  const strategyEl = document.getElementById('dungeon-strategy-select');
  let strategyPowerMod = 0;
  let strategyChanceMod = 0;
  if (strategyEl) {
    const sid = strategyEl.value;
    if (sid === 'brave') { strategyPowerMod = 5; strategyChanceMod = -0.05; }
    else if (sid === 'careful') { strategyChanceMod = 0.10; }
    else if (sid === 'together') { strategyPowerMod = Math.floor(WorldState.getBond().score / 10); }
  }

  const rawState = WorldState.getRawState();
  const sk = rawState.lobster.skills || {};
  const skillExtra = choice.skillWeight ? Math.round((sk[choice.skillWeight] || 0) * 0.5) : 0;
  const combatPower = _calcCombatPower(rawState, (choice.strategyBonus || 0) + skillExtra + strategyPowerMod, foodBonus);
  let winChance = _calcWinChance(combatPower, boss.difficulty);
  winChance = Math.max(0.01, Math.min(0.99, winChance + strategyChanceMod));
  const won = Math.random() < winChance;

  if (WorldState.hasActiveBuff('lucky_star')) {
    WorldState.consumeLuckyStar();
  }

  WorldState.recordBossAttempt(boss.id);

  const resultEl = document.getElementById('dungeon-battle-result');
  resultEl.classList.remove('hidden');

  if (won) {
    WorldState.recordBossWin(boss.id, boss.tier);
    const rewards = boss.rewards.win || {};
    const rewardParts = [];
    if (rewards.item) { WorldState.addItem(rewards.item, 1); rewardParts.push(`获得 ${itemsData[rewards.item]?.name || rewards.item}`); }
    if (rewards.shells) { WorldState.addShells(rewards.shells); rewardParts.push(`+${rewards.shells} 贝壳`); }
    if (rewards.exp) { WorldState.addExp(rewards.exp); rewardParts.push(`+${rewards.exp} 经验`); }
    if (rewards.skill) { WorldState.modifySkill(rewards.skill, 1); rewardParts.push(`${rewards.skill} +1`); }

    resultEl.innerHTML = `<div class="dungeon-result-win"><div class="dungeon-result-title">🏆 胜利！</div><div class="dungeon-result-text">${choice.winText}</div><div class="dungeon-result-rewards">${rewardParts.join(' | ')}</div><div class="dungeon-result-stats">战力 ${combatPower} vs 难度 ${boss.difficulty} | 胜率 ${Math.round(winChance * 100)}%</div></div>`;
  } else {
    WorldState.recordBossLoss();
    const rewards = boss.rewards.lose || {};
    if (rewards.exp) WorldState.addExp(rewards.exp);
    if (rewards.mood) WorldState.modifyStat('mood', rewards.mood);
    if (rewards.energy) WorldState.modifyStat('energy', rewards.energy);

    resultEl.innerHTML = `<div class="dungeon-result-lose"><div class="dungeon-result-title">💔 惜败</div><div class="dungeon-result-text">${choice.loseText}</div><div class="dungeon-result-stats">战力 ${combatPower} vs 难度 ${boss.difficulty} | 胜率 ${Math.round(winChance * 100)}%</div></div>`;
  }

  WorldState.updateAdaptiveDifficulty(won);
  if (won) WorldState.incrementStat('combatWins');
  WorldState.clampStats();
  _checkAchievements();
  SaveSystem.save(WorldState.getRawState());
  document.getElementById('btn-dungeon-battle-close').classList.remove('hidden');
}

// --- Auto-Pilot System ---

function initAutoPilot() {
  AutoPilot.init({
    itemsData,
    recipesData,
    get mudCooldown() { return _mudCooldown; },
    dungeonBosses: _dungeonBosses,
    calcCombatPower: (raw) => _calcCombatPower(raw),
    harvestPlot,
    waterPlot,
    plantSeed,
    triggerMudScene: _triggerMudSceneForAutoPilot,
    executeDungeonBattle: _executeDungeonBattleForAutoPilot,
  });

  AutoPilot.onMessage((text) => {
    _appendLocalChatMsg('lobster', text, 'autopilot');
  });

  AutoPilot.onStateChange((active) => {
    const btn = document.getElementById('btn-autopilot');
    if (!btn) return;
    const icon = btn.querySelector('.autopilot-icon');
    const label = btn.querySelector('.autopilot-label');
    if (active) {
      btn.classList.add('autopilot-active');
      icon.textContent = '🤖';
      label.textContent = '龙虾自动驾驶中';
      document.getElementById('action-bar')?.classList.add('action-bar-dimmed');
    } else {
      btn.classList.remove('autopilot-active');
      icon.textContent = '🤚';
      label.textContent = '手动操控中';
      document.getElementById('action-bar')?.classList.remove('action-bar-dimmed');
    }
  });

  const btn = document.getElementById('btn-autopilot');
  if (btn) {
    btn.addEventListener('click', () => AutoPilot.toggle());
    if (AutoPilot.active) {
      btn.classList.add('autopilot-active');
      btn.querySelector('.autopilot-icon').textContent = '🤖';
      btn.querySelector('.autopilot-label').textContent = '龙虾自动驾驶中';
      document.getElementById('action-bar')?.classList.add('action-bar-dimmed');
    }
  }
}

function _triggerMudSceneForAutoPilot() {
  if (_mudScenes.length === 0) return null;
  if (_mudCooldown > Date.now()) return null;

  const rawState = WorldState.getRawState();
  const level = rawState.lobster.level;
  const bossScenes = _mudScenes.filter(s => s.type === 'boss' && level >= (s.minLevel || 1));
  const normalScenes = _mudScenes.filter(s => s.type !== 'boss');

  let scene = null;
  if (level >= 3 && bossScenes.length > 0) {
    const pityBonus = Math.max(0, (_mudSinceLastBoss - CONFIG.BOSS_MINI_PITY) * 0.1);
    const bossChance = CONFIG.BOSS_MINI_CHANCE + pityBonus;
    if (Math.random() < bossChance) {
      const available = bossScenes.filter(b => WorldState.canAttemptBoss(b.id));
      if (available.length > 0) {
        scene = available[Math.floor(Math.random() * available.length)];
        _mudSinceLastBoss = 0;
      }
    }
  }

  if (!scene) {
    scene = normalScenes[Math.floor(Math.random() * normalScenes.length)];
    _mudSinceLastBoss++;
  }

  if (!scene) return null;
  _mudCooldown = Date.now() + MUD_COOLDOWN_MS;

  const container = document.getElementById('chat-messages');
  const choicesEl = document.getElementById('chat-choices');

  if (scene.type === 'boss') {
    _appendLocalChatMsg('lobster', `⚔️ 遇到了Boss：${scene.name}！`, 'autopilot');

    return {
      scene,
      clickChoice(idx) {
        const choice = scene.choices[idx] || scene.choices[0];
        const inv = WorldState.getInventory();
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
        if (container && choicesEl) {
          const empty = container.querySelector('.chat-empty');
          if (empty) empty.remove();
          _showBossEncounter(scene, container, choicesEl);
          choicesEl.classList.add('hidden');
        }
        _resolveBossChoice(scene, choice, container, bestFoodId);
      }
    };
  } else {
    _appendLocalChatMsg('lobster', `🗺️ ${scene.name}：${scene.narration.slice(0, 40)}...`, 'autopilot');

    return {
      scene,
      clickChoice(idx) {
        const choice = scene.choices[idx] || scene.choices[0];
        if (container && choicesEl) {
          const empty = container.querySelector('.chat-empty');
          if (empty) empty.remove();
          _showNormalMudScene(scene, container, choicesEl);
          choicesEl.classList.add('hidden');
        }
        _resolveMudChoice(choice, container);
      }
    };
  }
}

function _executeDungeonBattleForAutoPilot(boss, choice, foodId) {
  let foodBonus = 0;
  if (foodId && recipesData[foodId]) {
    foodBonus = recipesData[foodId].battleBonus || 0;
    WorldState.removeItem(foodId, 1);
  }

  const rawState = WorldState.getRawState();
  const sk = rawState.lobster.skills || {};
  const skillExtra = choice.skillWeight ? Math.round((sk[choice.skillWeight] || 0) * 0.5) : 0;
  const combatPower = _calcCombatPower(rawState, (choice.strategyBonus || 0) + skillExtra, foodBonus);
  const winChance = _calcWinChance(combatPower, boss.difficulty);
  const won = Math.random() < winChance;

  if (WorldState.hasActiveBuff('lucky_star')) {
    WorldState.consumeLuckyStar();
  }

  WorldState.recordBossAttempt(boss.id);
  EmpathyTracker.recordBattle(won, boss.name);
  if (won) _trackCoopProgress('battle', 'lobster');

  const rewardParts = [];
  if (won) {
    WorldState.recordBossWin(boss.id, boss.tier);
    const rewards = boss.rewards.win || {};
    if (rewards.item) { WorldState.addItem(rewards.item, 1); rewardParts.push(`${itemsData[rewards.item]?.name || rewards.item}`); }
    if (rewards.shells) { WorldState.addShells(rewards.shells); rewardParts.push(`+${rewards.shells}贝壳`); }
    if (rewards.exp) { WorldState.addExp(rewards.exp); rewardParts.push(`+${rewards.exp}经验`); }
    if (rewards.skill) { WorldState.modifySkill(rewards.skill, 1); }
  } else {
    WorldState.recordBossLoss();
    const rewards = boss.rewards.lose || {};
    if (rewards.exp) WorldState.addExp(rewards.exp);
    if (rewards.mood) WorldState.modifyStat('mood', rewards.mood);
    if (rewards.energy) WorldState.modifyStat('energy', rewards.energy);
  }

  WorldState.clampStats();
  SaveSystem.save(WorldState.getRawState());

  return { won, rewardText: rewardParts.join('、') };
}

// --- Lobster API Bridge ---

function _apiWrap(fn) {
  try { const data = fn(); return { ok: true, data: data ?? null }; }
  catch (e) { return { ok: false, error: e.message }; }
}

window.__LOBSTER_API = {
  getState() {
    return _apiWrap(() => WorldState.getState());
  },

  getStatus() {
    return _apiWrap(() => {
      const s = WorldState.getState();
      const l = s.lobster;
      const lastAction = l.memory?.[0]?.action || 'none';
      return {
        name: l.name, personality: l.personality, level: l.level, exp: l.exp,
        mood: l.mood, energy: l.energy, hunger: l.hunger,
        shells: s.shells, day: s.world.dayCount, tick: s.world.tickCount,
        season: s.world.season, weather: s.world.weather, timeOfDay: s.world.timeOfDay,
        lastAction,
        traveling: Boolean(l.traveling),
        travelDestination: l.traveling?.destination || null,
        farmPlots: s.farm.plots.length,
        farmPlanted: s.farm.plots.filter(p => p.crop).length,
        farmRipe: s.farm.plots.filter(p => p.crop && p.growthStage >= p.maxGrowth).length,
        visitor: s.world.currentVisitor?.name || null,
      };
    });
  },

  getInventory() {
    return _apiWrap(() => WorldState.getInventory());
  },

  getDiary(n = 10) {
    return _apiWrap(() => {
      const log = WorldState.getState().eventLog || [];
      return log.slice(-n);
    });
  },

  tick() {
    return _apiWrap(() => {
      GameLoop.tick();
      return WorldState.getState().lobster;
    });
  },

  feed(itemId) {
    return _apiWrap(() => {
      const edibles = EDIBLE_FOODS;
      const info = edibles[itemId];
      if (!info) throw new Error(`unknown food: ${itemId}`);
      if ((WorldState.getInventory()[itemId] || 0) <= 0) throw new Error(`no ${itemId} in inventory`);
      feedLobster(itemId, info);
      return { fed: itemId, mood: WorldState.getLobster().mood, hunger: WorldState.getLobster().hunger };
    });
  },

  plant(seedId, plotIndex) {
    return _apiWrap(() => {
      const farm = WorldState.getFarm();
      const idx = plotIndex ?? farm.plots.findIndex(p => !p.crop);
      if (idx < 0) throw new Error('no empty plot');
      if ((WorldState.getInventory()[seedId] || 0) <= 0) throw new Error(`no ${seedId} in inventory`);
      plantSeed(seedId, idx);
      return { planted: seedId, plot: idx };
    });
  },

  harvest(plotIndex) {
    return _apiWrap(() => {
      const ok = harvestPlot(plotIndex ?? -1);
      return { harvested: Boolean(ok) };
    });
  },

  water(plotIndex) {
    return _apiWrap(() => {
      const ok = waterPlot(plotIndex ?? -1);
      return { watered: Boolean(ok) };
    });
  },

  suggest(action) {
    return _apiWrap(() => {
      const valid = ['rest', 'eat', 'farm', 'cook', 'explore', 'socialize', 'travel'];
      if (!valid.includes(action)) throw new Error(`invalid action: ${action}. Valid: ${valid.join(',')}`);
      pendingSuggestion = action;
      GameLoop.tick();
      pendingSuggestion = null;
      return { suggested: action, state: WorldState.getState().lobster };
    });
  },

  pet() {
    return _apiWrap(() => {
      petLobster();
      return { mood: WorldState.getLobster().mood };
    });
  },

  buyItem(shopIndex) {
    return _apiWrap(() => {
      const ok = WorldState.buyFromShop(shopIndex);
      if (!ok) throw new Error('purchase failed (sold out or insufficient shells)');
      SaveSystem.save(WorldState.getRawState());
      return { bought: true, shells: WorldState.getShells() };
    });
  },

  getShopStock() {
    return _apiWrap(() => {
      const shop = WorldState.getShop();
      return (shop.dailyStock || []).map((item, i) => ({
        index: i, id: item.id, price: item.price, sold: item.sold,
        name: (itemsData[item.id] || {}).name || item.id,
      }));
    });
  },

  startTravel(destination) {
    return _apiWrap(() => {
      const dests = CONFIG.DESTINATIONS;
      if (!dests[destination]) throw new Error(`unknown destination: ${destination}. Valid: ${Object.keys(dests).join(',')}`);
      const l = WorldState.getLobster();
      if (l.level < dests[destination].minLevel) throw new Error(`level too low (need ${dests[destination].minLevel})`);
      if (WorldState.isTraveling()) throw new Error('already traveling');
      const inv = WorldState.getInventory();
      if (!inv.backpack || !inv.snack_pack) throw new Error('need backpack and snack_pack');
      WorldState.removeItem('backpack', 1);
      WorldState.removeItem('snack_pack', 1);
      WorldState.startTravel(destination, 3);
      SaveSystem.save(WorldState.getRawState());
      return { traveling: true, destination, returnIn: 3 };
    });
  },

  writeDiary(text) {
    return _apiWrap(() => {
      if (!text) throw new Error('empty text');
      WorldState.addEvent({
        id: `agent_diary_${Date.now()}`,
        tick: WorldState.getWorld().tickCount,
        type: 'diary',
        title: '龙虾手记',
        description: text,
      });
      SaveSystem.save(WorldState.getRawState());
      return { written: true };
    });
  },

  triggerAdventure() {
    return _apiWrap(() => {
      triggerMudScene();
      return { triggered: true };
    });
  },

  isReady() { return true; },
};

window.addEventListener('beforeunload', () => { EmpathyTracker.flushOnlineTime(); });

// --- Boot ---

boot().catch(err => {
  console.error('启动失败:', err);
  document.body.innerHTML = `<div style="padding:40px;color:#ff6b4a;text-align:center;">
    <h2>启动失败</h2>
    <p>游戏加载时遇到了问题</p>
    <p style="color:#8899aa;font-size:13px;">请通过网页服务器访问本页面，不能直接双击打开文件。</p>
    <p style="color:#556677;font-size:11px;margin-top:12px;">错误详情：${err.message}</p>
  </div>`;
});
