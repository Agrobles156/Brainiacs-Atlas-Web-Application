from flask import request, abort
import re


def require_https():
    # Allow localhost (local dev) to use http; production must use https
    if request.host.startswith('localhost') or request.host.startswith('127.0.0.1'):
        return
    # Allow OPTIONS requests (CORS preflight) to pass through
    if request.method == 'OPTIONS':
        return
    if request.headers.get('X-Forwarded-Proto', 'http') != 'https':
        abort(403)


def register_security_middleware(app):
    @app.before_request
    def before_request_func():
        require_https()


# --- XSS sanitization helpers ---
# Truncate any string at the first occurrence of a <script> tag (case-insensitive)
SCRIPT_RE = re.compile(r'(?i)<\s*script\b')


def strip_after_script_tag(text: str) -> str:
    """Return text truncated at the first <script tag occurrence. Non-strings pass through."""
    if not isinstance(text, str):
        return text
    m = SCRIPT_RE.search(text)
    return text[: m.start()] if m else text


def sanitize_payload(obj):
    """Recursively sanitize dicts/lists/strings by truncating strings at <script tags."""
    if isinstance(obj, dict):
        return {k: sanitize_payload(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_payload(x) for x in obj]
    if isinstance(obj, str):
        return strip_after_script_tag(obj)
    return obj