from pymongo import MongoClient, ReturnDocument
import gridfs
from gridfs.errors import NoFile
from dotenv import dotenv_values
from bson import ObjectId
from datetime import datetime
from bson import ObjectId
from typing import Tuple, Optional, List, Dict, Any
from PIL import Image, ImageDraw, ImageChops
import io, base64, numpy as np
# So background images can be made as a property of each map
import hashlib

# Global Variables for Image Uploads for Maps
# File Type
ALLOWED_MIME = {"image/png", "image/jpeg", "image/tiff"}
# File Size
MAX_BYTES = 15 * 1024 * 1024   # 15MBa

def connect_db():
    config = dotenv_values(".env")
    client = MongoClient(config["DB_URL"])
    return client["demo"]

# Helper to upload live in the GridFS bucket
def _get_bucket(db):
    return gridfs.GridFS(db)

# Helper to obtain bucket for background images
def _get_images(db):
    return gridfs.GridFS(db, collection="mapimages")

# Helper to get image properties
def _generate_thumb_bytes(bytes, max_width=512, max_height=512):
    image = Image.open(io.BytesIO(bytes)).convert("RGB")
    image.thumbnail((max_width, max_height))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    return buffer.getvalue(), "image/jpeg"

def _put_background(db, data, filename="background", mime="application/octet-stream", meta=None):
    return _get_images(db).put(data, filename=filename, contentType=mime, metadata=meta or {})

def _get_image_blob(db, file_id: ObjectId):
    try:
        image_file = _get_images(db).get(file_id)
    except NoFile:
        return None
    return image_file.read(), (image_file.content_type or "application/octet-stream"), (image_file.filename or "background.bin")

# Make Image from Image-Upload Collection to a property of a new map
def _make_image_property_of_map(db, upload_id):
    source = _get_bucket(db).get(upload_id)
    data = source.read()
    image_hash = hashlib.sha256(data).hexdigest()
    metadata = {"sha256": image_hash, "origin": "upload_copy"}

    id = _put_background(
        db, data, filename=source.filename or f"map_bg_{str(upload_id)}", mime=source.content_type or "application/octet-stream", meta=metadata
    )

    return id, {"size": getattr(source, "length", len(data)), "mime": source.content_type or "application/octent-stream", "filename": source.filename or "background.bin", "sha256": image_hash}


# Helper to denormalize map
def _layer_empty_payload(layer_type):
    if layer_type == "strokes":
        return {"paths": []}
    if layer_type == "shapes":
        return {"items": []}
    return {}

def _to_json(doc):
    if isinstance(doc, ObjectId):
        return str(doc)
    if isinstance(doc, datetime):
        return doc.isoformat()
    if isinstance(doc, list):
        return [_to_json(item) for item in doc]
    if isinstance(doc, dict):
        return {cell:_to_json(item) for cell, item in doc.items()}
    return doc
    
def _stringify_map_ids(map_doc):
    return _to_json(map_doc)

# ******************* NEW FUNCTIONS FOR MY MAPS TAB - IMPLEMENTATION STARTED BY RAFAEL AYALA AND TEAM 2 OF DR. MEJIA'S SWE PRACTICUM COURSE - FALL 2025
# ******************* Maps created by users

# Creates a map that references an existing image upload. Also stores thumbnail for landing page table
def create_map(user_id, title, base_image_upload_id, thumb_bytes=None):
    db = connect_db()
    fs = gridfs.GridFS(db)
    users = db['users']

    upload_doc = users.find_one(
        {"username": user_id, "uploads._id": ObjectId(base_image_upload_id)},
        {"uploads.$": 1}
    )
    if not upload_doc or not upload_doc.get("uploads"): return None

    image_upload = upload_doc["uploads"][0]
    gridfs_id = image_upload.get("file_id")
    if not gridfs_id: return None

    try:
        bucket_file_id, bucket_info = _make_image_property_of_map(db, gridfs_id)
    except Exception:
        return None
    
    if thumb_bytes:
        thumb_id = fs.put(thumb_bytes, filename=f"thumb_{base_image_upload_id}.png", contentType="image/png")
    else:
        file_id = _get_images(db).get(bucket_file_id)
        jpg, jpg_ct = _generate_thumb_bytes(file_id.read())
        thumb_id = fs.put(jpg, filename=f"map_thumb_{str(bucket_file_id)}.jpg", contentType=jpg_ct)

    map_doc = {
        "_id": ObjectId(),
        "title": (title or "Untitled Map").strip(),
        "base_image": {
            "file_id": bucket_file_id,
            "filename": bucket_info["filename"],
            "mime": bucket_info["mime"],
            "size": bucket_info["size"],
            "sha256": bucket_info["sha256"],
            "created_at": datetime.utcnow(),
        },
        "canvas": { "fit": "contain", "bg": "#ffffff"},
        "layers": [],
        "thumb_id": thumb_id,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    res = users.update_one({"username": user_id}, {"$push": {"maps": map_doc}})
    if res.matched_count == 0: # If user is not found
        try: _get_images(db).delete(bucket_file_id)
        except: pass
        try: fs.delete(thumb_id)
        except: pass
        return None
    
    # Provides a record of what maps an image is used in
    users.update_one(
        {"username": user_id, "uploads._id": ObjectId(base_image_upload_id)},
        {"$addToSet": {"uploads.$.used_in_maps": str(map_doc["_id"])}}
    )
    return str(map_doc["_id"])

def get_map(user_id, map_id):
    db = connect_db()
    users = db['users']
    doc = users.find_one({"username": user_id, "maps._id": ObjectId(map_id)}, {"maps.$": 1})
    if not doc or not doc.get("maps"):
        return None
    return _stringify_map_ids(doc["maps"][0])

def get_maps(user_id, limit=50, skip=0):
    db = connect_db()
    users = db['users']
    user = users.find_one({"username": user_id}, {"maps": 1}) or {}
    maps = user.get("maps", [])

    maps = sorted(maps, key=lambda m: m.get("updated_at", datetime.min), reverse=True)
    maps = maps[skip: skip + limit]

    return [_stringify_map_ids(map) for map in maps]

# New function to obtain the map-owned background
def get_map_image_blob(map_id):
    db = connect_db()
    users = db["users"]
    doc = users.find_one({"maps._id": ObjectId(map_id)},{"maps.$": 1})
    if not doc or not doc.get("maps"):
        return None
    map = doc["maps"][0]
    file_id = (map.get("base_image") or {}).get("file_id")
    if not file_id:
        return None
    return _get_image_blob(db, file_id)

def delete_map(user_id, map_id):
    db = connect_db()
    fs = gridfs.GridFS(db)
    users = db['users']
    images = _get_images(db)

    # fetch current to cleanup thumb
    mapDoc = users.find_one({"username": user_id, "maps._id": ObjectId(map_id)}, {"maps.$": 1})
    if not mapDoc or not mapDoc.get("maps"):
        return False
    
    map = mapDoc["maps"][0]
    thumb_id = map.get("thumb_id")
    map_file_id = (map.get("base_image") or {}).get("file_id")
    
    res = users.update_one({"username": user_id}, {"$pull": {"maps": {"_id": ObjectId(map_id)}}})
    if res.modified_count == 0:
        return False

    if thumb_id:
        try: fs.delete(thumb_id)
        except: pass
    if map_file_id:
        try: images.delete(map_file_id)
        except: pass
    return True

def update_map_title(user_id, map_id, new_title):
    db = connect_db()
    users = db['users']
    
    if not new_title or not new_title.strip():
        return False
    
    res = users.update_one(
        {"username": user_id, "maps._id": ObjectId(map_id)},
        {"$set": {"maps.$.title": new_title.strip(), "maps.$.updated_at": datetime.utcnow()}}
    )
    return res.modified_count > 0

# Functionality for adding updates to drawing objects is split across several functions

# Adds a layer header to maps.layers[] and creates an empty map_layers payload doc
def add_layer(user_id, map_id, name, layer_type = "strokes", visible=True, opacity=1.0, z=0):
    db =connect_db()
    users = db["users"]

    layer_id = ObjectId()
    layer = {
        "_id": layer_id,
        "name": name or "Layer",
        "type": layer_type,
        "visible": bool(visible),
        "opacity": float(opacity),
        "z": int(z),
        "payload": _layer_empty_payload(layer_type),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    res = users.update_one(
        {"username": user_id, "maps._id": ObjectId(map_id)},
        {"$push": {"maps.$.layers": layer},
         "$set": {"maps.$.updated_at": datetime.utcnow()}
        } 
    )

    return str(layer_id) if (res.modified_count>0) else None


def get_layer(user_id, map_id, layer_id):
    db = connect_db()
    users = db["users"]
    doc = users.find_one(
        {"username": user_id, "maps._id": ObjectId(map_id)},
        {"maps.$": 1}
    )
    if not doc or not doc.get("maps"): return None

    map = doc["maps"][0]
    for layer in map.get("layers", []):
        if str(layer["_id"]) == layer_id:
            output = dict(layer)
            output["_id"] = str(output["_id"])
            return output
        
    return None

# Replaces the whole payload (after the user saves) and ensures the payload uses IMAGE PIXEL coordinates
def replace_layer_payload(user_id, map_id, layer_id, payload):
    db = connect_db()
    users = db["users"]
    res = users.update_one(
        {"username": user_id, "maps._id": ObjectId(map_id), "maps.layers._id":ObjectId(layer_id)},
        {"$set": {
            "maps.$[m].layers.$[l].payload": payload,
            "maps.$[m].layers.$[l].updated_at": datetime.utcnow(),
            "maps.$[m].updated_at": datetime.utcnow()
        }},
        array_filters=[{"m._id": ObjectId(map_id)}, {"l._id": ObjectId(layer_id)}]
    )
    return res.modified_count>0

# Appends the stroke paths without fetching or replacing the entire payload.
# A new_path instance could appear as such: [{"color": "#000", "width":2, "points":[[x,y],[x,y2], ... ]}, ... ]
def append_strokes(user_id, map_id, layer_id, new_paths):
    db = connect_db()
    users = db["users"]
    res = users.update_one(
        {"username": user_id, "maps._id": ObjectId(map_id), "maps.layers._id": ObjectId(layer_id)},
        {"$push": {"maps.$[m].layers.$[l].payload.paths": {"$each": new_paths}},
         "$set": {"maps.$[m].layers.$[l].updated_at": datetime.utcnow(),
                  "maps.$[m].updated_at": datetime.utcnow()  
                } 
        },
        array_filters=[{"m._id": ObjectId(map_id)}, {"l._id": ObjectId(layer_id), "l.type": "strokes"}]
    )
    return res.modified_count>0


def set_layer_header(user_id, map_id, layer_id, **fields):
    allowed = {k: v for k, v in fields.items() if k in {"name", "type", "visible", "opacity", "z"}}
    if not allowed:
        return False
    
    db = connect_db()
    users = db["users"]
    set_paths = {f"maps.$[m].layers.$[l].{k}": v for k, v in allowed.items()}
    set_paths["maps.$[m].layers.$[l].updated_at"] = datetime.utcnow()
    set_paths["maps.$[m].updated_at"] = datetime.utcnow()

    res = users.update_one(
        {"username": user_id, "maps._id": ObjectId(map_id), "maps.layers._id": ObjectId(layer_id)},
        {"$set": set_paths},
        array_filters=[{"m._id": ObjectId(map_id)}, {"l._id": ObjectId(layer_id)}]
    )
    return res.modified_count>0


# Functions to help obtain a thumbnail for the landing-page table
def save_map_thumb(user_id, map_id, png_bytes):
    db = connect_db()
    fs = gridfs.GridFS(db)
    users = db["users"]

    thumb = fs.put(png_bytes, filename=f"map_thumb{map_id}.png", contentType="image/png")
    res = users.update_one(
        {"username": user_id, "maps._id": ObjectId(map_id)},
        {"$set": {"maps.$.thumb_id": thumb, "maps.$.updated_at": datetime.utcnow()}}
    )
    if res.modified_count == 0:
        try: fs.delete(thumb)
        except: pass
        return None
    return str(thumb)

def get_map_thumb_blob(map_id):
    db = connect_db()
    fs = gridfs.GridFS(db)
    users = db['users']
    mapDoc = users.find_one({"maps._id": ObjectId(map_id)}, {"maps.$": 1})
    if not mapDoc or not mapDoc.get("maps"):
        return None
    map = mapDoc["maps"][0]
    thumb_id = map.get("thumb_id")
    if not thumb_id:
        return None
    mapFile = fs.get(thumb_id)
    return mapFile.read(), "image/png", mapFile.filename or "thumb.png"

def set_map_title(user_id, map_id, title):
    if not title or not title.strip():
        return False
    
    db = connect_db()
    users = db["users"]
    res = users.update_one(
        {"username": user_id, "maps._id": ObjectId(map_id)},
        {"$set" : {
            "maps.$.title": title.strip(),
            "maps.$.updated_at": datetime.utcnow()
        }}
    )
    return res.modified_count > 0