"""体重記録の保存（SQLite）。

夫婦2人分を1つのDBに持つ。ユーザーごと・日付ごとに1件（同じ日に撮り直したら上書き）。
"""

from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

DEFAULT_DB_PATH = "diet.db"
DEFAULT_USERS = ("夫", "妻")

SCHEMA = """
CREATE TABLE IF NOT EXISTS records (
    user       TEXT NOT NULL,
    date       TEXT NOT NULL,
    weight_kg  REAL NOT NULL,
    body_fat_pct REAL,
    source     TEXT NOT NULL DEFAULT 'manual',
    note       TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user, date)
);

CREATE TABLE IF NOT EXISTS goals (
    user           TEXT PRIMARY KEY,
    goal_weight_kg REAL
);
"""


def users() -> list[str]:
    """記録するユーザー名。環境変数 DIET_USERS で変えられる（例: "たろう,はなこ"）。"""
    raw = os.environ.get("DIET_USERS", "").strip()
    if not raw:
        return list(DEFAULT_USERS)
    return [name.strip() for name in raw.split(",") if name.strip()]


def db_path() -> str:
    return os.environ.get("DIET_DB_PATH", DEFAULT_DB_PATH)


def connect(path: str | Path | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path or db_path()))
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


@dataclass
class Record:
    user: str
    date: str
    weight_kg: float
    body_fat_pct: float | None = None
    source: str = "manual"
    note: str | None = None

    def as_dict(self) -> dict:
        return {
            "user": self.user,
            "date": self.date,
            "weight_kg": self.weight_kg,
            "body_fat_pct": self.body_fat_pct,
            "source": self.source,
            "note": self.note,
        }


def save_record(conn: sqlite3.Connection, record: Record) -> Record:
    """1件保存する。同じ (user, date) があれば上書き。"""
    if record.user not in users():
        raise ValueError(f"知らないユーザーです: {record.user}")
    _parse_date(record.date)  # 形式チェック（不正なら ValueError）
    if not 20 <= record.weight_kg <= 250:
        raise ValueError(f"体重が想定範囲外です: {record.weight_kg}kg")
    if record.body_fat_pct is not None and not 1 <= record.body_fat_pct <= 70:
        raise ValueError(f"体脂肪率が想定範囲外です: {record.body_fat_pct}%")

    conn.execute(
        """
        INSERT INTO records (user, date, weight_kg, body_fat_pct, source, note, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (user, date) DO UPDATE SET
            weight_kg = excluded.weight_kg,
            body_fat_pct = excluded.body_fat_pct,
            source = excluded.source,
            note = excluded.note,
            updated_at = excluded.updated_at
        """,
        (
            record.user,
            record.date,
            round(record.weight_kg, 2),
            round(record.body_fat_pct, 2) if record.body_fat_pct is not None else None,
            record.source,
            record.note,
            datetime.now().isoformat(timespec="seconds"),
        ),
    )
    conn.commit()
    return record


def delete_record(conn: sqlite3.Connection, user: str, day: str) -> bool:
    cur = conn.execute("DELETE FROM records WHERE user = ? AND date = ?", (user, day))
    conn.commit()
    return cur.rowcount > 0


def list_records(
    conn: sqlite3.Connection, user: str | None = None, days: int | None = None
) -> list[dict]:
    """新しい順に返す。days を指定すると直近その日数分だけ。"""
    sql = "SELECT * FROM records"
    where, params = [], []
    if user:
        where.append("user = ?")
        params.append(user)
    if days:
        since = (date.today() - timedelta(days=days - 1)).isoformat()
        where.append("date >= ?")
        params.append(since)
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY date DESC, user ASC"
    return [dict(row) for row in conn.execute(sql, params)]


def latest_record(conn: sqlite3.Connection, user: str) -> dict | None:
    rows = conn.execute(
        "SELECT * FROM records WHERE user = ? ORDER BY date DESC LIMIT 1", (user,)
    ).fetchall()
    return dict(rows[0]) if rows else None


def set_goal(conn: sqlite3.Connection, user: str, goal_weight_kg: float | None) -> None:
    if user not in users():
        raise ValueError(f"知らないユーザーです: {user}")
    if goal_weight_kg is not None and not 20 <= goal_weight_kg <= 250:
        raise ValueError(f"目標体重が想定範囲外です: {goal_weight_kg}kg")
    conn.execute(
        """
        INSERT INTO goals (user, goal_weight_kg) VALUES (?, ?)
        ON CONFLICT (user) DO UPDATE SET goal_weight_kg = excluded.goal_weight_kg
        """,
        (user, goal_weight_kg),
    )
    conn.commit()


def goals(conn: sqlite3.Connection) -> dict[str, float | None]:
    return {
        row["user"]: row["goal_weight_kg"]
        for row in conn.execute("SELECT * FROM goals")
    }


def summary(conn: sqlite3.Connection, user: str) -> dict:
    """ユーザー1人分のサマリ。記録が無い場合も同じ形で返す。"""
    rows = [
        dict(row)
        for row in conn.execute(
            "SELECT * FROM records WHERE user = ? ORDER BY date ASC", (user,)
        )
    ]
    result = {
        "user": user,
        "count": len(rows),
        "latest": rows[-1] if rows else None,
        "start_weight_kg": rows[0]["weight_kg"] if rows else None,
        "total_change_kg": None,
        "week_change_kg": None,
        "week_average_kg": None,
        "goal_weight_kg": goals(conn).get(user),
        "to_goal_kg": None,
    }
    if not rows:
        return result

    latest = rows[-1]
    result["total_change_kg"] = round(latest["weight_kg"] - rows[0]["weight_kg"], 2)

    # 直近7日の平均（日々のブレが大きいので、比較は平均同士で行う）
    latest_day = _parse_date(latest["date"])
    this_week = _window_average(rows, latest_day, 0, 6)
    prev_week = _window_average(rows, latest_day, 7, 13)
    result["week_average_kg"] = this_week
    if this_week is not None and prev_week is not None:
        result["week_change_kg"] = round(this_week - prev_week, 2)

    goal = result["goal_weight_kg"]
    if goal is not None:
        result["to_goal_kg"] = round(latest["weight_kg"] - goal, 2)
    return result


def _window_average(
    rows: list[dict], latest_day: date, start_days_ago: int, end_days_ago: int
) -> float | None:
    """latest_day から start_days_ago〜end_days_ago 日前までの平均体重。"""
    newest = latest_day - timedelta(days=start_days_ago)
    oldest = latest_day - timedelta(days=end_days_ago)
    values = [
        row["weight_kg"] for row in rows if oldest <= _parse_date(row["date"]) <= newest
    ]
    if not values:
        return None
    return round(sum(values) / len(values), 2)


def _parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()
