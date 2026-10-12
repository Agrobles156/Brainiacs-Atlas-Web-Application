from pymongo import MongoClient
from pymongo.errors import ConfigurationError, ServerSelectionTimeoutError
from dotenv import dotenv_values
from pathlib import Path
import certifi
import threading
import time

_client_lock = threading.Lock()
_cached_client = None

def connect_db():
    global _cached_client
    if _cached_client is not None:
        return _cached_client["demo"]

    with _client_lock:
        if _cached_client is not None:
            return _cached_client["demo"]

        # Always load .env relative to project root
        env_path = Path(__file__).resolve().parent.parent / ".env"
        config = dotenv_values(env_path)

        uri = config.get("DB_URL")
        if not uri:
            raise ConfigurationError(f"DB_URL missing or unreadable in {env_path}")

        max_retries = 3
        retry_delay = 1
        last_error = None
        
        for attempt in range(max_retries):
            try:
                client = MongoClient(
                    uri,
                    tls=True,
                    tlsCAFile=certifi.where(),
                    serverSelectionTimeoutMS=15000,
                    connectTimeoutMS=15000,
                    socketTimeoutMS=15000,
                )
                client.server_info()
                _cached_client = client
                return _cached_client["demo"]
            except (ServerSelectionTimeoutError, OSError) as e:
                last_error = e
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    retry_delay *= 2
                continue
        
        raise ConfigurationError(f"Failed to connect to MongoDB after {max_retries} attempts: {str(last_error)}")
