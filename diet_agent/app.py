"""夫婦で使う体重記録アプリのWebサーバ。

スマホのブラウザから開いて、体重計の写真を撮る → 数字が自動で入る → 確認して保存、
という流れ。OCRの結果は保存しない（/api/ocr は読むだけ）ので、
必ず人間が数字を見てから /api/records で確定する。

    GEMINI_API_KEY=xxx python app.py       # 本番（Geminiで読み取る）
    DIET_FAKE_OCR=1 python app.py          # APIキー無しでUIだけ試す
"""

from __future__ import annotations

import os
from datetime import date
from pathlib import Path

from fastapi import FastAPI, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

import ocr
import store

STATIC_DIR = Path(__file__).parent / "static"
MAX_IMAGE_BYTES = 8 * 1024 * 1024


class RecordIn(BaseModel):
    user: str
    date: str
    weight_kg: float
    body_fat_pct: float | None = None
    source: str = "manual"
    note: str | None = None


class GoalIn(BaseModel):
    user: str
    goal_weight_kg: float | None = None


def create_app(db: str | None = None, reader=None) -> FastAPI:
    """reader は read_scale_photo 互換の呼び出し可能オブジェクト（テストで差し替える）。"""
    app = FastAPI(title="夫婦のダイエット記録")
    db_file = db or store.db_path()

    if reader is None:
        reader = (
            ocr.FakeReader()
            if os.environ.get("DIET_FAKE_OCR") == "1"
            else ocr.read_scale_photo
        )
    app.state.reader = reader

    def open_db():
        return store.connect(db_file)

    @app.get("/")
    def index():
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/api/state")
    def get_state(days: int = 180):
        conn = open_db()
        try:
            return {
                "users": store.users(),
                "today": date.today().isoformat(),
                "records": store.list_records(conn, days=days),
                "summaries": [store.summary(conn, user) for user in store.users()],
            }
        finally:
            conn.close()

    @app.post("/api/ocr")
    async def read_photo(user: str = Form(...), photo: UploadFile = None):
        """写真から数字を読むだけ。ここでは保存しない。"""
        if user not in store.users():
            raise HTTPException(400, f"知らないユーザーです: {user}")
        if photo is None:
            raise HTTPException(400, "写真がありません")

        image_bytes = await photo.read()
        if not image_bytes:
            raise HTTPException(400, "写真が空です")
        if len(image_bytes) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "写真が大きすぎます（8MBまで）")

        conn = open_db()
        try:
            previous = store.latest_record(conn, user)
        finally:
            conn.close()

        try:
            reading = app.state.reader(
                image_bytes,
                mime_type=photo.content_type or "image/jpeg",
                previous_weight=previous["weight_kg"] if previous else None,
            )
        except KeyError:
            # GEMINI_API_KEY が無いときはここに来る
            raise HTTPException(503, "GEMINI_API_KEY が設定されていません")
        except Exception as exc:  # 読み取り失敗はUI側で手入力に倒す
            raise HTTPException(502, f"読み取りに失敗しました: {exc}")

        return {"reading": reading.as_dict(), "previous": previous}

    @app.post("/api/records")
    def put_record(body: RecordIn):
        conn = open_db()
        try:
            record = store.Record(**body.model_dump())
            store.save_record(conn, record)
            return {"record": record.as_dict(), "summary": store.summary(conn, record.user)}
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        finally:
            conn.close()

    @app.delete("/api/records/{user}/{day}")
    def remove_record(user: str, day: str):
        conn = open_db()
        try:
            if not store.delete_record(conn, user, day):
                raise HTTPException(404, "その日の記録はありません")
            return {"deleted": True}
        finally:
            conn.close()

    @app.post("/api/goals")
    def put_goal(body: GoalIn):
        conn = open_db()
        try:
            store.set_goal(conn, body.user, body.goal_weight_kg)
            return {"summary": store.summary(conn, body.user)}
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        finally:
            conn.close()

    @app.exception_handler(404)
    def not_found(_request, exc):
        return JSONResponse({"detail": getattr(exc, "detail", "not found")}, status_code=404)

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    if os.environ.get("DIET_FAKE_OCR") == "1":
        print("[デモモード] 写真は読まず、固定のダミー値を返します")
    elif not os.environ.get("GEMINI_API_KEY"):
        print("警告: GEMINI_API_KEY が未設定です。写真の読み取りは失敗します")
        print("      UIだけ試すなら DIET_FAKE_OCR=1 を付けて起動してください")

    host = os.environ.get("DIET_HOST", "0.0.0.0")
    port = int(os.environ.get("DIET_PORT", "8000"))
    print(f"http://localhost:{port} を開いてください（同じWi-Fiのスマホからも見られます）")
    uvicorn.run(app, host=host, port=port)
