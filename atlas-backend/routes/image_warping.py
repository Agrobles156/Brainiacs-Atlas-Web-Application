from flask import Blueprint, request, jsonify
import numpy as np
import cv2
from io import BytesIO
import traceback
import base64

def register_image_warping_routes(app):
    @app.route('/warp-images', methods=['POST'])
    @app.route('/flask-api/warp-images', methods=['POST'])
    def warp_images():
        try:
            file1 = request.files.get('files1')
            file2 = request.files.get('files2')
            pts1 = request.form.get('points1')
            pts2 = request.form.get('points2')

            if not all([file1, file2, pts1, pts2]):
                return jsonify({'error': 'Missing required fields'}), 400

            pts1 = np.array(eval(pts1), dtype=np.float32)
            pts2 = np.array(eval(pts2), dtype=np.float32)

            img1 = cv2.imdecode(np.frombuffer(file1.read(), np.uint8), cv2.IMREAD_COLOR)  # BGR
            img2 = cv2.imdecode(np.frombuffer(file2.read(), np.uint8), cv2.IMREAD_COLOR)  # BGR

            mask2 = np.zeros(img2.shape[:2], dtype=np.uint8)
            cv2.fillPoly(mask2, [np.int32(pts2)], 255)

            img2_masked = cv2.bitwise_and(img2, img2, mask=mask2)

            H, _ = cv2.findHomography(pts2, pts1, cv2.RANSAC)
            if H is None:
                return jsonify({'error': 'Homography computation failed'}), 400

            w, h = img1.shape[1], img1.shape[0]

            warped_rgb = cv2.warpPerspective(img2_masked, H, (w, h))
            warped_mask = cv2.warpPerspective(mask2, H, (w, h))

            warped_rgba = cv2.cvtColor(warped_rgb, cv2.COLOR_BGR2BGRA)
            warped_rgba[:, :, 3] = warped_mask  

            _, buf_base = cv2.imencode('.png', img1)          
            _, buf_overlay = cv2.imencode('.png', warped_rgba)

            return jsonify({
                "base": base64.b64encode(buf_base).decode("utf-8"),
                "overlay": base64.b64encode(buf_overlay).decode("utf-8")
            })

        except Exception:
            print("=== Warp ERROR ===")
            print(traceback.format_exc())
            return jsonify({'error': 'Server error'}), 500
