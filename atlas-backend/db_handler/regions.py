import re
from bson import ObjectId
from docx2python import docx2python
from datetime import datetime
from .connection_db import connect_db
from .utils import flatten_document

def parse_endnotes(endnotes):
    """Turn flattened endnotes into a dict mapping number -> text."""
    note_dict = {}
    if not endnotes or not isinstance(endnotes, list):
        return note_dict

    flattened = flatten_document(endnotes)
    for line in flattened:
        match = re.match(r"endnote(\d+)\)\t(.+)", line)
        if match:
            note_dict[match.group(1)] = match.group(2).strip()
    return note_dict

def parse_region(text, endnotes, last_endnote):
    """Extract region names, abbreviations, and associated endnotes."""
    parts = text.split(' or ')
    names, abbreviations = [], []
    endnote_texts, endnote_refs = [], []

    for part in parts:
        # Region name (before first parenthesis)
        name_match = re.match(r"([^(]+)", part)
        if name_match:
            names.append(name_match.group(1).strip())

        # Abbreviations inside parentheses
        abbrs = re.findall(r'\(([^)]+)\)', part)
        if abbrs:
            abbreviations.append(abbrs[-1])

    found_refs = re.findall(r'endnote(\d+)', text)
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

def load_regions_from_docx(file_path, reference_map=None):
    """
    Parse a docx file of CNS regions and insert them into MongoDB.
    Optionally enrich with external reference map (endnote_num -> refs).
    """
    doc_content = docx2python(file_path)
    endnotes = parse_endnotes(doc_content.endnotes)
    flat_text = flatten_document(doc_content.body)

    regions, start_processing, last_endnote = [], False, None

    for text in flat_text:
        if 'central nervous system [rat]' in text.lower():
            start_processing = True
        elif start_processing and text:
            region_info, last_endnote = parse_region(text, endnotes, last_endnote)
            if region_info.get("names"):
                # Map references if provided
                if reference_map and "endnote_nums" in region_info:
                    refs = set()
                    for num in region_info["endnote_nums"]:
                        if num != "1" and num in reference_map:
                            refs.update(reference_map[num])
                    region_info["references"] = list(refs)
                # Remove helper field
                region_info.pop("endnote_nums", None)
                regions.append(region_info)

    if regions:
        db = connect_db()
        db["regions"].insert_many(regions)
        return f"{len(regions)} regions loaded into MongoDB"
    return "No regions were found in the document."

def load_reference_mappings(txt_path):
    """Load reference mappings from a text file (num -> refs list)."""
    reference_map = {}
    with open(txt_path, "r") as f:
        for line in f:
            match = re.match(r"^(\d+)\.\s+(.*)", line.strip())
            if match:
                num = str(int(match.group(1)))
                refs = [r.strip() for r in match.group(2).split(",")]
                reference_map[num] = refs
    return reference_map

def get_references_by_region_id(region_id):
    """Return reference list for a region by its MongoDB _id."""
    db = connect_db()
    region = db["regions"].find_one({"_id": ObjectId(region_id)})
    return region.get("references", []) if region else []

def get_all_regions():
    """Return all regions (without _id)."""
    db = connect_db()
    return list(db["regions"].find({}, {"_id": 0}))

def get_region_by_abbr(abbr):
    """Find a region by its abbreviation."""
    db = connect_db()
    return db["regions"].find_one({"abbreviations": abbr})
