from db_handler.connection_db import connect_db
from pymongo.errors import ServerSelectionTimeoutError

try:
    db = connect_db()
    print("Connected OK, db name:", db.name)
    print("Collections:", db.list_collection_names())
except ServerSelectionTimeoutError as e:
    print("Server selection error:", e)
except Exception as e:
    print("Other error:", e)
