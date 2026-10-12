from flask import request, jsonify, session, make_response
from db_handler.users import (
    whoami as db_whoami,
    register_user,
    login_user,
    request_password_reset,
    consume_password_reset_token,
    get_user_by_id,
    update_user_orcid,
    update_user_email,
)
from security.security_middleware import strip_after_script_tag
import re


def register_auth_routes(app):
    @app.get("/whoami")
    @app.get("/flask-api/whoami")
    def whoami_route():
        user_id = session.get("userId")
        if not user_id:
            return jsonify({"error": "Not Signed In"}), 400

        orcid_id = None
        try:
            user = get_user_by_id(user_id)
            orcid_id = user.get("orcid_id") if user else None
            print(f"[WHOAMI] user_id: {user_id}, user exists: {user is not None}, orcid_id from db: {orcid_id}")
        except Exception as e:
            print(f"[WHOAMI] Error fetching user: {str(e)}")
            orcid_id = None

        # eturn early if already cached
        if "username" in session and "role" in session:
            print(f"[WHOAMI] Returning cached response - orcid_id: {orcid_id}")
            return jsonify({
                "message": session["username"],
                "role": session["role"],
                "email": session.get("email"),
                "name": session["username"],
                "orcid_id": orcid_id
            }), 200

        # 🧠 Otherwise, go to DB once
        display_name, role = db_whoami(user_id)
        session["username"] = display_name
        session["role"] = role

        email = session.get("email")
        print(f"[WHOAMI] Returning full response - orcid_id: {orcid_id}, email: {email}")
        resp = make_response(jsonify({
            "message": display_name,
            "role": role,
            "email": email,
            "name": display_name,
            "orcid_id": orcid_id
        }), 200)

        return _apply_identity_to_session_and_cookies(resp, email=email, name=display_name, role=role)


    @app.post("/register")
    def register():
        data = request.get_json(silent=True) or {}
        username = data.get("username")
        email = data.get("email")
        password = data.get("password")

        if isinstance(username, str) and strip_after_script_tag(username) != username:
            return jsonify({"error": "invalid_username"}), 400
        if isinstance(email, str) and strip_after_script_tag(email) != email:
            return jsonify({"error": "invalid_email"}), 400

        if not username or not email or not password:
            return jsonify({"error": "Missing data"}), 400

        error, msg_id = register_user(username, email, password)
        if error:
            return jsonify({"error": msg_id}), 409

        session["userId"] = msg_id
        session["role"] = session.get("role") or "user"
        return jsonify({"message": "User registered successfully", "user_id": str(msg_id)}), 201

    @app.post("/login")
    def login():
        data = request.get_json(silent=True) or {}
        email = data.get("email")
        password = data.get("password")

        if isinstance(email, str) and strip_after_script_tag(email) != email:
            return jsonify({"error": "invalid_email"}), 400

        if not email or not password:
            return jsonify({"error": "Missing email or password"}), 400

        user_id, role = login_user(email, password)

        if user_id in ("Wrong Password", "Blocked Account"):
            return jsonify({"error": user_id}), 401

        if not user_id:
            return jsonify({"error": "User not found"}), 404

        session["userId"] = user_id
        session["role"] = role
        return jsonify({"message": "Login successful", "user_id": user_id, "role": role}), 200

    @app.get("/logout")
    @app.get("/flask-api/logout")
    def logout():
        session.clear()
        session.modified = True  # Force Flask to update the session cookie
        response = jsonify({"message": "Logout was successful"})
        # Delete the Flask session cookie - Flask uses 'session' as the default cookie name
        response.set_cookie('session', '', max_age=0, expires=0, httponly=True, samesite='Lax', path='/')
        # Also delete without path specification for safety
        response.set_cookie('session', '', max_age=0, expires=0, httponly=True, samesite='Lax')
        # Ensure CORS headers are explicit for credential-based requests
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response, 200

    @app.post("/auth/request-password-reset")
    def request_password_reset_route():
        """Request a password reset email"""
        data = request.get_json(silent=True) or {}
        email = data.get("email")

        if not email:
            return jsonify({"error": "Email is required"}), 400

        success, message = request_password_reset(email)
        
        if success:
            return jsonify({"message": message}), 200
        else:
            return jsonify({"error": message}), 404

    @app.post("/auth/reset-password")
    def reset_password_route():
        """Consume a reset token and set a new password"""
        try:
            data = request.get_json(silent=True) or {}
            token = data.get("token")
            new_password = data.get("new_password")

            if not token or not new_password:
                return jsonify({"error": "Missing token or new password"}), 400

            success, message = consume_password_reset_token(token, new_password)
            if success:
                return jsonify({"message": message}), 200
            else:
                return jsonify({"error": message}), 400
        except Exception as e:
            return jsonify({"error": "reset_failed", "details": str(e)}), 500

    @app.get("/user/settings")
    @app.get("/flask-api/user/settings")
    def get_user_settings():
        """Retrieve current user's settings (email and ORCID ID)"""
        user_id = session.get("userId")
        if not user_id:
            return jsonify({"error": "Not signed in"}), 401

        user = get_user_by_id(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        return jsonify({
            "email": user.get("email"),
            "orcid_id": user.get("orcid_id"),
            "username": user.get("username")
        }), 200

    @app.post("/user/settings")
    @app.post("/flask-api/user/settings")
    def update_user_settings():
        """Update user's settings (ORCID ID and/or email)"""
        user_id = session.get("userId")
        if not user_id:
            return jsonify({"error": "Not signed in"}), 401

        data = request.get_json(silent=True) or {}
        orcid_id = data.get("orcid_id")
        new_email = data.get("email")

        user = get_user_by_id(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        # Update ORCID ID if provided
        if orcid_id is not None:
            # Validate ORCID format (XXXX-XXXX-XXXX-XXXX)
            orcid_pattern = r'^\d{4}-\d{4}-\d{4}-\d{3}[0-9X]$'
            if orcid_id and not re.match(orcid_pattern, orcid_id):
                return jsonify({"error": "Invalid ORCID format. Expected: XXXX-XXXX-XXXX-XXXX"}), 400
            
            success, message = update_user_orcid(user_id, orcid_id)
            if not success:
                return jsonify({"error": message}), 409

        # Update email if provided
        if new_email is not None:
            # Validate email format
            email_pattern = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
            if not re.match(email_pattern, new_email):
                return jsonify({"error": "Invalid email format"}), 400
            
            success, message = update_user_email(user_id, new_email)
            if not success:
                return jsonify({"error": message}), 409

        return jsonify({"message": "Settings updated successfully"}), 200
