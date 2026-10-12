from flask import request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
import os, requests, mimetypes
from security.security_middleware import sanitize_payload


# Imports from refactored db package
from db_handler.library import (
    add_paper_to_library,
    get_user_library,
    update_user_paper,
    delete_user_paper,
    paper_exists_in_library
)
from db_handler.metadata import (
    fetch_metadata_by_identifier,
    extract_identifiers_from_pdf,
    fetch_abstract_by_id
)
from db_handler.regions import get_region_by_abbr
from db_handler.utils import extract_identifiers_from_url


def register_library_routes(app, upload_folder, serpapi_key):
    app.config["UPLOAD_FOLDER"] = os.path.abspath(upload_folder)
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    @app.route("/uploads/<path:filename>")
    @app.route("/flask-api/uploads/<path:filename>")
    def serve_upload(filename):
        mime, _ = mimetypes.guess_type(filename)
        return send_from_directory(app.config["UPLOAD_FOLDER"], filename, mimetype=mime)
    
    @app.route('/library/upload', methods=['POST'])
    @app.route('/flask-api/library/upload', methods=['POST'])
    def upload_paper():
        user_id = request.form.get('user_id')
        identifier = request.form.get('identifier')
        paper_file = request.files.get('file')
        metadata = None

        if identifier:
            metadata = fetch_metadata_by_identifier(identifier)
        elif paper_file:
            filename = secure_filename(paper_file.filename)
            filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            paper_file.save(filepath)

            web_url = f"/flask-api/uploads/{filename}"  

            extracted_ids = extract_identifiers_from_pdf(filepath)
            metadata = None
            for id_candidate in extracted_ids:
                metadata = fetch_metadata_by_identifier(id_candidate)
                if metadata:
                    metadata["pdf_url"] = web_url
                    break

            if not metadata:
                metadata = {
                    "title": filename,
                    "authors": [],
                    "abstract": "Could not extract metadata.",
                    "pdf_url": web_url,          
                    "user_notes": "",
                    "identifiers": {}
                }

        if metadata:
            paper_id = add_paper_to_library(user_id, metadata)
            return jsonify({"message": "Paper uploaded", "paper_id": paper_id}), 201
        return jsonify({"error": "Failed to upload or extract metadata"}), 400

    @app.route('/library', methods=['GET'])
    @app.route('/flask-api/library', methods=['GET'])
    def get_library():
        user_id = request.args.get('user_id')
        if not user_id:
            return jsonify({"error": "Missing user_id"}), 400
        library = get_user_library(user_id)
        return jsonify(library), 200

    @app.route('/library/update/<paper_id>', methods=['PUT'])
    @app.route('/flask-api/library/update/<paper_id>', methods=['PUT'])
    def update_paper(paper_id):
        data = request.json or {}
        data = sanitize_payload(data)
        user_id = data.get('user_id')
        if not user_id:
            return jsonify({"error": "Missing user_id"}), 400
        updated_fields = {k: v for k, v in data.items() if k not in ['user_id', '_id']}
        success = update_user_paper(user_id, paper_id, updated_fields)
        return jsonify({"success": success}), 200

    @app.route('/library/delete/<paper_id>', methods=['DELETE'])
    @app.route('/flask-api/library/delete/<paper_id>', methods=['DELETE'])
    def delete_paper_route(paper_id):
        user_id = request.args.get("user_id")
        if not user_id:
            return jsonify({"error": "Missing user_id"}), 400
        success = delete_user_paper(user_id, paper_id)
        if success:
            return jsonify({"success": True}), 200
        return jsonify({"success": False, "error": "Deletion failed"}), 404

    @app.route("/region-papers-by-abbr/<abbr>", methods=["GET"])
    @app.route("/flask-api/region-papers-by-abbr/<abbr>", methods=["GET"])
    def get_region_papers_by_abbr_route(abbr):
        region = get_region_by_abbr(abbr)
        user_id = request.args.get('user_id')
        if not region:
            return jsonify({"error": "Region not found"}), 404
        references = region.get("references", [])
        if not references:
            return jsonify({"error": "No references found for this region."}), 404

        results = []
        for ref in references:
            params = {"engine": "google_scholar", "q": ref, "api_key": serpapi_key}
            response = requests.get("https://serpapi.com/search", params=params)
            if response.status_code == 200:
                data = response.json()
                top_result = data.get("organic_results", [])[0] if data.get("organic_results") else {}
                title = top_result.get("title") if top_result else None
                already_added = paper_exists_in_library(user_id, title) if user_id and title else False
                results.append({
                    "reference": ref,
                    "title": top_result.get("title"),
                    "link": top_result.get("link"),
                    "snippet": top_result.get("snippet"),
                    "alreadyAdded": already_added
                })
            else:
                results.append({"reference": ref, "error": f"Failed. Status: {response.status_code}"})
        return jsonify({"papers": results})

    @app.route('/library/add-region-paper', methods=['POST'])
    @app.route('/flask-api/library/add-region-paper', methods=['POST'])
    def add_region_paper_to_library():
        data = request.json
        user_id = data.get('user_id')
        title = data.get('title')
        link = data.get('link')
        reference = data.get('reference')
        if not user_id or not title or not link:
            return jsonify({"error": "Missing required fields"}), 400
        if paper_exists_in_library(user_id, title):
            return jsonify({"message": "Paper already in your library."}), 200

        extracted_ids = extract_identifiers_from_url(link)
        metadata = None
        for identifier in extracted_ids:
            metadata = fetch_metadata_by_identifier(identifier)
            if metadata:
                break
        if metadata:
            metadata["pdf_url"] = None
        if not metadata:
            metadata = {
                "title": title,
                "authors": [],
                "abstract": f"Auto-added from region reference: {reference}",
                "source_url": link,
                "pdf_url": None,
                "user_notes": "",
                "identifiers": {"source": "reference"}
            }
        paper_id = add_paper_to_library(user_id, metadata)
        return jsonify({"message": "Paper added to library", "paper_id": paper_id}), 200

    @app.route('/library/add-pubmed-paper', methods=['POST'])
    @app.route('/flask-api/library/add-pubmed-paper', methods=['POST'])
    def add_pubmed_paper_to_library():
        data = request.json
        user_id = data.get('user_id')
        title = data.get('title')
        source = data.get('source')
        uid = data.get('uid')
        authors = data.get('authors', [])
        journal = data.get('journal', '')
        pubdate = data.get('year', '')
        year = pubdate.split()[0] if pubdate else ''
        abstract = data.get('abstract', '')

        if not user_id or not title or not uid or not source:
            return jsonify({"error": "Missing required fields"}), 400
        if paper_exists_in_library(user_id, title):
            return jsonify({"message": "Paper already in your library."}), 200

        if not abstract:
            abstract = fetch_abstract_by_id(source, uid)

        source_url = f"https://www.ncbi.nlm.nih.gov/{'pubmed' if source == 'pubmed' else 'pmc/articles'}/{uid}"
        metadata = {
            "title": title,
            "authors": authors,
            "abstract": abstract or f"Auto-added from {source} entry: {uid}",
            "pdf_url": None,
            "source_url": source_url,
            "user_notes": "",
            "identifiers": {"source": source},
            "journal": journal,
            "year": year
        }
        paper_id = add_paper_to_library(user_id, metadata)
        return jsonify({"message": "Paper added to library", "paper_id": paper_id}), 200