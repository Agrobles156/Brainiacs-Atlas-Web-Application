# atlas-backend/routes/notes.py 
import os
from urllib.parse import unquote
from datetime import datetime, timezone
from flask import request, jsonify, session
from pymongo.collection import Collection
from bson.objectid import ObjectId
from pymongo import MongoClient
from dotenv import dotenv_values

DB_HANDLER_AVAILABLE = False
SANITIZE_AVAILABLE = False
try:
    from db_handler.notes import (
        get_notes as db_get_notes,
        create_note as db_create_note,
        update_note as db_update_note,
        delete_note as db_delete_note,
    )
    DB_HANDLER_AVAILABLE = True
except Exception:
    DB_HANDLER_AVAILABLE = False

try:
    from security.security_middleware import sanitize_payload
    SANITIZE_AVAILABLE = True
except Exception:
    SANITIZE_AVAILABLE = False


def _sanitize(data: dict) -> dict:
    if SANITIZE_AVAILABLE:
        return sanitize_payload(data or {})
    return data or {}


# Feature flag to prefer db_handler flow where applicable
USE_DB_HANDLER = (os.getenv("NOTES_USE_DB_HANDLER") or "0").lower() in {"1", "true", "yes"}

# Optional allow-list for local/dev
ADMIN_EMAILS = {
    e.strip().lower()
    for e in (os.getenv("ADMIN_EMAILS") or "").split(",")
    if e.strip()
}


def _first_str(*vals):
    for v in vals:
        if isinstance(v, str) and v.strip():
            return v
    return None


def _coerce_year(v):
    """Ensure year is stored as int or None"""
    if v is None or v == "":
        return None
    try:
        return int(v)
    except Exception:
        return None


def _current_identity():
    """
    Try hard to figure out who the caller is.
    Priority:
      1) session.user / session.profile / session.userinfo
      2) session['email'] / session['name']
      3) DEV headers: X-User-Email / X-Dev-Email, X-User-Name
      4) cookies (prefer user_email over email)
    """
    email = None
    name = None

    me = session.get("user") or session.get("profile") or session.get("userinfo") or {}
    if isinstance(me, dict):
        email = _first_str(me.get("email"), me.get("preferred_username"), me.get("login"))
        name = _first_str(me.get("name"), me.get("given_name"), me.get("nickname"))

    email = email or session.get("email")
    name = name or session.get("name")

    # DEV headers
    email = email or request.headers.get("X-User-Email") or request.headers.get("X-Dev-Email")
    name = name or request.headers.get("X-User-Name") or request.headers.get("X-Dev-Name")

    # Cookies
    cookie_email = _first_str(
        request.cookies.get("user_email"),
        request.cookies.get("email"),
        request.cookies.get("account"),
    )
    cookie_name = _first_str(
        request.cookies.get("user_name"),
        request.cookies.get("name"),
    )
    email = email or cookie_email
    name = name or cookie_name

    if isinstance(email, str):
        email = unquote(email)
    if not name and email:
        name = email.split("@")[0]

    roles_cookie = (request.cookies.get("roles") or "")
    roles = {r.strip().lower() for r in roles_cookie.split(",") if r.strip()}
    return {"email": email, "name": name, "roles": roles}


def _is_admin(db, ident) -> bool:
    """Admin if in ADMIN_EMAILS or users.role is owner/admin (status true)."""
    email = (ident.get("email") or "").lower()
    if email and email in ADMIN_EMAILS:
        return True
    try:
        col: Collection = db["users"]
        doc = col.find_one({"email": email}) if email else None
        return bool(doc and doc.get("role") in ("owner", "admin") and bool(doc.get("status", True)))
    except Exception:
        return False


def _owner_filter_for(ident):
    """Filter that matches notes owned by the current user."""
    email = (ident.get("email") or "").lower().strip()
    name = (ident.get("name") or "").strip()

    ors = []
    if email:
        ors += [
            {"owner_email": email},
            {"user_email": email},
            {"created_by_email": email},
            {"owner.email": email},
            {"user.email": email},
            {"user": email},
        ]
    if name:
        ors += [
            {"owner_name": name},
            {"created_by": name},
            {"username": name},
            {"user_name": name},
        ]

    return {"$or": ors} if ors else {"_id": {"$exists": False}}


def _note_author(doc: dict) -> str:
    """Derive a displayable author; prefer emails first."""

    def _local(s):
        return s.split("@")[0] if isinstance(s, str) and "@" in s else (s if isinstance(s, str) else None)

    for k in ("owner_email", "user_email", "created_by_email"):
        loc = _local(doc.get(k))
        if loc:
            return loc
    owner = doc.get("owner")
    if isinstance(owner, dict):
        loc = _local(owner.get("email")) or owner.get("name")
        if loc:
            return loc
    user = doc.get("user")
    if isinstance(user, dict):
        loc = _local(user.get("email")) or user.get("name")
        if loc:
            return loc
    if isinstance(user, str) and user.strip():
        return user
    for key in ("owner_name", "created_by", "username", "user_name"):
        v = doc.get(key)
        if isinstance(v, str) and v.strip():
            return v
    a = doc.get("author")
    if isinstance(a, str) and a.strip():
        return a
    return "—"


def _normalize_note_for_client(doc: dict) -> dict:
    """Return a lean, client-friendly note document."""
    _id = doc.get("_id") or doc.get("id") or doc.get("note_id") or doc.get("uuid") or ""
    title = doc.get("title") or doc.get("name") or "Untitled"
    details = doc.get("details") or doc.get("content") or doc.get("description") or doc.get("text") or ""
    region = doc.get("region") or doc.get("selected_region") or doc.get("area")
    year = doc.get("year") or doc.get("note_year")
    updated = (
        doc.get("updated_at")
        or doc.get("updatedAt")
        or doc.get("last_updated")
        or doc.get("ts")
        or doc.get("timestamp")
        or doc.get("created_at")
    )
    out = {
        "id": str(_id),
        "title": title,
        "details": details,
        "region": region,
        "year": year,
        "updated_at": updated,
        "author": _note_author(doc),
    }
    owner = doc.get("owner")
    if isinstance(owner, dict) and (owner.get("name") or owner.get("email")):
        out["owner"] = {"name": owner.get("name"), "email": owner.get("email")}
    else:
        on, oe = doc.get("owner_name"), doc.get("owner_email")
        if on or oe:
            out["owner"] = {"name": on, "email": oe}
    return out


def _choose_notes_collection(db) -> Collection | None:
    names = set(db.list_collection_names())
    if "notes" in names:
        return db["notes"]
    if "log" in names:
        return db["log"]
    return None


def _as_epoch(v) -> float:
    if not v:
        return 0.0
    try:
        if isinstance(v, str):
            s = v.replace("Z", "+00:00")
            return datetime.fromisoformat(s).timestamp()
        if isinstance(v, datetime):
            return v.timestamp()
        if isinstance(v, (int, float)):
            return float(v) / (1000.0 if v > 10_000_000_000 else 1.0)
    except Exception:
        return 0.0
    return 0.0


def _note_like_filter_for_log():
    return {
        "$or": [
            {"type": "note"},
            {"kind": "note"},
            {"obj_type": "note"},
            {"title": {"$exists": True}},
        ]
    }


def _id_query_from_any(note_id):
    conds = []
    if isinstance(note_id, str) and ObjectId.is_valid(note_id):
        conds.append({"_id": ObjectId(note_id)})
    for k in ("id", "note_id", "uuid", "ID"):
        conds.append({k: note_id})
    return {"$or": conds}


def _get_username_from_session(app=None):
    user_oid = session.get("userId")
    if not user_oid:
        return None
    try:
        if app is not None and hasattr(app, "db"):
            doc = app.db["users"].find_one({"_id": ObjectId(user_oid)}, {"username": 1})
            return doc["username"] if doc else None
        cfg = dotenv_values(".env")
        db = MongoClient(cfg.get("DB_URL") or "mongodb://127.0.0.1:27017")["demo"]
        doc = db["users"].find_one({"_id": ObjectId(user_oid)}, {"username": 1})
        return doc["username"] if doc else None
    except Exception:
        return None


def register_notes_routes(app):

    # ---- LIST (my / all / admin) ----
    @app.get("/notes")
    @app.get("/flask-api/notes")
    def list_notes():
        ident = _current_identity()
        is_admin = _is_admin(app.db, ident)

        scope = (request.args.get("scope") or "my").lower()
        # non-admins can request "my" or "shared"; anything else collapses to "my"
        if not is_admin and scope not in ("my", "shared"):
            scope = "my"

        q = (request.args.get("q") or "").strip()
        sort = (request.args.get("sort") or "updated").lower()
        try:
            limit = max(1, min(int(request.args.get("limit") or 250), 1000))
        except Exception:
            limit = 250
        col = _choose_notes_collection(app.db)
        if col is None:
            return jsonify([]), 200

        # Handle shared scope via query param (?scope=shared)
        if scope == "shared":
            user_email = (ident.get("email") or "").lower().strip()
            if not user_email:
                return jsonify([]), 200

            query = {"shared_with": user_email}
            if q:
                rx = {"$regex": q, "$options": "i"}
                text = {
                    "$or": [
                        {"title": rx},
                        {"details": rx},
                        {"content": rx},
                        {"description": rx},
                        {"text": rx},
                    ]
                }
                query = {"$and": [query, text]}
            docs = list(col.find(query).limit(limit * 3))
            items = [_normalize_note_for_client(d) for d in docs]
            if sort == "title":
                items.sort(key=lambda x: (x.get("title") or "").lower())
            else:
                items.sort(key=lambda x: _as_epoch(x.get("updated_at")), reverse=True)
            return jsonify(items[:limit]), 200

        # Default: my / all / admin
        if scope in ("all", "admin"):
            query = {} if col.name != "log" else _note_like_filter_for_log()
        else:
            query = _owner_filter_for(ident)
            if col.name == "log":
                query = {"$and": [query, _note_like_filter_for_log()]}

        if q:
            rx = {"$regex": q, "$options": "i"}
            text = {"$or": [{"title": rx}, {"details": rx}, {"content": rx}, {"description": rx}, {"text": rx}]}
            query = {"$and": [query, text]} if query else text

        docs = list(col.find(query).limit(limit * 3))
        items = [_normalize_note_for_client(d) for d in docs]
        if sort == "title":
            items.sort(key=lambda x: (x.get("title") or "").lower())
        else:
            items.sort(key=lambda x: _as_epoch(x.get("updated_at")), reverse=True)
        return jsonify(items[:limit]), 200

    # ---- LIST SHARED (alias for /notes/shared) ----
    @app.get("/notes/shared")
    @app.get("/flask-api/notes/shared")
    def list_shared_notes():
        ident = _current_identity()
        user_email = (ident.get("email") or "").lower().strip()

        if not user_email:
            return jsonify([]), 200

        q = (request.args.get("q") or "").strip()
        sort = (request.args.get("sort") or "updated").lower()
        try:
            limit = max(1, min(int(request.args.get("limit") or 250), 1000))
        except Exception:
            limit = 250

        col = _choose_notes_collection(app.db)
        if col is None:
            return jsonify([]), 200

        query = {"shared_with": user_email}
        if q:
            rx = {"$regex": q, "$options": "i"}
            text = {
                "$or": [
                    {"title": rx},
                    {"details": rx},
                    {"content": rx},
                    {"description": rx},
                    {"text": rx},
                ]
            }
            query = {"$and": [query, text]}

        docs = list(col.find(query).limit(limit * 3))
        items = [_normalize_note_for_client(d) for d in docs]
        if sort == "title":
            items.sort(key=lambda x: (x.get("title") or "").lower())
        else:
            items.sort(key=lambda x: _as_epoch(x.get("updated_at")), reverse=True)
        return jsonify(items[:limit]), 200

    # CREATE
    @app.post("/notes")
    @app.post("/notes/create")
    @app.post("/notes/new")
    @app.post("/create-note")
    @app.post("/flask-api/notes")
    @app.post("/flask-api/notes/create")
    @app.post("/flask-api/notes/new")
    @app.post("/flask-api/create-note")
    def create_note():
        data = _sanitize(request.get_json(silent=True) or {})

        ident = _current_identity()
        owner_email = (ident.get("email") or "").lower()
        owner_name = ident.get("name") or (owner_email.split("@")[0] if owner_email else None)
        if not owner_email:
            return jsonify({"error": "unauthenticated"}), 401

        # Clone support for duplication (preserve preview)
        clone_key = (
            data.get("clone_id")
            or data.get("copy_from")
            or data.get("source_id")
            or data.get("from_id")
            or data.get("parent_id")
        )
        source_doc = None
        col_for_clone = _choose_notes_collection(app.db)
        if col_for_clone is None:
            col_for_clone = app.db["notes"]
        if clone_key:
            try:
                q = _id_query_from_any(str(clone_key))
                source_doc = col_for_clone.find_one(q)
            except Exception:
                source_doc = None

        # Extract incoming details
        new_details = (
            data.get("details")
            or data.get("content")
            or data.get("description")
            or ""
        )

        # If cloning, merge atlas-related metadata and (optionally) the fenced block
        if source_doc:
            # Copy region/year if missing
            if not data.get("region") and source_doc.get("region"):
                data["region"] = source_doc.get("region")
            if data.get("year") in (None, "", 0) and source_doc.get("year") is not None:
                data["year"] = source_doc.get("year")

            # Copy atlas fields if not provided by client
            for k in ("atlas", "atlas_state", "selected_region", "active_layers", "selected_tiles"):
                if k not in data and k in source_doc:
                    data[k] = source_doc[k]

            # Append fenced ```atlas block if new_details lacks one but source has one
            def _extract_fenced(s):
                if not isinstance(s, str):
                    return None
                i = s.find("```atlas")
                if i == -1:
                    return None
                j = s.find("```", i + 7)
                if j == -1:
                    return None
                return s[i : j + 3]

            if isinstance(new_details, str):
                has_fence = "```atlas" in new_details
            else:
                has_fence = False

            if not has_fence:
                fence = _extract_fenced(source_doc.get("details", ""))
                if fence:
                    if new_details and not new_details.endswith("\n"):
                        new_details += "\n"
                    new_details += ("\n" + fence + "\n")

        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "title": data.get("title") or "Untitled",
            "details": new_details,
            "region": data.get("region"),
            "year": _coerce_year(data.get("year")),
            "created_at": now,
            "updated_at": now,
            "owner": {"name": owner_name, "email": owner_email},
            "owner_name": owner_name,
            "owner_email": owner_email,
            "author": owner_name,
            "user_email": owner_email,
            "user": {"name": owner_name, "email": owner_email},
        }

        # Pass through atlas metadata (original or cloned)
        for k in ("atlas", "atlas_state", "selected_region", "active_layers", "selected_tiles"):
            if k in data:
                doc[k] = data[k]

        col = _choose_notes_collection(app.db)
        if col is None:
            col = app.db["notes"]
        ins = col.insert_one(doc)
        out = _normalize_note_for_client({**doc, "_id": ins.inserted_id})
        return jsonify(out), 201

    # UPDATE (core + aliases)
    def _update_note_core(note_id: str, data: dict):
        data = _sanitize(data or {})
        ident = _current_identity()
        col = _choose_notes_collection(app.db)
        if col is None:
            col = app.db["notes"]
        base = _id_query_from_any(note_id)
        if not _is_admin(app.db, ident):
            base = {"$and": [base, _owner_filter_for(ident)]}
        patch = {}
        if "title" in data:
            patch["title"] = data.get("title")
        if any(k in data for k in ("details", "content", "description", "text")):
            patch["details"] = (
                data.get("details")
                or data.get("content")
                or data.get("description")
                or data.get("text")
            )
        if "region" in data:
            patch["region"] = data.get("region")
        if "year" in data:
            patch["year"] = _coerce_year(data.get("year"))
        patch["updated_at"] = datetime.now(timezone.utc).isoformat()
        try:
            res = col.update_one(base, {"$set": patch})
            if res.matched_count == 0:
                return jsonify({"error": "not found"}), 404
            new_doc = col.find_one(base)
            out = _normalize_note_for_client(new_doc)
            return jsonify({"message": "Note updated successfully", "updated": True, "note": out, **out}), 200
        except Exception as e:
            return jsonify({"error": "update failed", "details": str(e)}), 500

    @app.put("/notes/<note_id>")
    @app.put("/flask-api/notes/<note_id>")
    def update_note_route(note_id):
        data = request.get_json(silent=True) or {}
        return _update_note_core(note_id, data)

    @app.patch("/flask-api/notes/<note_id>")
    def update_note_patch(note_id):
        data = request.get_json(silent=True) or {}
        return _update_note_core(note_id, data)

    @app.post("/flask-api/notes/<note_id>/edit")
    @app.post("/notes/<note_id>/edit")
    def update_note_edit_alias(note_id):
        data = request.get_json(silent=True) or {}
        return _update_note_core(note_id, data)

    @app.post("/flask-api/notes/update")
    @app.post("/flask-api/notes/edit")
    @app.post("/notes/update")
    @app.post("/notes/edit")
    def update_note_post_alias():
        data = request.get_json(silent=True) or {}
        note_id = data.get("id") or data.get("note_id") or data.get("_id") or request.args.get("id")
        if not note_id:
            return jsonify({"error": "missing id"}), 400
        return _update_note_core(str(note_id), data)

    # -------------------------
    # DELETE
    # -------------------------
    def _perform_delete(note_id: str):
        ident = _current_identity()
        col = _choose_notes_collection(app.db)
        if col is None:
            return jsonify({"error": "not found"}), 404

        base = _id_query_from_any(note_id)
        if not _is_admin(app.db, ident):
            base = {"$and": [base, _owner_filter_for(ident)]}

        try:
            res = col.delete_one(base)
            if res.deleted_count == 0:
                return jsonify({"error": "not found"}), 404
            return jsonify({"deleted": True, "id": str(note_id)}), 200
        except Exception as e:
            return jsonify({"error": "delete failed", "details": str(e)}), 500

    @app.delete("/flask-api/notes/<note_id>")
    @app.delete("/notes/<note_id>")
    def delete_note(note_id):
        return _perform_delete(note_id)

    @app.post("/flask-api/notes/delete")
    @app.post("/flask-api/notes/remove")
    @app.post("/flask-api/notes/destroy")
    def delete_note_post_alias():
        data = request.get_json(silent=True) or {}
        note_id = data.get("id") or data.get("note_id") or data.get("_id") or request.args.get("id")
        if not note_id:
            return jsonify({"error": "missing id"}), 400
        return _perform_delete(str(note_id))

    # ------------------------------------------------
    # SHARE NOTE  (matches frontend expectations)
    # ------------------------------------------------
    @app.post("/notes/<note_id>/share")
    @app.post("/flask-api/notes/<note_id>/share")
    @app.post("/notes/share")
    @app.post("/flask-api/notes/share")
    def share_note(note_id=None):
        data = request.get_json(silent=True) or {}

        # Determine the incoming note id
        nid = note_id or data.get("note_id") or data.get("id")
        if not nid:
            return jsonify({"error": "missing id"}), 400

        # Determine the target email
        email = data.get("email")
        if not email or not isinstance(email, str):
            return jsonify({"error": "missing email"}), 400

        ident = _current_identity()
        if not ident.get("email"):
            return jsonify({"error": "unauthenticated"}), 401

        col = _choose_notes_collection(app.db)
        if col is None:
            col = app.db["notes"]

        base = _id_query_from_any(str(nid))
        doc = col.find_one(base)
        if not doc:
            return jsonify({"error": "not found"}), 404

        # Add email to shared_with (array)
        shared = doc.get("shared_with", [])
        if email not in shared:
            shared.append(email)

        col.update_one(base, {"$set": {"shared_with": shared}})

        return jsonify({"success": True, "shared_with": shared}), 200

