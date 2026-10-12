# Enhanced File Upload Security Module
# Advanced file type validation, malware scanning, and secure file handling

import os
import hashlib
import mimetypes
from werkzeug.utils import secure_filename
from PIL import Image
import subprocess

# Try to import magic, but make it optional for Windows compatibility
try:
    import magic
    MAGIC_AVAILABLE = True
except ImportError:
    MAGIC_AVAILABLE = False
    #print("[WARNING] python-magic not available. File MIME type detection will be limited.")

class FileUploadSecurity:
    def __init__(self):
        # Allowed file types and extensions
        self.allowed_extensions = {
            'images': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'],
            'documents': ['.pdf', '.doc', '.docx', '.txt', '.rtf'],
            'data': ['.json', '.csv', '.xml', '.yaml'],
            'archives': ['.zip', '.tar', '.gz']
        }
        
        # MIME type whitelist
        self.allowed_mimetypes = {
            'image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp',
            'application/pdf', 'text/plain', 'application/json',
            'text/csv', 'application/xml', 'application/zip'
        }
        
        # Maximum file sizes (in bytes)
        self.max_file_sizes = {
            'images': 10 * 1024 * 1024,  # 10MB
            'documents': 50 * 1024 * 1024,  # 50MB
            'data': 5 * 1024 * 1024,  # 5MB
            'archives': 100 * 1024 * 1024  # 100MB
        }
        
        # Dangerous file patterns
        self.dangerous_patterns = [
            '.exe', '.bat', '.cmd', '.scr', '.pif', '.com',
            '.js', '.vbs', '.jar', '.app', '.deb', '.rpm'
        ]
    
    def validate_file_extension(self, filename):
        """Validate file extension against whitelist"""
        if not filename or '.' not in filename:
            return False, "No file extension found"
        
        ext = os.path.splitext(filename)[1].lower()
        
        # Check for dangerous extensions
        if ext in self.dangerous_patterns:
            return False, f"File type {ext} is not allowed"
        
        # Check if extension is in allowed list
        for category, extensions in self.allowed_extensions.items():
            if ext in extensions:
                return True, category
        
        return False, f"File extension {ext} is not allowed"
    
    def validate_file_content(self, file_path):
        """Validate file content using magic numbers (or fallback to mimetypes)"""
        try:
            # Try to use magic if available
            if MAGIC_AVAILABLE:
                mime_type = magic.from_file(file_path, mime=True)
            else:
                # Fallback to mimetypes module on Windows
                mime_type, _ = mimetypes.guess_type(file_path)
                if not mime_type:
                    mime_type = "application/octet-stream"
            
            if mime_type not in self.allowed_mimetypes:
                return False, f"File content type {mime_type} is not allowed"
            
            return True, mime_type
        except Exception as e:
            return False, f"Error validating file content: {str(e)}"
    
    def validate_image_file(self, file_path):
        """Additional validation for image files"""
        try:
            with Image.open(file_path) as img:
                # Check image format
                if img.format.lower() not in ['jpeg', 'png', 'gif', 'bmp', 'webp']:
                    return False, "Invalid image format"
                
                # Check image dimensions (prevent bomb attacks)
                width, height = img.size
                if width > 10000 or height > 10000:
                    return False, "Image dimensions too large"
                
                # Verify image can be processed
                img.verify()
                return True, "Valid image"
        except Exception as e:
            return False, f"Invalid image file: {str(e)}"
    
    def scan_for_malware(self, file_path):
        """Basic malware scanning (placeholder for actual antivirus integration)"""
        try:
            # In production, integrate with ClamAV or similar
            # For now, perform some basic checks
            
            # Check file size
            file_size = os.path.getsize(file_path)
            if file_size > 500 * 1024 * 1024:  # 500MB
                return False, "File too large, potential security risk"
            
            # Check for embedded executables in images
            with open(file_path, 'rb') as f:
                content = f.read(1024)  # Read first 1KB
                if b'MZ' in content or b'PE' in content:  # Windows executable signatures
                    return False, "Executable content detected in file"
            
            return True, "File appears safe"
        except Exception as e:
            return False, f"Error scanning file: {str(e)}"
    
    def generate_safe_filename(self, filename, user_id):
        """Generate a safe, unique filename"""
        # Secure the filename
        safe_name = secure_filename(filename)
        
        # Add timestamp and user ID for uniqueness
        import time
        timestamp = str(int(time.time()))
        
        # Generate hash for additional security
        file_hash = hashlib.md5(f"{user_id}_{timestamp}_{safe_name}".encode()).hexdigest()[:8]
        
        name, ext = os.path.splitext(safe_name)
        return f"{name}_{file_hash}_{timestamp}{ext}"
    
    def validate_upload(self, file, user_id, upload_dir):
        """Complete file upload validation"""
        if not file or not file.filename:
            return False, "No file provided", None
        
        # Validate extension
        valid_ext, category = self.validate_file_extension(file.filename)
        if not valid_ext:
            return False, category, None
        
        # Generate safe filename
        safe_filename = self.generate_safe_filename(file.filename, user_id)
        file_path = os.path.join(upload_dir, safe_filename)
        
        # Save file temporarily for validation
        file.save(file_path)
        
        try:
            # Validate file content
            valid_content, mime_type = self.validate_file_content(file_path)
            if not valid_content:
                os.remove(file_path)
                return False, mime_type, None
            
            # Additional validation for images
            if category == 'images':
                valid_image, message = self.validate_image_file(file_path)
                if not valid_image:
                    os.remove(file_path)
                    return False, message, None
            
            # Scan for malware
            safe_file, scan_message = self.scan_for_malware(file_path)
            if not safe_file:
                os.remove(file_path)
                return False, scan_message, None
            
            # Check file size
            file_size = os.path.getsize(file_path)
            max_size = self.max_file_sizes.get(category, 10 * 1024 * 1024)
            if file_size > max_size:
                os.remove(file_path)
                return False, f"File too large. Maximum size: {max_size // (1024*1024)}MB", None
            
            return True, "File upload successful", {
                'filename': safe_filename,
                'original_name': file.filename,
                'path': file_path,
                'size': file_size,
                'mime_type': mime_type,
                'category': category
            }
        
        except Exception as e:
            if os.path.exists(file_path):
                os.remove(file_path)
            return False, f"Upload validation error: {str(e)}", None

# Global file upload security instance
file_security = FileUploadSecurity()
