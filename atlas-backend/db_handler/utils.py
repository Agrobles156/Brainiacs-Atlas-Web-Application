import re

def flatten_document(nested_list):
    flat = []
    for item in nested_list:
        if isinstance(item, list):
            flat.extend(flatten_document(item))
        elif isinstance(item, str) and item.strip():
            flat.append(item.strip())
    return flat

def extract_identifiers_from_url(url):
    ids = []
    match = re.search(r'(10\.\d{4,9}/[-._;()/:A-Za-z0-9]+)', url)
    if match:
        ids.append(match.group(1))
    return ids
