import sys
import json
import base64
import cv2
import numpy as np
import easyocr
import re
import warnings

# Suppress easyocr warnings
warnings.filterwarnings("ignore")

def main():
    try:
        # read base64 string from stdin
        b64_data = sys.stdin.read().strip()
        if not b64_data:
            print(json.dumps({"error": "No data provided"}))
            return
            
        img_data = base64.b64decode(b64_data)
        np_arr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        results = reader.readtext(img)
        
        plate_candidates = []
        for result in results:
            bbox, text, confidence = result
            if confidence < 0.3:
                continue
            
            cleaned = re.sub(r'[^A-Z0-9]', '', text.upper())
            if len(cleaned) >= 3:
                p1, p2, p3, p4 = bbox
                w = np.linalg.norm(np.array(p1) - np.array(p2))
                h = np.linalg.norm(np.array(p1) - np.array(p4))
                area = w * h
                plate_candidates.append((cleaned, confidence, area, text))
                
        if plate_candidates:
            # Sort by area (closest) * confidence (clearest)
            plate_candidates.sort(key=lambda x: x[2] * x[1], reverse=True)
            best_plate, best_conf, best_area, raw_text = plate_candidates[0]
            
            m = re.match(r'^([A-Z]{1,3})([0-9]{1,4})([A-Z]?)$', best_plate)
            if m:
                prefix = m.group(1)
                digits = m.group(2)
                suffix = f" {m.group(3)}" if m.group(3) else ""
                best_plate = f"{prefix} {digits}{suffix}".strip()
                
            print(json.dumps({
                "plate_number": best_plate,
                "confidence": float(best_conf),
                "rawText": raw_text
            }))
        else:
            print(json.dumps({
                "plate_number": "UNREADABLE",
                "confidence": 0.0,
                "rawText": ""
            }))
            
    except Exception as e:
        print(json.dumps({
            "plate_number": "UNREADABLE",
            "confidence": 0.0,
            "rawText": "",
            "error": str(e)
        }))

if __name__ == "__main__":
    main()
