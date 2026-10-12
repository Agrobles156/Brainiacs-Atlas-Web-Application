from bson import ObjectId
from datetime import datetime, timezone
from .connection_db import connect_db   # or from .connection import connect_db if file is named connection.py


def create_new_collection(user_id, name):
    db = connect_db()
    user_obj_id = ObjectId(user_id)
    result = db['users'].update_one(
        {"_id": user_obj_id},
        {"$set": {
            f"collections.{name}": {"notes": [], "last_updated": datetime.now(timezone.utc).isoformat()}
        }}
    )
    return result.modified_count > 0


def add_to_collection(user_id, name, note):
    db = connect_db()
    user_obj_id = ObjectId(user_id)
    result = db['users'].update_one(
        {"_id": user_obj_id},
        {
            "$push": {f"collections.{name}.notes": note},
            "$set": {f"collections.{name}.last_updated": datetime.now(timezone.utc).isoformat()}
        }
    )
    return result.modified_count > 0


def get_collections(user_id):
    db = connect_db()
    user = db['users'].find_one({"_id": ObjectId(user_id)}, {"collections": 1})
    return user.get("collections") if user else None


def delete_collection(user_id, name):
    db = connect_db()
    result = db['users'].update_one(
        {"_id": ObjectId(user_id)},
        {"$unset": {f"collections.{name}": ""}}
    )
    return result.modified_count > 0


def remove_note_from_collection(user_id, name, note_id):
    db = connect_db()
    result = db['users'].update_one(
        {"_id": ObjectId(user_id)},
        {
            "$pull": {f"collections.{name}.notes": {"_id": ObjectId(note_id)}},
            "$set": {f"collections.{name}.last_updated": datetime.now(timezone.utc).isoformat()}
        }
    )
    return result.modified_count > 0