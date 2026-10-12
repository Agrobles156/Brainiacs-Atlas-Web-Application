from bson import ObjectId
from datetime import datetime
from .connection_db import connect_db

def create_note(title, content, username, region):
    db = connect_db()
    users_collection = db['users']

    user = users_collection.find_one({"username": username})

    if not user:
        raise ValueError("User not found")

    note = {
        "_id": ObjectId(),
        "title": title,
        "content": content,
        "region": region,
        "public": False,
        "created_at": datetime.now(),
        "updated_at": datetime.now()
    }

    result = users_collection.update_one(
        {"_id": user["_id"]}, 
        {"$push": {"notes": note}}
    )

    return str(note["_id"]) if result.modified_count > 0 else None

# Get all active notes for a user
def get_notes(user_id):
    db = connect_db()
    users_collection = db['users']

    user = users_collection.find_one({"username": user_id}, {"notes": 1})

    if user and 'notes' in user:
        notes = user['notes']
        for note in notes:
            note['_id'] = str(note['_id']) 
        return notes
    else:
        return []

# Update a note
def update_note(note_id, title=None, content=None):
    db = connect_db()
    users = db['users']

    updates = {}
    if title:
        updates["notes.$.title"] = title
    if content:
        updates["notes.$.content"] = content
    updates["notes.$.updated_at"] = datetime.now()

    result = users.update_one(
        {"notes._id": ObjectId(note_id)},
        {"$set": updates}
    )

    return result.modified_count > 0

# Delete a note permanently
def delete_note(note_id):
    db = connect_db()
    users = db['users']

    result = users.update_one(
        {"notes._id": ObjectId(note_id)},
        {"$pull": {"notes": {"_id": ObjectId(note_id)}}}
    )

    return result.modified_count > 0

def pull_all_notes():
    db = connect_db()
    users = db['users']
    userNotesArr = []
    for user in users.find():
        for note in user["notes"]:
            userNotesArr.append({
                "note_id": str(note["_id"]),
                "name": user["username"],
                "title": note["title"],
                "content": note["content"],
                "region": note["region"],
                "public": note["public"],
                "created": note["created_at"],
                "updated": note["updated_at"]
            })
    return userNotesArr

def set_note_public(noteId, value):
    db = connect_db()
    users = db['users']
    print(users.find_one({"notes._id": ObjectId(noteId)}))
    results = users.update_one({"notes._id": ObjectId(noteId)},{"$set": {"notes.$.public": value}})
    
    return results.modified_count > 0

# Just finds one right now
def find_public_notes(region):
    db = connect_db()
    users = db['users']
    notes = users.find_one({"notes.region": region})

    if not notes:
        return None
    notesArr = []
    print(notes["notes"])
    for note in notes["notes"]:
        if note["region"] == region and note["public"]:
            notesArr.append({
                "author": notes["username"],
                "title": note["title"],
                "content": note["content"]
            })
            
    if len(notesArr) == 0:
        return None
    return notesArr