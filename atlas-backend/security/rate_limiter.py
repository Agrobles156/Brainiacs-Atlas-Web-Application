import time
from collections import defaultdict
from functools import wraps
from flask import request, jsonify
from security.security_logging import log_security_event


class RateLimiter:
    def __init__(self):
        self.upload_attempts = defaultdict(list)
        self.ip_attempts = defaultdict(list)
        
        self.config = {
            'per_user_limit': 10,
            'per_user_window': 3600,
            'per_ip_limit': 50,
            'per_ip_window': 3600,
            'max_file_size_per_hour': 500 * 1024 * 1024,
        }
        
        self.user_data_upload = defaultdict(lambda: {'count': 0, 'bytes': 0, 'reset_time': time.time() + self.config['per_user_window']})
        self.ip_data_upload = defaultdict(lambda: {'count': 0, 'bytes': 0, 'reset_time': time.time() + self.config['per_ip_window']})
    
    def _get_client_ip(self):
        if request.headers.get('X-Forwarded-For'):
            return request.headers.get('X-Forwarded-For').split(',')[0].strip()
        return request.remote_addr or 'unknown'
    
    def _cleanup_old_attempts(self, storage, window):
        current_time = time.time()
        for key in list(storage.keys()):
            storage[key] = [t for t in storage[key] if current_time - t < window]
            if not storage[key]:
                del storage[key]
    
    def check_user_upload_rate_limit(self, user_id):
        current_time = time.time()
        window = self.config['per_user_window']
        limit = self.config['per_user_limit']
        
        self._cleanup_old_attempts(self.upload_attempts, window)
        
        user_key = f"user_{user_id}"
        self.upload_attempts[user_key].append(current_time)
        
        if len(self.upload_attempts[user_key]) > limit:
            log_security_event("Rate limit exceeded", f"User {user_id}: {len(self.upload_attempts[user_key])} uploads in {window}s")
            return False, f"Rate limit exceeded. Maximum {limit} uploads per hour."
        
        return True, None
    
    def check_ip_upload_rate_limit(self, ip):
        current_time = time.time()
        window = self.config['per_ip_window']
        limit = self.config['per_ip_limit']
        
        self._cleanup_old_attempts(self.ip_attempts, window)
        
        ip_key = f"ip_{ip}"
        self.ip_attempts[ip_key].append(current_time)
        
        if len(self.ip_attempts[ip_key]) > limit:
            log_security_event("Rate limit exceeded", f"IP {ip}: {len(self.ip_attempts[ip_key])} uploads in {window}s")
            return False, f"Rate limit exceeded. Maximum {limit} uploads per hour."
        
        return True, None
    
    def check_user_data_volume(self, user_id, file_size):
        current_time = time.time()
        user_data = self.user_data_upload[user_id]
        
        if current_time >= user_data['reset_time']:
            user_data['count'] = 0
            user_data['bytes'] = 0
            user_data['reset_time'] = current_time + self.config['per_user_window']
        
        max_bytes = self.config['max_file_size_per_hour']
        if user_data['bytes'] + file_size > max_bytes:
            log_security_event("Data volume limit exceeded", f"User {user_id}: {user_data['bytes'] + file_size} bytes exceeds {max_bytes}")
            return False, f"Data volume limit exceeded. Maximum {max_bytes // (1024*1024)}MB per hour."
        
        user_data['bytes'] += file_size
        user_data['count'] += 1
        return True, None
    
    def check_ip_data_volume(self, ip, file_size):
        current_time = time.time()
        ip_data = self.ip_data_upload[ip]
        
        if current_time >= ip_data['reset_time']:
            ip_data['count'] = 0
            ip_data['bytes'] = 0
            ip_data['reset_time'] = current_time + self.config['per_ip_window']
        
        max_bytes = self.config['max_file_size_per_hour'] * 5
        if ip_data['bytes'] + file_size > max_bytes:
            log_security_event("Data volume limit exceeded", f"IP {ip}: {ip_data['bytes'] + file_size} bytes exceeds {max_bytes}")
            return False, f"Data volume limit exceeded for IP."
        
        ip_data['bytes'] += file_size
        ip_data['count'] += 1
        return True, None
    
    def rate_limit_upload(self, f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user_id = request.args.get('user_id')
            client_ip = self._get_client_ip()
            
            if user_id:
                allowed, msg = self.check_user_upload_rate_limit(user_id)
                if not allowed:
                    log_security_event("Upload rate limit violation", f"User {user_id}: {msg}")
                    return jsonify({"error": msg}), 429
            else:
                allowed, msg = self.check_ip_upload_rate_limit(client_ip)
                if not allowed:
                    log_security_event("Upload rate limit violation", f"IP {client_ip}: {msg}")
                    return jsonify({"error": msg}), 429
            
            return f(*args, **kwargs)
        
        return decorated_function


rate_limiter = RateLimiter()
