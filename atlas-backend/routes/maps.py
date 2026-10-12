# *********** New Feature Being Added as of 9/9/2025 by Team 2 of Dr. Mejia's SWE Practicum Class - My Maps Tab
# routes_maps.py
from datetime import datetime
from io import BytesIO
from flask import Blueprint, request, jsonify, session, send_file
from db_handler.maps import get_maps
from bson import ObjectId
# For exporting TIFF of overlay
from PIL import Image
import io
from db_handler.maps import (
    create_map,
    get_map,
    get_maps,
    delete_map,
    update_map_title,
    add_layer,
    get_layer,
    replace_layer_payload,
    append_strokes,
    set_layer_header,
    save_map_thumb,
    get_map_thumb_blob,
    set_map_title,
    connect_db,
    get_map_image_blob # To obtain the map-owned background.
)

# Overlay Blueprint - Helps in downloading TIFF of the Overlay
overlay_bp = Blueprint("overlay", __name__)

maps_bp = Blueprint("maps_bp", __name__)

def register_maps_routes(app):
    app.register_blueprint(maps_bp, name="maps_bp")
    app.register_blueprint(maps_bp, url_prefix="/flask-api", name="maps_bp_prefixed")
    app.register_blueprint(overlay_bp)

def _get_user():
    user_id = request.args.get("user_id")
    if not user_id:
        return None, (jsonify({"error": "User Not Identified"}), 401)
    return user_id, None

def dfd():
    user_id = "raph"
    db = connect_db()
    map_id = "68fc076abdee174bad493b2"
    m = _fetch_user_map(db, user_id, map_id)
    print("base_image_id:", m.get("base_image_id"))

    print(bool(_fetch_base_image_bytes(db, user_id, str(m["base_image_id"]))))
    # Expect True
    
@maps_bp.route("/maps", methods=["GET"])
def list_maps_route():
    user_id, error = _get_user()
    if error: return error
    try:
        limit = int(request.args.get("limit", 50))
        skip = int(request.args.get("skip", 0))
    except ValueError:
        return jsonify({"error": "limit/skip must be in the form of an integer"}), 400
    
    items = get_maps(user_id, limit=limit, skip=skip)

    def date_formatter(maps):
        formatted_maps = dict(maps)
        if isinstance(formatted_maps.get("created_at"), datetime):
            formatted_maps["created_at"] = formatted_maps["created_at"].isoformat()
        if isinstance(formatted_maps.get("updated_at"), datetime):
            formatted_maps["updated_at"] = formatted_maps["updated_at"].isoformat()
        formatted_maps["layers"] = formatted_maps.get("layers", [])
        return formatted_maps
    
    return jsonify([date_formatter(map) for map in items]), 200

@maps_bp.route("/maps/create", methods=["POST"])
def create_map_route():
    user_id, error = _get_user()
    if error: return error

    map_data = request.get_json(silent=True) or {}
    base_upload_id = map_data.get("from_upload_id") or map_data.get("base_upload_id")
    map_title = map_data.get("title") or "Untitled Map"
    if not base_upload_id:
        return jsonify({"error": "Base Image ID Required"}), 400
    
    map_id = create_map(user_id, map_title, base_upload_id)
    if not map_id:
        return jsonify({"error": "Map ID Not Found"}), 404
    
    # Default strokes layer
    layer_id = add_layer(user_id, map_id, name="Strokes", layer_type="strokes", visible=True, z=10)
    return jsonify({"map_id": map_id, "default_layer_id": layer_id}), 201

@maps_bp.route("/maps/<map_id>", methods=["GET"])
def get_map_route(map_id):
    user_id, error = _get_user()
    if error: return error

    map = get_map(user_id, map_id)
    if not map:
        return jsonify({"error": "Map Not Found"}), 404
    return jsonify(map), 200

@maps_bp.route("/maps/<map_id>", methods=["DELETE"])
def delete_map_route(map_id):
    user_id, error = _get_user()
    if error: return error

    deletion = delete_map(user_id, map_id)
    if not deletion:
        return jsonify({"error": "Map could not be deleted"}), 400
    return jsonify({"message": "Map Deleted"}), 200

@maps_bp.route("/maps/<map_id>", methods=["PUT"])
def update_map_route(map_id):
    user_id, error = _get_user()
    if error: return error

    data = request.get_json(silent=True) or {}
    new_title = data.get("title")
    
    if not new_title:
        return jsonify({"error": "Title is required"}), 400
    
    success = update_map_title(user_id, map_id, new_title)
    if not success:
        return jsonify({"error": "Map could not be updated"}), 400
    return jsonify({"message": "Map Updated"}), 200

##################### Map Layer Route Functions
@maps_bp.route("/maps/<map_id>/layers", methods=["POST"])
def add_layer_route(map_id):
    user_id, error = _get_user()
    if error: return error

    map_data = request.get_json(silent=True) or {}
    name = map_data.get("name") or "Layer"
    layer_type = map_data.get("type") or "strokes"
    visible = bool(map_data.get("visible", True))
    opacity = float(map_data.get("opacity", 1.0))
    z = int(map_data.get("z", 0))

    layer_id = add_layer(user_id, map_id, name=name, layer_type=layer_type, visible=visible,opacity=opacity, z=z)
    if not layer_id:
        return jsonify({"error": "Map Layer Not Added"}), 404
    return jsonify({"layer_id": layer_id}), 201

@maps_bp.route("/maps/<map_id>/layers/<layer_id>", methods=["GET"])
def get_layer_route(map_id, layer_id):
    user_id, error = _get_user()
    if error: return error

    layer = get_layer(user_id, map_id, layer_id)
    if not layer:
        return jsonify({"error": "Map Layer could not be Found"}), 404
    return jsonify(layer), 200

@maps_bp.route("/maps/<map_id>/layers/<layer_id>", methods=["PUT"])
def replace_layer_payload_route(map_id, layer_id):
    user_id, error = _get_user()
    if error: return error

    data = request.get_json(silent=True) or {}
    payload = data.get("payload")
    if payload is None:
        return jsonify({"error": "Payload Not Identified"}), 400
    
    replacement = replace_layer_payload(user_id, map_id, layer_id, payload)
    if not replacement:
        return jsonify({"error": "Layer updates could not be saved"}), 400
    return (jsonify({"message": "ok"}), 200)

@maps_bp.route("/maps/<map_id>/layers/<layer_id>/append", methods=["PATCH"])
def append_strokes_route(map_id, layer_id):
    # Body Example: { "paths": [{"color": "#000", "width":2, "points":[[x, y], ...]}, ...]}
    user_id, error = _get_user()
    if error: return error

    map_data = request.get_json(silent=True) or {}
    paths = map_data.get("paths", [])
    if not isinstance(paths, list):
        return jsonify({"error": "Paths not in valid format"}), 400
    
    layer_appendment = append_strokes(user_id, map_id, layer_id, paths)
    if not layer_appendment:
        return jsonify({"error": "Layer append could not be completed"}), 400
    return jsonify({"message": "ok"}), 200

@maps_bp.route("/maps/<map_id>/layers/<layer_id>/header", methods=["PATCH"])
def set_layer_header_route(map_id, layer_id):
    # Body example: {visible, opacity, z, name, type}
    user_id, error = _get_user()
    if error: return error

    map_data = request.get_json(silent=True) or {}
    header = set_layer_header(user_id, map_id, layer_id, **map_data)
    if not header:
        return jsonify({"error": "Header could not be set"}), 400
    return jsonify({"message": "ok"})

@maps_bp.route("/maps/<map_id>/thumb", methods=["GET"])
def get_map_thumb_route(map_id):
    blob = get_map_thumb_blob(map_id)
    if not blob:
        return jsonify({"error": "Map Thumb Blob Not Found"}), 404
    data, mime, filename = blob
    return send_file(BytesIO(data), mimetype=mime, as_attachment=False, download_name=filename)

# New getter for map-owned backgrounds
@maps_bp.route("/maps/<map_id>/background", methods=["GET"])
def get_background_route(map_id):
    image_blob = get_map_image_blob(map_id)
    if not image_blob:
        return jsonify({"error": "No background for this map could be obtained"}), 404
    image_data, mime, file_name = image_blob
    return send_file(BytesIO(image_data), mimetype=mime, as_attachment=False, download_name=file_name)

@maps_bp.route("/maps/<map_id>/thumb", methods=["PUT"])
def put_map_thumb_route(map_id):
    user_id, error = _get_user()
    if error: return error
    
    png = request.get_data()
    if not png:
        return jsonify({"error": "No Data"}), 400
    
    thumb_id = save_map_thumb(user_id, map_id, png)
    if not thumb_id:
        return jsonify({"error": "Map Thumb could not be Saved"}), 400
    return jsonify({"thumb_id": thumb_id}), 200

@maps_bp.route("/maps/<map_id>/title", methods=["PATCH"])
def set_map_title_route(map_id):
    user_id, error = _get_user()
    if error: return error

    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "Title required for title to be set"}), 400
    
    ok = set_map_title(user_id, map_id, title)
    if not ok:
        return jsonify({"error": "Either Map was not found or Title could not be changed"}), 404
    
    return jsonify({"message": "ok", "title": title}), 200