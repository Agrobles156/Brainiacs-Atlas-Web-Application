# atlas-backend/routes/admin.py
import os
from urllib.parse import unquote
from datetime import datetime
from flask import request, jsonify, session
from pymongo.collection import Collection

# Optional whitelist for development / bootstrap
ADMIN_EMAILS = {
    e.strip().lower()
    for e in (os.getenv("ADMIN_EMAILS") or "").split(",")
    if e.strip()
}


def _current_identity():
    """
    Extract the current user's identity from session/cookies.
    Returns: {"email": str|None, "name": str|None, "roles": set[str]}
    """
    email = None
    name = None

    me = session.get('user') or session.get('profile') or session.get('userinfo') or {}
    if isinstance(me, dict):
        email = me.get('email') or me.get('preferred_username') or me.get('login') or email
        name  = me.get('name')  or me.get('given_name') or me.get('nickname') or name

    email = email or session.get('email')
    name  = name  or session.get('name')

    # Cookies fallback (dev-friendly)
    email = email or request.cookies.get('email') or request.cookies.get('user_email') or request.cookies.get('account')
    name  = name  or request.cookies.get('name')  or request.cookies.get('user_name')

    if isinstance(email, str):
        email = unquote(email)
    if not name and email:
        name = email.split('@')[0]

    roles_cookie = (request.cookies.get('roles') or '')
    roles = {r.strip().lower() for r in roles_cookie.split(',') if r.strip()}
    return {"email": email, "name": name, "roles": roles}


def _ensure_current_user_seed_mongo(db, ident):
    """
    If the users collection is empty and we have a caller email, seed them as owner.
    """
    email = (ident.get("email") or "").lower()
    if not email:
        return
    col: Collection = db["users"]
    if col.count_documents({}) == 0:
        col.insert_one({
            "username": ident.get("name") or email.split("@")[0],
            "email": email,
            "role": "owner",
            "status": True,
        })


def _require_admin_mongo(db, ident):
    """
    Allow admin if:
      - roles cookie contains owner/admin, OR
      - ADMIN_EMAILS env contains this email, OR
      - users.email has role owner/admin and status true
    """
    email = (ident.get("email") or "").lower()

    # Cookie shortcut (dev)
    if any(r in ident["roles"] for r in ("owner", "admin")):
        return True, None

    # Whitelist shortcut (dev)
    if email and email in ADMIN_EMAILS:
        return True, None

    col: Collection = db["users"]
    doc = col.find_one({"email": email}) if email else None
    if doc and doc.get("role") in ("owner", "admin") and bool(doc.get("status", True)):
        return True, None

    return False, (jsonify({"error": "forbidden"}), 403)


def _to_ui_user(doc: dict) -> dict:
    """Return the minimal, normalized shape your Admin Users table expects."""
    email = (
        doc.get("email")
        or doc.get("user_email")
        or doc.get("preferred_username")
        or doc.get("login")
        or ""
    )
    name = (
        doc.get("username")
        or doc.get("name")
        or doc.get("full_name")
        or (email.split("@")[0] if email else "—")
    )
    role = (doc.get("role") or "user").lower()
    status = bool(doc.get("status", True))

    return {
        "name": name,
        "email": email or "",
        "role": role,
        "status": status,
    }


# ---------- helpers for admin notes ----------
def _parse_ts(v):
    if not v:
        return 0
    try:
        if isinstance(v, str):
            s = v.replace("Z", "+00:00")
            return datetime.fromisoformat(s).timestamp()
        if isinstance(v, datetime):
            return v.timestamp()
        if isinstance(v, (int, float)):
            return float(v) / (1000.0 if v > 10_000_000_000 else 1.0)
    except Exception:
        return 0
    return 0


def _email_local(s: str | None) -> str | None:
    if not isinstance(s, str) or not s.strip():
        return None
    return s.split("@")[0] if "@" in s else s.strip()


def _note_author(doc: dict) -> str:
    # Prefer email fields first for stable authorship
    for k in ("owner_email", "user_email", "created_by_email"):
        local = _email_local(doc.get(k))
        if local:
            return local

    owner = doc.get("owner")
    if isinstance(owner, dict):
        local = _email_local(owner.get("email"))
        if local:
            return local

    user = doc.get("user")
    if isinstance(user, dict):
        local = _email_local(user.get("email"))
        if local:
            return local

    # Fallback to names
    for key in ("owner_name", "created_by", "username", "user_name"):
        v = doc.get(key)
        if isinstance(v, str) and v.strip():
            return v

    if isinstance(user, str) and user.strip():
        return user

    a = doc.get("author")
    if isinstance(a, str) and a.strip():
        return a

    # Last resort
    for k in ("owner", "user"):
        v = doc.get(k)
        if isinstance(v, str):
            local = _email_local(v)
            if local:
                return local
    return "—"


def _map_note_doc(doc: dict) -> dict:
    """Normalize various possible note shapes into the GridNote your UI expects."""
    _id = doc.get("_id") or doc.get("id") or doc.get("note_id") or doc.get("noteId")
    note_id = str(_id) if _id is not None else ""

    title = doc.get("title") or doc.get("name") or "Untitled"
    details = doc.get("details") or doc.get("content") or doc.get("text") or ""
    region = doc.get("region") or doc.get("atlas_region") or doc.get("selected_region")
    year   = doc.get("year")   or doc.get("atlas_year")  or doc.get("selected_year")

    updated = (
        doc.get("updated_at")
        or doc.get("updatedAt")
        or doc.get("last_updated")
        or doc.get("updated")
        or doc.get("ts")
        or doc.get("timestamp")
    )

    return {
        "id": note_id,
        "title": title,
        "authors": _note_author(doc),  # email-first author
        "details": details,
        "region": region,
        "year": year,
        "updatedAt": updated,
        "_sort_updated": _parse_ts(updated),
    }


def register_admin_routes(app):
    """
    Register admin endpoints.  This function is imported in main.py.
    """
    @app.get("/admin/logs")
    @app.get("/flask-api/admin/logs")
    def admin_get_logs():
        # Identify current user
        ident = _current_identity()

        # Ensure at least one user exists (same as admin/users)
        _ensure_current_user_seed_mongo(app.db, ident)

        # Enforce admin-only access
        ok, err = _require_admin_mongo(app.db, ident)
        if not ok:
            return err

        # Use consistent Mongo reference
        col: Collection = app.db["log"]

        # Fetch logs and serialize IDs
        docs = list(col.find({}, {"_id": 1, "username": 1, "login_at": 1, "ip_address": 1}))

        logs = []
        for d in docs:
            logs.append({
                "_id": str(d.get("_id")),
                "username": d.get("username") or "—",
                "login_at": d.get("login_at"),
                "ip_address": d.get("ip_address"),
            })

        return jsonify(logs), 200

    @app.get("/admin/users")
    @app.get("/flask-api/admin/users")
    def admin_list_users():
        ident = _current_identity()
        _ensure_current_user_seed_mongo(app.db, ident)
        ok, err = _require_admin_mongo(app.db, ident)
        if not ok:
            return err

        col: Collection = app.db["users"]
        projection = {
            "_id": 0,
            "username": 1,
            "name": 1,
            "full_name": 1,
            "email": 1,
            "user_email": 1,
            "preferred_username": 1,
            "login": 1,
            "role": 1,
            "status": 1,
        }
        docs = list(col.find({}, projection))
        users = [_to_ui_user(d) for d in docs]
        return jsonify(users), 200

    @app.post("/admin/user/field")
    @app.post("/flask-api/admin/user/field")
    def admin_update_user_field():
        ident = _current_identity()
        _ensure_current_user_seed_mongo(app.db, ident)
        ok, err = _require_admin_mongo(app.db, ident)
        if not ok:
            return err

        data = request.get_json(force=True) or {}
        email = (data.get("email") or "").lower()
        field = data.get("field")
        value = data.get("value")

        if not email or field not in ("role", "status"):
            return jsonify({"error": "invalid payload"}), 400

        col: Collection = app.db["users"]
        doc = col.find_one({"email": email})
        if not doc:
            return jsonify({"error": "user not found"}), 404

        update = {}
        if field == "role":
            update["role"] = "admin" if value == "admin" else "user"
        elif field == "status":
            update["status"] = bool(value)

        col.update_one({"email": email}, {"$set": update})
        return jsonify({"message": "ok"}), 200
    
    @app.delete("/admin/user")
    @app.delete("/flask-api/admin/user")
    def admin_delete_user():
        ident = _current_identity()
        _ensure_current_user_seed_mongo(app.db, ident)
        ok, err = _require_admin_mongo(app.db, ident)
        if not ok:
            return err

        data = request.get_json(force=True) or {}
        email = (data.get("email") or "").lower()

        if not email:
            return jsonify({"error": "missing email"}), 400

        col: Collection = app.db["users"]

        # Do not allow an admin to delete themselves
        if email == (ident.get("email") or "").lower():
            return jsonify({"error": "cannot delete your own account"}), 400

        result = col.delete_one({"email": email})

        if result.deleted_count == 0:
            return jsonify({"error": "user not found"}), 404

        return jsonify({"message": "deleted"}), 200

        
    # Admin-wide notes listing
    @app.get("/admin/notes")
    @app.get("/flask-api/admin/notes")
    def admin_list_all_notes():
        ident = _current_identity()
        _ensure_current_user_seed_mongo(app.db, ident)
        ok, err = _require_admin_mongo(app.db, ident)
        if not ok:
            return err

        q = (request.args.get("q") or "").strip()
        sort_key = (request.args.get("sort") or "updated").lower()
        try:
            limit = max(1, min(int(request.args.get("limit") or 250), 1000))
        except Exception:
            limit = 250

        names = set(app.db.list_collection_names())
        preferred = None
        for candidate in ("notes", "user_notes", "notes_idem", "note"):
            if candidate in names:
                preferred = candidate
                break
        if preferred is None:
            preferred = "log" if "log" in names else None

        if preferred is None:
            return jsonify({"items": []}), 200

        col: Collection = app.db[preferred]

        filters = []
        if preferred == "log":
            filters.append({
                "$or": [
                    {"type": "note"},
                    {"kind": "note"},
                    {"obj_type": "note"},
                    {"title": {"$exists": True}}
                ]
            })

        if q:
            rx = {"$regex": q, "$options": "i"}
            filters.append({"$or": [{"title": rx}, {"details": rx}, {"content": rx}, {"text": rx}]})

        mongo_query = {"$and": filters} if filters else {}
        docs = list(col.find(mongo_query).limit(limit * 3))

        items = [_map_note_doc(d) for d in docs]

        if sort_key == "title":
            items.sort(key=lambda x: (x.get("title") or "").lower())
        else:
            items.sort(key=lambda x: x.get("_sort_updated", 0), reverse=True)

        for it in items:
            it.pop("_sort_updated", None)
        items = items[:limit]

        return jsonify({"items": items}), 200
    
    


# make the intended export explicit
__all__ = ["register_admin_routes"]
