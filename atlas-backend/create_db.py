import json
from pathlib import Path
from db_handler.connection_db import connect_db

# Source file of newline-delimited JSON region docs
JSONL_PATH = "database.jsonl"  

# Target MongoDB collection name
COLLECTION_NAME = "regions"

def _strip_id(doc: dict) -> dict:
    # Remove MongoDB _id so inserts can assign new ObjectIds
    if "_id" in doc:
        d = dict(doc)
        d.pop("_id", None)
        return d
    return doc

def load_regions_from_jsonl(jsonl_path: str) -> str:
    p = Path(jsonl_path)

    # Fail early if the JSONL file is missing
    if not p.exists():
        raise FileNotFoundError(f"JSONL file not found: {p}")

    batch = []

    # Read newline-delimited JSON; skip blank lines
    with p.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                # Include line number to make debugging bad JSON easy
                raise ValueError(f"Invalid JSON on line {line_no}: {e}") from e
            batch.append(_strip_id(obj))

    # Nothing to insert if the file had no valid objects
    if not batch:
        return "No regions found in JSONL; nothing inserted."

    # Connect to DB 
    db = connect_db()
    coll = db[COLLECTION_NAME]

    # Bulk insert for speed
    result = coll.insert_many(batch, ordered=False)
    return f"Inserted {len(result.inserted_ids)} regions."

if __name__ == "__main__":
    # Run as a script to load regions into the database
    msg = load_regions_from_jsonl(JSONL_PATH)
    print(msg)
