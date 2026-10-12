from io import BytesIO
from flask import request, jsonify, session, send_file, url_for
from werkzeug.utils import secure_filename
from security.security_middleware import sanitize_payload
from security.file_security import file_security, FileUploadSecurity
from security.security_logging import log_security_event
from security.rate_limiter import rate_limiter
from db_handler.image_uploads import (
    create_image_upload as db_create_image_upload,
    get_image_uploads,
    get_image_upload,
    get_image_blob,
    get_upload_thumb_blob,
    update_image_upload,
    delete_image_upload as db_delete_image_upload,
    get_map_thumb_blob
)
import os
import tempfile

try:
    from PIL import Image
    PIL_AVAILABLE = True
except Exception:
    PIL_AVAILABLE = False

ALLOWED_MIME = {"image/png", "image/jpeg", "image/tiff"}
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25MB hard cap

def register_image_uploads_routes(app):
    app.config.setdefault("MAX_CONTENT_LENGTH", MAX_UPLOAD_BYTES)

    @app.route('/imageuploads', methods=['GET'])
    @app.route('/flask-api/imageuploads', methods=['GET'])
    def list_image_uploads():
        user_id = request.args.get('user_id')
        if not user_id:
            return jsonify({"error": "Not authenticated"}), 401

        try:
            limit = int(request.args.get("limit", 50))
            skip  = int(request.args.get("skip", 0))
        except ValueError:
            return jsonify({"error": "limit/skip must be integers"}), 400

        items = get_image_uploads(user_id, limit=limit, skip=skip)

        def to_front(u):
            return {
                "_id": u["_id"],
                "title": u.get("title"),
                "filename": u.get("filename"),
                "mimeType": u.get("mime"),
                "sizeBytes": u.get("size"),
                "uploaded_at": u.get("created_at").isoformat() if u.get("created_at") else None,
                "updated_at": u.get("updated_at").isoformat() if u.get("updated_at") else None,
                "file_id": u.get("file_id"),
                "thumb_id": u.get("thumb_id"),
                "used_in_maps": u.get("used_in_maps", []),
            }

        out = [to_front(x) for x in items]

        return jsonify(out), 200


    @app.route('/imageuploads/<upload_id>', methods=['GET'])
    @app.route('/flask-api/imageuploads/<upload_id>', methods=['GET'])
    def get_image_upload_meta(upload_id):
        user_id = request.args.get('user_id')
        if not user_id:
            return jsonify({"error": "Not authenticated"}), 401

        meta = get_image_upload(user_id, upload_id)
        if not meta:
            return jsonify({"error": "Not found"}), 404
        meta["uploaded_at"] = meta.pop("created_at", None)
        meta["mimeType"]    = meta.pop("mime", None)
        meta["sizeBytes"]   = meta.pop("size", None)
        meta["thumbUrl"]    = url_for('download_image_thumb', upload_id=meta["_id"], _external=False)
        meta["downloadUrl"] = url_for('download_image_upload', upload_id=meta["_id"], _external=False)

        return jsonify(meta), 200

    @app.route('/imageuploads/create', methods=['POST'])
    @app.route('/flask-api/imageuploads/create', methods=['POST'])
    def create_image_upload():
        user_id = request.args.get('user_id')
        if not user_id:
            log_security_event("Unauthorized upload attempt", f"Missing user_id")
            return jsonify({"error": "Not authenticated"}), 401

        client_ip = rate_limiter._get_client_ip()
        allowed, msg = rate_limiter.check_user_upload_rate_limit(user_id)
        if not allowed:
            return jsonify({"error": msg}), 429
        
        allowed, msg = rate_limiter.check_ip_upload_rate_limit(client_ip)
        if not allowed:
            return jsonify({"error": msg}), 429

        if 'file' not in request.files:
            log_security_event("Invalid upload request", f"No file in request from user {user_id}")
            return jsonify({"error": "file is required (multipart/form-data)"}), 400

        up = request.files['file']
        
        # Create temporary directory for security validation
        with tempfile.TemporaryDirectory() as temp_dir:
            # Use FileUploadSecurity to validate the upload
            is_valid, message, file_info = file_security.validate_upload(up, user_id, temp_dir)
            
            if not is_valid:
                log_security_event("File upload rejected", f"User {user_id}: {message}")
                return jsonify({"error": message}), 415
            
            # Sanitize title to prevent XSS
            form_data = sanitize_payload({k: v for k, v in request.form.items()})
            title = form_data.get('title') or (up.filename or "Untitled")
            
            # Check data volume limits
            file_size = file_info['size']
            allowed, msg = rate_limiter.check_user_data_volume(user_id, file_size)
            if not allowed:
                log_security_event("Upload rejected - data volume limit", f"User {user_id}: {msg}")
                return jsonify({"error": msg}), 429
            
            allowed, msg = rate_limiter.check_ip_data_volume(client_ip, file_size)
            if not allowed:
                log_security_event("Upload rejected - data volume limit", f"IP {client_ip}: {msg}")
                return jsonify({"error": msg}), 429
            
            # Read validated file
            with open(file_info['path'], 'rb') as f:
                data = f.read()
            
            if not data:
                log_security_event("File upload rejected", f"User {user_id}: Empty file")
                return jsonify({"error": "Empty file"}), 400

            # Generate thumbnail for images
            thumb_bytes = None
            if PIL_AVAILABLE and file_info['category'] == 'images':
                try:
                    img = Image.open(BytesIO(data))
                    img = img.convert("RGB")
                    img.thumbnail((512, 512))
                    buf = BytesIO()
                    img.save(buf, format="PNG", optimize=True)
                    thumb_bytes = buf.getvalue()
                except Exception as e:
                    log_security_event("Thumbnail generation failed", f"User {user_id}: {str(e)}")
                    thumb_bytes = None

            # Create database entry
            upload_id = db_create_image_upload(
                user_id=user_id,
                title=title,
                filename=file_info['filename'],
                mime=file_info['mime_type'],
                data_bytes=data,
                thumb_bytes=thumb_bytes
            )
            
            if not upload_id:
                log_security_event("Upload failed", f"User not found: {user_id}")
                return jsonify({"error": "User not found"}), 404

            meta = get_image_upload(user_id, upload_id)
            if not meta:
                log_security_event("Upload lookup failed", f"User {user_id}, Upload {upload_id}")
                return jsonify({"error": "Lookup failed after create"}), 404

            log_security_event("File uploaded successfully", f"User {user_id}: {file_info['filename']} ({file_info['size']} bytes)")

            def to_front(u):
                return {
                    "_id": u["_id"],
                    "title": u.get("title"),
                    "filename": u.get("filename"),
                    "mimeType": u.get("mime"),
                    "sizeBytes": u.get("size"),
                    "uploaded_at": u.get("created_at").isoformat() if u.get("created_at") else None,
                    "updated_at": u.get("updated_at").isoformat() if u.get("updated_at") else None,
                    "file_id": u.get("file_id"),
                    "thumb_id": u.get("thumb_id"),
                    "used_in_maps": u.get("used_in_maps", []),
                }

            return jsonify(to_front(meta)), 201


    @app.route('/imageuploads/update/<upload_id>', methods=['PUT'])
    @app.route('/flask-api/imageuploads/update/<upload_id>', methods=['PUT'])
    def update_image_upload(upload_id):
        """
        JSON body:
          { "title": "new title" }
        """
        user_id = request.args.get('user_id')
        if not user_id:
            return jsonify({"error": "Not authenticated"}), 401

        data = request.get_json(silent=True) or {}
        data = sanitize_payload(data)
        ok = update_image_upload(upload_id, title=data.get("title"))
        if not ok:
            return jsonify({"error": "Update failed"}), 400

        meta = get_image_upload(user_id, upload_id)
        meta["uploaded_at"] = meta.pop("created_at", None)
        meta["mimeType"]    = meta.pop("mime", None)
        meta["sizeBytes"]   = meta.pop("size", None)
        meta["thumbUrl"]    = url_for('download_image_thumb', upload_id=meta["_id"], _external=False)
        meta["downloadUrl"] = url_for('download_image_upload', upload_id=meta["_id"], _external=False)
        return jsonify(meta), 200

    @app.route('/imageuploads/delete/<upload_id>', methods=['DELETE'])
    @app.route('/flask-api/imageuploads/delete/<upload_id>', methods=['DELETE'])
    def delete_image_upload(upload_id):
        user_id = request.args.get('user_id')
        if not user_id:
            return jsonify({"error": "Not authenticated"}), 401

        ok = db_delete_image_upload(user_id, upload_id)
        if not ok:
            return jsonify({"error": "Delete failed"}), 400

        return jsonify({"message": "Deleted"}), 200

    @app.route('/imageuploads/<upload_id>/download', methods=['GET'])
    @app.route('/flask-api/imageuploads/<upload_id>/download', methods=['GET'])
    def download_image_upload(upload_id):
        """
        Streams the original image bytes from GridFS.
        """
        blob = get_image_blob(upload_id)
        if not blob:
            return jsonify({"error": "Not found"}), 404

        data, mime, filename = blob
        return send_file(
            BytesIO(data),
            mimetype=mime,
            as_attachment=True,
            download_name=filename
        )
    
    @app.route('/imageuploads/<upload_id>/thumb', methods=['GET'])
    @app.route('/flask-api/imageuploads/<upload_id>/thumb', methods=['GET'])
    def download_image_thumb_blob(upload_id):
        blob = get_upload_thumb_blob(upload_id)
        if not blob:
            return jsonify({"error": "Not found"}), 404
        data, mime, filename = blob
        return send_file(BytesIO(data), mimetype=mime, as_attachment=False, download_name=filename)