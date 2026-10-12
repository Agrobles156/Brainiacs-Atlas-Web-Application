from flask import jsonify, send_from_directory, make_response, request
import os
from db_handler.connection_db import connect_db


def register_misc_routes(app, upload_folder):
    @app.route('/uploads/<path:filename>')
    @app.route('/flask-api/uploads/<path:filename>')
    def serve_uploaded_file(filename):
        response = make_response(send_from_directory(upload_folder, filename, as_attachment=False))
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Cross-Origin-Resource-Policy', 'cross-origin')
        return response

    @app.route('/get_endnote', methods=['GET'])
    @app.route('/flask-api/get_endnote', methods=['GET'])
    def get_endnote():
        abbreviation = request.args.get('abbr')
        if not abbreviation:
            return jsonify({'error': 'No abbreviation provided'}), 400

        db = connect_db()
        collection = db['regions']
        region_data = collection.find_one(
            {'abbreviations': {'$regex': f'^{abbreviation}$', '$options': 'i'}},
            {'_id': 0}
        )

        if not region_data:
            return jsonify({'error': f'Region {abbreviation} not found'}), 404

        return jsonify({
            'abbreviation': abbreviation,
            'names': region_data['names'],
            'endnotes': region_data.get('endnotes', [])
        }
    )