#!/usr/bin/env python3
"""
Daily diary generator for all registered lobsters.
Run via cron: 0 8 * * * python3 /www/wwwroot/lobster-farm/server/daily_diary.py

Generates one diary entry per lobster per day using rule-based templates.
No LLM needed — zero token cost.
"""

import json
import sqlite3
import random
from datetime import datetime, date
from pathlib import Path

DB_PATH = Path(__file__).parent / 'lobster_sync.db'

PERSONALITY_LABELS = {
    'adventurous': '冒险型',
    'lazy': '懒惰型',
    'gluttonous': '贪吃型',
    'scholarly': '学者型',
    'social': '社交型',
    'mischievous': '调皮型',
}

SEASON_LABELS = {'spring': '春天', 'summer': '夏天', 'autumn': '秋天', 'winter': '冬天'}
WEATHER_LABELS = {
    'sunny': '晴天', 'rainy': '雨天', 'breezy': '微风天', 'hot': '大热天',
    'stormy': '暴风天', 'cloudy': '阴天', 'windy': '大风天', 'foggy': '雾天',
    'snowy': '雪天', 'cold': '寒冷天', 'clear': '晴朗天',
}

TEMPLATES = {
    'adventurous': {
        'high_mood': [
            "今天心情超好！我偷偷溜出去探险了，在珊瑚礁后面发现了一个小洞穴，里面闪闪发光的！",
            "海水暖暖的，我游了好远好远。远处好像有一艘沉船，下次一定要去看看！",
            "今天遇到了一条很酷的剑鱼，它说东边有片没人去过的海域。我已经开始计划了！",
            "在石头缝里找到了一颗奇怪的珠子，不知道是什么，但我决定收藏起来。冒险家的直觉告诉我它很珍贵。",
            "今天爬上了最高的那块礁石！从上面看下去，整个海底都在脚下，太壮观了。",
        ],
        'battle_win': [
            "今天在MUD里遇到了一个强敌！打了好久才赢，但那种心跳加速的感觉太棒了！",
            "又赢了一场战斗！对手很强，但冒险家从不退缩。战利品已经收好了~",
            "深海挑战又推进了一层！那个Boss比想象中难对付，但我找到了它的弱点。冒险家的直觉果然靠谱！",
        ],
        'battle_lose': [
            "今天被一个Boss打败了...但我记住了它的招式，下次一定能赢！冒险家不怕失败！",
            "输了一场战斗，有点不甘心。不过对手确实很强，我需要变得更强才行。",
            "被打飞了...钳子还有点疼。但这种挑战才是冒险的意义啊！明天继续！",
        ],
        'low_mood': [
            "今天有点累，不太想出门。但还是忍不住在附近转了转，习惯了每天都要发现点什么。",
            "探险的路上摔了一跤，钳子有点疼。不过没关系，冒险家不怕这点小伤。",
            "今天雾蒙蒙的，什么都看不清。我就坐在石头上发了会儿呆，偶尔也需要安静一下。",
        ],
        'hungry': [
            "肚子好饿...但我不想回去吃饭，外面还有好多地方没去过。先忍忍吧，冒险家要有毅力！",
            "饿着肚子探险效率好低，走两步就想躺下。主人要是能给我带点吃的就好了...",
        ],
        'farming': [
            "今天难得在农田待了一会儿，发现种地其实也挺有趣的。每颗种子都像一个小小的冒险。",
            "浇完水之后我就跑出去玩了。农田的事情...嗯，明天再说吧！",
        ],
    },
    'lazy': {
        'high_mood': [
            "今天...嗯...睡了个好觉。然后又睡了一觉。窗外的阳光照在身上，暖暖的，真舒服。",
            "躺在沙地上看水母飘来飘去，什么都不用想。这就是生活的意义吧。",
            "今天的云朵特别好看，我数了数，一共有...算了，数着数着就睡着了。",
            "找到了一块完美的石头，形状刚好可以靠着。我觉得我可以在这里待一整天。",
            "主人好像很忙的样子。没关系，我替你享受这份悠闲好了~",
        ],
        'battle_win': [
            "被拖去打Boss了...虽然赢了但好累啊，下次能不能让我在旁边看？",
            "打赢了...可以回去睡觉了吧？战斗什么的太消耗体力了。",
            "居然赢了，我自己都惊讶。看来躺着养精蓄锐也是一种战术？",
        ],
        'battle_lose': [
            "输了...算了，本来就不想打。回去睡觉，明天再说。",
            "被打败了，浑身酸痛。这下有理由躺一整天了。",
            "战斗好累啊...输了就输了吧，至少可以光明正大地休息了。",
        ],
        'low_mood': [
            "今天连睡觉都不太安稳，翻来覆去的。可能是昨天吃太多了...",
            "有点无聊，但又不想动。就这么躺着吧，反正也没什么急事。",
            "下雨了，水滴打在壳上咚咚响。虽然有点吵，但也挺催眠的。",
        ],
        'hungry': [
            "好饿啊...但是食物在那边，我在这边...距离好远啊...再躺一会儿吧。",
            "如果食物能自己走过来就好了。发明一个自动投喂机怎么样？嗯，想想就好累，算了。",
        ],
        'farming': [
            "农田好像该浇水了...我看了一眼就回来躺着了。植物应该也喜欢自由生长吧？",
            "今天破天荒去收了一次菜。累死了。决定接下来三天都不出门。",
        ],
    },
    'gluttonous': {
        'high_mood': [
            "今天做了一道新菜！虽然卖相一般，但味道超级棒！我给它取名叫'海底惊喜'。",
            "在海边捡到了新鲜的海藻，立刻做了海苔卷。一口气吃了三个，幸福~",
            "今天的珊瑚蛋糕烤得刚刚好，外焦里嫩。我觉得我的厨艺又进步了！",
            "路过螃蟹商人的摊位，闻到了好香的味道。忍不住买了好多食材，钱包哭了但肚子笑了。",
            "研究了一下新食谱，需要一种没见过的食材。为了美食，明天必须出门找！",
        ],
        'battle_win': [
            "打完Boss饿死了，赶紧做了一顿大餐犒劳自己。战斗消耗的卡路里必须补回来！",
            "赢了！战利品里有食材！今晚加餐庆祝~",
            "用美食的力量打败了敌人！果然吃饱了才有力气战斗。",
        ],
        'battle_lose': [
            "输了...一定是因为战前没吃饱。下次一定要带满食物再去！",
            "被打败了，肚子又饿了。伤心的时候只有美食能治愈我。",
            "战斗失败了，但我发现了一个新道理：空腹战斗是大忌！",
        ],
        'low_mood': [
            "今天做的菜糊了...心情有点低落。不过失败是成功之母，明天再试一次。",
            "肚子不太舒服，可能是昨天吃太多了。今天决定少吃一点...好吧，少吃一点点。",
            "下雨天没什么胃口。就喝了点海洋茶，暖暖的，心情好了一些。",
        ],
        'hungry': [
            "饿饿饿饿饿！！！背包里什么吃的都没有了！主人快来喂我！！！",
            "饿到开始幻想食物了。那块石头看起来像珊瑚蛋糕...不，冷静，那是石头。",
        ],
        'farming': [
            "今天去农田看了看，海带长得真好。已经开始想象它变成美味料理的样子了~",
            "收获了一批作物！立刻冲进厨房开始做饭。今晚要吃大餐！",
        ],
    },
    'scholarly': {
        'high_mood': [
            "今天观察到一个有趣的现象：涨潮时珊瑚的颜色会微微变化。我决定记录下来做长期研究。",
            "读了一本关于深海生态的书（好吧，是一片泡水的纸），学到了很多新知识。",
            "在实验中发现，浇水时间对作物生长速度有显著影响。明天要设计对照组。",
            "今天和海龟长老聊了很久，它知道好多古老的故事。我把每一个都记在了笔记里。",
            "计算了一下农田的最优种植方案。如果按我的计划执行，产量可以提升23%。大概。",
        ],
        'battle_win': [
            "通过分析对手的行为模式，我成功预判了它的攻击路线并取得了胜利。数据不会说谎。",
            "今天的战斗验证了我的理论：准备充分比蛮力更重要。胜率计算完全正确！",
            "记录了这场战斗的每一个细节。对手的弱点在第三回合暴露了，和我的预测一致。",
        ],
        'battle_lose': [
            "战斗失败了。复盘分析后发现是战力计算有误差，需要重新校准公式。",
            "输了...但我收集到了宝贵的战斗数据。失败也是一种实验结果。",
            "对手的实力超出了我的模型预测。需要更多样本来修正战力评估算法。",
        ],
        'low_mood': [
            "实验失败了...数据和预期完全不符。需要重新审视假设。科学就是这样，失败也是进步。",
            "今天脑子有点转不动，可能是精力不够。先休息一下，明天再继续研究。",
            "翻看之前的笔记，发现有几处逻辑错误。有点沮丧，但至少发现了问题。",
        ],
        'hungry': [
            "饿着肚子很难集中注意力。根据我的观察，饥饿状态下思维效率下降约40%。需要补充能量。",
            "忘记吃饭了...太专注于研究了。身体是革命的本钱，得注意。",
        ],
        'farming': [
            "农田是一个绝佳的实验场。今天记录了每株作物的生长数据，准备做统计分析。",
            "发现了一种新的种植技巧：在特定时间浇水效果更好。需要更多数据验证。",
        ],
    },
    'social': {
        'high_mood': [
            "今天和好多朋友聊天了！鱼邮差给我讲了外面的故事，章鱼厨师教了我一个新动作。",
            "组织了一个小型聚会，大家一起吃东西聊天。虽然只有几个人，但特别开心。",
            "收到了一封远方朋友的信，说它那边下雪了。好想去看看啊，下次旅行就去那里！",
            "今天帮螃蟹商人搬了一会儿货，它送了我一颗糖。朋友之间就是要互相帮助嘛。",
            "和主人说了好多话（虽然不知道主人有没有听到），但说出来心情就好多了。",
        ],
        'battle_win': [
            "打赢了！好多朋友来给我加油，有朋友的支持果然不一样！赢了之后大家一起庆祝~",
            "战斗中遇到了一个有趣的对手，打完之后我们居然成了朋友！它说下次再来切磋。",
            "靠着和朋友们学到的技巧赢了这场战斗。社交也是一种战斗力！",
        ],
        'battle_lose': [
            "输了...朋友们都来安慰我，说下次一定能赢。有朋友真好。",
            "被打败了，但对手人还不错，教了我几招。也算交了个新朋友？",
            "战斗失败了，心情有点低落。不过和朋友们聊了聊就好多了。",
        ],
        'low_mood': [
            "今天没有朋友来找我玩...有点寂寞。不过没关系，我可以给远方的朋友写信。",
            "和邻居吵了一小架，虽然很快就和好了，但心里还是有点不舒服。",
            "今天一个人待着，有点想念以前的朋友们。希望它们都过得好。",
        ],
        'hungry': [
            "饿了...要是有朋友一起吃饭就好了。一个人吃饭总觉得不太香。",
            "主人好久没来了，我有点想你。顺便...能带点吃的来吗？",
        ],
        'farming': [
            "今天在农田干活的时候，隔壁的蜗牛过来帮忙了。有朋友一起干活效率高多了！",
            "收获的时候分了一些给路过的小鱼，看它们开心的样子我也很开心。",
        ],
    },
    'mischievous': {
        'high_mood': [
            "嘿嘿，今天把螃蟹商人的招牌偷偷转了个方向，它找了半天才发现。太好笑了！",
            "在沙地上画了一个巨大的笑脸，路过的鱼都吓了一跳。我在旁边偷偷笑了好久。",
            "今天假装自己是一块石头，一只小鱼在我身上停了好久。忍住不笑真的好难！",
            "发现了一个秘密通道，通向一个没人知道的小花园。这是我的秘密基地了！",
            "把农田里的标签全换了位置，明天看看会不会有人发现。嘿嘿嘿~",
        ],
        'battle_win': [
            "嘿嘿，用了一个小诡计就把Boss骗到了陷阱里！谁说打架一定要正面硬刚？",
            "赢了赢了！我在对手脚下挖了个坑，它一脚踩空就摔倒了。聪明吧？",
            "战斗中我假装投降，趁对手放松警惕的时候反击成功！兵不厌诈嘛~",
        ],
        'battle_lose': [
            "输了...对手居然不吃我的诡计！下次得想个更高明的招数。",
            "被打败了，好气哦。不过我已经想好了报复计划，嘿嘿嘿...",
            "这次的对手太狡猾了，比我还会耍花招！不服，下次一定要赢回来！",
        ],
        'low_mood': [
            "今天的恶作剧被发现了，被骂了一顿...好吧，我承认有点过分了。",
            "没什么好玩的事情发生，无聊到开始数沙粒。数到第47颗就放弃了。",
            "心情不好的时候连捣蛋的力气都没有。就安静地缩在角落里吧。",
        ],
        'hungry': [
            "饿到开始想偷别人的食物了...不不不，我是有底线的龙虾。但真的好饿啊！",
            "如果我假装晕倒，主人会不会赶紧来喂我？值得一试！",
        ],
        'farming': [
            "在农田里埋了一个'宝藏'（其实是一颗石头），等下次有人来挖到一定很惊喜。",
            "今天认真种地了！...好吧，种了一会儿就跑去玩了。但至少我努力过！",
        ],
    },
}

OWNER_TEMPLATES = {
    'busy': [
        "主人好像最近很忙，希望你别太累了。",
        "感觉主人今天做了好多事情，辛苦啦。",
        "主人忙碌的时候，我就安静地守着农场，等你有空来看我。",
    ],
    'night_owl': [
        "主人昨晚好像很晚才休息...要注意身体呀。",
        "深夜的海底特别安静，不知道主人那边是不是也很安静。",
    ],
    'absent': [
        "主人好几天没来了...我有点想你。农场我帮你看着呢，放心。",
        "等了好久都没看到主人，不过没关系，我知道你一定在忙重要的事情。",
        "虽然主人不在，但我每天都在认真生活。下次来的时候，我有好多话想跟你说！",
    ],
    'frequent': [
        "主人最近经常来看我，好开心！",
        "每天都能见到主人，是最幸福的事了。",
    ],
    'relaxed': [
        "感觉主人今天比较轻松，那我也可以放松一下啦~",
        "主人今天似乎心情不错，我也跟着开心起来了。",
    ],
}

WEATHER_ADDITIONS = [
    "外面{weather}，{feeling}。",
    "{season}的{weather}真{adj}。",
    "今天是{weather}，{scene}。",
]

WEATHER_FEELINGS = {
    'sunny': ('暖洋洋的', '舒服', '阳光洒在海面上，波光粼粼'),
    'rainy': ('有点冷', '适合发呆', '雨滴在水面上画出一圈圈涟漪'),
    'snowy': ('好冷啊', '美', '雪花飘进海里，一下子就化了'),
    'stormy': ('有点害怕', '刺激', '海浪翻涌着，远处传来隆隆声'),
    'breezy': ('凉爽', '惬意', '微风带来了远方的味道'),
    'cloudy': ('灰蒙蒙的', '安静', '云层很厚，光线柔柔的'),
    'foggy': ('什么都看不清', '神秘', '雾气弥漫，像是进入了另一个世界'),
    'hot': ('好热', '想找个阴凉处', '连石头都被晒得发烫'),
    'windy': ('被吹得站不稳', '有趣', '海草被吹得东倒西歪'),
    'cold': ('冻得直哆嗦', '想喝热茶', '水温比平时低了好多'),
    'clear': ('心旷神怡', '通透', '能看到好远好远的地方'),
}


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    return conn


def has_diary_today(conn, key):
    today = date.today().isoformat()
    row = conn.execute(
        "SELECT COUNT(*) as c FROM messages WHERE key = ? AND type = 'diary' AND date(created_at) = ?",
        (key, today)
    ).fetchone()
    return row['c'] > 0


def pick_template(personality, mood, hunger, farm_ripe, battle_delta=None):
    p = personality if personality in TEMPLATES else 'adventurous'
    templates = TEMPLATES[p]

    if battle_delta and (battle_delta.get('wins', 0) > 0 or battle_delta.get('losses', 0) > 0):
        if battle_delta.get('wins', 0) >= battle_delta.get('losses', 0):
            pool = templates.get('battle_win', [])
        else:
            pool = templates.get('battle_lose', [])
        if pool and random.random() < 0.6:
            return random.choice(pool)

    if hunger >= 60:
        pool = templates.get('hungry', [])
    elif farm_ripe > 0 or random.random() < 0.2:
        pool = templates.get('farming', [])
    elif mood >= 50:
        pool = templates.get('high_mood', [])
    else:
        pool = templates.get('low_mood', [])

    if not pool:
        pool = templates.get('high_mood', ['今天过得还不错。'])

    return random.choice(pool)


def add_weather_line(weather, season):
    w_key = weather if weather in WEATHER_FEELINGS else 'sunny'
    feeling, adj, scene = WEATHER_FEELINGS[w_key]
    s_label = SEASON_LABELS.get(season, '春天')
    w_label = WEATHER_LABELS.get(weather, '晴天')

    template = random.choice(WEATHER_ADDITIONS)
    return template.format(weather=w_label, feeling=feeling, adj=adj, scene=scene, season=s_label)


def get_owner_context(conn, key):
    """Determine owner mood from recent Skill reports."""
    today = date.today().isoformat()
    try:
        rows = conn.execute(
            'SELECT date, data FROM reports WHERE key = ? ORDER BY date DESC LIMIT 3',
            (key,)
        ).fetchall()
    except Exception:
        return None

    if not rows:
        return None

    latest = json.loads(rows[0]['data']) if rows else {}
    latest_date = rows[0]['date'] if rows else ''

    days_since = (date.today() - date.fromisoformat(latest_date)).days if latest_date else 999

    if days_since >= 3:
        return 'absent'

    work_min = latest.get('work_minutes', 0)
    last_active = latest.get('last_active', '')
    mood_hint = latest.get('mood_hint', '')

    if last_active:
        try:
            hour = int(last_active.split(':')[0]) if ':' in last_active else 0
            if hour >= 23 or hour < 5:
                return 'night_owl'
        except (ValueError, IndexError):
            pass

    if mood_hint == 'relaxed':
        return 'relaxed'

    if work_min > 120 or mood_hint == 'busy':
        return 'busy'

    if len(rows) >= 3:
        return 'frequent'

    return None


def get_battle_delta(state):
    dungeon = state.get('dungeon', {})
    total_wins = dungeon.get('totalWins', 0)
    total_losses = dungeon.get('totalLosses', 0)
    mud_boss_defeats = dungeon.get('mudBossDefeats', {})
    mud_wins = sum(mud_boss_defeats.values()) if isinstance(mud_boss_defeats, dict) else 0

    last_count = state.get('_lastDiaryBattleCount', 0)
    current_count = total_wins + total_losses + mud_wins
    if current_count <= last_count:
        return None
    return {'wins': total_wins + mud_wins, 'losses': total_losses, 'new_battles': current_count - last_count}


def generate_diary(state, owner_ctx=None):
    lob = state.get('lobster', {})
    world = state.get('world', {})
    farm = state.get('farm', {})
    plots = farm.get('plots', [])

    personality = lob.get('personality', 'adventurous')
    mood = lob.get('mood', 50)
    hunger = lob.get('hunger', 30)
    farm_ripe = sum(1 for p in plots if p.get('crop') and p.get('growthStage', 0) >= p.get('maxGrowth', 999))

    battle_delta = get_battle_delta(state)
    main_text = pick_template(personality, mood, hunger, farm_ripe, battle_delta)

    if random.random() < 0.6:
        weather_line = add_weather_line(world.get('weather', 'sunny'), world.get('season', 'spring'))
        if random.random() < 0.5:
            main_text = f"{weather_line}\n{main_text}"
        else:
            main_text = f"{main_text}\n{weather_line}"

    if owner_ctx and owner_ctx in OWNER_TEMPLATES and random.random() < 0.65:
        owner_line = random.choice(OWNER_TEMPLATES[owner_ctx])
        main_text = f"{main_text}\n{owner_line}"

    return main_text


def run():
    conn = get_db()
    try:
        agents = conn.execute('SELECT key, state FROM agents').fetchall()
        generated = 0
        skipped = 0

        for agent in agents:
            key = agent['key']
            if has_diary_today(conn, key):
                skipped += 1
                continue

            try:
                state = json.loads(agent['state'])
            except Exception:
                continue

            owner_ctx = get_owner_context(conn, key)
            diary_text = generate_diary(state, owner_ctx)

            conn.execute(
                "INSERT INTO messages (key, type, sender, text) VALUES (?, 'diary', 'lobster', ?)",
                (key, diary_text)
            )

            dungeon = state.get('dungeon', {})
            mud_boss_defeats = dungeon.get('mudBossDefeats', {})
            mud_wins = sum(mud_boss_defeats.values()) if isinstance(mud_boss_defeats, dict) else 0
            new_count = dungeon.get('totalWins', 0) + dungeon.get('totalLosses', 0) + mud_wins
            state['_lastDiaryBattleCount'] = new_count
            conn.execute(
                'UPDATE agents SET state = ? WHERE key = ?',
                (json.dumps(state, ensure_ascii=False), key)
            )

            generated += 1

        proactive_count = generate_proactive_messages(conn)

        conn.commit()
        print(f"Daily diary: generated {generated}, skipped {skipped} (already had today's diary), proactive {proactive_count}")
    finally:
        conn.close()


PROACTIVE_TEMPLATES = {
    'miss_you': {
        'adventurous': ['主人好久没来了，我今天自己去探险了，但有点想你...', '主人～你去哪里啦？我发现了一个新洞穴想带你看！'],
        'lazy': ['主人不在的日子，我睡了好多觉...但还是想你来陪我', '打了好大一个哈欠，主人怎么还不来看我呀'],
        'gluttonous': ['主人不在我都没胃口了...好吧其实还是吃了不少', '今天做了一道新菜，想留给主人尝尝，快来吧！'],
        'scholarly': ['主人不在的时候我读了好多书，但想和你分享', '观察海底生态第N天，缺少主人的陪伴数据...'],
        'social': ['好想主人啊，跟访客聊天都提到你了', '今天来了个访客，但我更想见到主人你'],
        'mischievous': ['嘿嘿主人不在我偷偷重新布置了房间，快来看！', '主人再不来我就要把农田全种满奇怪的东西了哦'],
    },
    'achievement': {
        'adventurous': ['主人主人！我刚才{achievement}！超厉害的吧！', '嘿！告诉你一个好消息，我{achievement}了！'],
        'lazy': ['虽然有点累但是...我{achievement}了哦，夸我夸我', '难得努力了一下，居然{achievement}了，嘻嘻'],
        'gluttonous': ['为了庆祝{achievement}，我要做一顿大餐！', '我{achievement}了！奖励自己一顿好吃的'],
        'scholarly': ['经过仔细分析和准备，我成功{achievement}了', '记录：今日{achievement}，值得纪念'],
        'social': ['快来恭喜我！我{achievement}了！要告诉所有朋友', '好开心！{achievement}了！想跟主人一起庆祝'],
        'mischievous': ['猜猜怎么着？我{achievement}了！没想到吧', '嘿嘿，趁主人不在我偷偷{achievement}了'],
    },
    'late_night': {
        'adventurous': ['主人还没睡吗？深夜的海底也很美哦，但要注意休息', '这么晚了还在忙？我陪你，但别太累了'],
        'lazy': ['主人...这么晚了...我都困了...你也快睡吧...', '哈啊～好困，主人也早点休息嘛'],
        'gluttonous': ['这么晚了主人还在忙？要不要我给你做个夜宵？', '深夜容易饿，主人吃点东西再休息吧'],
        'scholarly': ['据研究，熬夜对身体不好哦，主人要注意作息', '夜深了，主人的工作效率会下降的，建议休息'],
        'social': ['主人还没睡呀？那我也陪你聊聊天吧', '这么晚了，主人是不是有心事？跟我说说呗'],
        'mischievous': ['嘘...深夜了...主人是不是在偷偷做什么？', '这么晚还不睡？明天会变成熊猫眼哦'],
    },
}


def generate_proactive_messages(conn):
    count = 0
    today = date.today().isoformat()
    agents = conn.execute('SELECT key, state FROM agents').fetchall()

    for agent in agents:
        key = agent['key']
        try:
            state = json.loads(agent['state'])
        except Exception:
            continue

        existing = conn.execute(
            "SELECT COUNT(*) as c FROM proactive_messages WHERE key = ? AND date(created_at) = ?",
            (key, today)
        ).fetchone()['c']
        if existing >= 2:
            continue

        personality = state.get('lobster', {}).get('personality', 'adventurous')
        lobster_name = state.get('lobster', {}).get('name', '龙虾')

        report = conn.execute(
            'SELECT data FROM reports WHERE key = ? ORDER BY date DESC LIMIT 1',
            (key,)
        ).fetchone()

        report_data = {}
        if report:
            try:
                report_data = json.loads(report['data'])
            except Exception:
                pass

        last_active = conn.execute(
            'SELECT last_active FROM agents WHERE key = ?', (key,)
        ).fetchone()
        days_absent = 0
        if last_active and last_active['last_active']:
            try:
                la = datetime.fromisoformat(last_active['last_active'])
                days_absent = (datetime.now() - la).days
            except Exception:
                pass

        messages_to_insert = []

        if days_absent >= 2:
            templates = PROACTIVE_TEMPLATES['miss_you'].get(personality, PROACTIVE_TEMPLATES['miss_you']['adventurous'])
            messages_to_insert.append((random.choice(templates), 'miss_you'))

        last_active_time = report_data.get('last_active', '')
        if last_active_time:
            try:
                hour = int(last_active_time.split(':')[0])
                if hour >= 23 or hour < 5:
                    templates = PROACTIVE_TEMPLATES['late_night'].get(personality, PROACTIVE_TEMPLATES['late_night']['adventurous'])
                    messages_to_insert.append((random.choice(templates), 'late_night'))
            except Exception:
                pass

        dungeon = state.get('dungeon', {})
        total_wins = dungeon.get('totalWins', 0)
        mud_wins = sum(dungeon.get('mudBossDefeats', {}).values()) if isinstance(dungeon.get('mudBossDefeats'), dict) else 0
        if total_wins + mud_wins > 0 and random.random() < 0.3:
            templates = PROACTIVE_TEMPLATES['achievement'].get(personality, PROACTIVE_TEMPLATES['achievement']['adventurous'])
            achievements = []
            if mud_wins > 0:
                achievements.append('打败了一个Boss')
            if dungeon.get('highestTier', 0) >= 2:
                achievements.append(f"闯到了深海第{dungeon['highestTier']}层")
            if total_wins >= 5:
                achievements.append(f"赢了{total_wins}场战斗")
            if achievements:
                achievement_text = random.choice(achievements)
                msg = random.choice(templates).replace('{achievement}', achievement_text)
                messages_to_insert.append((msg, 'achievement'))

        for text, trigger in messages_to_insert[:2]:
            conn.execute(
                'INSERT INTO proactive_messages (key, text, trigger_type) VALUES (?, ?, ?)',
                (key, text, trigger)
            )
            count += 1

    return count


if __name__ == '__main__':
    run()
