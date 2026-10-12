# atlas-backend/routes/auth.py
from flask import request, jsonify, session, make_response
from db_handler.users import (
    whoami as db_whoami, 
    register_user, 
    login_user,
    request_password_reset,
    consume_password_reset_token,
    get_user_by_id,
    db_change_password
)


def register_auth_routes(app):

    def _apply_identity_to_session_and_cookies(resp, *, email: str | None, name: str | None, role: str | None):
        # Keep session aligned (notes.py reads session too)
        session["email"] = email
        session["name"] = name
        session["role"] = role or session.get("role") or "user"
        session["user"] = {"email": email, "name": name}

        # Notes routes also look at cookies; overwrite any stale admin values
        cookie = dict(path="/", samesite="Lax", secure=False, httponly=False)
        resp.set_cookie("email", email or "", **cookie)
        resp.set_cookie("user_email", email or "", **cookie)
        resp.set_cookie("name", name or "", **cookie)
        resp.set_cookie("user_name", name or "", **cookie)
        resp.set_cookie("roles", (role or "user"), **cookie)
        return resp

    # --- WHOAMI (with /flask-api alias) ---
    @app.get("/whoami")
    @app.get("/flask-api/whoami")
    def whoami_route():
        user_id = session.get("userId")
        if not user_id:
            return jsonify({"error": "Not Signed In"}), 400

        orcid_id = session.get("orcid_id")
        if not orcid_id:
            try:
                user = get_user_by_id(user_id)
                orcid_id = user.get("orcid_id") if user else None
            except Exception:
                orcid_id = None
            session["orcid_id"] = orcid_id

        #Already cached in session? Return early.
        if "username" in session and "role" in session:
            return jsonify({
                "message": session["username"],
                "role": session["role"],
                "email": session.get("email"),
                "name": session["username"],
                "orcid_id": orcid_id,
            }), 200

        # 🧠 Only hit DB if cache is missing
        display_name, role = db_whoami(user_id)
        session["username"] = display_name
        session["role"] = role

        email = session.get("email")

        resp = make_response(jsonify({
            "message": display_name,
            "role": role,
            "email": email,
            "name": display_name,
            "orcid_id": orcid_id,
        }), 200)

        return _apply_identity_to_session_and_cookies(resp, email=email, name=display_name, role=role)


    # --- REGISTER (with /flask-api alias) ---
    @app.post("/register")
    @app.post("/flask-api/register")
    def register():
        data = request.get_json(silent=True) or {}
        username = data.get("username")
        email = data.get("email")
        password = data.get("password")

        if not username or not email or not password:
            return jsonify({"error": "Missing data"}), 400

        try:
            error, msg_id = register_user(username, email, password)
        except Exception as e:
            return jsonify({"error": "Registration failed", "details": str(e)}), 500

        if error:
            return jsonify({"error": msg_id}), 409

        # Persist identity
        session["userId"] = msg_id
        session["role"] = session.get("role") or "user"

        resp = make_response(
            jsonify({"message": "User registered successfully", "user_id": str(msg_id)}), 201
        )
        return _apply_identity_to_session_and_cookies(resp, email=email, name=username, role=session["role"])

    # --- LOGIN (with /flask-api alias) ---
    @app.post("/login")
    @app.post("/flask-api/login")
    def login():
        data = request.get_json(silent=True) or {}
        email = (data.get("email") or "").strip()
        password = data.get("password")

        if not email or not password:
            return jsonify({"error": "Missing email or password"}), 400

        # Client IP (may be used by login_user in some implementations)
        ip_address = request.remote_addr

        # Call variant with IP; if not supported, fall back gracefully
        try:
            user_id, role = login_user(email, password, ip_address)
        except TypeError:
            user_id, role = login_user(email, password)

        # login_user convention:
        #   returns (error_msg, None) on auth errors, or (user_id, role) on success
        if role is None:
            return jsonify({"error": user_id}), 401

        if not user_id:
            return jsonify({"error": "User not found"}), 404

        # Persist server-side identity
        session["userId"] = user_id
        session["role"] = role

        # Ask DB for a display name so we can populate cookies cleanly
        display_name, _ = db_whoami(user_id)

        resp = make_response(jsonify({"message": "Login successful", "user_id": user_id, "role": role}), 200)
        return _apply_identity_to_session_and_cookies(resp, email=email, name=display_name, role=role)

    # --- LOGOUT (with /flask-api alias) ---
    @app.get("/logout")
    @app.get("/flask-api/logout")
    def logout():
        session.clear()
        resp = make_response(jsonify({"message": "Logout was successful"}), 200)
        # Clear identity cookies so switching users doesn't leak old admin values
        for k in ("email", "user_email", "name", "user_name", "roles"):
            resp.set_cookie(k, "", path="/", samesite="Lax", secure=False, max_age=0)
        return resp

    # --- REQUEST PASSWORD RESET (with /flask-api alias) ---
    @app.post("/auth/request-password-reset")
    @app.post("/flask-api/auth/request-password-reset")
    def request_password_reset_route():
        """Request a password reset email"""
        try:
            data = request.get_json(silent=True) or {}
            email = data.get("email")

            if not email:
                return jsonify({"error": "Email is required"}), 400

            success, message = request_password_reset(email)
            
            if success:
                return jsonify({"message": message}), 200
            else:
                return jsonify({"error": message}), 404
        except Exception as e:
            print(f"[PASSWORD RESET ERROR] {e}")
            return jsonify({"error": "Password reset request failed", "details": str(e)}), 500

    # --- RESET PASSWORD (with /flask-api alias) ---
    @app.post("/auth/reset-password")
    @app.post("/flask-api/auth/reset-password")
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
    
    # routes/auth.py
    @app.post("/auth/change-password")
    def change_password_route():
        data = request.get_json() or {}
        current_password = data.get("current_password")
        new_password = data.get("new_password")

        user_id = session.get("userId")
        if not user_id:
            return jsonify({"error": "Not signed in"}), 401

        if not current_password or not new_password:
            return jsonify({"error": "Missing fields"}), 400

        try:
            success, msg = db_change_password(user_id, current_password, new_password)
            if success:
                return jsonify({"message": msg}), 200
            else:
                return jsonify({"error": msg}), 400
        except Exception as e:
            return jsonify({"error": "change_failed", "details": str(e)}), 500



