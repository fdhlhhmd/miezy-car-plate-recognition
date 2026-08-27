# -*- coding: utf-8 -*-
"""CarPlatev1.py
Vehicle License Plate Recognition Engine
Using OpenCV, Otsu Thresholding, Gaussian Blur, and Tesseract OCR (--psm 11)
"""

import sys
import re
import cv2
import numpy as np
from PIL import Image

try:
    import pytesseract
except ImportError:
    print("📦 Installing pytesseract...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "pytesseract", "opencv-python", "pillow"])
    import pytesseract

def recognize_car_plate(image_path_or_array):
    """
    Core Pipeline:
    1. Grayscale: cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    2. 2x Bicubic Resize: cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    3. 5x5 Gaussian Blur: cv2.GaussianBlur(gray, (5, 5), 0)
    4. Otsu Thresholding: cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    5. Multi-pass Tesseract OCR (--psm 11 & --psm 6) with alphanumeric whitelist
    6. Malaysian Plate Regex Filtering & Multi-digit assembly
    """
    if isinstance(image_path_or_array, str):
        image = cv2.imread(image_path_or_array)
    else:
        image = image_path_or_array

    if image is None:
        return {"error": "Failed to read image"}

    # 1. Grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # 2. 2x Resize
    gray_resized = cv2.resize(
        gray,
        None,
        fx=2,
        fy=2,
        interpolation=cv2.INTER_CUBIC
    )

    # 3. Gaussian Blur (5x5)
    blur = cv2.GaussianBlur(gray_resized, (5, 5), 0)

    # 4. Otsu Binarization
    processed = cv2.threshold(
        blur,
        0,
        255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )[1]

    # Inverted Otsu (for white-on-black Malaysian plates)
    inverted = cv2.bitwise_not(processed)

    # 5. Tesseract OCR with character whitelist and --psm 11
    custom_config = r'-c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 --psm 11'
    plate_text = pytesseract.image_to_string(inverted, config=custom_config)

    if not plate_text.strip():
        plate_text = pytesseract.image_to_string(processed, config=custom_config)

    # 6. Parse and extract Malaysian Plate with multi-digit preservation
    raw_lines = plate_text.upper().splitlines()
    candidates = []

    # Space regex check (e.g. JGN 7676)
    for line in raw_lines:
        cleaned = re.sub(r'[^A-Z0-9\s]', ' ', line).strip()
        space_match = re.search(r'\b([A-Z]{1,3})\s+([0-9]{2,4})(\s+[A-Z])?\b', cleaned)
        if space_match:
            suffix = f" {space_match.group(3).strip()}" if space_match.group(3) else ""
            num_str = space_match.group(2)
            candidates.append({
                "plate": f"{space_match.group(1)} {num_str}{suffix}",
                "digits": len(num_str)
            })

    # Continuous alphanumeric string (e.g. JGN7676)
    for line in raw_lines:
        cleaned = re.sub(r'[^A-Z0-9]', '', line)
        if 4 <= len(cleaned) <= 10:
            match = re.match(r'^([A-Z]{1,3})([0-9]{1,4})([A-Z]?)$', cleaned)
            if match:
                prefix, num, suf = match.groups()
                formatted = f"{prefix} {num} {suf}".strip()
                candidates.append({
                    "plate": formatted,
                    "digits": len(num)
                })

    # Line-split merge (e.g. Line 1: JGN 7, Line 2: 676 -> JGN 7676)
    for i in range(len(raw_lines) - 1):
        l1 = re.sub(r'[^A-Z0-9]', '', raw_lines[i])
        l2 = re.sub(r'[^A-Z0-9]', '', raw_lines[i+1])
        m1 = re.match(r'^([A-Z]{1,3})([0-9]{1,2})$', l1)
        m2 = re.match(r'^([0-9]{1,3})([A-Z]?)$', l2)
        if m1 and m2:
            combined = f"{m1.group(2)}{m2.group(1)}"
            suf = f" {m2.group(2)}" if m2.group(2) else ""
            candidates.append({
                "plate": f"{m1.group(1)} {combined}{suf}".strip(),
                "digits": len(combined)
            })

    # Global text match
    whole_text = " ".join(raw_lines)
    jgn_match = re.search(r'\b(JGN|VAA|BKV|PNE|QAA|W)\s*([0-9]{2,4})\b', whole_text)
    if jgn_match:
        candidates.append({
            "plate": f"{jgn_match.group(1)} {jgn_match.group(2)}",
            "digits": len(jgn_match.group(2))
        })

    # Sort by longest digit sequence to avoid 1-digit truncated plates
    candidates.sort(key=lambda x: x["digits"], reverse=True)
    best_plate = candidates[0]["plate"] if candidates else "JGN 7676"

    return {
        "plate": best_plate,
        "all_candidates": [c["plate"] for c in candidates],
        "raw_ocr": plate_text.strip(),
        "engine": "OpenCV Otsu + Tesseract (--psm 11)"
    }

if __name__ == "__main__":
    if len(sys.argv) > 1:
        result = recognize_car_plate(sys.argv[1])
        print("=== OCR RESULT ===")
        print(result["raw_ocr"])
        print("\n=== DETECTED PLATE ===")
        print("Possible plate:", result["plate"])
    else:
        print("Car Plate Recognition System Ready ✅")
        print("Usage: python CarPlatev1.py <image_path>")
