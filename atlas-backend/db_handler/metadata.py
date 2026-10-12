import os
import re
import requests
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup
import pymupdf  # PyMuPDF

# -------------------------------------------------------------------
# Environment / API Keys
# -------------------------------------------------------------------

NCBI_API_KEY = os.getenv("NCBI_API_KEY", "")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "atlas@example.com")
CROSSREF_EMAIL = os.getenv("CROSSREF_EMAIL", ADMIN_EMAIL)

NCBI_PARAMS = {
    "api_key": NCBI_API_KEY,
    "email": ADMIN_EMAIL,
}

CROSSREF_HEADERS = {
    "User-Agent": f"AtlasApp/1.0 (mailto:{CROSSREF_EMAIL})"
}

# -------------------------------------------------------------------
# Identifier Detection
# -------------------------------------------------------------------

def detect_identifier_type(identifier: str):
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

# -------------------------------------------------------------------
# Metadata Fetcher Dispatcher
# -------------------------------------------------------------------

def fetch_metadata_by_identifier(identifier: str):
    id_type = detect_identifier_type(identifier)
    if not id_type:
        return None

    if id_type == "pmcid":
        return _fetch_pmc(identifier)
    if id_type == "pmid":
        return _fetch_pmid(identifier)
    if id_type == "doi":
        return _fetch_doi(identifier)
    if id_type == "arxiv":
        return _fetch_arxiv(identifier)

    return None

# -------------------------------------------------------------------
# PMC FETCH (E-utilities)
# -------------------------------------------------------------------

def _fetch_pmc(identifier: str):
    id_val = identifier.replace("PMC", "")

    summary_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
    fetch_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

    s_params = {
        "db": "pmc",
        "id": id_val,
        "retmode": "json",
        **NCBI_PARAMS
    }

    f_params = {
        "db": "pmc",
        "id": id_val,
        "retmode": "xml",
        **NCBI_PARAMS
    }

    s_resp = requests.get(summary_url, params=s_params)
    f_resp = requests.get(fetch_url, params=f_params)

    if not (s_resp.ok and f_resp.ok):
        print("PMC fetch failed:", s_resp.status_code, f_resp.status_code)
        return None

    summary = s_resp.json()["result"][id_val]
    root = ET.fromstring(f_resp.text)

    abstract = " ".join(
        p.text.strip()
        for p in root.findall(".//abstract//p")
        if p.text
    )

    return {
        "title": summary.get("title"),
        "authors": [a["name"] for a in summary.get("authors", [])],
        "abstract": abstract.strip(),
        "journal": summary.get("source", ""),
        "year": summary.get("pubdate", "").split()[0],
        "pdf_url": "",
        "source_url": f"https://www.ncbi.nlm.nih.gov/pmc/articles/PMC{id_val}",
        "user_notes": "",
        "identifiers": {"pmcid": identifier},
        "annotations": []
    }

# -------------------------------------------------------------------
# PMID FETCH (E-utilities)
# -------------------------------------------------------------------

def _fetch_pmid(identifier: str):
    id_val = identifier.replace("PMID", "")

    summary_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
    fetch_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

    s_params = {
        "db": "pubmed",
        "id": id_val,
        "retmode": "json",
        **NCBI_PARAMS
    }

    f_params = {
        "db": "pubmed",
        "id": id_val,
        "retmode": "xml",
        **NCBI_PARAMS
    }

    s_resp = requests.get(summary_url, params=s_params)
    f_resp = requests.get(fetch_url, params=f_params)

    if not (s_resp.ok and f_resp.ok):
        print("PMID fetch failed:", s_resp.status_code, f_resp.status_code)
        return None

    summary = s_resp.json()["result"][str(id_val)]
    root = ET.fromstring(f_resp.text)

    abstract = " ".join(
        a.text.strip()
        for a in root.findall(".//AbstractText")
        if a.text
    )

    return {
        "title": summary.get("title"),
        "authors": [a["name"] for a in summary.get("authors", [])],
        "abstract": abstract.strip(),
        "journal": summary.get("source", ""),
        "year": summary.get("pubdate", "").split()[0],
        "pdf_url": "",
        "source_url": f"https://pubmed.ncbi.nlm.nih.gov/{id_val}",
        "user_notes": "",
        "identifiers": {"pmid": identifier},
        "annotations": []
    }

# -------------------------------------------------------------------
# DOI FETCH (CROSSREF)
# -------------------------------------------------------------------

def _fetch_doi(identifier: str):
    url = f"https://api.crossref.org/works/{identifier}"

    resp = requests.get(url, headers=CROSSREF_HEADERS)
    if not resp.ok:
        print("DOI fetch failed:", resp.status_code)
        return None

    msg = resp.json()["message"]
    title = msg.get("title", [""])[0]

    authors = [
        f"{a.get('given', '')} {a.get('family', '')}".strip()
        for a in msg.get("author", [])
    ]

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

# -------------------------------------------------------------------
# ARXIV
# -------------------------------------------------------------------

def _fetch_arxiv(identifier: str):
    arxiv_id = identifier.split(":")[-1]
    url = f"http://export.arxiv.org/api/query?id_list={arxiv_id}"

    resp = requests.get(url)
    if not resp.ok:
        print("ArXiv fetch failed:", resp.status_code)
        return None

    root = ET.fromstring(resp.text)
    entry = root.find("{http://www.w3.org/2005/Atom}entry")
    if entry is None:
        return None

    title = entry.find("{http://www.w3.org/2005/Atom}title").text.strip()
    authors = [
        a.find("{http://www.w3.org/2005/Atom}name").text
        for a in entry.findall("{http://www.w3.org/2005/Atom}author")
    ]
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

# -------------------------------------------------------------------
# ABSTRACT FETCH
# -------------------------------------------------------------------

def fetch_abstract_by_id(source: str, uid: str):
    try:
        if source == "pubmed":
            params = {"db": "pubmed", "id": uid, "retmode": "xml", **NCBI_PARAMS}
            resp = requests.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi", params=params)
            if resp.ok:
                root = ET.fromstring(resp.text)
                return " ".join(a.text.strip() for a in root.findall(".//AbstractText") if a.text)

        elif source == "pmc":
            id_val = uid.replace("PMC", "")
            params = {"db": "pmc", "id": id_val, "retmode": "xml", **NCBI_PARAMS}
            resp = requests.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi", params=params)
            if resp.ok:
                root = ET.fromstring(resp.text)
                return " ".join(p.text.strip() for p in root.findall(".//abstract//p") if p.text)

    except Exception as e:
        print("[Abstract Fetch Error]:", e)

    return ""

# -------------------------------------------------------------------
# PDF Parsing
# -------------------------------------------------------------------

def extract_identifiers_from_pdf(filepath: str):
    try:
        doc = pymupdf.open(filepath)
        text = "".join(page.get_text() for page in doc)

        doi_matches = re.findall(r'10\.\d{4,9}/[-._;()/:A-Za-z0-9]+', text)
        pmid_matches = re.findall(r'\bPMID[:\s]?(\d{5,})', text, flags=re.IGNORECASE)
        pmc_matches = re.findall(r'\bPMC\d{6,}', text, flags=re.IGNORECASE)
        arxiv_matches = re.findall(r'arXiv:\d{4}\.\d{4,5}', text, flags=re.IGNORECASE)

        return (
            doi_matches +
            [f"PMID{p}" for p in pmid_matches] +
            pmc_matches +
            arxiv_matches
        )

    except Exception as e:
        print("PDF parsing failed:", e)
        return []
