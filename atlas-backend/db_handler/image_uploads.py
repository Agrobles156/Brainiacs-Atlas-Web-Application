import gridfs
from bson import ObjectId
from datetime import datetime
from bson import ObjectId
from pymongo import MongoClient
from dotenv import dotenv_values

# Global Variables for Image Uploads for Maps
# File Type
ALLOWED_MIME = {"image/png", "image/jpeg", "image/tiff"}
# File Size
MAX_BYTES = 15 * 1024 * 1024   # 15MB

def connect_db():
    config = dotenv_values(".env")
    client = MongoClient(config["DB_URL"])
    return client["demo"]


def create_image_upload(user_id, title, filename, mime, data_bytes, thumb_bytes=None):
    db = connect_db()
    fs = gridfs.GridFS(db)
    users = db['users']

    file_id = fs.put(data_bytes, filename=filename, contentType=mime)
    thumb_id = fs.put(thumb_bytes, filename=f"thumb_{filename}", contentType="image/png") if thumb_bytes else None

    upload_doc = {
        "_id": ObjectId(),
        "title": title or filename,
        "filename": filename,
        "mime": mime,
        "size": len(data_bytes),
        "file_id": file_id,
        "thumb_id": thumb_id,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    res = users.update_one({"username": user_id}, {"$push": {"uploads": upload_doc}})
    if res.matched_count == 0:
        # optional: cleanup GridFS if user not found
        fs.delete(file_id)
        if thumb_id:
            fs.delete(thumb_id)
        return None

    # return the new subdocument id as string
    return str(upload_doc["_id"])

def get_image_uploads(user_id, limit=50, skip=0):
    db = connect_db()
    users = db['users']
    user = users.find_one({"username": user_id}, {"uploads": 1})
    uploads = (user or {}).get("uploads", [])

    uploads = sorted(uploads, key=lambda u: u.get("created_at") or datetime.min, reverse=True)
    uploads = uploads[skip: skip + limit]

    out = []
    for u in uploads:
        out.append({
            "_id": str(u["_id"]),
            "title": u.get("title"),
            "filename": u.get("filename"),
            "mime": u.get("mime"),
            "size": u.get("size"),
            "created_at": u.get("created_at"), 
            "updated_at": u.get("updated_at"),
            "file_id": str(u["file_id"]) if u.get("file_id") else None,
            "thumb_id": str(u["thumb_id"]) if u.get("thumb_id") else None,
            "used_in_maps": u.get("used_in_maps", []),
        })
    return out


def get_image_upload(user_id, upload_id):
    db = connect_db()
    users = db['users']
    doc = users.find_one({"username": user_id, "uploads._id": ObjectId(upload_id)}, {"uploads.$": 1})
    if not doc or "uploads" not in doc or not doc["uploads"]:
        return None
    u = doc["uploads"][0]
    u["_id"] = str(u["_id"])
    if "file_id" in u:
        u["file_id"] = str(u["file_id"])
    if u.get("thumb_id"):
        u["thumb_id"] = str(u["thumb_id"])
    return u

def get_image_blob(upload_id):
    db = connect_db()
    fs = gridfs.GridFS(db)
    users = db['users']
    doc = users.find_one({"uploads._id": ObjectId(upload_id)}, {"uploads.$": 1})
    if not doc or not doc.get("uploads"):
        return None
    u = doc["uploads"][0]
    grid_id = u.get("file_id")
    if not grid_id:
        return None
    f = fs.get(grid_id)
    return f.read(), u.get("mime") or "application/octet-stream", u.get("filename") or "download"

def update_image_upload(upload_id, title=None):
    if not title:
        return False
    db = connect_db()
    users = db['users']
    updates = {
        "uploads.$.title": title,
        "uploads.$.updated_at": datetime.utcnow()
    }
    res = users.update_one({"uploads._id": ObjectId(upload_id)}, {"$set": updates})
    return res.modified_count > 0

def delete_image_upload(user_id, upload_id):
    db = connect_db()
    fs = gridfs.GridFS(db)
    users = db['users']

    # find the subdoc first to get GridFS ids
    doc = users.find_one({"username": user_id, "uploads._id": ObjectId(upload_id)}, {"uploads.$": 1})
    if not doc or not doc.get("uploads"):
        return False

    u = doc["uploads"][0]
    file_id = u.get("file_id")
    thumb_id = u.get("thumb_id")

    res = users.update_one({"username": user_id}, {"$pull": {"uploads": {"_id": ObjectId(upload_id)}}})
    if res.modified_count == 0:
        return False

    # cleanup blobs
    if file_id:
        try: fs.delete(file_id)
        except: pass
    if thumb_id:
        try: fs.delete(thumb_id)
        except: pass

    return True

# Stream thumbnail for gallery cards
def get_map_thumb_blob(map_id):
    db = connect_db()
    fs = gridfs.GridFS(db)
    users = db['users']
    doc = users.find_one({"maps._id": ObjectId(map_id)}, {"maps.$": 1})
    if not doc or not doc.get("maps"):
        return None
    m = doc["maps"][0]
    t_id = m.get("thumb_id")
    if not t_id:
        return None
    f = fs.get(t_id)
    return f.read(), "image/png", f.filename or "thumb.png"

def get_upload_thumb_blob(upload_id):
    db = connect_db()
    fs = gridfs.GridFS(db)
    users = db['users']
    doc = users.find_one({"uploads._id": ObjectId(upload_id)}, {"uploads.$": 1})
    if not doc or not doc.get("uploads"):
        return None
    u = doc["uploads"][0]
    t_id = u.get("thumb_id")
    if not t_id:
        return None
    f = fs.get(t_id)
    return f.read(), "image/png", f.filename or "thumb.png"