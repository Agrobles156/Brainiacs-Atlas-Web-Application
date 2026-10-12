# routes_chat.py
from flask import request, jsonify
from datetime import datetime
from pymongo import ASCENDING, DESCENDING
import uuid

DEFAULT_CHANNELS = ["general", "start-here", "announcements"]

def _ensure_channels(app, server_id: str):
    """Make sure the server doc has a channels array with stable ids."""
    db = app.db
    srv = db.servers.find_one({"_id": server_id})
    if not srv:
        # If for some reason the server hasn't been created yet, create a stub.
        db.servers.update_one(
            {"_id": server_id},
            {"$setOnInsert": {"name": server_id, "members": [], "channels": []}},
            upsert=True,
        )
        srv = db.servers.find_one({"_id": server_id})

    channels = (srv or {}).get("channels") or []
    # If already present and each has id+name, keep as-is
    if channels and all(c.get("id") and c.get("name") for c in channels):
        return channels

    # Seed defaults with deterministic UUIDs per (serverId, channelName)
    seeded = []
    for name in DEFAULT_CHANNELS:
        ch_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{server_id}:{name}"))
        seeded.append({"id": ch_id, "name": name})

    db.servers.update_one({"_id": server_id}, {"$set": {"channels": seeded}})
    return seeded


def register_chat_routes(app):
    db = app.db

    # Optional but helpful: indexes
    try:
        db.messages.create_index([("serverId", ASCENDING), ("channelId", ASCENDING), ("createdAt", ASCENDING)])
        db.messages.create_index([("clientId", ASCENDING)], sparse=True)
    except Exception:
        pass

    @app.get("/servers/<server_id>/channels")
    def list_channels(server_id: str):
        channels = _ensure_channels(app, server_id)
        return jsonify({"ok": True, "channels": channels}), 200

    @app.get("/servers/<server_id>/channels/<channel_id>/messages")
    def list_messages(server_id: str, channel_id: str):
        try:
            limit = int(request.args.get("limit", 200))
        except Exception:
            limit = 200
        limit = max(1, min(limit, 500))

        cur = (
            db.messages
            .find({"serverId": server_id, "channelId": channel_id})
            .sort("createdAt", ASCENDING)
            .limit(limit)
        )

        out = []
        for m in cur:
            k = (m.get("kind") or "text").lower()
            doc = {
                "_id": str(m.get("_id")),
                "kind": k,
                "author": m.get("author") or "someone",
                "createdAt": (m.get("createdAt") or datetime.utcnow()).isoformat() + "Z",
            }
            if k == "loop":
                doc["loop"] = m.get("loop") or {}
            elif k == "note":
                # forward the stored note payload verbatim
                doc["note"] = m.get("note") or {}
            else:
                doc["text"] = m.get("text") or ""
            out.append(doc)

        return jsonify({"ok": True, "count": len(out), "messages": out}), 200

    @app.post("/servers/<server_id>/channels/<channel_id>/messages")
    def post_message(server_id: str, channel_id: str):
        data = request.get_json(silent=True) or {}
        kind = (data.get("kind") or "text").lower()
        author = (data.get("author") or "someone").strip()
        client_id = (data.get("clientId") or "").strip()

        if kind not in ("text", "loop", "note"):
            return jsonify({"ok": False, "error": "invalid kind"}), 400

        base = {
            "serverId": server_id,
            "channelId": channel_id,
            "kind": kind,
            "author": author,
            "createdAt": datetime.utcnow(),
        }

        if kind == "text":
            text = (data.get("text") or "").strip()
            if not text:
                return jsonify({"ok": False, "error": "empty text"}), 400
            doc = {**base, "text": text}
        elif kind == "loop":
            loop = data.get("loop") or {}
            doc = {**base, "loop": loop}
        else:  # kind == "note"
            note = data.get("note") or {}
            # minimal sanity: ensure we at least have a title string
            title = note.get("title") if isinstance(note, dict) else None
            if not isinstance(title, str) or not title.strip():
                return jsonify({"ok": False, "error": "invalid note payload"}), 400
            doc = {**base, "note": note}

        if client_id:
            doc["clientId"] = client_id

        _id = db.messages.insert_one(doc).inserted_id
        return jsonify({"ok": True, "id": str(_id)}), 200
 