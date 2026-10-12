# atlas-backend/routes_share_notes.py
from flask import request, jsonify, session
from bson import ObjectId
from db_handler.connection_db import connect_db
from db_handler.shares import share_note_with_user, get_shared_notes

PREFIXES = ["", "/flask-api"]

def _get_user_id():
  # Session user id set by your auth
  return session.get("userId")

def _need_auth():
  return jsonify({"error": "User not authenticated"}), 401

def register_share_routes(app):
  # POST /<prefix>/notes/<note_id>/share
  # POST /<prefix>/notes/share            (with { id | note_id | _id } in body)
  def _share_note(note_id=None):
    user_id = _get_user_id()
    if not user_id:
      return _need_auth()

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    if not email:
      return jsonify({"error": "Missing email"}), 400

    # Allow id in body
    if not note_id:
      note_id = data.get("id") or data.get("note_id") or data.get("_id")
    if not note_id:
      return jsonify({"error": "Missing note id"}), 400

    db = connect_db()
    users = db["users"]

    # Verify note belongs to current user and fetch username
    try:
      owner = users.find_one(
        {"_id": ObjectId(user_id), "notes._id": ObjectId(note_id)},
        {"username": 1, "notes.$": 1}
      )
    except Exception:
      return jsonify({"error": "Bad id format"}), 400

    if not owner or "username" not in owner:
      return jsonify({"error": "note not found", "success": False}), 400

    owner_username = owner["username"]

    ok = share_note_with_user(owner_username, str(note_id), email)
    if ok:
      return jsonify({"success": True, "message": "Note shared successfully"}), 200
    return jsonify({"error": "Failed to share note", "success": False}), 400

  # GET /<prefix>/notes/shared
  def _shared_with_me():
    user_id = _get_user_id()
    if not user_id:
      return _need_auth()

    db = connect_db()
    users = db["users"]

    me = users.find_one({"_id": ObjectId(user_id)}, {"username": 1})
    if not me or "username" not in me:
      return jsonify({"notes": []}), 200

    notes = get_shared_notes(me["username"]) or []
    return jsonify({"notes": notes}), 200

  # Register for both "" and "/flask-api"
  for p in PREFIXES:
    # Share via path id
    app.add_url_rule(
      f"{p}/notes/<string:note_id>/share",
      endpoint=f"share_note_with_id_{p or 'root'}",
      view_func=_share_note,
      methods=["POST"],
      strict_slashes=False,
    )
    # Share via body id
    app.add_url_rule(
      f"{p}/notes/share",
      endpoint=f"share_note_body_{p or 'root'}",
      view_func=_share_note,
      methods=["POST"],
      strict_slashes=False,
    )
    # List shared-with-me
    app.add_url_rule(
      f"{p}/notes/shared",
      endpoint=f"shared_with_me_{p or 'root'}",
      view_func=_shared_with_me,
      methods=["GET"],
      strict_slashes=False,
    )
