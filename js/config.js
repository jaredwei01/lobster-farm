export const CONFIG = {
  TICK_INTERVAL_MS: 10 * 60 * 1000,
  TICKS_PER_DAY: 6,
  DAYS_PER_SEASON: 7,
  SEASONS: ['spring', 'summer', 'autumn', 'winter'],
  SEASON_LABELS: { spring: '春', summer: '夏', autumn: '秋', winter: '冬' },
  WEATHER_POOLS: {
    spring: ['sunny', 'rainy', 'breezy'],
    summer: ['sunny', 'hot', 'stormy'],
    autumn: ['cloudy', 'windy', 'foggy'],
    winter: ['snowy', 'cold', 'clear'],
  },
  WEATHER_LABELS: {
    sunny: '☀️ 晴天', rainy: '🌧️ 雨天', breezy: '🍃 微风',
    hot: '🔥 酷热', stormy: '⛈️ 暴风', cloudy: '☁️ 多云',
    windy: '💨 大风', foggy: '🌫️ 雾天', snowy: '❄️ 雪天',
    cold: '🥶 寒冷', clear: '✨ 晴朗',
  },
  TIME_OF_DAY: ['morning', 'morning', 'afternoon', 'afternoon', 'evening', 'night'],
  TIME_LABELS: { morning: '🌅 早晨', afternoon: '☀️ 午后', evening: '🌇 傍晚', night: '🌙 夜晚' },

  LOBSTER_MAX_STAT: 100,
  LOBSTER_MAX_LEVEL: 50,
  LOBSTER_MAX_SKILL: 30,
  MEMORY_SIZE: 30,
  EXP_BASE: 80,
  EXP_GROWTH_FACTOR: 0.15,

  FARM_INITIAL_PLOTS: 4,
  FARM_MAX_PLOTS: 12,

  MOOD_SEASON_BASE: { spring: 5, summer: 0, autumn: 3, winter: -5 },
  HUNGER_PER_TICK: 8,
  ENERGY_REST_GAIN: 30,

  MAX_EVENTS_PER_TICK: 2,
  EVENT_LOG_MAX: 200,
  CATCHUP_MAX_TICKS: 20,

  STAT_TIERS: {
    mood: [
      { name: '低落', emoji: '😭', min: 0, max: 20, expMult: -0.20, winMult: -0.15 },
      { name: '平静', emoji: '😐', min: 21, max: 50, expMult: 0, winMult: 0 },
      { name: '愉快', emoji: '😊', min: 51, max: 80, expMult: 0.10, winMult: 0.10 },
      { name: '极乐', emoji: '🥰', min: 81, max: 100, expMult: 0.20, winMult: 0.20 },
    ],
    energy: [
      { name: '疲惫', emoji: '😵', min: 0, max: 15, actionFail: 0.25, efficiency: -0.25 },
      { name: '疲倦', emoji: '😪', min: 16, max: 40, actionFail: 0, efficiency: -0.10 },
      { name: '充沛', emoji: '💪', min: 41, max: 70, actionFail: 0, efficiency: 0 },
      { name: '亢奋', emoji: '⚡', min: 71, max: 100, actionFail: 0, efficiency: 0.15 },
    ],
    hunger: [
      { name: '饱足', emoji: '😋', min: 0, max: 30, moodTick: 0, cookBonus: 0.10 },
      { name: '微饿', emoji: '🍽️', min: 31, max: 60, moodTick: -1, cookBonus: 0 },
      { name: '饥饿', emoji: '🥵', min: 61, max: 100, moodTick: -3, cookBonus: 0 },
    ],
  },

  SKILL_MILESTONES: {
    farming:  [5, 15, 25],
    cooking:  [5, 15, 25],
    exploring:[5, 15, 25],
    social:   [5, 15, 25],
  },

  DESTINATIONS: {
    beach:     { name: '阳光海滩', icon: '🏖️', minLevel: 6 },
    mountain:  { name: '山间湖泊', icon: '🏔️', minLevel: 6 },
    city:      { name: '人类城市', icon: '🏙️', minLevel: 10 },
    deepsea:   { name: '深海秘境', icon: '🌊', minLevel: 16 },
    hotspring: { name: '海底温泉', icon: '♨️', minLevel: 10 },
  },

  TRAVEL_REQUIREMENTS: ['backpack', 'snack_pack'],
  TRAVEL_EXP_BONUS: 15,
  VISITOR_BASE_CHANCE: 0.15,

  FESTIVALS: [
    { id: 'spring_fest', name: '春之祭', season: 'spring', day: 1, icon: '🌸', expBonus: 20, shellBonus: 30, specialItem: 'coral_rose_seed' },
    { id: 'sea_day', name: '海之日', season: 'summer', day: 4, icon: '🌊', expBonus: 25, shellBonus: 40, specialItem: 'golden_shard' },
    { id: 'harvest_fest', name: '丰收节', season: 'autumn', day: 7, icon: '🍂', expBonus: 30, shellBonus: 50, specialItem: 'exp_book_m' },
    { id: 'starlight', name: '星光夜', season: 'winter', day: 5, icon: '✨', expBonus: 35, shellBonus: 60, specialItem: 'lucky_star' },
  ],

  SHOP_STOCK_SIZE: 6,
  SHOP_POOLS: {
    seed: ['seaweed_seed', 'coral_rose_seed', 'sun_kelp_seed', 'amber_moss_seed', 'frost_pearl_seed'],
    ingredient: ['salt', 'sugar', 'kelp_flour', 'plankton', 'seaweed'],
    travel: ['backpack', 'snack_pack', 'map', 'compass'],
    decoration: ['lantern', 'rock_garden', 'wind_chime', 'mini_lighthouse'],
    consumable: ['exp_book_s', 'energy_potion', 'mood_potion'],
  },

  PREFERENCE_THRESHOLD_FOOD: 5,
  PREFERENCE_THRESHOLD_PLACE: 3,
  PREFERENCE_MOOD_BONUS: 5,

  BOSS_MINI_CHANCE: 0.20,
  BOSS_MINI_PITY: 3,
  COMBAT_POWER_WEIGHTS: {
    level: 2,
    exploring: 1.5,
    cooking: 0.8,
    social: 0.5,
    farming: 0.3,
  },
  WIN_CHANCE_FACTOR: 0.04,
  WIN_CHANCE_BASE: 0.5,
  WIN_CHANCE_MIN: 0.05,
  WIN_CHANCE_MAX: 0.95,

  ZHIPU_KEY: '0785add4f2784f809fb3e59d70715d18.Iw7DrHDc2GKVxdh0',
  SAVE_KEY: 'lobster_farm_save',
  VERSION: '0.5.1',
};

export const ACTION_LABELS = {
  rest: '💤 休息', eat: '🍽️ 进食', farm: '🌱 种植',
  cook: '🍳 烹饪', explore: '🔍 探索', shop: '🏪 购物',
  travel: '✈️ 旅行', socialize: '💬 社交',
};

export const PERSONALITY_LABELS = {
  adventurous: '🧭 冒险型', lazy: '😴 懒惰型', gluttonous: '🍖 贪吃型',
  scholarly: '📚 学者型', social: '🤝 社交型', mischievous: '😈 调皮型',
};

export const GROWTH_STAGES = [
  { name: '幼体', emoji: '🦐', minLevel: 1, maxLevel: 5, farmPlots: 4, unlocks: ['基础农田', '基础烹饪'] },
  { name: '少年', emoji: '🦞', minLevel: 6, maxLevel: 15, farmPlots: 6, unlocks: ['探索系统', '商店扩展', '小屋基础家具'] },
  { name: '成年', emoji: '🦞', minLevel: 16, maxLevel: 35, farmPlots: 9, unlocks: ['高级食谱', '稀有事件', '小屋装修', '金色工坊扩展'] },
  { name: '长老', emoji: '🎩', minLevel: 36, maxLevel: 50, farmPlots: 12, unlocks: ['传说事件', '导师系统', '小屋满级形态'] },
];

export const CHECKIN_REWARDS = [
  { shells: 10, label: '10 贝壳' },
  { items: [{ id: 'seaweed_seed', count: 1 }], label: '海苔种子 ×1' },
  { shells: 20, label: '20 贝壳' },
  { items: [{ id: 'exp_book_s', count: 1 }], label: '经验书(小) ×1' },
  { shells: 30, label: '30 贝壳' },
  { items: [{ id: 'energy_potion', count: 1 }, { id: 'mood_potion', count: 1 }], label: '精力药水 + 心情药水' },
  { shells: 50, items: [{ id: 'lucky_star', count: 1 }], label: '50 贝壳 + 幸运星 ⭐' },
];

export const SHOP_SPECIALS = [
  'lucky_charm', 'growth_potion', 'weather_stone', 'exp_accelerator',
  'skill_scroll_exploring', 'skill_scroll_cooking', 'skill_scroll_social',
  'rainbow_anemone_seed', 'exp_book_m', 'exp_book_l',
];

export const FISHING_REWARDS = {
  perfect: { shells: 15, exp: 12, items: ['pearl_dust', 'crystal', 'deep_sea_pearl'], label: '完美！' },
  good:    { shells: 8,  exp: 8,  items: ['coral_fragment', 'glowing_algae', 'shell_necklace'], label: '不错！' },
  ok:      { shells: 3,  exp: 4,  items: ['seaweed', 'plankton', 'salt'], label: '凑合~' },
  miss:    { shells: 0,  exp: 0,  items: [], label: '跑了...' },
};

export const FISHING_CONFIG = {
  maxAttemptsPerDay: 3,
  energyCost: 5,
  minLevel: 6,
};

export const ACHIEVEMENT_DEFS = [
  { id: 'feed_10',     cat: 'nurture',  icon: '🍽️', name: '初级饲养员', desc: '喂食10次', target: 10, stat: 'totalFeeds' },
  { id: 'feed_50',     cat: 'nurture',  icon: '🍽️', name: '资深饲养员', desc: '喂食50次', target: 50, stat: 'totalFeeds' },
  { id: 'feed_200',    cat: 'nurture',  icon: '🍽️', name: '美食大师', desc: '喂食200次', target: 200, stat: 'totalFeeds' },
  { id: 'pet_10',      cat: 'nurture',  icon: '🤚', name: '初次抚摸', desc: '摸摸10次', target: 10, stat: 'totalPets' },
  { id: 'pet_50',      cat: 'nurture',  icon: '🤚', name: '温柔的手', desc: '摸摸50次', target: 50, stat: 'totalPets' },
  { id: 'pet_200',     cat: 'nurture',  icon: '🤚', name: '最佳陪伴', desc: '摸摸200次', target: 200, stat: 'totalPets' },
  { id: 'harvest_10',  cat: 'farm',     icon: '🌾', name: '新手农夫', desc: '收获10次', target: 10, stat: 'totalHarvests' },
  { id: 'harvest_50',  cat: 'farm',     icon: '🌾', name: '丰收之手', desc: '收获50次', target: 50, stat: 'totalHarvests' },
  { id: 'harvest_200', cat: 'farm',     icon: '🌾', name: '农田之王', desc: '收获200次', target: 200, stat: 'totalHarvests' },
  { id: 'all_crops',   cat: 'farm',     icon: '🌈', name: '全品种大师', desc: '种过所有6种作物', target: 6, stat: 'cropTypes' },
  { id: 'golden_harvest', cat: 'farm',  icon: '✨', name: '黄金收获', desc: '收获黄金作物', target: 1, stat: 'goldenHarvests' },
  { id: 'travel_all',  cat: 'explorer', icon: '🗺️', name: '环游世界', desc: '去过所有5个目的地', target: 5, stat: 'destVisited' },
  { id: 'postcards_10',cat: 'explorer', icon: '📮', name: '明信片收藏家', desc: '收集10张明信片', target: 10, stat: 'postcardCount' },
  { id: 'mud_5',       cat: 'explorer', icon: '🏔️', name: '冒险新手', desc: '完成5次MUD探险', target: 5, stat: 'totalMudScenes' },
  { id: 'mud_30',      cat: 'explorer', icon: '🏔️', name: '探险达人', desc: '完成30次MUD探险', target: 30, stat: 'totalMudScenes' },
  { id: 'first_combat',cat: 'combat',   icon: '⚔️', name: '初战告捷', desc: '赢得第一场战斗', target: 1, stat: 'combatWins' },
  { id: 'tier_4',      cat: 'combat',   icon: '🏰', name: '深海勇者', desc: '通关第4层', target: 4, stat: 'highestTier' },
  { id: 'tier_6',      cat: 'combat',   icon: '🏰', name: '深渊征服者', desc: '通关第6层', target: 6, stat: 'highestTier' },
  { id: 'tier_8',      cat: 'combat',   icon: '🏰', name: '海神挑战者', desc: '通关第8层', target: 8, stat: 'highestTier' },
  { id: 'stamps_all',  cat: 'social',   icon: '📬', name: '印章大师', desc: '收集全部5个印章', target: 5, stat: 'stampCount' },
  { id: 'coop_5',      cat: 'social',   icon: '🤝', name: '默契搭档', desc: '完成5次协作任务', target: 5, stat: 'coopCompleted' },
  { id: 'sealife_7',   cat: 'collector',icon: '🔍', name: '海洋观察者', desc: '发现7种海洋生物', target: 7, stat: 'seaLifeCount' },
  { id: 'sealife_14',  cat: 'collector',icon: '🔍', name: '海洋博物学家', desc: '发现全部14种', target: 14, stat: 'seaLifeCount' },
  { id: 'recipes_6',   cat: 'collector',icon: '📖', name: '厨艺入门', desc: '解锁6个食谱', target: 6, stat: 'recipeCount' },
  { id: 'recipes_12',  cat: 'collector',icon: '📖', name: '食谱全书', desc: '解锁全部12个食谱', target: 12, stat: 'recipeCount' },
  { id: 'fish_1',      cat: 'collector',icon: '🎣', name: '初次垂钓', desc: '钓到第一条鱼', target: 1, stat: 'totalFishCatches' },
  { id: 'fish_20',     cat: 'collector',icon: '🎣', name: '钓鱼达人', desc: '钓到20条鱼', target: 20, stat: 'totalFishCatches' },
  { id: 'streak_7',    cat: 'dedication',icon: '📅', name: '一周坚持', desc: '连续签到7天', target: 7, stat: 'checkinStreak' },
  { id: 'streak_30',   cat: 'dedication',icon: '📅', name: '月度陪伴', desc: '连续签到30天', target: 30, stat: 'checkinStreak' },
  { id: 'level_max',   cat: 'dedication',icon: '👑', name: '满级传说', desc: '达到50级', target: 50, stat: 'level' },
];

export const SEA_CREATURE_CATALOG = {
  'big-fish':    { name: '大鱼', emoji: '🐟', desc: '悠闲游过的深海大鱼', rarity: 'common' },
  'jellyfish':   { name: '水母', emoji: '🪼', desc: '透明飘逸的海中精灵', rarity: 'common' },
  'starfish':    { name: '海星', emoji: '⭐', desc: '五角形的海底慢行者', rarity: 'common' },
  'crab':        { name: '螃蟹', emoji: '🦀', desc: '横行霸道的小家伙', rarity: 'common' },
  'turtle':      { name: '海龟', emoji: '🐢', desc: '百年长寿的海洋智者', rarity: 'uncommon' },
  'seahorse':    { name: '海马', emoji: '🐴', desc: '直立游泳的奇妙生物', rarity: 'common' },
  'pufferfish':  { name: '河豚', emoji: '🐡', desc: '生气就会膨胀的圆球', rarity: 'uncommon' },
  'eel':         { name: '鳗鱼', emoji: '🐍', desc: '在暗礁间穿梭的猎手', rarity: 'uncommon' },
  'manta':       { name: '蝠鲼', emoji: '🦅', desc: '展翅滑翔的海底巨翼', rarity: 'rare' },
  'clownfish':   { name: '小丑鱼', emoji: '🐠', desc: '色彩斑斓的珊瑚居民', rarity: 'common' },
  'octopus':     { name: '章鱼', emoji: '🐙', desc: '八臂智者，伪装大师', rarity: 'uncommon' },
  'whale':       { name: '鲸鱼', emoji: '🐋', desc: '海洋中最壮观的存在', rarity: 'rare' },
  'anglerfish':  { name: '灯笼鱼', emoji: '🔦', desc: '深海中提灯的孤独旅者', rarity: 'rare' },
  'fish-school': { name: '鱼群', emoji: '🐟', desc: '成群结队的银色闪光', rarity: 'common' },
};
