from bson import ObjectId
from werkzeug.security import generate_password_hash, check_password_hash
from .connection_db import connect_db
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from email_utils import send_password_reset
from security.password_policy import password_policy
def whoami(userId):
    db = connect_db()
    currUser = db['users'].find_one({"_id": ObjectId(userId)})
    return currUser["username"],currUser["role"]

def register_user(username, email, password):
    db = connect_db()
    users = db['users']
    
    valid, msg = password_policy.validate_complexity(password)
    if not valid:
        return True, msg
    
    if users.find_one({"email": email}) and users.find_one({"username": username}):
        return True, 'Email and Username already exists'
    if users.find_one({"email": email}):
        return True, 'Email already exists'
    if users.find_one({"username": username}):
        return True, 'UserName already exists'
    hashed_password = generate_password_hash(password)
    user_id = users.insert_one({
        "username": username,
        "email": email,
        "password": hashed_password,
        "role": "user",
        "status": True,
        "notes": [],
        "library": [],
        "failed_login_attempts": 0,
        "failed_login_timestamp": None,
        "password_history": []
    }).inserted_id
    return False, user_id

def login_user(email, password):
    db = connect_db()
    users = db['users']
    user = users.find_one({"email": email})
    if user:
        failed_attempts = user.get('failed_login_attempts', 0)
        failed_timestamp = user.get('failed_login_timestamp')
        
        locked, lock_msg, time_remaining = password_policy.is_account_locked(failed_attempts, failed_timestamp)
        if locked:
            return lock_msg, None
        
        if check_password_hash(user['password'], password):
            if not user['status']:
                return "Blocked Account", None
            
            reset_attempts, reset_timestamp = password_policy.reset_failed_login()
            users.update_one({"_id": user["_id"]}, {"$set": {
                "failed_login_attempts": reset_attempts,
                "failed_login_timestamp": reset_timestamp
            }})
            
            return str(user['_id']), user["role"]
        else:
            updated_attempts, updated_timestamp = password_policy.record_failed_login(failed_attempts, failed_timestamp)
            users.update_one({"_id": user["_id"]}, {"$set": {
                "failed_login_attempts": updated_attempts,
                "failed_login_timestamp": updated_timestamp
            }})
            return "Wrong Password", None
    else:
        return None

def find_user_by_email(email):
    """Find a user by email address"""
    db = connect_db()
    users = db['users']
    user = users.find_one({"email": email})
    return user

def request_password_reset(email):
    """Request a password reset for the given email"""
    user = find_user_by_email(email)
    if not user:
        return False, "User not found"
    
    if not user['status']:
        return False, "Account is blocked"
    
    # Generate a secure token & hash it for storage
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)

    db = connect_db()
    users = db['users']
    users.update_one({"_id": user["_id"]}, {"$set": {
        "reset_token_hash": token_hash,
        "reset_token_expires": expires_at.isoformat()
    }})

    # Send email (or simulate if SMTP not configured)
    sent, email_msg = send_password_reset(user['email'], raw_token)
    if sent:
        return True, email_msg
    else:
        return False, email_msg

def consume_password_reset_token(token: str, new_password: str):
    """Validate and consume a password reset token, updating the user's password.

    Returns (success: bool, message: str)
    """
    if not token or not new_password:
        return False, "Missing token or password"

    valid, msg = password_policy.validate_complexity(new_password)
    if not valid:
        return False, msg

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    db = connect_db()
    users = db['users']

    user = users.find_one({"reset_token_hash": token_hash})
    if not user:
        return False, "Invalid or expired token"

    expires_raw = user.get("reset_token_expires")
    try:
        if not expires_raw:
            return False, "Invalid or expired token"
        expires_at = datetime.fromisoformat(expires_raw)
    except Exception:
        return False, "Invalid or expired token"

    if datetime.now(timezone.utc) > expires_at:
        return False, "Token expired"

    password_history = user.get("password_history", [])
    allowed, history_msg = password_policy.check_password_history(new_password, password_history)
    if not allowed:
        return False, history_msg

    hashed_password = generate_password_hash(new_password)
    
    new_history = [user["password"]] + password_history[:password_policy.password_history_limit - 1]
    
    users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password": hashed_password,
                "password_history": new_history,
                "failed_login_attempts": 0,
                "failed_login_timestamp": None
            },
            "$unset": {"reset_token_hash": "", "reset_token_expires": ""}
        }
    )

    return True, "Password updated successfully"

def get_user_by_id(user_id):
    """Retrieve a user by their MongoDB ObjectId.
    
    Returns the user document or None if not found.
    """
    try:
        db = connect_db()
        users = db['users']
        user = users.find_one({"_id": ObjectId(user_id)})
        return user
    except Exception as e:
        print(f"Error getting user by ID: {e}")
        return None

def get_user_by_orcid(orcid_id):
    """Check if a user with the given ORCID ID exists.
    
    Returns the user document or None if not found.
    """
    db = connect_db()
    users = db['users']
    user = users.find_one({"orcid_id": orcid_id})
    return user

def update_user_orcid(user_id, orcid_id):
    """Update a user's ORCID ID.
    
    Returns (success: bool, message: str)
    """
    try:
        db = connect_db()
        users = db['users']
        
        # Check if another user already has this ORCID ID
        existing_user = users.find_one({"orcid_id": orcid_id, "_id": {"$ne": ObjectId(user_id)}})
        if existing_user:
            return False, "This ORCID ID is already linked to another account"
        
        # Update the user's ORCID ID
        result = users.update_one({"_id": ObjectId(user_id)}, {"$set": {"orcid_id": orcid_id}})
        
        if result.modified_count > 0:
            return True, "ORCID ID updated successfully"
        else:
            return False, "Failed to update ORCID ID"
    except Exception as e:
        print(f"Error updating user ORCID: {e}")
        return False, str(e)

def update_user_email(user_id, new_email):
    """Update a user's email address.
    
    Returns (success: bool, message: str)
    """
    try:
        db = connect_db()
        users = db['users']
        
        # Check if the new email is already in use by another user
        existing_user = users.find_one({"email": new_email, "_id": {"$ne": ObjectId(user_id)}})
        if existing_user:
            return False, "This email is already in use by another account"
        
        # Update the user's email
        result = users.update_one({"_id": ObjectId(user_id)}, {"$set": {"email": new_email}})
        
        if result.modified_count > 0:
            return True, "Email updated successfully"
        else:
            return False, "Failed to update email"
    except Exception as e:
        print(f"Error updating user email: {e}")
        return False, str(e)
    
def get_user_password_hash(user_id: str) -> str | None:
    """Retrieve the hashed password of a user by their ID."""
    db = connect_db()
    user = db['users'].find_one({"_id": ObjectId(user_id)}, {"password": 1})
    return user["password"] if user else None

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check if the provided password matches the hashed password."""
    if not hashed_password:
        return False
    return check_password_hash(hashed_password, plain_password)


def set_user_password(user_id: str, new_password: str):
    """Hash the new password and store it in the database."""
    db = connect_db()
    hashed_password = generate_password_hash(new_password)
    db['users'].update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"password": hashed_password}}
    )

    
def db_change_password(user_id: str, current_password: str, new_password: str) -> tuple[bool, str]:
    stored_password = get_user_password_hash(user_id)
    if not verify_password(current_password, stored_password):
        return False, "Current password is incorrect"
    set_user_password(user_id, new_password)
    return True, "Password changed successfully"

