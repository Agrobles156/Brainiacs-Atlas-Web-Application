# Enhanced Authentication & Authorization Module
# JWT tokens, session management, and role-based access control

import jwt
import datetime
from functools import wraps
from flask import session, request, jsonify, current_app
import secrets

class AuthManager:
    def __init__(self, app=None):
        self.app = app
        if app:
            self.init_app(app)
    
    def init_app(self, app):
        app.config.setdefault('JWT_SECRET_KEY', secrets.token_hex(32))
        app.config.setdefault('JWT_EXPIRATION_HOURS', 24)
        app.config.setdefault('SESSION_TIMEOUT_MINUTES', 30)
    
    def generate_jwt_token(self, user_id, role='user'):
        """Generate JWT token for API authentication"""
        payload = {
            'user_id': user_id,
            'role': role,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(
                hours=current_app.config['JWT_EXPIRATION_HOURS']
            ),
            'iat': datetime.datetime.utcnow()
        }
        
        return jwt.encode(
            payload, 
            current_app.config['JWT_SECRET_KEY'], 
            algorithm='HS256'
        )
    
    def verify_jwt_token(self, token):
        """Verify and decode JWT token"""
        try:
            payload = jwt.decode(
                token, 
                current_app.config['JWT_SECRET_KEY'], 
                algorithms=['HS256']
            )
            return payload
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None
    
    def require_auth(self, roles=None):
        """Decorator to require authentication"""
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                # Check session-based auth first
                user_id = session.get('userId')
                user_role = session.get('userRole', 'user')
                
                # Check JWT token if no session
                if not user_id:
                    auth_header = request.headers.get('Authorization')
                    if auth_header and auth_header.startswith('Bearer '):
                        token = auth_header.split(' ')[1]
                        payload = self.verify_jwt_token(token)
                        if payload:
                            user_id = payload['user_id']
                            user_role = payload['role']
                
                if not user_id:
                    return jsonify({'error': 'Authentication required'}), 401
                
                # Check role-based access
                if roles and user_role not in roles:
                    return jsonify({'error': 'Insufficient permissions'}), 403
                
                # Add user info to request context
                request.current_user = {
                    'id': user_id,
                    'role': user_role
                }
                
                return f(*args, **kwargs)
            return decorated_function
        return decorator
    
    def require_admin(self, f):
        """Decorator to require admin role"""
        return self.require_auth(['admin'])(f)
    
    def check_session_timeout(self):
        """Check if session has timed out"""
        if 'last_activity' in session:
            timeout_minutes = current_app.config['SESSION_TIMEOUT_MINUTES']
            last_activity = session['last_activity']
            if datetime.datetime.now() - last_activity > datetime.timedelta(minutes=timeout_minutes):
                session.clear()
                return True
        
        session['last_activity'] = datetime.datetime.now()
        return False

# Global auth manager instance
auth_manager = AuthManager()

def login_required(roles=None):
    """Shorthand decorator for requiring authentication"""
    return auth_manager.require_auth(roles)

def admin_required(f):
    """Shorthand decorator for requiring admin role"""
    return auth_manager.require_admin(f)
