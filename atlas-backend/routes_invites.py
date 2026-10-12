# routes_invites.py
from flask import request, jsonify
from datetime import datetime, timedelta
import os, secrets, base64, smtplib
from email.message import EmailMessage


# Current user helpers 
def _first_nonempty(*vals):
    for v in vals:
        if v:
            s = str(v).strip()
            if s:
                return s
    return None


def current_user_id():
    """
    Try multiple places for an identity (prefer email).
    Falls back to None (so callers can choose a default).
    """
    cookie_keys = ["email", "user_email", "user", "user_id", "uid"]
    header_keys = ["X-Email", "X-User-Email", "X-User-Id"]

    cookie_val = _first_nonempty(*[request.cookies.get(k) for k in cookie_keys])
    header_val = _first_nonempty(*[request.headers.get(k) for k in header_keys])

    ident = _first_nonempty(cookie_val, header_val)
    return ident.lower() if ident else None


def current_user_display():
    """
    Best-effort display name for the inviter.
    Tries a few common cookies; falls back to the current_user_id (email) or 'anonymous'.
    """
    display_keys = ["whoami", "display", "username", "user_name", "name"]
    disp = _first_nonempty(*[request.cookies.get(k) for k in display_keys])
    if disp:
        return str(disp).strip()
    uid = current_user_id()
    return uid or "anonymous"


# Helpers 
def _get_server_name(db, server_id: str) -> str:
    doc = db.servers.find_one({"_id": server_id})
    if doc and doc.get("name"):
        return str(doc["name"])
    return server_id


# Email helper (safe if SMTP not configured) 
def maybe_send_email_invite(*, app, rcpt_to: str, server_name: str, join_link: str):
    cfg = app.config
    smtp_host = os.getenv("SMTP_HOST", cfg.get("SMTP_HOST", ""))
    smtp_port = int(os.getenv("SMTP_PORT", cfg.get("SMTP_PORT", 0) or 0))
    smtp_user = os.getenv("SMTP_USER", cfg.get("SMTP_USER", ""))
    smtp_pass = os.getenv("SMTP_PASS", cfg.get("SMTP_PASS", ""))
    mail_from = os.getenv("MAIL_FROM", cfg.get("MAIL_FROM", smtp_user or ""))

    if not (smtp_host and smtp_port and mail_from):
        app.logger.info(f"[invite] SMTP not configured; skipping send to {rcpt_to}. Link: {join_link}")
        return True, "skipped (no smtp)"

    subject = f"You've been invited to join “{server_name}”"
    text_body = f"Join: {join_link}\n"
    html_body = f"""
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif">
        <h2>You've been invited to <em>{server_name}</em></h2>
        <p><a href="{join_link}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Join {server_name}</a></p>
        <p>If the button doesn't work, copy this link:</p>
        <code>{join_link}</code>
      </div>
    """

    try:
        msg = EmailMessage()
        msg["From"] = mail_from
        msg["To"] = rcpt_to
        msg["Subject"] = subject
        msg.set_content(text_body)
        msg.add_alternative(html_body, subtype="html")

        with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as s:
            try:
                s.starttls()
            except Exception:
                pass
            if smtp_user:
                s.login(smtp_user, smtp_pass)
            s.send_message(msg)
        return True, "sent"
    except Exception as e:
        app.logger.error(f"[invite] FAILED to {rcpt_to}: {e}")
        return False, f"error: {e}"


# Route registration 
def register_invite_routes(app):
    db = app.db  # Mongo handle from main.py

    # Create invites
    @app.post("/servers/<server_id>/invites")
    def create_invites(server_id: str):
        data = request.get_json(silent=True) or {}
        emails = [e.lower() for e in (data.get("emails") or []) if isinstance(e, str) and "@" in e]
        if not emails:
            return jsonify({"ok": False, "message": "no emails"}), 200

        # If a serverName is provided by the client, persist it on the server document.
        provided_name = (data.get("serverName") or "").strip()
        if provided_name:
            db.servers.update_one(
                {"_id": server_id},
                {"$set": {"name": provided_name}, "$setOnInsert": {"members": []}},
                upsert=True,
            )
        else:
            # Ensure server exists with a default name (id) if not created elsewhere
            db.servers.update_one(
                {"_id": server_id},
                {"$setOnInsert": {"name": server_id, "members": []}},
                upsert=True,
            )

        # Friendly values (always recompute after potential update)
        server_name = _get_server_name(db, server_id)
        invited_by_display = current_user_display()

        frontend_base = os.getenv("FRONTEND_BASE_URL", app.config.get("FRONTEND_BASE_URL", "http://localhost:3000"))
        expires_at = datetime.utcnow() + timedelta(days=7)

        invited, failed, links = [], [], {}
        for rcpt in emails:
            raw = f"{server_id}:{rcpt}:{secrets.token_urlsafe(16)}"
            token = base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")

            db.invites.insert_one({
                "token": token,
                "serverId": server_id,
                "serverName": server_name,       
                "email": rcpt,
                "invitedBy": invited_by_display, 
                "createdAt": datetime.utcnow(),
                "expiresAt": expires_at,
                "acceptedAt": None,
                "acceptedBy": None,
                "declinedAt": None,
            })

            join_url = f"{frontend_base}/join/{server_id}?t={token}"
            links[rcpt] = join_url
            ok, _ = maybe_send_email_invite(app=app, rcpt_to=rcpt, server_name=server_name, join_link=join_url)
            (invited if ok else failed).append(rcpt)

        return jsonify({
            "ok": True,
            "serverId": server_id,
            "serverName": server_name,
            "invited": invited,
            "failed": failed,
            "links": links
        }), 200

    # Accept invite
    @app.post("/invites/accept")
    def accept_invite():
        data = request.get_json(silent=True) or {}
        token = data.get("token")
        if not token:
            return jsonify({"ok": False, "error": "missing token"}), 400

        inv = db.invites.find_one({"token": token})
        if not inv:
            return jsonify({"ok": False, "error": "invalid token"}), 400

        if inv.get("acceptedAt"):
            srv = db.servers.find_one({"_id": inv["serverId"]}, {"_id": 1, "name": 1, "members": 1})
            return jsonify({"ok": True, "alreadyAccepted": True, "server": srv, "serverName": (srv.get("name") if srv else inv.get("serverName"))}), 200

        if inv["expiresAt"] < datetime.utcnow():
            return jsonify({"ok": False, "error": "expired"}), 400

        # Identity: explicit override, else cookie/header, else invited email
        user_id = _first_nonempty(data.get("as"), current_user_id(), inv.get("email")).lower()

        db.servers.update_one({"_id": inv["serverId"]}, {"$addToSet": {"members": user_id}})
        db.invites.update_one({"token": token}, {"$set": {"acceptedAt": datetime.utcnow(), "acceptedBy": user_id}})

        srv = db.servers.find_one({"_id": inv["serverId"]}, {"_id": 1, "name": 1, "members": 1})
        server_name = inv.get("serverName", srv.get("name") if srv else inv["serverId"])
        return jsonify({"ok": True, "server": srv, "serverName": server_name}), 200

    # Decline invite (optional; used by the frontend "Decline" button)
    @app.post("/invites/decline")
    def decline_invite():
        data = request.get_json(silent=True) or {}
        token = data.get("token")
        if not token:
            return jsonify({"ok": False, "error": "missing token"}), 400

        inv = db.invites.find_one({"token": token})
        if not inv:
            return jsonify({"ok": False, "error": "invalid token"}), 400

        # Mark declined; you could also delete the invite instead.
        db.invites.update_one({"token": token}, {"$set": {"declinedAt": datetime.utcnow()}})
        return jsonify({"ok": True}), 200

    # Leave a server (persisted removal from members) 
    @app.post("/servers/<server_id>/leave")
    def leave_server(server_id: str):
        body = request.get_json(silent=True) or {}
        who = _first_nonempty(body.get("as"), current_user_id())
        if not who:
            return jsonify({"ok": False, "error": "no identity"}), 400
        who = who.lower()
        db.servers.update_one({"_id": server_id}, {"$pull": {"members": who}})
        return jsonify({"ok": True}), 200

    # Pending invites for the current user (or ?email=)
    @app.get("/invites/pending")
    def list_pending_invites():
        frontend_base = os.getenv("FRONTEND_BASE_URL", app.config.get("FRONTEND_BASE_URL", "http://localhost:3000"))
        me = _first_nonempty(request.args.get("email"), current_user_id())
        if not me:
            return jsonify({"ok": False, "error": "no identity"}), 200

        me = me.lower()
        cur = db.invites.find({"email": me, "acceptedAt": None, "declinedAt": None})
        items = []
        for inv in cur:
            join_url = f"{frontend_base}/join/{inv['serverId']}?t={inv['token']}"
            # Resolve friendly server name if not stored
            server_name = inv.get("serverName") or _get_server_name(db, inv["serverId"])
            items.append({
                "serverId": inv["serverId"],
                "serverName": server_name,
                "email": inv["email"],
                "invitedBy": inv.get("invitedBy") or "—",
                "createdAt": inv.get("createdAt"),
                "expiresAt": inv.get("expiresAt"),
                "joinLink": join_url,
            })
        return jsonify({"ok": True, "count": len(items), "invites": items}), 200

    # Servers for me (or ?email=)
    @app.get("/me/servers")
    def list_my_servers():
        uid = _first_nonempty(request.args.get("email"), current_user_id())
        if not uid:
            return jsonify({"ok": True, "servers": []}), 200
        uid = uid.lower()
        cur = db.servers.find({"members": uid}, {"_id": 1, "name": 1})
        out = [{"id": s["_id"], "name": (s.get("name") or s["_id"])} for s in cur]
        return jsonify({"ok": True, "servers": out}), 200
