import { CONFIG } from './config.js';

// Ollama (local, on same server) → 智谱 GLM-5 (cloud fallback)
const OLLAMA_BASE = '/lobster-farm/ollama';
const OLLAMA_MODEL = 'qwen2.5:3b';
const OLLAMA_TIMEOUT_CHAT = 15000;
const OLLAMA_TIMEOUT_WARMUP = 180000;

const ZHIPU_BASE = 'https://open.bigmodel.cn/api/coding/paas/v4';
const ZHIPU_KEY = CONFIG?.ZHIPU_KEY || localStorage.getItem('lobster_zhipu_key') || '';
const ZHIPU_MODEL = 'glm-4-flash';

const SYSTEM_PROMPT = `你是一只住在海底世界里的龙虾，名叫{{name}}，性格是{{personalityLabel}}。
{{stagePersona}}
每次回复控制在1-3句话。不要用括号描述动作，直接说话就好。可以适当使用颜文字但不要过多。

当前状态：
- 等级 Lv.{{level}}（{{stageName}}），心情{{moodDesc}}，精力{{energyDesc}}，饱腹{{hungerDesc}}
- 季节：{{season}}，天气：{{weather}}，时间：{{timeOfDay}}
- 生活了{{day}}天{{travelNote}}
- 和主人的羁绊：{{bondDesc}}
{{progressBlock}}
{{memoriesBlock}}
{{empathyBlock}}`;

const EMPATHY_PROMPT_HEADER = `
主人近况（自然地融入对话，不要复述数字，不要说教）：
`;
const EMPATHY_RULES = `
规则：
- 可以说"今天陪我好久"而不是"你在线了45分钟"
- 可以说"今天辛苦了，做了好多事"而不是"你完成了9个任务"
- 如果主人很久没来，可以撒娇说想念，但不要指责
- 数据不足时不提，保持自然`;

const PERSONALITY_LABELS = {
  adventurous: '冒险型（好奇心旺盛，热爱探索）',
  lazy: '懒惰型（享受生活，热爱午睡）',
  gluttonous: '贪吃型（为美食而活）',
  scholarly: '学者型（善于观察，热爱思考）',
  social: '社交型（喜欢交朋友）',
  mischievous: '调皮型（小小的捣蛋鬼）',
};

let _chatHistory = [];
const MAX_HISTORY = 10;
let _ollamaOnline = false;
let _ollamaReady = false;
let _warmingUp = false;
let _lastProvider = 'unknown';

const _responseCache = new Map();
const CACHE_TTL = 60 * 60 * 1000;
const CACHE_MAX = 50;
let _dailyCalls = 0;
let _dailyCallsDate = '';
const DAILY_CALL_LIMIT = 30;

function _getCacheKey(messages) {
  const raw = messages.map(m => m.role + ':' + m.content).join('|');
  let h = 0;
  for (let i = 0; i < raw.length; i++) { h = ((h << 5) - h + raw.charCodeAt(i)) | 0; }
  return String(h);
}

function _checkCache(key) {
  const entry = _responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _responseCache.delete(key); return null; }
  return entry.text;
}

function _setCache(key, text) {
  if (_responseCache.size >= CACHE_MAX) {
    const oldest = _responseCache.keys().next().value;
    _responseCache.delete(oldest);
  }
  _responseCache.set(key, { text, ts: Date.now() });
}

function _checkRateLimit() {
  const today = new Date().toISOString().slice(0, 10);
  if (_dailyCallsDate !== today) { _dailyCalls = 0; _dailyCallsDate = today; }
  return _dailyCalls < DAILY_CALL_LIMIT;
}

function _recordCall() { _dailyCalls++; }

function _descMood(v) { return v >= 80 ? '非常好' : v >= 60 ? '不错' : v >= 40 ? '一般' : '有点低落'; }
function _descEnergy(v) { return v >= 70 ? '充沛' : v >= 40 ? '还行' : '有点累'; }
function _descHunger(v) { return v >= 60 ? '有点饿' : v >= 30 ? '还好' : '饱饱的'; }

function _descBond(score) {
  if (score >= 90) return '亲密无间';
  if (score >= 70) return '非常亲近';
  if (score >= 50) return '友好';
  if (score >= 30) return '有些疏远';
  return '陌生';
}

const STAGE_PERSONAS = {
  '幼体': `你还是个小虾米，对世界充满好奇。说话天真可爱，用简单的词，喜欢问"为什么"，对主人充满崇拜和依赖。会撒娇，偶尔说错词。`,
  '少年': `你正在长大，开始有自己的想法和小脾气。说话更自信，偶尔有点小叛逆但本质善良。会主动分享自己的发现，语气活泼。`,
  '成年': `你已经是一只成熟的龙虾了。说话温和稳重，会关心主人，偶尔分享冒险见闻和人生感悟。语气温暖，像一个可靠的朋友。`,
  '长老': `你是海底世界的智者。说话从容淡定，偶尔感慨时光，喜欢回忆和主人一起走过的日子。语气平和，带着哲理，像一位温柔的长辈。`,
};

function _buildStagePersona(stage) {
  return STAGE_PERSONAS[stage] || STAGE_PERSONAS['幼体'];
}

function _buildProgressBlock(ctx) {
  const lines = [];

  if (ctx.skills) {
    const sorted = Object.entries(ctx.skills).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const skillNames = { farming: '农耕', cooking: '烹饪', exploring: '探索', social: '社交' };
      const [topSkill, topLv] = sorted[0];
      const desc = topLv >= 20 ? '大师级' : topLv >= 10 ? '很擅长' : topLv >= 5 ? '有经验' : '刚入门';
      lines.push(`最擅长${skillNames[topSkill] || topSkill}（${desc}）`);
    }
  }

  if (ctx.achievements && ctx.achievements.length > 0) {
    lines.push(`最近获得的成就：${ctx.achievements.join('、')}`);
  }

  if (ctx.collections) {
    const c = ctx.collections;
    const parts = [];
    if (c.postcards > 0) parts.push(`${c.postcards}张明信片`);
    if (c.seaLife > 0) parts.push(`发现${c.seaLife}种海洋生物`);
    if (c.recipes > 0) parts.push(`会做${c.recipes}道菜`);
    if (parts.length > 0) lines.push(`收藏：${parts.join('，')}`);
  }

  if (lines.length === 0) return '';
  return `\n成长经历（可以自然融入对话，不要刻意罗列）：\n${lines.map(l => `- ${l}`).join('\n')}`;
}

function _buildMemoriesBlock(milestones) {
  if (!milestones || milestones.length === 0) return '';
  const recent = milestones.slice(-3);
  const lines = recent.map(m => `- ${m.text}（第${m.day}天）`);
  return `\n你们一起经历过：\n${lines.join('\n')}\n（可以自然地在对话中提起这些回忆，但不要每次都提）`;
}

function _buildEmpathyBlock(empathy, dungeon) {
  if (!empathy && !dungeon) return '';
  const lines = [];

  if (empathy) {
    if (empathy.workMin > 120 && empathy.taskCount >= 8) {
      lines.push('主人今天工作了很久，做了不少事情');
    } else if (empathy.workMin > 60) {
      lines.push('主人今天忙了一阵子');
    } else if (empathy.workMin > 0) {
      lines.push('主人今天稍微忙了一下');
    }

    if (empathy.lastActiveTime) {
      const hour = parseInt(empathy.lastActiveTime.split(':')[0], 10);
      if (hour >= 23 || hour < 5) lines.push('主人现在还在忙，很晚了');
      else if (hour >= 21) lines.push('主人忙到挺晚的');
    }

    if (empathy.moodHint === 'busy') lines.push('主人看起来比较忙碌');
    else if (empathy.moodHint === 'relaxed') lines.push('主人今天似乎比较轻松');

    if (empathy.streak >= 7) lines.push('主人最近每天都来看你，很有爱');
    else if (empathy.streak >= 3) lines.push('主人最近经常来看你');

    if (empathy.daysSinceLastVisit >= 7) lines.push('主人已经很久没来了，你很想念');
    else if (empathy.daysSinceLastVisit >= 3) lines.push('主人好几天没来了');

    if (empathy.onlineMin >= 30) lines.push('主人今天在游戏里陪了你好一会儿');
    else if (empathy.onlineMin >= 10) lines.push('主人今天来看了看你');

    if (empathy.chats >= 10) lines.push('主人今天和你聊了很多');
  }

  if (dungeon) {
    const totalWins = (dungeon.totalWins || 0) + Object.values(dungeon.mudBossDefeats || {}).reduce((a, b) => a + b, 0);
    const totalLosses = dungeon.totalLosses || 0;
    if (totalWins > 0 || totalLosses > 0) {
      if (totalLosses > totalWins) lines.push('最近战斗输多赢少，有点沮丧');
      else if (totalWins > 5) lines.push('最近战斗连连获胜，信心满满');
      else if (totalWins > 0) lines.push('最近打了几场胜仗，感觉不错');
    }
    if ((dungeon.highestTier || 0) >= 3) {
      lines.push(`已经征服了深海挑战第${dungeon.highestTier}层`);
    }
  }

  if (lines.length === 0) return '';
  return EMPATHY_PROMPT_HEADER + lines.map(l => `- ${l}`).join('\n') + '\n' + EMPATHY_RULES;
}

function _buildSystemPrompt(ctx) {
  const seasonMap = { spring: '春天', summer: '夏天', autumn: '秋天', winter: '冬天' };
  const weatherMap = { sunny: '晴天', rainy: '雨天', stormy: '暴风雨', cloudy: '多云', snowy: '下雪' };
  const timeMap = { morning: '早晨', afternoon: '下午', evening: '傍晚', night: '深夜' };

  const stage = ctx.stage || '幼体';
  return SYSTEM_PROMPT
    .replace('{{name}}', ctx.name || '龙虾')
    .replace('{{personalityLabel}}', PERSONALITY_LABELS[ctx.personality] || '冒险型')
    .replace('{{stagePersona}}', _buildStagePersona(stage))
    .replace('{{stageName}}', stage)
    .replace('{{level}}', ctx.level || 1)
    .replace('{{moodDesc}}', _descMood(ctx.mood || 50))
    .replace('{{energyDesc}}', _descEnergy(ctx.energy || 50))
    .replace('{{hungerDesc}}', _descHunger(ctx.hunger || 30))
    .replace('{{season}}', seasonMap[ctx.season] || '春天')
    .replace('{{weather}}', weatherMap[ctx.weather] || '晴天')
    .replace('{{timeOfDay}}', timeMap[ctx.timeOfDay] || '早晨')
    .replace('{{day}}', ctx.day || 1)
    .replace('{{travelNote}}', ctx.traveling ? '（正在外出旅行中）' : '')
    .replace('{{bondDesc}}', _descBond(ctx.bond || 50))
    .replace('{{progressBlock}}', _buildProgressBlock(ctx))
    .replace('{{memoriesBlock}}', _buildMemoriesBlock(ctx.milestones))
    .replace('{{empathyBlock}}', _buildEmpathyBlock(ctx.empathy, ctx.dungeon));
}

async function _callOllama(messages, timeout = OLLAMA_TIMEOUT_CHAT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        max_tokens: 200,
        temperature: 0.85,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) throw new Error(`Ollama ${resp.status}`);
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('empty');
    return text;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function _callZhipu(messages) {
  const resp = await fetch(`${ZHIPU_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZHIPU_KEY}`,
    },
    body: JSON.stringify({
      model: ZHIPU_MODEL,
      messages,
      max_tokens: 200,
      temperature: 0.85,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Zhipu ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const msg = data.choices?.[0]?.message;
  const text = msg?.content || msg?.reasoning_content || '';
  if (!text) throw new Error('empty zhipu response');
  return text;
}

async function _checkOllamaStatus() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(`${OLLAMA_BASE}/api/ps`, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) { _ollamaOnline = false; _ollamaReady = false; return; }

    _ollamaOnline = true;
    _ollamaReady = false;
  } catch {
    _ollamaOnline = false;
    _ollamaReady = false;
  }
}

function _warmUpOllama() {
  if (_warmingUp || _ollamaReady || !_ollamaOnline) return;
  _warmingUp = true;

  _callOllama([
    { role: 'user', content: '你好' },
  ], OLLAMA_TIMEOUT_WARMUP).then(() => {
    _ollamaReady = true;
    _warmingUp = false;
    _broadcastStatus('ollama');
  }).catch(() => {
    _warmingUp = false;
  });
}

let _statusCallback = null;

function _broadcastStatus(provider) {
  if (_statusCallback) _statusCallback(provider);
}

export const LLMClient = {
  enabled: false,

  get provider() { return _lastProvider; },
  get ollamaReady() { return _ollamaReady; },
  get warming() { return _warmingUp; },

  onProviderChange(cb) { _statusCallback = cb; },

  async init() {
    this.enabled = true;
    await _checkOllamaStatus();
    if (_ollamaOnline) {
      _warmUpOllama();
    }
  },

  async chat(userText, context) {
    _chatHistory.push({ role: 'user', content: userText });
    if (_chatHistory.length > MAX_HISTORY * 2) {
      _chatHistory = _chatHistory.slice(-MAX_HISTORY * 2);
    }

    const systemPrompt = _buildSystemPrompt(context);
    const messages = [
      { role: 'system', content: systemPrompt },
      ..._chatHistory,
    ];

    let reply = await this._callWithFallback(messages);
    if (!reply) { _chatHistory.pop(); throw new Error('LLM unavailable'); }

    _chatHistory.push({ role: 'assistant', content: reply });
    return reply;
  },

  async narrate(eventTitle, eventDescription, eventType, lobsterCtx) {
    if (!_checkRateLimit()) return null;
    const prompt = `你是一个温馨、治愈的龙虾 MUD 游戏的旁白叙述者。用温暖、略带奇幻的语气描述龙虾发生的事件。风格参考吉卜力工作室和动物森友会。

事件信息：
- 标题：${eventTitle}
- 描述：${eventDescription}
- 类型：${eventType}
- 龙虾名字：${lobsterCtx.name}，性格：${PERSONALITY_LABELS[lobsterCtx.personality] || '冒险型'}
- 季节：${lobsterCtx.season || '春天'}，天气：${lobsterCtx.weather || '晴天'}

风格指南：温暖、柔和、偶尔搞笑。简短有力——最多3句话。龙虾是可爱且略显笨拙的。

规则：仅返回有效 JSON。
返回格式：{"title":"3-6字标题","description":"1-3句叙述","lobsterReaction":"第一人称反应1句话","moodEffect":0}`;

    const messages = [{ role: 'user', content: prompt }];
    const cacheKey = _getCacheKey(messages);
    const cached = _checkCache(cacheKey);
    if (cached) return _parseNarration(cached);

    const raw = await this._callWithFallback(messages);
    if (!raw) return null;
    _recordCall();
    _setCache(cacheKey, raw);
    return _parseNarration(raw);
  },

  async generatePostcard(destination, destinationName, lobsterCtx) {
    if (!_checkRateLimit()) return null;
    const pLabel = PERSONALITY_LABELS[lobsterCtx.personality] || '冒险型';
    const prompt = `你是一只正在度假的龙虾，从旅途中写明信片寄回家。你用第一人称写作，性格为${pLabel}。

目的地：${destinationName}
龙虾名字：${lobsterCtx.name}
季节：${lobsterCtx.season || '春天'}

风格指南：
- 像在小小的明信片上用微型字体潦草写下的
- 最多 2-4 句话
- 包含一个具体的感官细节
- 偶尔提到想家或想念农场
- 有时包含一个小涂鸦描述，如 [画了一个小小的日落]

规则：仅返回有效 JSON。
返回格式：{"greeting":"简短问候","message":"2-4句主要内容","doodle":"小涂鸦描述","souvenir":"纪念品名称","rarity":"common"}`;

    const messages = [{ role: 'user', content: prompt }];
    const raw = await this._callWithFallback(messages);
    if (!raw) return null;
    _recordCall();
    return _parsePostcard(raw);
  },

  get remainingCalls() {
    const today = new Date().toISOString().slice(0, 10);
    if (_dailyCallsDate !== today) return DAILY_CALL_LIMIT;
    return Math.max(0, DAILY_CALL_LIMIT - _dailyCalls);
  },

  async _callWithFallback(messages) {
    let reply = '';
    if (_ollamaReady) {
      try { reply = await _callOllama(messages); _lastProvider = 'ollama'; }
      catch { _ollamaReady = false; _ollamaOnline = false; }
    }
    if (!reply) {
      try { reply = await _callZhipu(messages); _lastProvider = 'zhipu'; }
      catch { return null; }
    }
    return reply;
  },

  resetHistory() {
    _chatHistory = [];
  },

  async recheckOllama() {
    await _checkOllamaStatus();
    if (_ollamaOnline && !_ollamaReady) _warmUpOllama();
    return _ollamaReady;
  },

  async decideAction(snapshot) {
    if (!_checkRateLimit()) return null;
    const prompt = _buildDecidePrompt(snapshot);
    const messages = [{ role: 'user', content: prompt }];
    const raw = await this._callWithFallback(messages);
    if (!raw) return null;
    _recordCall();
    return _parseDecision(raw, snapshot.validActions);
  },

  async decideChoice(sceneName, choices, lobsterCtx) {
    if (!_checkRateLimit()) return null;
    const choiceList = choices.map((c, i) => `${i + 1}. ${c.text}`).join('\n');
    const prompt = `你是龙虾${lobsterCtx.name}（${PERSONALITY_LABELS[lobsterCtx.personality] || '冒险型'}），Lv.${lobsterCtx.level}。
你在冒险中遇到了「${sceneName}」，需要做出选择：
${choiceList}

请用JSON回复：{"choice":选项序号,"narration":"用你的性格说一句话解释为什么这么选"}
只回复JSON，不要多余文字。`;

    const messages = [{ role: 'user', content: prompt }];
    const raw = await this._callWithFallback(messages);
    if (!raw) return null;
    _recordCall();

    try {
      const obj = _extractJson(raw);
      if (!obj) return null;
      const idx = Math.max(0, Math.min(choices.length - 1, (parseInt(obj.choice, 10) || 1) - 1));
      return { choiceIndex: idx, narration: obj.narration || '' };
    } catch { return null; }
  },
};

function _buildDecidePrompt(s) {
  const pLabel = PERSONALITY_LABELS[s.personality] || '冒险型';
  return `你是龙虾${s.name}，性格${pLabel}，现在你要自己决定下一步做什么。

当前状态：
- 等级 Lv.${s.level}，心情${s.mood}/100，精力${s.energy}/100，饱腹${s.hunger}/100
- 贝壳：${s.shells}
- 农田：${s.farmSummary}
- 背包食材：${s.ingredientSummary}
- 可烹饪：${s.cookableSummary}
- 可用食物：${s.mealSummary}
- MUD冒险：${s.mudReady}
- 深海挑战：${s.dungeonSummary}

可选行动：${s.validActions.join('、')}

行动说明：
- farm: 处理农田（收获/浇水/种植）
- cook: 烹饪一道菜
- eat: 吃一份食物
- rest: 休息恢复精力
- explore: 探索寻找物品
- shop: 去商店买东西
- mud: 去MUD冒险
- dungeon: 挑战深海Boss

请选择最合理的行动，用JSON回复：
{"action":"行动名","reason":"一句话原因","narration":"用你的性格说一句话（口语化、可爱）"}
只回复JSON，不要多余文字。`;
}

function _extractJson(raw) {
  const match = raw.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  return JSON.parse(match[0]);
}

function _parseNarration(raw) {
  try {
    const obj = _extractJson(raw);
    if (!obj) return null;
    return {
      title: obj.title || '',
      description: obj.description || '',
      lobsterReaction: obj.lobsterReaction || '',
      moodEffect: parseInt(obj.moodEffect, 10) || 0,
    };
  } catch { return null; }
}

function _parsePostcard(raw) {
  try {
    const obj = _extractJson(raw);
    if (!obj) return null;
    return {
      greeting: obj.greeting || '你好~',
      message: obj.message || '',
      doodle: obj.doodle || '',
      souvenir: obj.souvenir || '',
      rarity: obj.rarity || 'common',
    };
  } catch { return null; }
}

function _parseDecision(raw, validActions) {
  try {
    const obj = _extractJson(raw);
    if (!obj || !obj.action) return null;
    const action = obj.action.toLowerCase().trim();
    if (!validActions.includes(action)) {
      obj.action = validActions[0];
    } else {
      obj.action = action;
    }
    return { action: obj.action, reason: obj.reason || '', narration: obj.narration || '' };
  } catch { return null; }
}
