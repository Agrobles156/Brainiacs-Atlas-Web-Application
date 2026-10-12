# atlas-backend/routes_collections.py
from flask import request, jsonify, session
from security.security_middleware import sanitize_payload
from db_handler.collections import (
    create_new_collection as db_create_new_collection,
    add_to_collection as db_add_to_collection,
    get_collections as db_get_collections,
    delete_collection as db_delete_collection,
    remove_note_from_collection as db_remove_note_from_collection,
)

def register_collections_routes(app):
    @app.route('/collections', methods=['POST'])
    @app.route('/flask-api/collections', methods=['POST'])
    def create_collection_route():
        user_id = session.get("userId")
        if not user_id:
            return jsonify({'error': 'User not authenticated'}), 401

        data = request.get_json() or {}
        data = sanitize_payload(data)
        # accept either "name" or "collectionName" from the client
        name = (data.get("name") or data.get("collectionName") or "").strip()
        if not name:
            return jsonify({'error': 'Collection name is required'}), 400

        # DB function takes ONLY (user_id, name)
        ok = db_create_new_collection(user_id, name)
        if ok:
            return jsonify({'message': f'Collection {name} created successfully'}), 201
        return jsonify({'error': f'Failed to create collection {name}'}), 400

    @app.route('/collections', methods=['GET'])
    @app.route('/flask-api/collections', methods=['GET'])
    def get_collections_route():
        user_id = session.get("userId")
        if not user_id:
            return jsonify({'error': 'User not authenticated'}), 401

        collections = db_get_collections(user_id)
        # normalize to one shape for the frontend
        return jsonify({'collection': collections}), 200

    @app.route('/collections/add', methods=['POST'])
    @app.route('/flask-api/collections/add', methods=['POST'])
    def add_to_collection_route():
        user_id = session.get("userId")
        if not user_id:
            return jsonify({'error': 'User not authenticated'}), 401

        data = request.get_json() or {}
        data = sanitize_payload(data)
        note = data.get('note')
        collection_name = data.get('name') or data.get('collectionName')
        if not note or not collection_name:
            return jsonify({'error': 'Note and collection name are required'}), 400

        ok = db_add_to_collection(user_id, collection_name, note)
        if ok:
            return jsonify({'message': f'Note added to {collection_name}'}), 200
        return jsonify({'error': f'Note is already saved to {collection_name}'}), 400

    @app.route('/collections/<collection_name>', methods=['DELETE'])
    @app.route('/flask-api/collections/<collection_name>', methods=['DELETE'])
    def delete_collection_route(collection_name):
        user_id = session.get("userId")
        if not user_id:
            return jsonify({'error': 'User not authenticated'}), 401

        ok = db_delete_collection(user_id, collection_name)
        if ok:
            return jsonify({'message': f'Collection {collection_name} deleted successfully'}), 200
        return jsonify({'error': f'Failed to delete collection {collection_name}'}), 404

    @app.route('/collections/<collection_name>/remove', methods=['DELETE'])
    @app.route('/flask-api/collections/<collection_name>/remove', methods=['DELETE'])
    def remove_note_from_collection_route(collection_name):
        user_id = session.get("userId")
        if not user_id:
            return jsonify({'error': 'User not authenticated'}), 401

        data = request.get_json() or {}
        note_id = data.get('noteID')
        if not note_id:
            return jsonify({'error': 'Missing noteID'}), 400

        ok = db_remove_note_from_collection(user_id, collection_name, note_id)
        if ok:
            return jsonify({'message': f'Note removed successfully from {collection_name}'}), 200
        return jsonify({'error': f'Failed to remove note from {collection_name}'}), 400
