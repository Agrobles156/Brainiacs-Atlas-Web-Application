# db_handler/shares.py
from datetime import datetime
from bson import ObjectId
from .connection_db import connect_db

# Share a note with a user by their email
def share_note_with_user(owner_username: str, note_id: str, target_email: str) -> bool:
    db = connect_db()
    users = db["users"]
    shares = db["shares"]

    owner = users.find_one({"username": owner_username}, {"_id": 1, "username": 1, "notes": 1})
    if not owner:
        return False

    try:
        note_oid = ObjectId(note_id)
    except Exception:
        return False

    # Make sure the owner actually has this note
    has_note = any(n.get("_id") == note_oid for n in (owner.get("notes") or []))
    if not has_note:
        return False

    # Find the recipient by email
    recipient = users.find_one({"email": target_email}, {"_id": 1, "username": 1, "email": 1})
    if not recipient:
        return False

    # Avoid duplicate share entries
    existing = shares.find_one({
        "note_id": note_oid,
        "owner_id": owner["_id"],
        "to_user_id": recipient["_id"],
    })
    if existing:
        return True

    doc = {
        "note_id": note_oid,
        "owner_id": owner["_id"],
        "owner_username": owner.get("username"),
        "to_user_id": recipient["_id"],
        "to_email": recipient.get("email"),
        "created_at": datetime.utcnow(),
    }
    shares.insert_one(doc)
    return True


# Return notes that were shared *to* this username
def get_shared_notes(username: str):
    db = connect_db()
    users = db["users"]
    shares = db["shares"]

    # Who is the current user?
    me = users.find_one({"username": username}, {"_id": 1})
    if not me:
        return []

    # Find shares addressed to me
    my_shares = list(shares.find({"to_user_id": me["_id"]}))
    if not my_shares:
        return []

    # Group by owner to fetch notes efficiently
    by_owner = {}
    for s in my_shares:
        by_owner.setdefault(s["owner_id"], set()).add(s["note_id"])

    results = []
    # Fetch each owner's notes and extract the ones shared
    for owner_id, note_ids in by_owner.items():
        owner = users.find_one({"_id": owner_id}, {"username": 1, "notes": 1})
        if not owner:
            continue
        owner_name = owner.get("username")
        for n in owner.get("notes") or []:
            if n.get("_id") in note_ids:
              
                results.append({
                    "_id": str(n.get("_id")),
                    "id": str(n.get("_id")),
                    "title": n.get("title"),
                    "details": n.get("content") or n.get("details"),
                    "content": n.get("content"),
                    "region": n.get("region"),
                    "year": n.get("year") or n.get("note_year"),
                    "created_at": n.get("created_at"),
                    "updated_at": n.get("updated_at"),
                    "author": owner_name,
                })

    return results
