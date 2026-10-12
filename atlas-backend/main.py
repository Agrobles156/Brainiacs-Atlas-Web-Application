from flask import Flask, jsonify
from flask_cors import CORS
from flask_session import Session
from pymongo import MongoClient
from dotenv import dotenv_values, load_dotenv
import os, time, sys

from security.security_headers import set_security_headers
from security.security_middleware import register_security_middleware
from security.security_logging import log_security_event
from oauth_auth import google_oauth, add_oauth_routes
from routes.auth import register_auth_routes
from routes.notes import register_notes_routes
from routes.collections import register_collections_routes
from routes.library import register_library_routes
from routes.search import register_search_routes
from routes.misc import register_misc_routes
from routes.maps import register_maps_routes
from routes.image_uploads import register_image_uploads_routes
from routes.image_warping import register_image_warping_routes
from routes_invites import register_invite_routes
from routes_chat import register_chat_routes
from routes.admin import register_admin_routes

def loading_bar(text="Starting backend", steps=30, delay=0.05):
    for i in range(steps + 1):
        percent = int((i / steps) * 100)
        bar = "#" * i + "-" * (steps - i)
        sys.stdout.write(f"\r{text}: [{bar}] {percent}%")
        sys.stdout.flush()
        time.sleep(delay)
    print()

def create_app():
    app = Flask(__name__)

    register_security_middleware(app)
    log_security_event("Flask app initialized with security middleware")

    load_dotenv()
    file_config = dotenv_values(".env")
    app.config.update(file_config)

    # Tunnel URL auto-configuration
    tunnel_url = os.getenv("TUNNEL_URL", "").rstrip("/")
    if tunnel_url:
        os.environ.setdefault("BACKEND_PUBLIC_URL", tunnel_url)
        os.environ.setdefault("NEXT_PUBLIC_BACKEND_URL", tunnel_url)
        os.environ.setdefault("FRONTEND_BASE_URL", tunnel_url)

    # Overlay selected environment variables
    override_keys = ["DB_URL", "MONGO_URI", "MONGO_DB", "SECRET_KEY", "SERPAPI_KEY"]
    env_overrides = {k: os.getenv(k) for k in override_keys if os.getenv(k)}
    app.config.update(env_overrides)

    WEB_ORIGIN = (
        os.getenv("WEB_ORIGIN")
        or file_config.get("WEB_ORIGIN")
        or "http://localhost:3000"
    )

    allowed_origins = (
        [WEB_ORIGIN, "http://localhost:3000"]
        if WEB_ORIGIN != "http://localhost:3000"
        else [WEB_ORIGIN]
    )

    CORS(app, supports_credentials=True, resources={r"/*": {"origins": allowed_origins}})

    app.config.setdefault("SECRET_KEY", os.urandom(12).hex())
    app.config.update(
        SESSION_TYPE="filesystem",
        SESSION_FILE_DIR="./flask_session",
        SESSION_PERMANENT=False,
        SESSION_USE_SIGNER=True,
        SESSION_COOKIE_PATH="/",
    )

    use_secure_cookies = bool(tunnel_url) or os.getenv("SESSION_COOKIE_SECURE", "").lower() in {"1", "true", "yes"}

    if use_secure_cookies:
        app.config.update(
            SESSION_COOKIE_SAMESITE="None",
            SESSION_COOKIE_SECURE=True,
            SESSION_COOKIE_HTTPONLY=True,
        )
    else:
        app.config.update(
            SESSION_COOKIE_SAMESITE="Lax",
            SESSION_COOKIE_SECURE=False,
        )
        app.config.setdefault("SESSION_COOKIE_HTTPONLY", True)

    os.makedirs("./flask_session", exist_ok=True)

    global UPLOAD_FOLDER
    UPLOAD_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), "uploads"))
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

    Session(app)

    mongo_uri = (
        os.getenv("DB_URL")
        or file_config.get("DB_URL")
        or os.getenv("MONGO_URI")
        or file_config.get("MONGO_URI")
        or "mongodb://127.0.0.1:27017"
    )
    mongo_db_name = os.getenv("MONGO_DB") or file_config.get("MONGO_DB") or "demo"

    client = MongoClient(mongo_uri)
    app.db = client[mongo_db_name]

    try:
        pass
    except Exception as e:
        print("Index create (notes) skipped:", e)

    SERPAPI_KEY = app.config.get("SERPAPI_KEY")

    google_oauth.init_app(app)
    add_oauth_routes(app)

    register_auth_routes(app)
    register_notes_routes(app)
    register_collections_routes(app)
    register_library_routes(app, UPLOAD_FOLDER, SERPAPI_KEY)
    register_search_routes(app)
    register_misc_routes(app, UPLOAD_FOLDER)
    register_maps_routes(app)
    register_image_uploads_routes(app)
    register_image_warping_routes(app)
    register_invite_routes(app)
    register_chat_routes(app)
    register_admin_routes(app)

    @app.get("/healthz")
    def healthz():
        return jsonify({"ok": True})

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Not Found"}), 404

    @app.errorhandler(405)
    def not_allowed(e):
        return jsonify({"error": "Method Not Allowed"}), 405

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Server Error"}), 500

    @app.after_request
    def apply_headers(resp):
        return set_security_headers(resp)

    session_folder = os.path.join(os.path.dirname(__file__), "flask_session")
    if os.path.isdir(session_folder):
        for fname in os.listdir(session_folder):
            try:
                os.remove(os.path.join(session_folder, fname))
            except Exception as e:
                print(f"⚠️ Could not delete session file {fname}: {e}")

    return app


if __name__ == '__main__':
    
    print("Starting Atlas Backend...")
    app = create_app()
    port = int(os.getenv("FLASK_RUN_PORT", "5000"))
    host = os.getenv("FLASK_RUN_HOST", "localhost")
    loading_bar("Booting Atlas Backend", steps=40, delay=0.03)
    app.run(host=host, port=port, debug=True)

