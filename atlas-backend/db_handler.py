from docx2python import docx2python
from pymongo import MongoClient
import gridfs
from bs4 import BeautifulSoup
import re
import pymupdf
import xml.etree.ElementTree as ET
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import dotenv_values
from bson import ObjectId
from datetime import datetime, timezone
import requests
from bson import ObjectId
import gridfs

# Global Variables for Image Uploads for Maps
# File Type
ALLOWED_MIME = {"image/png", "image/jpeg"}
# File Size
MAX_BYTES = 15 * 1024 * 1024   # 15MB

def connect_db():
    config = dotenv_values(".env")
    client = MongoClient(config["DB_URL"])
    return client["demo"]

# ------------------------- Auth / Users -------------------------

def whoami(user_id):
    db = connect_db()
    curr = db["users"].find_one({"_id": ObjectId(user_id)})
    print(user_id)
    print(curr)
    return curr["username"], curr["role"]

def register_user(username, email, password):
    db = connect_db()
    users = db["users"]

    if users.find_one({"email": email}) and users.find_one({"username": username}):
        return True, "Email and Username already exists"
    if users.find_one({"email": email}):
        return True, "Email already exists"
    if users.find_one({"username": username}):
        return True, "UserName already exists"

    hashed = generate_password_hash(password)
    user_id = users.insert_one({
        "username": username,
        "email": email,
        "password": hashed,
        "role": "user",
        "status": True,
        "notes": [],
        "library": [],
        "maps":[],
        "uploads":[]
    }).inserted_id
    return False, user_id

def login_user(email, password):
    db = connect_db()
    users = db["users"]
    user = users.find_one({"email": email})
    if user:
        if check_password_hash(user['password'], password):
            if not user['status']:
                return "Blocked Account", None
            return str(user['_id']), user["role"]
        else:
            return "Wrong Password", None
    else:
        return "User not found", None

def load_regions_from_docx(file_path, reference_map=None):
    doc_content = docx2python(file_path)
    endnotes = parse_endnotes(doc_content.endnotes)
    flat_text_list = flatten_document(doc_content.body)

    regions, start_processing, last_endnote = [], False, None
    for text in flat_text_list:
        if "central nervous system [rat]" in text.lower():
            start_processing = True
        elif start_processing and text:
            region_info, last_endnote = parse_region(text, endnotes, last_endnote)
            if region_info.get("names"):
                if reference_map and "endnote_nums" in region_info:
                    refs = set()
                    for num in region_info["endnote_nums"]:
                        if num != "1" and num in reference_map:
                            refs.update(reference_map[num])
                    region_info["references"] = list(refs)
                region_info.pop("endnote_nums", None)
                regions.append(region_info)

    if regions:
        db = connect_db()
        db["regions"].insert_many(regions)
        return f"{len(regions)} regions loaded into MongoDB"
    return "No regions were found in the document."

def flatten_document(nested_list):
    flat_list = []
    for item in nested_list:
        if isinstance(item, list):
            flat_list.extend(flatten_document(item))
        elif isinstance(item, str) and item.strip():
            flat_list.append(item.strip())
    return flat_list

def parse_region(text, endnotes, last_endnote):
    parts = text.split(" or ")
    names, abbreviations, endnote_texts, endnote_refs = [], [], [], []

    for part in parts:
        name_match = re.match(r"([^(]+)", part)
        if name_match:
            names.append(name_match.group(1).strip())
        abbr_match = re.findall(r"\(([^)]+)\)", part)
        if abbr_match:
            abbreviations.append(abbr_match[-1])

    found_refs = re.findall(r"endnote(\d+)", text)
    if found_refs:
        endnote_refs = found_refs
        endnote_texts = [endnotes.get(ref, f"MISSING ENDNOTE {ref}") for ref in found_refs]
        last_endnote = found_refs[-1]
    elif last_endnote:
        endnote_refs = [last_endnote]
        endnote_texts = [endnotes.get(last_endnote, f"MISSING ENDNOTE {last_endnote}")]

    return {
        "names": names,
        "abbreviations": abbreviations,
        "endnotes": endnote_texts,
        "endnote_nums": endnote_refs
    }, last_endnote

def parse_endnotes(endnotes):
    note_dict = {}
    if not endnotes or not isinstance(endnotes, list):
        return note_dict
    for line in flatten_document(endnotes):
        match = re.match(r"endnote(\d+)\)\t(.+)", line)
        if match:
            note_dict[match.group(1)] = match.group(2).strip()
    return note_dict

def load_reference_mappings(txt_path):
    reference_map = {}
    with open(txt_path, "r") as file:
        for line in file:
            match = re.match(r"^(\d+)\.\s+(.*)", line.strip())
            if match:
                num = str(int(match.group(1)))
                refs = [r.strip() for r in match.group(2).split(",")]
                reference_map[num] = refs
    return reference_map

def get_references_by_region_id(region_id):
    db = connect_db()
    region = db["regions"].find_one({"_id": ObjectId(region_id)})
    return region.get("references", []) if region else []

def get_all_regions():
    db = connect_db()
    return list(db["regions"].find({}, {"_id": 0}))

# ------------------------- NOTES -------------------------

def create_note(user_id, title, content, region):
    """
    Create a note for the user identified by Mongo _id string.
    """
    db = connect_db()
    users = db["users"]

    try:
        user_obj_id = ObjectId(user_id)
    except Exception:
        raise ValueError("Invalid user id")

    note = {
        "_id": ObjectId(),
        "title": title,
        "content": content,
        "region": region,
        "public": False,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    result = users.update_one({"_id": user_obj_id}, {"$push": {"notes": note}})
    return str(note["_id"]) if result.modified_count > 0 else None

def get_notes(user_id):
    """
    Return all notes for the user identified by Mongo _id string.
    """
    db = connect_db()
    users = db["users"]

    try:
        user_obj_id = ObjectId(user_id)
    except Exception:
        return []

    user = users.find_one({"_id": user_obj_id}, {"notes": 1})
    if not user or "notes" not in user:
        return []

    notes = user["notes"]
    for n in notes:
        n["_id"] = str(n["_id"])
    return notes

def update_note(note_id, title=None, content=None):
    db = connect_db()
    users = db["users"]

    updates = {}
    if title is not None:
        updates["notes.$.title"] = title
    if content is not None:
        updates["notes.$.content"] = content
    updates["notes.$.updated_at"] = datetime.now(timezone.utc)

    result = users.update_one({"notes._id": ObjectId(note_id)}, {"$set": updates})
    return result.modified_count > 0

def delete_note(note_id):
    db = connect_db()
    users = db["users"]
    result = users.update_one(
        {"notes._id": ObjectId(note_id)},
        {"$pull": {"notes": {"_id": ObjectId(note_id)}}}
    )
    return result.modified_count > 0

def set_note_public(note_id, value):
    db = connect_db()
    users = db["users"]
    result = users.update_one(
        {"notes._id": ObjectId(note_id)},
        {"$set": {"notes.$.public": bool(value)}}
    )
    return result.modified_count > 0

def find_public_notes(region):
    db = connect_db()
    users = db["users"]
    owner = users.find_one({"notes.region": region})
    if not owner:
        return None
    out = []
    for note in owner["notes"]:
        if note.get("region") == region and note.get("public"):
            out.append({"author": owner["username"], "title": note["title"], "content": note["content"]})
    return out or None

# ------------------------- Collections -------------------------

def create_new_collection(user_id, collection_name):
    db = connect_db()
    users = db["users"]
    try:
        user_obj_id = ObjectId(user_id)
    except Exception as e:
        print("Invalid user_id:", e)
        return False

    exists = users.find_one({"_id": user_obj_id, f"collections.{collection_name}": {"$exists": True}})
    if exists:
        return False

    result = users.update_one(
        {"_id": user_obj_id},
        {"$set": {
            f"collections.{collection_name}": {
                "notes": [],
                "last_updated": datetime.now(timezone.utc).isoformat()
            }
        }},
        upsert=False
    )
    return result.modified_count > 0

def add_to_collection(user_id, collection_name, note):
    db = connect_db()
    users = db["users"]
    try:
        user_obj_id = ObjectId(user_id)
    except Exception as e:
        print("Invalid user_id:", e)
        return False

    exists = users.find_one({"_id": user_obj_id, f"collections.{collection_name}.notes._id": note["_id"]})
    if exists:
        return False

    result = users.update_one(
        {"_id": user_obj_id},
        {
            "$push": {f"collections.{collection_name}.notes": note},
            "$set": {f"collections.{collection_name}.last_updated": datetime.now(timezone.utc).isoformat()}
        }
    )
    return result.modified_count > 0

def get_collection(user_id):
    db = connect_db()
    try:
        user_obj_id = ObjectId(user_id)
    except Exception as e:
        print("Invalid user_id:", e)
        return None
    user = db.users.find_one({"_id": user_obj_id}, {"collections": 1, "_id": 0})
    return user.get("collections") if user and "collections" in user else None

def delete_collection(user_id, collection_name):
    db = connect_db()
    try:
        user_obj_id = ObjectId(user_id)
    except Exception as e:
        print("Invalid user_id:", e)
        return False
    result = db.users.update_one({"_id": user_obj_id}, {"$unset": {f"collections.{collection_name}": ""}})
    return result.modified_count > 0

def remove_note_from_collection(user_id, collection_name, note_id):
    db = connect_db()
    try:
        user_obj_id = ObjectId(user_id)
    except Exception as e:
        print("Invalid user_id:", e)
        return False
    result = db.users.update_one(
        {"_id": user_obj_id},
        {
            "$pull": {f"collections.{collection_name}.notes": {"_id": ObjectId(note_id)}},
            "$set": {f"collections.{collection_name}.last_updated": datetime.now(timezone.utc).isoformat()}
        }
    )
    return result.modified_count > 0

# ------------------------- Library / metadata helpers -------------------------

def detect_identifier_type(identifier):
    identifier = identifier.strip()
    if identifier.upper().startswith("PMC"):
        return "pmcid"
    if re.fullmatch(r"\d{7,8}", identifier):
        return "pmid"
    if re.fullmatch(r"arXiv:\d{4}\.\d{4,5}(v\d+)?", identifier, re.IGNORECASE):
        return "arxiv"
    if identifier.lower().startswith("10.") or "/" in identifier:
        return "doi"
    return None

def fetch_metadata_by_identifier(identifier):
    id_type = detect_identifier_type(identifier)

    if id_type == "pmcid":
        id_val = identifier.replace("PMC", "")
        summary_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pmc&id={id_val}&retmode=json"
        fetch_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id={id_val}&retmode=xml"
        s, f = requests.get(summary_url), requests.get(fetch_url)
        if s.ok and f.ok:
            result = s.json()["result"][id_val]
            root = ET.fromstring(f.text)
            abstract = " ".join((p.text or "").strip() for p in root.findall(".//abstract//p")).strip()
            journal = result.get("source", "")
            pubdate = result.get("pubdate", "")
            year = pubdate.split()[0] if pubdate else None
            return {
                "title": result.get("title"),
                "authors": [a["name"] for a in result.get("authors", [])],
                "abstract": abstract,
                "journal": journal,
                "year": year,
                "pdf_url": "",
                "source_url": f"https://www.ncbi.nlm.nih.gov/pmc/articles/PMC{id_val}",
                "user_notes": "",
                "identifiers": {"pmcid": identifier},
                "annotations": []
            }

    elif id_type == "pmid":
        id_val = identifier.replace("PMID", "")
        s = requests.get(f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id={id_val}&retmode=json")
        f = requests.get(f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id={id_val}&retmode=xml")
        if s.ok and f.ok:
            result = s.json()["result"][id_val]
            root = ET.fromstring(f.text)
            abstract = " ".join((a.text or "").strip() for a in root.findall(".//AbstractText")).strip()
            journal = result.get("source", "")
            pubdate = result.get("pubdate", "")
            year = pubdate.split()[0] if pubdate else None
            return {
                "title": result.get("title"),
                "authors": [a["name"] for a in result.get("authors", [])],
                "abstract": abstract,
                "journal": journal,
                "year": year,
                "pdf_url": "",
                "source_url": f"https://pubmed.ncbi.nlm.nih.gov/{id_val}",
                "user_notes": "",
                "identifiers": {"pmid": identifier},
                "annotations": []
            }

    elif id_type == "doi":
        r = requests.get(f"https://api.crossref.org/works/{identifier}")
        if r.ok:
            msg = r.json()["message"]
            title = msg.get("title", [""])[0]
            authors = [f"{a.get('given','')} {a.get('family','')}".strip() for a in msg.get("author", [])]
            abstract_html = msg.get("abstract", "")
            abstract = BeautifulSoup(abstract_html, "html.parser").get_text()
            journal = msg.get("container-title", [""])[0]
            published = msg.get("published-print") or msg.get("published-online") or msg.get("created")
            year = published.get("date-parts", [[None]])[0][0] if published else None
            return {
                "title": title,
                "authors": authors,
                "abstract": abstract.strip(),
                "journal": journal,
                "year": year,
                "pdf_url": msg.get("URL", ""),
                "source_url": f"https://doi.org/{identifier}",
                "user_notes": "",
                "identifiers": {"doi": identifier},
                "annotations": []
            }

    elif id_type == "arxiv":
        arxiv_id = identifier.split(":")[-1]
        r = requests.get(f"http://export.arxiv.org/api/query?id_list={arxiv_id}")
        if r.ok:
            root = ET.fromstring(r.text)
            entry = root.find("{http://www.w3.org/2005/Atom}entry")
            if entry is not None:
                title = entry.find("{http://www.w3.org/2005/Atom}title").text.strip()
                authors = [a.find("{http://www.w3.org/2005/Atom}name").text for a in entry.findall("{http://www.w3.org/2005/Atom}author")]
                abstract = entry.find("{http://www.w3.org/2005/Atom}summary").text.strip()
                published = entry.find("{http://www.w3.org/2005/Atom}published").text
                year = published.split("-")[0] if published else None
                return {
                    "title": title,
                    "authors": authors,
                    "abstract": abstract,
                    "journal": "arXiv",
                    "year": year,
                    "pdf_url": entry.find("{http://www.w3.org/2005/Atom}id").text.replace("abs", "pdf"),
                    "source_url": f"https://arxiv.org/abs/{arxiv_id}",
                    "user_notes": "",
                    "identifiers": {"arxiv": identifier},
                    "annotations": []
                }

    return None

def fetch_abstract_by_id(source, uid):
    if source == "pubmed":
        url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id={uid}&retmode=xml"
        try:
            r = requests.get(url)
            if r.ok:
                root = ET.fromstring(r.text)
                return " ".join((a.text or "").strip() for a in root.findall(".//AbstractText")).strip()
        except Exception as e:
            print("[PubMed Abstract Fetch Error]:", e)
            return ""
    elif source == "pmc":
        id_val = uid.replace("PMC", "")
        url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id={id_val}&retmode=xml"
        try:
            r = requests.get(url)
            if r.ok:
                root = ET.fromstring(r.text)
                return " ".join((p.text or "").strip() for p in root.findall(".//abstract//p")).strip()
        except Exception as e:
            print("[PMC Abstract Fetch Error]:", e)
            return ""
    return ""

def extract_identifiers_from_pdf(filepath):
    try:
        doc = pymupdf.open(filepath)
        text = "".join(page.get_text() for page in doc)
        doi_matches = re.findall(r"10\.\d{4,9}/[-._;()/:A-Za-z0-9]+", text)
        pmid_matches = re.findall(r"\bPMID[:\s]?(\d{5,})", text, flags=re.IGNORECASE)
        pmc_matches = re.findall(r"\bPMC\d{6,}", text, flags=re.IGNORECASE)
        arxiv_matches = re.findall(r"arXiv:\d{4}\.\d{4,5}", text, flags=re.IGNORECASE)
        return doi_matches + [("PMID" + p) for p in pmid_matches] + pmc_matches + arxiv_matches
    except Exception as e:
        print("PDF parsing failed:", e)
        return []

# ------------------------- Library (uses username as user_id) -------------------------
# These endpoints expect `user_id` to be the username (front-end current behavior).

def add_paper_to_library(user_id, metadata):
    db = connect_db()
    users = db["users"]
    user = users.find_one({"username": user_id})
    if not user:
        raise ValueError("User not found")

    paper = {"_id": ObjectId(), **metadata, "uploaded_at": datetime.now(timezone.utc)}
    users.update_one({"_id": user["_id"]}, {"$push": {"library": paper}})
    return str(paper["_id"])

def get_user_library(user_id):
    db = connect_db()
    users = db["users"]
    user = users.find_one({"username": user_id}, {"library": 1})
    if not user or "library" not in user:
        return []
    for p in user["library"]:
        if "_id" in p:
            p["_id"] = str(p["_id"])
    return user["library"]

def update_user_paper(user_id, paper_id, updated_fields):
    db = connect_db()
    users = db["users"]
    result = users.update_one(
        {"username": user_id, "library._id": ObjectId(paper_id)},
        {"$set": {f"library.$.{k}": v for k, v in updated_fields.items()}}
    )
    return result.modified_count > 0

def delete_user_paper(user_id, paper_id):
    db = connect_db()
    users = db["users"]
    result = users.update_one(
        {"username": user_id},
        {"$pull": {"library": {"_id": ObjectId(paper_id)}}}
    )
    return result.modified_count > 0

def pull_all_user():
    db = connect_db()
    users = db["users"]
    out = []
    for u in users.find():
        out.append({"name": u["username"], "email": u["email"], "role": u["role"], "status": u["status"]})
    return out

def set_user_field(userEmail, field, value):
    db = connect_db()
    users = db["users"]
    res = users.update_one({"email": userEmail}, {"$set": {field: value}})
    return res.modified_count > 0

def pull_all_notes():
    db = connect_db()
    users = db["users"]
    out = []
    for u in users.find():
        for n in u.get("notes", []):
            out.append({
                "note_id": str(n["_id"]),
                "name": u["username"],
                "title": n["title"],
                "content": n["content"],
                "region": n["region"],
                "public": n["public"],
                "created": n["created_at"],
                "updated": n["updated_at"],
            })
    return out

def get_region_by_abbr(abbr):
    db = connect_db()
    return db["regions"].find_one({"abbreviations": abbr})

def paper_exists_in_library(user_id, reference_title):
    db = connect_db()
    users = db["users"]
    user = users.find_one({"username": user_id}, {"library": 1})
    if not user or "library" not in user:
        return False
    return any(p.get("title") == reference_title for p in user["library"])

def get_all_library_titles(user_id):
    db = connect_db()
    users = db["users"]
    user = users.find_one({"username": user_id}, {"library.title": 1})
    if not user or "library" not in user:
        return []
    return [p.get("title") for p in user["library"] if "title" in p]

def extract_identifiers_from_url(url):
    ids = []
    m = re.search(r"(10\.\d{4,9}/[-._;()/:A-Za-z0-9]+)", url)
    if m:
        ids.append(m.group(1))
    return ids

def batch_check_titles_in_library(user_id, titles):
    db = connect_db()
    users = db["users"]
    user = users.find_one({"username": user_id}, {"library.title": 1})
    if not user or "library" not in user:
        return set()

    user_titles = {paper.get("title") for paper in user["library"] if "title" in paper}
    return user_titles.intersection(titles)

# ******************* NEW FUNCTIONS FOR MY MAPS TAB - IMPLEMENTATION STARTED BY RAFAEL AYALA AND TEAM 2 OF DR. MEJIA'S SWE PRACTICUM COURSE - FALL 2025
# ******************* Maps created by users
def create_map(user_id, title, base_image_upload_id, visibility, drawing_json, thumb_bytes=None):
    assert visibility in ("public", "private")

    db = connect_db()
    fs = gridfs.GridFS(db)
    users = db['users']

    # sanity: ensure the base upload exists for this user
    owner_has_image = users.find_one(
        {"username": user_id, "uploads._id": ObjectId(base_image_upload_id)},
        {"_id": 1}
    )
    if not owner_has_image:
        return None

    thumb_id = fs.put(thumb_bytes, filename=f"map_thumb_{datetime.utcnow().isoformat()}.png", contentType="image/png") if thumb_bytes else None

    map_doc = {
        "_id": ObjectId(),
        "title": title,
        "base_image_id": ObjectId(base_image_upload_id),
        "visibility": visibility,
        "drawing": drawing_json,            # dict (vector shapes, layers, etc.)
        "thumb_id": thumb_id,               # GridFS id for preview
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "download_count": 0
    }

    res = users.update_one({"username": user_id}, {"$push": {"maps": map_doc}})
    if res.matched_count == 0:
        if thumb_id:
            try: fs.delete(thumb_id)
            except: pass
        return None

    return str(map_doc["_id"])

def get_maps(user_id, limit=50, skip=0):
    db = connect_db()
    users = db['users']
    user = users.find_one({"username": user_id}, {"maps": 1})
    maps = (user or {}).get("maps", [])

    maps = sorted(maps, key=lambda m: m.get("created_at", datetime.min), reverse=True)
    maps = maps[skip: skip + limit]

    out = []
    for m in maps:
        out.append({
            "_id": str(m["_id"]),
            "title": m.get("title"),
            "visibility": m.get("visibility"),
            "created_at": m.get("created_at"),
            "updated_at": m.get("updated_at"),
            "download_count": m.get("download_count", 0),
            "base_image_id": str(m["base_image_id"]) if m.get("base_image_id") else None,
            "thumb_id": str(m["thumb_id"]) if m.get("thumb_id") else None,
        })
    return out

def get_map(user_id, map_id):
    db = connect_db()
    users = db['users']
    doc = users.find_one({"username": user_id, "maps._id": ObjectId(map_id)}, {"maps.$": 1})
    if not doc or not doc.get("maps"):
        return None
    m = doc["maps"][0]
    m["_id"] = str(m["_id"])
    if m.get("base_image_id"):
        m["base_image_id"] = str(m["base_image_id"])
    if m.get("thumb_id"):
        m["thumb_id"] = str(m["thumb_id"])
    return m

def update_map(map_id, title=None, visibility=None, drawing_json=None, new_thumb_bytes=None):
    db = connect_db()
    fs = gridfs.GridFS(db)
    users = db['users']

    updates = {"maps.$.updated_at": datetime.utcnow()}
    if title is not None:
        updates["maps.$.title"] = title
    if visibility is not None:
        assert visibility in ("public", "private")
        updates["maps.$.visibility"] = visibility
    if drawing_json is not None:
        updates["maps.$.drawing"] = drawing_json

    # handle thumbnail replacement
    if new_thumb_bytes is not None:
        # fetch current to delete old thumb
        current = users.find_one({"maps._id": ObjectId(map_id)}, {"maps.$": 1})
        old_thumb = None
        if current and current.get("maps"):
            old_thumb = current["maps"][0].get("thumb_id")
        new_thumb_id = gridfs.GridFS(db).put(new_thumb_bytes, filename=f"map_thumb_{map_id}.png", contentType="image/png")
        updates["maps.$.thumb_id"] = new_thumb_id
    else:
        old_thumb = None

    res = users.update_one({"maps._id": ObjectId(map_id)}, {"$set": updates})
    if res.modified_count == 0:
        # if we uploaded a new thumb but failed to set it, cleanup it
        if new_thumb_bytes is not None:
            try: fs.delete(new_thumb_id)
            except: pass
        return False

    # delete old thumb after successful update
    if old_thumb:
        try: fs.delete(old_thumb)
        except: pass

    return True

def delete_map(user_id, map_id):
    db = connect_db()
    fs = gridfs.GridFS(db)
    users = db['users']

    # fetch current to cleanup thumb
    current = users.find_one({"username": user_id, "maps._id": ObjectId(map_id)}, {"maps.$": 1})
    if not current or not current.get("maps"):
        return False
    thumb_id = current["maps"][0].get("thumb_id")

    res = users.update_one({"username": user_id}, {"$pull": {"maps": {"_id": ObjectId(map_id)}}})
    if res.modified_count == 0:
        return False

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
    
# ******************* NEW FUNCTIONS FOR MY MAPS TAB - IMPLEMENTATION STARTED BY RAFAEL AYALA AND TEAM 2 OF DR. MEJIA'S SWE PRACTICUM COURSE - FALL 2025
# ******************* Image files uploaded by users
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
            "created_at": u.get("created_at"),   # datetime; we stringify in route
            "updated_at": u.get("updated_at"),
            "file_id": str(u["file_id"]) if u.get("file_id") else None,
            "thumb_id": str(u["thumb_id"]) if u.get("thumb_id") else None,
            # include if you track this
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