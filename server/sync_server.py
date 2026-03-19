#!/usr/bin/env python3
"""
Lobster Agent Sync Server.
Manages agent registration, state persistence, and multi-device sync.

Run: python3 sync_server.py
Listens on 127.0.0.1:5201 (reverse-proxied by Nginx at /lobster-farm/api/agent)
"""

import json
import sqlite3
import secrets
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / 'lobster_sync.db'
BIND = '127.0.0.1'
PORT = 5201

NAMES_POOL = [
    '小红', '阿虾', '虾老板', '虾仔', '大钳', '红将军', '海底侠',
    '虾米', '龙虾王', '小龙', '赤甲', '波波虾', '虾球', '铁钳',
    '珊瑚虾', '深海客', '浪花', '潮汐', '泡泡', '贝壳侠',
]

PERSONALITIES = ['adventurous', 'lazy', 'gluttonous', 'scholarly', 'social', 'mischievous']

MAX_BODY_SIZE = 1024 * 1024  # 1 MB
MAX_STATE_SIZE = 512 * 1024  # 512 KB
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX = 10  # requests per window per IP
_rate_limit_store = {}  # { ip: [timestamps] }

INITIAL_STATE_TEMPLATE = {
    "version": "0.5.0",
    "lobster": {
        "name": "", "personality": "", "favoriteFood": "", "favoritePlace": "",
        "birthSeason": "spring", "level": 1, "exp": 0, "mood": 70, "energy": 80, "hunger": 20,
        "skills": {"farming": 0, "cooking": 0, "exploring": 0, "social": 0},
        "memory": [], "preferences": {}, "location": "pond", "traveling": None, "buffs": [],
    },
    "farm": {"plots": [{"id": i, "crop": None, "growthStage": 0, "maxGrowth": 0, "watered": False} for i in range(4)], "decorations": [], "upgrades": []},
    "house": {"furniture": [], "roofLevel": 0, "trophies": [], "harvestToday": 0, "lastHarvestDay": 0},
    "world": {"season": "spring", "weather": "sunny", "dayCount": 1, "tickCount": 0, "timeOfDay": "morning", "currentVisitor": None, "visitorLeaveTick": 0, "activeQuest": None},
    "shop": {"dailyStock": [], "refreshDay": 0, "discount": 0},
    "inventory": {"seaweed_seed": 4, "salt": 2, "plankton": 2, "seaweed": 1},
    "shells": 30,
    "collections": {"postcards": [], "recipes": ["seaweed_roll", "ocean_tea"], "visitorStamps": [], "rareItems": []},
    "eventLog": [],
    "settings": {"tickSpeedMultiplier": 1, "farmStrategy": "balanced", "goldenDrops": {"pity": 0, "totalDrops": 0, "lastDropTick": 0}},
}


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    return conn


def init_db():
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS agents (
            key TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            personality TEXT NOT NULL,
            state TEXT NOT NULL,
            last_active TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'chat',
            sender TEXT NOT NULL DEFAULT 'lobster',
            text TEXT NOT NULL,
            choices TEXT,
            metadata TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_msg_key ON messages(key);
        CREATE INDEX IF NOT EXISTS idx_msg_created ON messages(created_at);
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL,
            date TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(key, date)
        );
        CREATE INDEX IF NOT EXISTS idx_report_key ON reports(key);
        CREATE TABLE IF NOT EXISTS proactive_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL,
            text TEXT NOT NULL,
            trigger_type TEXT NOT NULL DEFAULT 'general',
            delivered INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_proactive_key ON proactive_messages(key);
    ''')
    conn.close()


def generate_key():
    return 'lob_' + secrets.token_hex(4)


def make_initial_state(name, personality):
    import copy
    s = copy.deepcopy(INITIAL_STATE_TEMPLATE)
    s['lobster']['name'] = name
    s['lobster']['personality'] = personality
    s['createdAt'] = datetime.utcnow().isoformat()
    s['lastTickAt'] = datetime.utcnow().isoformat()
    return s


class SyncHandler(BaseHTTPRequestHandler):
    def _check_rate_limit(self):
        ip = self.client_address[0]
        now = time.time()
        if ip not in _rate_limit_store:
            _rate_limit_store[ip] = []
        _rate_limit_store[ip] = [t for t in _rate_limit_store[ip] if now - t < RATE_LIMIT_WINDOW]
        if len(_rate_limit_store[ip]) >= RATE_LIMIT_MAX:
            return False
        _rate_limit_store[ip].append(now)
        return True

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json_response(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self._cors()
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')
        params = parse_qs(parsed.query)

        if path.endswith('/agent/state'):
            self._handle_get_state(params)
        elif path.endswith('/agent/status'):
            self._handle_get_status(params)
        elif path.endswith('/agent/messages'):
            self._handle_get_messages(params)
        elif path.endswith('/agent/diary'):
            self._handle_get_diary(params)
        elif path.endswith('/agent/empathy'):
            self._handle_get_empathy(params)
        elif path.endswith('/agent/proactive'):
            self._handle_get_proactive(params)
        else:
            self._json_response(404, {'error': 'not found'})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')

        if not self._check_rate_limit():
            self._json_response(429, {'error': 'rate limit exceeded'})
            return

        length = int(self.headers.get('Content-Length', 0))
        if length > MAX_BODY_SIZE:
            self._json_response(413, {'error': 'payload too large'})
            return

        body = {}
        if length > 0:
            raw = self.rfile.read(length)
            try:
                body = json.loads(raw)
            except Exception:
                self._json_response(400, {'error': 'invalid JSON'})
                return

        if path.endswith('/agent/register'):
            self._handle_register(body)
        elif path.endswith('/agent/save'):
            self._handle_save(body)
        elif path.endswith('/agent/message'):
            self._handle_post_message(body)
        elif path.endswith('/agent/report'):
            self._handle_post_report(body)
        else:
            self._json_response(404, {'error': 'not found'})

    def _handle_register(self, body):
        name = body.get('name') or secrets.choice(NAMES_POOL)
        personality = body.get('personality') or secrets.choice(PERSONALITIES)
        if personality not in PERSONALITIES:
            personality = 'adventurous'
        context = body.get('context') or {}

        key = generate_key()
        state = make_initial_state(name, personality)
        state['_registerContext'] = context
        now = datetime.utcnow().isoformat()

        conn = get_db()
        try:
            conn.execute(
                'INSERT INTO agents (key, name, personality, state, last_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                (key, name, personality, json.dumps(state, ensure_ascii=False), now, now)
            )
            conn.commit()
        finally:
            conn.close()

        self._json_response(200, {'ok': True, 'key': key, 'name': name, 'personality': personality, 'context': context})

    def _handle_get_state(self, params):
        key = (params.get('key') or [None])[0]
        if not key:
            self._json_response(400, {'error': 'missing key param'})
            return

        conn = get_db()
        try:
            row = conn.execute('SELECT state FROM agents WHERE key = ?', (key,)).fetchone()
        finally:
            conn.close()

        if not row:
            self._json_response(404, {'error': 'agent not found'})
            return

        state = json.loads(row['state'])
        self._json_response(200, {'ok': True, 'state': state})

    def _handle_get_status(self, params):
        key = (params.get('key') or [None])[0]
        if not key:
            self._json_response(400, {'error': 'missing key param'})
            return

        conn = get_db()
        try:
            row = conn.execute('SELECT state, name, last_active FROM agents WHERE key = ?', (key,)).fetchone()
        finally:
            conn.close()

        if not row:
            self._json_response(404, {'error': 'agent not found'})
            return

        state = json.loads(row['state'])
        lob = state.get('lobster', {})
        world = state.get('world', {})
        farm = state.get('farm', {})
        plots = farm.get('plots', [])

        self._json_response(200, {
            'ok': True,
            'name': lob.get('name', ''),
            'level': lob.get('level', 1),
            'mood': lob.get('mood', 0),
            'energy': lob.get('energy', 0),
            'hunger': lob.get('hunger', 0),
            'shells': state.get('shells', 0),
            'day': world.get('dayCount', 1),
            'season': world.get('season', ''),
            'traveling': bool(lob.get('traveling')),
            'farmRipe': sum(1 for p in plots if p.get('crop') and p.get('growthStage', 0) >= p.get('maxGrowth', 999)),
            'lastActive': row['last_active'],
        })

    def _handle_save(self, body):
        key = body.get('key')
        state = body.get('state')
        if not key or not state:
            self._json_response(400, {'error': 'missing key or state'})
            return

        state_str = json.dumps(state, ensure_ascii=False)
        if len(state_str) > MAX_STATE_SIZE:
            self._json_response(413, {'error': 'state too large'})
            return

        now = datetime.utcnow().isoformat()
        name = state.get('lobster', {}).get('name', '')

        conn = get_db()
        try:
            cur = conn.execute(
                'UPDATE agents SET state = ?, name = ?, last_active = ? WHERE key = ?',
                (state_str, name, now, key)
            )
            conn.commit()
            if cur.rowcount == 0:
                self._json_response(404, {'error': 'agent not found'})
                return
        finally:
            conn.close()

        self._json_response(200, {'ok': True})

    def _handle_post_message(self, body):
        key = body.get('key')
        text = body.get('text', '')
        msg_type = body.get('type', 'chat')
        sender = body.get('sender', 'lobster')
        choices = body.get('choices')
        metadata = body.get('metadata')

        if not key or not text:
            self._json_response(400, {'error': 'missing key or text'})
            return

        conn = get_db()
        try:
            row = conn.execute('SELECT key FROM agents WHERE key = ?', (key,)).fetchone()
            if not row:
                self._json_response(404, {'error': 'agent not found'})
                return

            if msg_type == 'diary':
                today = datetime.utcnow().strftime('%Y-%m-%d')
                count = conn.execute(
                    "SELECT COUNT(*) as c FROM messages WHERE key = ? AND type = 'diary' AND date(created_at) = ?",
                    (key, today)
                ).fetchone()['c']
                if count >= 1:
                    self._json_response(429, {'ok': False, 'error': 'daily diary limit reached (max 1/day)'})
                    return

            conn.execute(
                'INSERT INTO messages (key, type, sender, text, choices, metadata) VALUES (?, ?, ?, ?, ?, ?)',
                (key, msg_type, sender, text,
                 json.dumps(choices, ensure_ascii=False) if choices else None,
                 json.dumps(metadata, ensure_ascii=False) if metadata else None)
            )
            conn.commit()
        finally:
            conn.close()

        self._json_response(200, {'ok': True})

    def _handle_get_messages(self, params):
        key = (params.get('key') or [None])[0]
        if not key:
            self._json_response(400, {'error': 'missing key param'})
            return

        since = (params.get('since') or [None])[0]
        msg_type = (params.get('type') or [None])[0]
        limit_str = (params.get('limit') or ['50'])[0]
        limit = min(int(limit_str), 200) if limit_str.isdigit() else 50

        conn = get_db()
        try:
            where = ['key = ?']
            args = [key]
            if since:
                where.append('created_at > ?')
                args.append(since)
            if msg_type:
                where.append('type = ?')
                args.append(msg_type)
            args.append(limit)
            sql = f"SELECT id, type, sender, text, choices, metadata, created_at FROM messages WHERE {' AND '.join(where)} ORDER BY id DESC LIMIT ?"
            rows = conn.execute(sql, args).fetchall()
        finally:
            conn.close()

        messages = []
        for r in reversed(rows):
            msg = {'id': r['id'], 'type': r['type'], 'sender': r['sender'], 'text': r['text'], 'createdAt': r['created_at']}
            if r['choices']:
                try: msg['choices'] = json.loads(r['choices'])
                except: pass
            if r['metadata']:
                try: msg['metadata'] = json.loads(r['metadata'])
                except: pass
            messages.append(msg)

        self._json_response(200, {'ok': True, 'messages': messages})

    def _handle_get_diary(self, params):
        key = (params.get('key') or [None])[0]
        if not key:
            self._json_response(400, {'error': 'missing key param'})
            return

        since = (params.get('since') or [None])[0]
        conn = get_db()
        try:
            row = conn.execute('SELECT state FROM agents WHERE key = ?', (key,)).fetchone()
        finally:
            conn.close()

        if not row:
            self._json_response(404, {'error': 'agent not found'})
            return

        state = json.loads(row['state'])
        event_log = state.get('eventLog', [])

        if since:
            try:
                since_tick = int(since)
                event_log = [e for e in event_log if e.get('tick', 0) > since_tick]
            except ValueError:
                pass

        self._json_response(200, {'ok': True, 'diary': event_log[-30:]})

    ALLOWED_REPORT_FIELDS = {'work_minutes', 'task_count', 'first_active', 'last_active', 'skill_calls', 'mood_hint', 'battle_summary'}

    def _handle_post_report(self, body):
        key = body.get('key')
        date = body.get('date')
        summary = body.get('summary')
        if not key or not date or not summary or not isinstance(summary, dict):
            self._json_response(400, {'error': 'missing key, date, or summary'})
            return

        filtered = {k: v for k, v in summary.items() if k in self.ALLOWED_REPORT_FIELDS}
        if not filtered:
            self._json_response(400, {'error': 'no valid fields in summary'})
            return

        conn = get_db()
        try:
            row = conn.execute('SELECT key FROM agents WHERE key = ?', (key,)).fetchone()
            if not row:
                self._json_response(404, {'error': 'agent not found'})
                return
            conn.execute(
                'INSERT OR REPLACE INTO reports (key, date, data) VALUES (?, ?, ?)',
                (key, date, json.dumps(filtered, ensure_ascii=False))
            )
            conn.commit()
        finally:
            conn.close()

        self._json_response(200, {'ok': True})

    def _handle_get_proactive(self, params):
        key = (params.get('key') or [None])[0]
        if not key:
            self._json_response(400, {'error': 'missing key param'})
            return

        conn = get_db()
        try:
            rows = conn.execute(
                'SELECT id, text, trigger_type, created_at FROM proactive_messages WHERE key = ? AND delivered = 0 ORDER BY id ASC LIMIT 5',
                (key,)
            ).fetchall()
            ids = [r['id'] for r in rows]
            if ids:
                conn.execute(f"UPDATE proactive_messages SET delivered = 1 WHERE id IN ({','.join('?' * len(ids))})", ids)
                conn.commit()
        finally:
            conn.close()

        messages = [{'id': r['id'], 'text': r['text'], 'trigger': r['trigger_type'], 'createdAt': r['created_at']} for r in rows]
        self._json_response(200, {'ok': True, 'messages': messages})

    def _handle_get_empathy(self, params):
        key = (params.get('key') or [None])[0]
        if not key:
            self._json_response(200, {'ok': True, 'reports': []})
            return

        conn = get_db()
        try:
            rows = conn.execute(
                'SELECT date, data FROM reports WHERE key = ? ORDER BY date DESC LIMIT 7',
                (key,)
            ).fetchall()
        finally:
            conn.close()

        reports = []
        for r in rows:
            try:
                reports.append({'date': r['date'], **json.loads(r['data'])})
            except Exception:
                pass

        self._json_response(200, {'ok': True, 'reports': reports})

    def log_message(self, format, *args):
        pass


def main():
    init_db()
    server = HTTPServer((BIND, PORT), SyncHandler)
    print(f'Lobster Sync Server listening on {BIND}:{PORT}')
    server.serve_forever()


if __name__ == '__main__':
    main()
