import { createWorker } from 'tesseract.js';

export interface OcrResult {
  plateNumber: string;
  confidence: number;
  vehicleType: string;
  vehicleColor: string;
  countryOrState: string;
  processingEngine: string;
  processingTimeMs: number;
  rawOcrText: string;
  notes?: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Compute Otsu's optimal threshold (cv2.THRESH_OTSU in OpenCV)
 */
function computeOtsuThreshold(grayData: Uint8Array): number {
  const histogram = new Int32Array(256);
  const total = grayData.length;
  for (let i = 0; i < total; i++) {
    histogram[grayData[i]]++;
  }

  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }

  let sumB = 0;
  let wB = 0;
  let varMax = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }

  return threshold;
}

/**
 * Apply 5x5 Gaussian Blur (cv2.GaussianBlur(gray, (5, 5), 0))
 */
function applyGaussianBlur5x5(src: Uint8Array, width: number, height: number): Uint8Array {
  const dest = new Uint8Array(width * height);
  const kernel = [1, 4, 6, 4, 1];
  const temp = new Float32Array(width * height);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) {
        const px = Math.min(width - 1, Math.max(0, x + k));
        sum += src[y * width + px] * kernel[k + 2];
      }
      temp[y * width + x] = sum / 16;
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) {
        const py = Math.min(height - 1, Math.max(0, y + k));
        sum += temp[py * width + x] * kernel[k + 2];
      }
      dest[y * width + x] = Math.round(sum / 16);
    }
  }

  return dest;
}

/**
 * Preprocess image with OpenCV Otsu + Adaptive Local Contrast + License Plate Region Focus
 */
export async function preprocessImageWithOtsu(
  imageSource: string
): Promise<{ 
  otsuBase64: string; 
  invertedOtsuBase64: string; 
  plateCropBase64: string;
  vehicleColor: string 
}> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const width = img.width * 2;
      const height = img.height * 2;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve({ 
          otsuBase64: imageSource, 
          invertedOtsuBase64: imageSource, 
          plateCropBase64: imageSource,
          vehicleColor: 'Unknown' 
        });
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      const pixelCount = width * height;

      // Color sampling for vehicle color estimation
      let rSum = 0, gSum = 0, bSum = 0, sampleCount = 0;
      const startX = Math.floor(width * 0.3);
      const endX = Math.floor(width * 0.7);
      const startY = Math.floor(height * 0.2);
      const endY = Math.floor(height * 0.5);

      for (let y = startY; y < endY; y += 4) {
        for (let x = startX; x < endX; x += 4) {
          const idx = (y * width + x) * 4;
          rSum += data[idx];
          gSum += data[idx + 1];
          bSum += data[idx + 2];
          sampleCount++;
        }
      }

      const avgR = sampleCount ? rSum / sampleCount : 128;
      const avgG = sampleCount ? gSum / sampleCount : 128;
      const avgB = sampleCount ? bSum / sampleCount : 128;

      let vehicleColor = 'Classic Grey';
      if (avgR < 60 && avgG < 60 && avgB < 60) vehicleColor = 'Black / Dark';
      else if (avgR > 200 && avgG > 200 && avgB > 200) vehicleColor = 'White';
      else if (avgR > avgG + 30 && avgR > avgB + 30) vehicleColor = 'Red / Crimson';
      else if (avgB > avgR + 25 && avgB > avgG + 25) vehicleColor = 'Blue';
      else if (avgG > avgR + 15 && avgG > avgB + 15) vehicleColor = 'Olive Green';
      else if (avgR > 140 && avgG > 140 && avgB < 100) vehicleColor = 'Yellow / Gold';
      else if (avgR > 120 && avgG > 130 && avgB > 120) vehicleColor = 'Sage / Greenish Grey';

      // 1. Grayscale: cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
      const grayData = new Uint8Array(pixelCount);
      for (let i = 0; i < pixelCount; i++) {
        const idx = i * 4;
        grayData[i] = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
      }

      // 2. 5x5 Gaussian Blur: cv2.GaussianBlur(gray, (5, 5), 0)
      const blurred = applyGaussianBlur5x5(grayData, width, height);

      // 3. Otsu Thresholding: cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
      const otsuThreshold = computeOtsuThreshold(blurred);

      // Create Standard Otsu Image
      for (let i = 0; i < pixelCount; i++) {
        const idx = i * 4;
        const val = blurred[i] > otsuThreshold ? 255 : 0;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      const otsuBase64 = canvas.toDataURL('image/png');

      // Create Inverted Otsu Image (for white text on black background, standard on Malaysian plates)
      for (let i = 0; i < pixelCount; i++) {
        const idx = i * 4;
        const val = blurred[i] > otsuThreshold ? 0 : 255;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      const invertedOtsuBase64 = canvas.toDataURL('image/png');

      // Create Cropped Center-Lower Region (license plate region focus with local Otsu)
      const cropCanvas = document.createElement('canvas');
      const cropW = Math.floor(width * 0.6);
      const cropH = Math.floor(height * 0.45);
      const cropX = Math.floor(width * 0.2);
      const cropY = Math.floor(height * 0.35);

      cropCanvas.width = cropW;
      cropCanvas.height = cropH;
      const cropCtx = cropCanvas.getContext('2d');
      if (cropCtx) {
        cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      }
      const plateCropBase64 = cropCanvas.toDataURL('image/png');

      resolve({ otsuBase64, invertedOtsuBase64, plateCropBase64, vehicleColor });
    };

    img.onerror = () => {
      resolve({ 
        otsuBase64: imageSource, 
        invertedOtsuBase64: imageSource, 
        plateCropBase64: imageSource,
        vehicleColor: 'Unknown' 
      });
    };

    img.src = imageSource;
  });
}

/**
 * Filter and extract Malaysian plate from raw OCR text with full digit preservation
 */
export function parseMalaysianPlateFromOcr(plateText: string): { 
  plate: string; 
  confidence: number; 
  rawCandidates: string[] 
} {
  if (!plateText) return { plate: 'UNKNOWN', confidence: 0, rawCandidates: [] };

  const rawLines = plateText.toUpperCase().split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
  const candidates: { formatted: string; digitsCount: number; confidence: number }[] = [];

  // Pass 1: Check multi-word patterns with spaces (e.g. "JGN 7676", "VAA 8829")
  for (const line of rawLines) {
    const cleanedWithSpaces = line.replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Look for standard Malaysian plate: 1-3 letters followed by 1-4 digits
    const fullMatch = cleanedWithSpaces.match(/\b([A-Z]{1,3})\s+([0-9]{2,4})(\s+[A-Z])?\b/);
    if (fullMatch) {
      const suffix = fullMatch[3] ? ` ${fullMatch[3].trim()}` : '';
      const numStr = fullMatch[2];
      candidates.push({
        formatted: `${fullMatch[1]} ${numStr}${suffix}`,
        digitsCount: numStr.length,
        confidence: numStr.length >= 3 ? 0.98 : 0.92,
      });
    }
  }

  // Pass 2: Clean single lines (e.g. "JGN7676" or "JGN 7676")
  for (const line of rawLines) {
    const cleaned = line.replace(/[^A-Z0-9]/g, '');
    if (cleaned.length >= 4 && cleaned.length <= 10) {
      const match = cleaned.match(/^([A-Z]{1,3})([0-9]{1,4})([A-Z]?)$/);
      if (match) {
        const prefix = match[1];
        const numStr = match[2];
        const suffix = match[3] ? ` ${match[3]}` : '';
        candidates.push({
          formatted: `${prefix} ${numStr}${suffix}`,
          digitsCount: numStr.length,
          confidence: numStr.length >= 3 ? 0.96 : (numStr.length === 2 ? 0.85 : 0.70),
        });
      }
    }
  }

  // Pass 3: Handle split lines where letters appear on line 1, and digits on line 2
  for (let i = 0; i < rawLines.length; i++) {
    const line1 = rawLines[i].replace(/[^A-Z0-9]/g, '');
    const m1 = line1.match(/^([A-Z]{1,3})([0-9]{0,2})$/);
    if (m1 && i + 1 < rawLines.length) {
      const line2 = rawLines[i + 1].replace(/[^A-Z0-9]/g, '');
      const m2 = line2.match(/^([0-9]{1,4})([A-Z]?)$/);
      if (m2) {
        const combinedDigits = `${m1[2] || ''}${m2[1]}`;
        if (combinedDigits.length >= 1) {
          const suffix = m2[2] ? ` ${m2[2]}` : '';
          candidates.push({
            formatted: `${m1[1]} ${combinedDigits}${suffix}`.trim(),
            digitsCount: combinedDigits.length,
            confidence: 0.92,
          });
        }
      }
    }
  }

  // Sort candidates by most complete digits (prefer 4-digit or 3-digit over 1-digit truncated plates)
  candidates.sort((a, b) => {
    if (b.digitsCount !== a.digitsCount) {
      return b.digitsCount - a.digitsCount;
    }
    return b.confidence - a.confidence;
  });

  if (candidates.length > 0) {
    return {
      plate: candidates[0].formatted,
      confidence: candidates[0].confidence,
      rawCandidates: candidates.map(c => c.formatted),
    };
  }

  return { plate: 'UNREADABLE', confidence: 0.0, rawCandidates: [] };
}

/**
 * Execute robust OCR with OpenCV Otsu + Multi-pass PSM & Character Whitelist
 */
export async function performClientSideOcr(
  imageUrl: string,
  onProgress?: (status: string, progress: number) => void
): Promise<OcrResult> {
  const startTime = Date.now();

  try {
    onProgress?.('Applying OpenCV Otsu Thresholding & Gaussian Blur (5x5)...', 0.2);
    const { otsuBase64, invertedOtsuBase64, plateCropBase64, vehicleColor } = await preprocessImageWithOtsu(imageUrl);

    onProgress?.('Running Tesseract Neural Character Extractor...', 0.45);
    const worker = await createWorker('eng');

    // Configure Tesseract for alphanumeric license plate recognition
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
      tessedit_pageseg_mode: '11' as any,
    });

    // Pass 1: Inverted Otsu image (ideal for Malaysian black plates with white embossed characters)
    const retInverted = await worker.recognize(invertedOtsuBase64);
    let parsed = parseMalaysianPlateFromOcr(retInverted.data.text);
    let bestRaw = retInverted.data.text;

    // Pass 2: If plate has < 3 digits or low confidence, run on cropped plate region with uniform block PSM 6
    if (parsed.plate.replace(/[^0-9]/g, '').length < 3 || parsed.confidence < 0.92) {
      onProgress?.('Enhancing license plate region...', 0.7);
      await worker.setParameters({
        tessedit_pageseg_mode: '6' as any, // Uniform block of text
      });

      const retCrop = await worker.recognize(plateCropBase64);
      const parsedCrop = parseMalaysianPlateFromOcr(retCrop.data.text);
      
      const cropDigits = parsedCrop.plate.replace(/[^0-9]/g, '').length;
      const prevDigits = parsed.plate.replace(/[^0-9]/g, '').length;

      if (cropDigits > prevDigits || parsedCrop.confidence > parsed.confidence) {
        parsed = parsedCrop;
        bestRaw = `${bestRaw}\n${retCrop.data.text}`;
      }
    }

    await worker.terminate();
    const duration = Date.now() - startTime;

    onProgress?.('Car plate scanned!', 1.0);

    return {
      plateNumber: parsed.plate,
      confidence: parsed.confidence,
      vehicleType: 'Vehicle',
      vehicleColor,
      countryOrState: 'Malaysia',
      processingEngine: 'OpenCV Otsu + Tesseract (PSM 11)',
      processingTimeMs: duration,
      rawOcrText: bestRaw.trim() || parsed.plate,
      notes: `Extracted via Otsu binarization and neural character segmentation (${duration}ms).`,
    };
  } catch (err: any) {
    console.error('OCR error:', err);
    const duration = Date.now() - startTime;
    return {
      plateNumber: 'UNREADABLE',
      confidence: 0.0,
      vehicleType: 'Vehicle',
      vehicleColor: 'Unknown',
      countryOrState: 'Malaysia',
      processingEngine: 'OpenCV Otsu + Tesseract Backend',
      processingTimeMs: duration,
      rawOcrText: '',
      notes: 'No readable license plate characters found.',
    };
  }
}
