#!/usr/bin/env python3
"""
Lightweight analytics collector for Lobster Agent Farm.
Receives JSON event batches from the client, stores in SQLite.
Serves a dashboard at /lobster-farm/analytics/.

Run: python3 analytics_server.py
Listens on 127.0.0.1:5200 (reverse-proxied by Nginx)
"""

import json
import sqlite3
import time
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).parent / 'analytics.db'
DASHBOARD_PATH = Path(__file__).parent / 'dashboard.html'
BIND = '127.0.0.1'
PORT = 5200


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    return conn


def init_db():
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT NOT NULL,
            event TEXT NOT NULL,
            day TEXT NOT NULL,
            ts INTEGER NOT NULL,
            data TEXT,
            ip TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_events_day ON events(day);
        CREATE INDEX IF NOT EXISTS idx_events_uid ON events(uid);
        CREATE INDEX IF NOT EXISTS idx_events_event ON events(event);

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT NOT NULL,
            day TEXT NOT NULL,
            start_ts INTEGER NOT NULL,
            end_ts INTEGER,
            duration_sec INTEGER DEFAULT 0,
            active_sec INTEGER DEFAULT 0,
            interactions INTEGER DEFAULT 0,
            ticks INTEGER DEFAULT 0,
            ip TEXT,
            ua TEXT,
            screen TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_day ON sessions(day);
        CREATE INDEX IF NOT EXISTS idx_sessions_uid ON sessions(uid);
    ''')
    conn.close()


def store_events(events, ip):
    conn = get_db()
    cur = conn.cursor()

    for evt in events:
        uid = evt.get('uid', '')
        event_name = evt.get('event', '')
        day = evt.get('day', datetime.utcnow().strftime('%Y-%m-%d'))
        ts = evt.get('ts', int(time.time() * 1000))

        if event_name == 'session_start':
            cur.execute(
                'INSERT INTO sessions (uid, day, start_ts, ip, ua, screen) VALUES (?, ?, ?, ?, ?, ?)',
                (uid, day, ts, ip, evt.get('ua', ''), evt.get('screen', ''))
            )
        elif event_name == 'session_end':
            cur.execute(
                '''UPDATE sessions SET end_ts=?, duration_sec=?, active_sec=?
                   WHERE uid=? AND end_ts IS NULL ORDER BY id DESC LIMIT 1''',
                (ts, evt.get('duration', 0), evt.get('activeSeconds', 0), uid)
            )
        elif event_name == 'interaction':
            cur.execute(
                'UPDATE sessions SET interactions = interactions + 1 WHERE uid=? AND end_ts IS NULL ORDER BY id DESC LIMIT 1',
                (uid,)
            )
        elif event_name == 'tick':
            cur.execute(
                'UPDATE sessions SET ticks = ticks + 1 WHERE uid=? AND end_ts IS NULL ORDER BY id DESC LIMIT 1',
                (uid,)
            )

        extra = {k: v for k, v in evt.items() if k not in ('uid', 'event', 'day', 'ts')}
        cur.execute(
            'INSERT INTO events (uid, event, day, ts, data, ip) VALUES (?, ?, ?, ?, ?, ?)',
            (uid, event_name, day, ts, json.dumps(extra, ensure_ascii=False) if extra else None, ip)
        )

    conn.commit()
    conn.close()


def query_dashboard_data(days=30):
    conn = get_db()
    today = datetime.utcnow().strftime('%Y-%m-%d')
    start = (datetime.utcnow() - timedelta(days=days)).strftime('%Y-%m-%d')

    dau = conn.execute(
        'SELECT day, COUNT(DISTINCT uid) as users FROM sessions WHERE day >= ? GROUP BY day ORDER BY day',
        (start,)
    ).fetchall()

    total_users = conn.execute('SELECT COUNT(DISTINCT uid) FROM sessions').fetchone()[0]

    today_users = conn.execute(
        'SELECT COUNT(DISTINCT uid) FROM sessions WHERE day = ?', (today,)
    ).fetchone()[0]

    avg_duration = conn.execute(
        'SELECT AVG(duration_sec) FROM sessions WHERE duration_sec > 0 AND day >= ?', (start,)
    ).fetchone()[0] or 0

    avg_active = conn.execute(
        'SELECT AVG(active_sec) FROM sessions WHERE active_sec > 0 AND day >= ?', (start,)
    ).fetchone()[0] or 0

    avg_interactions = conn.execute(
        'SELECT AVG(interactions) FROM sessions WHERE day >= ?', (start,)
    ).fetchone()[0] or 0

    avg_ticks = conn.execute(
        'SELECT AVG(ticks) FROM sessions WHERE day >= ?', (start,)
    ).fetchone()[0] or 0

    personality_dist = conn.execute(
        "SELECT json_extract(data, '$.personality') as p, COUNT(*) as c FROM events WHERE event='create_lobster' GROUP BY p ORDER BY c DESC"
    ).fetchall()

    action_dist = conn.execute(
        "SELECT json_extract(data, '$.action') as a, COUNT(*) as c FROM events WHERE event IN ('interaction','suggest_accepted','suggest_refused') AND day >= ? GROUP BY a ORDER BY c DESC",
        (start,)
    ).fetchall()

    hourly = conn.execute(
        "SELECT CAST(strftime('%H', datetime(ts/1000, 'unixepoch')) AS INTEGER) as h, COUNT(DISTINCT uid) as users FROM events WHERE day >= ? GROUP BY h ORDER BY h",
        (start,)
    ).fetchall()

    retention_data = []
    for row in conn.execute(
        'SELECT DISTINCT uid, MIN(day) as first_day FROM sessions GROUP BY uid'
    ).fetchall():
        uid, first_day = row['uid'], row['first_day']
        for d in [1, 3, 7]:
            target = (datetime.strptime(first_day, '%Y-%m-%d') + timedelta(days=d)).strftime('%Y-%m-%d')
            came_back = conn.execute(
                'SELECT 1 FROM sessions WHERE uid=? AND day=? LIMIT 1', (uid, target)
            ).fetchone()
            retention_data.append({'uid': uid, 'day': d, 'retained': 1 if came_back else 0})

    retention = {}
    for d in [1, 3, 7]:
        subset = [r for r in retention_data if r['day'] == d]
        if subset:
            retention[f'd{d}'] = round(sum(r['retained'] for r in subset) / len(subset) * 100, 1)
        else:
            retention[f'd{d}'] = 0

    recent_sessions = conn.execute(
        'SELECT uid, day, duration_sec, active_sec, interactions, ticks, ua, screen FROM sessions ORDER BY id DESC LIMIT 50'
    ).fetchall()

    event_counts = conn.execute(
        'SELECT event, COUNT(*) as c FROM events WHERE day >= ? GROUP BY event ORDER BY c DESC LIMIT 20',
        (start,)
    ).fetchall()

    conn.close()

    return {
        'generated_at': datetime.utcnow().isoformat() + 'Z',
        'period_days': days,
        'total_users': total_users,
        'today_users': today_users,
        'avg_session_duration_sec': round(avg_duration),
        'avg_active_sec': round(avg_active),
        'avg_interactions_per_session': round(avg_interactions, 1),
        'avg_ticks_per_session': round(avg_ticks, 1),
        'retention': retention,
        'dau': [{'day': r['day'], 'users': r['users']} for r in dau],
        'personality_distribution': [{'personality': r['p'], 'count': r['c']} for r in personality_dist],
        'action_distribution': [{'action': r['a'], 'count': r['c']} for r in action_dist],
        'hourly_activity': [{'hour': r['h'], 'users': r['users']} for r in hourly],
        'event_counts': [{'event': r['event'], 'count': r['c']} for r in event_counts],
        'recent_sessions': [dict(r) for r in recent_sessions],
    }


def query_realtime():
    conn = get_db()
    now_ms = int(time.time() * 1000)
    one_hour_ago = now_ms - 3600_000
    five_min_ago = now_ms - 300_000
    one_min_ago = now_ms - 60_000

    online_now = conn.execute(
        'SELECT COUNT(DISTINCT uid) FROM events WHERE ts >= ?', (five_min_ago,)
    ).fetchone()[0]

    active_sessions = conn.execute(
        'SELECT COUNT(*) FROM sessions WHERE end_ts IS NULL AND start_ts >= ?', (one_hour_ago,)
    ).fetchone()[0]

    events_last_hour = conn.execute(
        'SELECT COUNT(*) FROM events WHERE ts >= ?', (one_hour_ago,)
    ).fetchone()[0]

    events_last_min = conn.execute(
        'SELECT COUNT(*) FROM events WHERE ts >= ?', (one_min_ago,)
    ).fetchone()[0]

    minute_buckets = []
    for i in range(60):
        bucket_start = now_ms - (60 - i) * 60_000
        bucket_end = bucket_start + 60_000
        row = conn.execute(
            'SELECT COUNT(*) as c, COUNT(DISTINCT uid) as u FROM events WHERE ts >= ? AND ts < ?',
            (bucket_start, bucket_end)
        ).fetchone()
        minute_buckets.append({
            'minute': i,
            'events': row['c'],
            'users': row['u'],
        })

    recent_events = conn.execute(
        'SELECT uid, event, ts, data FROM events WHERE ts >= ? ORDER BY ts DESC LIMIT 50',
        (one_hour_ago,)
    ).fetchall()

    action_counts = conn.execute(
        "SELECT json_extract(data, '$.action') as a, COUNT(*) as c FROM events WHERE event IN ('interaction','suggest_accepted','suggest_refused','feed','tick') AND ts >= ? GROUP BY a ORDER BY c DESC",
        (one_hour_ago,)
    ).fetchall()

    live_users = conn.execute(
        '''SELECT s.uid, s.start_ts, s.interactions, s.ticks,
           (SELECT e.event FROM events e WHERE e.uid = s.uid ORDER BY e.ts DESC LIMIT 1) as last_event,
           (SELECT e.ts FROM events e WHERE e.uid = s.uid ORDER BY e.ts DESC LIMIT 1) as last_ts
           FROM sessions s WHERE s.end_ts IS NULL AND s.start_ts >= ?
           ORDER BY s.start_ts DESC LIMIT 20''',
        (one_hour_ago,)
    ).fetchall()

    conn.close()

    return {
        'generated_at': datetime.utcnow().isoformat() + 'Z',
        'now_ms': now_ms,
        'online_now': online_now,
        'active_sessions': active_sessions,
        'events_last_hour': events_last_hour,
        'events_per_minute': events_last_min,
        'minute_buckets': minute_buckets,
        'action_counts': [{'action': r['a'], 'count': r['c']} for r in action_counts],
        'recent_events': [{'uid': r['uid'][:8], 'event': r['event'], 'ts': r['ts'], 'data': r['data']} for r in recent_events],
        'live_users': [{'uid': r['uid'][:8], 'start_ts': r['start_ts'], 'interactions': r['interactions'], 'ticks': r['ticks'], 'last_event': r['last_event'], 'last_ts': r['last_ts']} for r in live_users],
    }


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/lobster-farm/api/collect':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            ip = self.headers.get('X-Real-IP', self.client_address[0])
            try:
                events = json.loads(body)
                if isinstance(events, list):
                    store_events(events, ip)
                self.send_response(204)
                self.end_headers()
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(str(e).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in ('/lobster-farm/analytics/', '/lobster-farm/analytics'):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(DASHBOARD_PATH.read_bytes())
        elif parsed.path == '/lobster-farm/api/dashboard':
            params = parse_qs(parsed.query)
            days = int(params.get('days', [30])[0])
            data = query_dashboard_data(days)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode())
        elif parsed.path == '/lobster-farm/api/realtime':
            data = query_realtime()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode())
        elif parsed.path == '/lobster-farm/api/health':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'ok')
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        pass


if __name__ == '__main__':
    init_db()
    server = HTTPServer((BIND, PORT), Handler)
    print(f'Analytics server running on {BIND}:{PORT}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down.')
        server.server_close()
