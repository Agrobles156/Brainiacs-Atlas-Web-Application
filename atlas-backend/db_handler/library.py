from bson import ObjectId
from datetime import datetime
from .connection_db import connect_db

def add_paper_to_library(username, metadata):
    """
    Add a paper (with metadata) to a user's library.
    """
    db = connect_db()
    users = db['users']

    user = users.find_one({"username": username})
    if not user:
        raise ValueError("User not found")

    paper = {
        "_id": ObjectId(),
        **metadata,
        "uploaded_at": datetime.now()
    }

    users.update_one({"_id": user["_id"]}, {"$push": {"library": paper}})
    return str(paper["_id"])

def get_user_library(username):
    """
    Get all papers in a user's library.
    """
    db = connect_db()
    users = db['users']
    user = users.find_one({"username": username}, {"library": 1})

    if not user or "library" not in user:
        return []

    for paper in user["library"]:
        if "_id" in paper:
            paper["_id"] = str(paper["_id"])
    return user["library"]

def update_user_paper(username, paper_id, updated_fields):
    """
    Update fields of a paper in a user's library.
    """
    db = connect_db()
    users = db['users']

    result = users.update_one(
        {"username": username, "library._id": ObjectId(paper_id)},
        {"$set": {f"library.$.{field}": value for field, value in updated_fields.items()}}
    )
    return result.modified_count > 0

def delete_user_paper(username, paper_id):
    """
    Delete a paper from a user's library.
    """
    db = connect_db()
    users = db['users']

    result = users.update_one(
        {"username": username},
        {
            "$pull": {
                "library": {
                    "$or": [
                        {"_id": ObjectId(paper_id)},
                        {"_id": paper_id}  # in case it's stored as a string
                    ]
                }
            }
        }
    )
    return result.modified_count > 0

def paper_exists_in_library(username, reference_title):
    """
    Check if a paper with a given title already exists in user's library.
    """
    db = connect_db()
    users = db['users']
    user = users.find_one({"username": username}, {"library": 1})

    if not user or "library" not in user:
        return False

    return any(paper.get("title") == reference_title for paper in user["library"])

def get_all_library_titles(username):
    """
    Get all paper titles in a user's library.
    """
    db = connect_db()
    users = db['users']
    user = users.find_one({"username": username}, {"library.title": 1})

    if not user or "library" not in user:
        return []

    return [paper.get("title") for paper in user["library"] if "title" in paper]

def batch_check_titles_in_library(username, titles):
    """
    Check which of a given list of titles exist in user's library.
    Returns a set of matching titles.
    """
    db = connect_db()
    users = db['users']
    user = users.find_one({"username": username}, {"library.title": 1})

    if not user or "library" not in user:
        return set()

    user_titles = {paper.get("title") for paper in user["library"] if "title" in paper}
    return user_titles.intersection(titles)