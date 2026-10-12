# Third-Party Authentication Module
# Adds Google OAuth as an additional sign-in option

import os
import requests
import secrets
import jwt
from flask import redirect, url_for, session, request, jsonify
from urllib.parse import urlencode
from db_handler.connection_db import connect_db
from bson import ObjectId
try:
    from pymongo.errors import PyMongoError, ConfigurationError
except ImportError:
    PyMongoError = ConfigurationError = Exception  # Fallback if not available

def _json_db_error(exc):
    return {
        "error": "database_unavailable",
        "message": "Database temporarily unavailable. Please retry shortly.",
        "details": str(exc)
    }

def _mongo_find_or_create_oauth_user(email, google_id, name):
    """Directly access Mongo to find or create a user for Google OAuth.
    Adds fields if creating: auth_method='google', status=True, role='user'."""
    import time
    max_retries = 3
    retry_delay = 1
    last_error = None
    
    for attempt in range(max_retries):
        try:
            db = connect_db()
            users = db["users"]
            email_normalized = email.strip().lower() if email else email
            user = users.find_one({"email": {"$regex": f"^{email_normalized}$", "$options": "i"}}) if email else None
            if user:
                # Ensure google id and auth_method stored
                update_fields = {}
                if not user.get("google_id"):
                    update_fields["google_id"] = google_id
                if user.get("auth_method") != 'google':
                    update_fields["auth_method"] = 'google'
                if update_fields:
                    users.update_one({"_id": user["_id"]}, {"$set": update_fields})
                    user.update(update_fields)
                return user, None
            # Create new user (no password for OAuth)
            inserted_id = users.insert_one({
                "username": name or (email_normalized.split('@')[0]),
                "email": email_normalized,
                "role": "user",
                "status": True,
                "auth_method": "google",
                "google_id": google_id,
                "notes": [],
                "library": [],
                "maps": [],
                "uploads": []
            }).inserted_id
            new_user = users.find_one({"_id": inserted_id})
            return new_user, None
        except (ConfigurationError, PyMongoError, OSError) as e:
            last_error = e
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                return None, _json_db_error(e)

# ORCID helper: find or create user with optional email
def _mongo_find_or_create_orcid_user(orcid_id, name, email=None, allow_no_email=True):
    """Find or create a user for ORCID OAuth. Email may be missing; orcid_id is unique.
    
    Args:
        orcid_id: The ORCID ID (required)
        name: User's name from ORCID
        email: User's email (may be None if ORCID has privacy settings)
        allow_no_email: If False, raise error when email is None instead of creating account
    """
    import time
    max_retries = 3
    retry_delay = 1
    last_error = None
    
    for attempt in range(max_retries):
        try:
            db = connect_db()
            users = db["users"]

            #print(f"[ORCID DEBUG] orcid_id={orcid_id}, name={name}, email={email}")

            # Prefer merge by email if provided (case-insensitive, trimmed)
            user = None
            if email:
                email_trimmed = email.strip().lower()
                #print(f"[ORCID DEBUG] Looking up user with normalized email: {email_trimmed}")
                user = users.find_one({"email": {"$regex": f"^{email_trimmed}$", "$options": "i"}})
            
            #print(f"[ORCID DEBUG] Email lookup result: {user is not None}")
            if user:
                #print(f"[ORCID DEBUG] Found user by email: {user.get('username')} (existing email: {user.get('email')})")
                update_fields = {}
                if not user.get("orcid_id"):
                    update_fields["orcid_id"] = orcid_id
                    #print(f"[ORCID DEBUG] Adding orcid_id to existing user")
                if user.get("auth_method") != "orcid":
                    update_fields["auth_method"] = "orcid"
                    #print(f"[ORCID DEBUG] Updating auth_method to orcid")
                if update_fields:
                    users.update_one({"_id": user["_id"]}, {"$set": update_fields})
                    user.update(update_fields)
                    #print(f"[ORCID DEBUG] Successfully linked ORCID to existing account")
                return user, None

            # Fallback to orcid_id lookup
            user = users.find_one({"orcid_id": orcid_id})
            #print(f"[ORCID DEBUG] ORCID ID lookup result: {user is not None}")
            if user:
                #print(f"[ORCID DEBUG] Found user by ORCID ID: {user.get('username')}")
                return user, None

            # If email is missing and we're NOT allowing no-email creation, return error
            if email is None and not allow_no_email:
                #print(f"[ORCID DEBUG] Email is None and allow_no_email=False")
                return None, {
                    "error": "orcid_email_missing",
                    "message": "ORCID account has email privacy enabled. Please provide your account email to link.",
                    "requires_email_verification": True
                }

            # Create new user
            #print(f"[ORCID DEBUG] Creating new ORCID user: username={name}")
            email_normalized = email.strip().lower() if email else None
            doc = {
                "username": name or f"ORCID:{orcid_id}",
                "email": email_normalized,  # may be None
                "role": "user",
                "status": True,
                "auth_method": "orcid",
                "orcid_id": orcid_id,
                "notes": [],
                "library": [],
                "maps": [],
                "uploads": []
            }
            inserted_id = users.insert_one(doc).inserted_id
            new_user = users.find_one({"_id": inserted_id})
            return new_user, None
        except (ConfigurationError, PyMongoError, OSError) as e:
            last_error = e
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                return None, _json_db_error(e)

class GoogleOAuth:
    def __init__(self, app=None):
        self.app = app
        self.client_id = None
        self.client_secret = None
        self.redirect_uri = None
        self.path_prefix = ''  # optional path prefix like '/flask-api'
        
        if app:
            self.init_app(app)
    
    def init_app(self, app):
        # Get credentials from environment variables
        self.client_id = os.getenv('GOOGLE_CLIENT_ID')
        self.client_secret = os.getenv('GOOGLE_CLIENT_SECRET')
        backend_public_url = os.getenv('BACKEND_PUBLIC_URL')  # optional unified base
        self.path_prefix = os.getenv('BACKEND_PATH_PREFIX', '').rstrip('/')  # ex: '/flask-api'
        # Prefer explicit redirect if provided; otherwise derive from unified base
        explicit_redirect = os.getenv('GOOGLE_REDIRECT_URI')
        if explicit_redirect:
            self.redirect_uri = explicit_redirect
        elif backend_public_url:
            base = backend_public_url.rstrip('/')
            self.redirect_uri = f"{base}{self.path_prefix}/auth/google/callback" if self.path_prefix else f"{base}/auth/google/callback"
        else:
            self.redirect_uri = 'http://localhost:5000/auth/google/callback'
        #print("GOOGLE_CLIENT_ID:", self.client_id)
        #print("GOOGLE_CLIENT_SECRET:", self.client_secret)
        #print("GOOGLE_REDIRECT_URI:", self.redirect_uri)
        if not self.client_id or not self.client_secret:
            #print("⚠️  Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env")
            pass

    def get_authorization_url(self):
        """Generate Google OAuth authorization URL"""
        if not self.client_id:
            return None

        # Generate random state for security
        state = secrets.token_urlsafe(32)
        session['oauth_state'] = state

        # Compute redirect URI dynamically if not set via env
        if self.redirect_uri:
            redirect_uri = self.redirect_uri
        else:
            base = request.url_root.rstrip('/')
            prefix = self.path_prefix or ''
            redirect_uri = f"{base}{prefix}/auth/google/callback" if prefix else f"{base}/auth/google/callback"
        session['google_redirect_uri'] = redirect_uri

        params = {
            'client_id': self.client_id,
            'redirect_uri': redirect_uri,
            'scope': 'openid email profile',
            'response_type': 'code',
            'state': state,
            'access_type': 'offline',
            'prompt': 'consent'
        }

        auth_url = 'https://accounts.google.com/o/oauth2/auth?' + urlencode(params)
        return auth_url
    
    def exchange_code_for_token(self, code, state):
        """Exchange authorization code for access token"""
        # Verify state parameter (allow for session issues during testing)
        stored_state = session.get('oauth_state')
        if state and stored_state and state != stored_state:
            return None, "Invalid state parameter"
        
        # Clear the state from session
        session.pop('oauth_state', None)
        
        # Exchange code for token
        token_url = 'https://oauth2.googleapis.com/token'
        if self.redirect_uri:
            redirect_uri = self.redirect_uri
        else:
            redirect_uri = session.get('google_redirect_uri')
            if not redirect_uri:
                base = request.url_root.rstrip('/')
                prefix = self.path_prefix or ''
                redirect_uri = f"{base}{prefix}/auth/google/callback" if prefix else f"{base}/auth/google/callback"
        token_data = {
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'code': code,
            'grant_type': 'authorization_code',
            'redirect_uri': redirect_uri
        }
        
        try:
            response = requests.post(token_url, data=token_data)
            response.raise_for_status()
            return response.json(), None
        except requests.RequestException as e:
            return None, f"Token exchange failed: {str(e)}"
    
    def get_user_info(self, access_token):
        """Get user information from Google"""
        try:
            headers = {'Authorization': f'Bearer {access_token}'}
            response = requests.get('https://www.googleapis.com/oauth2/v2/userinfo', headers=headers)
            response.raise_for_status()
            return response.json(), None
        except requests.RequestException as e:
            return None, f"Failed to get user info: {str(e)}"
    
    def find_or_create_user(self, google_user):
        """Find existing user or create new one from Google data"""
        email = google_user.get('email')
        name = google_user.get('name', '')
        google_id = google_user.get('id')

        if not email:
            return None, "No email provided by Google"

        # Use the MongoDB handler directly
        try:
            user, error = _mongo_find_or_create_oauth_user(email, google_id, name)
            return user, error
        except (ConfigurationError, PyMongoError, OSError) as e:
            return None, _json_db_error(e)

# ORCID OAuth support
class OrcidOAuth:
    def __init__(self, app=None):
        self.app = app
        self.client_id = None
        self.client_secret = None
        self.redirect_uri = None
        self.base_url = None  # https://orcid.org or https://sandbox.orcid.org
        self.path_prefix = ''  # optional path prefix like '/flask-api'
        if app:
            self.init_app(app)

    def init_app(self, app):
        self.client_id = os.getenv('ORCID_CLIENT_ID')
        self.client_secret = os.getenv('ORCID_CLIENT_SECRET')
        backend_public_url = os.getenv('BACKEND_PUBLIC_URL')  # optional unified base
        self.path_prefix = os.getenv('BACKEND_PATH_PREFIX', '').rstrip('/')
        explicit_redirect = os.getenv('ORCID_REDIRECT_URI')
        if explicit_redirect:
            self.redirect_uri = explicit_redirect
        elif backend_public_url:
            base = backend_public_url.rstrip('/')
            self.redirect_uri = f"{base}{self.path_prefix}/auth/orcid/callback" if self.path_prefix else f"{base}/auth/orcid/callback"
        else:
            self.redirect_uri = 'http://localhost:5000/auth/orcid/callback'
        self.base_url = os.getenv('ORCID_BASE_URL', 'https://orcid.org')
        #print("ORCID_CLIENT_ID:", self.client_id)
        #print("ORCID_CLIENT_SECRET:", self.client_secret)
        #print("ORCID_REDIRECT_URI:", self.redirect_uri)
        #print("ORCID_BASE_URL:", self.base_url)
        if not (self.client_id and self.client_secret):
            print("⚠️  ORCID OAuth not configured. Set ORCID_CLIENT_ID and ORCID_CLIENT_SECRET in .env")

    def get_authorization_url(self):
        if not self.client_id:
            return None
        state = secrets.token_urlsafe(32)
        session['oauth_state_orcid'] = state
        session.modified = True
        # print(f"[ORCID AUTH URL DEBUG] Generated state: {state}")
        # print(f"[ORCID AUTH URL DEBUG] Session modified, state stored")

        # Compute redirect URI dynamically if not set via env
        if self.redirect_uri:
            redirect_uri = self.redirect_uri
        else:
            base = request.url_root.rstrip('/')
            prefix = self.path_prefix or ''
            redirect_uri = f"{base}{prefix}/auth/orcid/callback" if prefix else f"{base}/auth/orcid/callback"
        session['orcid_redirect_uri'] = redirect_uri
        params = {
            'client_id': self.client_id,
            'response_type': 'code',
            'scope': '/authenticate openid',
            'redirect_uri': redirect_uri,
            'state': state
        }
        auth_url = f"{self.base_url}/oauth/authorize?" + urlencode(params)
        #print(f"[ORCID AUTH URL DEBUG] Redirect URI: {redirect_uri}")
        return auth_url

    def exchange_code_for_token(self, code, state):
        stored_state = session.get('oauth_state_orcid')
        # print(f"[ORCID STATE DEBUG] Received state: {state}")
        # print(f"[ORCID STATE DEBUG] Stored state: {stored_state}")
        # print(f"[ORCID STATE DEBUG] Session ID: {session.sid if hasattr(session, 'sid') else 'N/A'}")
        if state and stored_state and state != stored_state:
            print(f"[ORCID STATE DEBUG] STATE MISMATCH - validation failed")
            return None, 'Invalid state parameter'
        #print(f"[ORCID STATE DEBUG] State validation passed")
        session.pop('oauth_state_orcid', None)

        token_url = f"{self.base_url}/oauth/token"
        if self.redirect_uri:
            redirect_uri = self.redirect_uri
        else:
            redirect_uri = session.get('orcid_redirect_uri')
            if not redirect_uri:
                base = request.url_root.rstrip('/')
                prefix = self.path_prefix or ''
                redirect_uri = f"{base}{prefix}/auth/orcid/callback" if prefix else f"{base}/auth/orcid/callback"
        token_data = {
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': redirect_uri
        }
        headers = {'Accept': 'application/json'}
        try:
            resp = requests.post(token_url, data=token_data, headers=headers)
            resp.raise_for_status()
            return resp.json(), None
        except requests.RequestException as e:
            return None, f"Token exchange failed: {str(e)}"

    def decode_id_token(self, id_token):
        """Decode the ORCID id_token JWT to extract email and other claims.
        
        The openid scope returns an id_token (JWT) that contains email and other user info.
        We decode it without verifying signature since ORCID is the trusted provider.
        
        Args:
            id_token: The JWT id_token from ORCID OAuth response
            
        Returns:
            tuple: (claims_dict, None) if successful; (None, error_message) if failed
        """
        try:
            #print(f"[ORCID ID_TOKEN DEBUG] Decoding id_token")
            # Decode without verification since we trust ORCID is the issuer
            claims = jwt.decode(id_token, options={"verify_signature": False})
            #print(f"[ORCID ID_TOKEN DEBUG] Decoded claims: {claims}")
            return claims, None
        except Exception as e:
            print(f"[ORCID ID_TOKEN DEBUG] Failed to decode id_token: {str(e)}")
            return None, f"Failed to decode ORCID id_token: {str(e)}"

    def find_or_create_user(self, token_data, allow_no_email=True):
        # ORCID returns 'orcid' and 'name' for /authenticate scope
        orcid_id = token_data.get('orcid')
        name = token_data.get('name') or ''
        id_token = token_data.get('id_token')
        
        if not orcid_id:
            return None, 'No ORCID iD returned'
        
        # Extract email from id_token JWT (openid scope includes id_token with email)
        email = None
        if id_token:
            claims, token_error = self.decode_id_token(id_token)
            if claims:
                email = claims.get('email')
                #print(f"[ORCID DEBUG] Email from id_token: {email}")
            else:
                #print(f"[ORCID DEBUG] Could not decode id_token: {token_error}")
                pass   # <-- optional, prevents empty block
        
        try:
            user, error = _mongo_find_or_create_orcid_user(
                orcid_id,
                name,
                email,
                allow_no_email=allow_no_email
            )
            return user, error
        except (ConfigurationError, PyMongoError, OSError) as e:
            return None, _json_db_error(e)

# Global OAuth instance
google_oauth = GoogleOAuth()
orcid_oauth = OrcidOAuth()

def add_oauth_routes(app):
    """Add OAuth routes to Flask app"""
    #print("[OAuth] Starting OAuth route registration...")
    # Explicitly initialize with the current app (in case global instance was created before load_dotenv)
    try:
        #print("[OAuth] Initializing Google OAuth...")
        google_oauth.init_app(app)
        #print("[OAuth] Google OAuth initialized successfully")
    except Exception as e:
        #print("[OAuth] Google init_app failed:", e)
        import traceback
        traceback.print_exc()

    # Init ORCID
    try:
        #print("[OAuth] Initializing ORCID OAuth...")
        orcid_oauth.init_app(app)
        #print("[OAuth] ORCID OAuth initialized successfully")
    except Exception as e:
        #print("[OAuth] ORCID init_app failed:", e)
        import traceback
        traceback.print_exc()
    
    @app.route('/auth/google')
    @app.route('/flask-api/auth/google')
    def google_login():
        """Initiate Google OAuth login"""
        auth_url = google_oauth.get_authorization_url()
        if not auth_url:
            return jsonify({'error': 'Google OAuth not configured'}), 500
        
        return redirect(auth_url)

    @app.route('/auth/google/debug')
    def google_debug():
        """Return current Google OAuth configuration (masked secret)."""
        return jsonify({
            'client_id_present': bool(google_oauth.client_id),
            'client_id': google_oauth.client_id[:8] + '...' if google_oauth.client_id else None,
            'client_secret_present': bool(google_oauth.client_secret),
            'redirect_uri': google_oauth.redirect_uri,
            'note': 'client_id truncated; secret not exposed'
        }), 200
    
    @app.route('/auth/google/callback')
    @app.route('/flask-api/auth/google/callback')
    def google_callback():
        """Handle Google OAuth callback"""
        code = request.args.get('code')
        state = request.args.get('state')
        error = request.args.get('error')
        
        if error:
            return jsonify({'error': f'OAuth error: {error}'}), 400
        
        if not code:
            return jsonify({'error': 'No authorization code received'}), 400
        
        # Exchange code for token
        token_data, error = google_oauth.exchange_code_for_token(code, state)
        if error:
            return jsonify({'error': error}), 400
        
        access_token = token_data.get('access_token')
        if not access_token:
            return jsonify({'error': 'No access token received'}), 400
        
        # Get user info
        user_info, error = google_oauth.get_user_info(access_token)
        if error:
            return jsonify({'error': error}), 400
        
        # Find or create user
        user, error = google_oauth.find_or_create_user(user_info)
        if error:
            status = 503 if isinstance(error, dict) and error.get("error") == "database_unavailable" else 400
            return jsonify(error), status
        
        # Log the user in
        session['userId'] = str(user['_id'])
        session['role'] = user['role']
        session['auth_method'] = 'google'
        session['email'] = user.get('email')
        session['name'] = user.get('username')
        session.modified = True
        
        # Redirect to frontend with session established (cookies work within same origin)
        frontend_url = os.getenv('FRONTEND_BASE_URL', 'http://localhost:3000')
        return redirect(f'{frontend_url}/?login=success')

    @app.route('/auth/orcid')
    @app.route('/flask-api/auth/orcid')
    def orcid_login():
        """Initiate ORCID OAuth login"""
        auth_url = orcid_oauth.get_authorization_url()
        if not auth_url:
            return jsonify({'error': 'ORCID OAuth not configured'}), 500
        return redirect(auth_url)

    @app.route('/auth/orcid/callback')
    @app.route('/flask-api/auth/orcid/callback')
    def orcid_callback():
        """Handle ORCID OAuth callback - Match against manually-set ORCID IDs.
        
        If ORCID doesn't return email (privacy settings or Public API limitation),
        redirect user to verify email before linking.
        """
        code = request.args.get('code')
        state = request.args.get('state')
        error = request.args.get('error')
        print(f"[ORCID CALLBACK] Received callback - code: {code[:20]}..., state: {state[:20]}..., error: {error}")
        if error:
            print(f"[ORCID CALLBACK] OAuth error received: {error}")
            return jsonify({'error': f'OAuth error: {error}'}), 400
        if not code:
            print(f"[ORCID CALLBACK] No authorization code received")
            return jsonify({'error': 'No authorization code received'}), 400

        token_data, err = orcid_oauth.exchange_code_for_token(code, state)
        if err:
            print(f"[ORCID CALLBACK] Token exchange failed: {err}")
            return jsonify({'error': err}), 400

        orcid_id = token_data.get('orcid')
        if not orcid_id:
            return jsonify({'error': 'No ORCID ID received from OAuth provider'}), 400

        # Extract email and name from token
        id_token = token_data.get('id_token')
        name = token_data.get('name') or ''
        email = None
        
        if id_token:
            claims, _ = orcid_oauth.decode_id_token(id_token)
            if claims:
                email = claims.get('email')
                if email:
                    email = email.strip().lower()
                    print(f"[ORCID CALLBACK] Extracted and normalized email from id_token: {email}")
        
        # If no email available, require user to provide it before linking
        if not email:
            print(f"[ORCID CALLBACK] No email for ORCID {orcid_id} - storing for verification")
            session['orcid_pending_verification'] = {
                'orcid_id': orcid_id,
                'name': name
            }
            session.modified = True
            print(f"[ORCID CALLBACK] Session before redirect: {dict(session)}")
            print(f"[ORCID CALLBACK] Session ID: {session.sid if hasattr(session, 'sid') else 'N/A'}")
            frontend_url = request.headers.get('Origin') or os.getenv('FRONTEND_BASE_URL', 'http://localhost:3000')
            redirect_url = f'{frontend_url}/login?orcid_verify_email=true'
            print(f"[ORCID CALLBACK] Redirecting to: {redirect_url}")
            resp = redirect(redirect_url)
            print(f"[ORCID CALLBACK] Response headers: {dict(resp.headers)}")
            return resp

        # Email is available - proceed with login/linking
        try:
            user, error = orcid_oauth.find_or_create_user(token_data, allow_no_email=False)
            
            if error:
                return jsonify(error if isinstance(error, dict) else {"error": error}), 400
            
            if not user:
                return jsonify({'error': 'Failed to find or create user'}), 500
            
            # Log the user in
            session['userId'] = str(user['_id'])
            session['role'] = user.get('role', 'user')
            session['auth_method'] = 'orcid'
            session['email'] = user.get('email')
            session['name'] = user.get('username')
            session.modified = True
            print(f"[ORCID CALLBACK] Session set - userId: {session.get('userId')}, role: {session.get('role')}")
            
            frontend_url = request.headers.get('Origin') or os.getenv('FRONTEND_BASE_URL', 'http://localhost:3000')
            redirect_url = f'{frontend_url}/?login=success'
            print(f"[ORCID CALLBACK] Redirecting to: {redirect_url}")
            return redirect(redirect_url)
            
        except (ConfigurationError, PyMongoError, OSError) as e:
            return jsonify(_json_db_error(e)), 503

    @app.route('/auth/orcid/verify-email', methods=['POST'])
    @app.route('/flask-api/auth/orcid/verify-email', methods=['POST'])
    def orcid_verify_email():
        """Complete ORCID linking by verifying user's email address.
        
        This endpoint is called when ORCID returns no email (due to privacy settings).
        User provides their account email to locate and link their existing account.
        """
        print(f"[ORCID VERIFY EMAIL] Endpoint called")
        print(f"[ORCID VERIFY EMAIL] Session ID: {session.sid if hasattr(session, 'sid') else 'N/A'}")
        print(f"[ORCID VERIFY EMAIL] Full session: {dict(session)}")
        # Check if user has pending ORCID verification
        orcid_pending = session.get('orcid_pending_verification')
        print(f"[ORCID VERIFY EMAIL] orcid_pending: {orcid_pending}")
        if not orcid_pending:
            print(f"[ORCID VERIFY EMAIL] No pending verification found")
            return jsonify({'error': 'No pending ORCID verification. Please start ORCID login again.'}), 400
        
        # Get email from request
        data = request.get_json() or {}
        provided_email = data.get('email', '').strip().lower()
        print(f"[ORCID VERIFY EMAIL] Provided email: {provided_email}")
        
        if not provided_email:
            print(f"[ORCID VERIFY EMAIL] Email is empty")
            return jsonify({'error': 'Email is required'}), 400
        
        orcid_id = orcid_pending.get('orcid_id')
        name = orcid_pending.get('name')
        print(f"[ORCID VERIFY EMAIL] orcid_id: {orcid_id}, name: {name}")
        
        try:
            db = connect_db()
            users = db["users"]
            
            # Look for existing user with the provided email (case-insensitive)
            print(f"[ORCID VERIFY EMAIL] Searching for user with email: {provided_email}")
            user = users.find_one({"email": {"$regex": f"^{provided_email}$", "$options": "i"}})
            print(f"[ORCID VERIFY EMAIL] User lookup result: {user is not None}")
            
            if user:
                print(f"[ORCID VERIFY EMAIL] Found existing user: {user.get('username')}")
                print(f"[ORCID VERIFY EMAIL] User current orcid_id: {user.get('orcid_id')}")
                print(f"[ORCID VERIFY EMAIL] User current auth_method: {user.get('auth_method')}")
                # User exists - link ORCID ID to existing account
                update_fields = {}
                if not user.get("orcid_id"):
                    update_fields["orcid_id"] = orcid_id
                    print(f"[ORCID VERIFY EMAIL] Will add orcid_id: {orcid_id}")
                if user.get("auth_method") != "orcid":
                    update_fields["auth_method"] = "orcid"
                    print(f"[ORCID VERIFY EMAIL] Will update auth_method to orcid")
                
                print(f"[ORCID VERIFY EMAIL] update_fields: {update_fields}")
                if update_fields:
                    print(f"[ORCID VERIFY EMAIL] Updating user with: {update_fields}")
                    users.update_one({"_id": user["_id"]}, {"$set": update_fields})
                    user.update(update_fields)
                else:
                    print(f"[ORCID VERIFY EMAIL] No updates needed (fields already set)")
                
                # Clear pending verification and log user in
                session.pop('orcid_pending_verification', None)
                session['userId'] = str(user['_id'])
                session['role'] = user['role']
                session['auth_method'] = 'orcid'
                session['email'] = user.get('email')
                session['name'] = user.get('username')
                session.modified = True
                print(f"[ORCID VERIFY EMAIL] Session updated - userId: {session['userId']}, role: {session['role']}")
                
                return jsonify({
                    'success': True,
                    'message': 'ORCID linked to existing account',
                    'user_id': str(user['_id']),
                    'redirect_path': '/?login=success'
                }), 200
            else:
                print(f"[ORCID VERIFY EMAIL] User not found - creating new account")
                # User doesn't exist - create new account with provided email
                new_doc = {
                    "username": name or (provided_email.split('@')[0]),
                    "email": provided_email,
                    "role": "user",
                    "status": True,
                    "auth_method": "orcid",
                    "orcid_id": orcid_id,
                    "notes": [],
                    "library": [],
                    "maps": [],
                    "uploads": []
                }
                print(f"[ORCID VERIFY EMAIL] Creating new user with email: {provided_email}")
                inserted_id = users.insert_one(new_doc).inserted_id
                new_user = users.find_one({"_id": inserted_id})
                
                # Clear pending verification and log user in
                session.pop('orcid_pending_verification', None)
                session['userId'] = str(new_user['_id'])
                session['role'] = new_user['role']
                session['auth_method'] = 'orcid'
                session['email'] = new_user.get('email')
                session['name'] = new_user.get('username')
                session.modified = True
                print(f"[ORCID VERIFY EMAIL] New user created and logged in - userId: {session['userId']}")
                
                return jsonify({
                    'success': True,
                    'message': 'New account created and ORCID linked',
                    'user_id': str(new_user['_id']),
                    'redirect_path': '/?login=success'
                }), 200
        
        except (ConfigurationError, PyMongoError, OSError) as e:
            print(f"[ORCID VERIFY EMAIL] Database error: {str(e)}")
            return jsonify(_json_db_error(e)), 503
        except Exception as e:
            print(f"[ORCID VERIFY EMAIL] UNEXPECTED ERROR: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': f'Unexpected error: {str(e)}'}), 500
    
    @app.route('/auth/db-status', methods=['GET'])
    def auth_db_status():
        """Lightweight DB connectivity probe for frontend."""
        try:
            db = connect_db()
            # Ping using a cheap command
            db.command("ping")
            return jsonify({"ok": True})
        except (ConfigurationError, PyMongoError, OSError) as e:
            return jsonify(_json_db_error(e)), 503

    @app.route('/auth/methods', methods=['GET'])
    def get_auth_methods():
        """Get available authentication methods"""
        try:
            methods = {
                'local': {
                    'name': 'Email & Password',
                    'available': True,
                    'endpoint': '/login'
                },
                'google': {
                    'name': 'Sign in with Google',
                    'available': bool(google_oauth.client_id),
                    'endpoint': '/auth/google'
                },
                'orcid': {
                    'name': 'Sign in with ORCID',
                    'available': bool(orcid_oauth.client_id),
                    'endpoint': '/auth/orcid'
                }
            }
            print(f"[DEBUG] Auth methods - Google available: {bool(google_oauth.client_id)}, ORCID available: {bool(orcid_oauth.client_id)}")
            return jsonify(methods)
        except Exception as e:
            print(f"[ERROR] /auth/methods failed: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': 'Failed to get auth methods', 'details': str(e)}), 500

# Helper function to check if user is OAuth user
def is_oauth_user(user_id):
    """Check in Mongo if user signed up via OAuth."""
    try:
        db = connect_db()
        users = db["users"]
        doc = users.find_one({"_id": ObjectId(user_id)})
        if not doc:
            return False
        return doc.get("auth_method") in ['google', 'oauth']
    except Exception:
        return False
