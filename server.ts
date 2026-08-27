import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, FieldValue, Firestore } from 'firebase-admin/firestore';
import { createWorker } from 'tesseract.js';

// Initialize Express
const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Project ID
const FIREBASE_PROJECT_ID = 'car-plate-recognition-48cf1';
const PARKING_COLLECTION = 'parking_records';

// Initialize Firebase Admin with credential detection
let adminApp: App | null = null;
let firestoreDb: Firestore | null = null;
let firestoreAdminEnabled = false;

try {
  const serviceAccountKeyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(process.cwd(), 'serviceAccountKey.json');
  const serviceAccountKeyEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  let credential = undefined;
  if (serviceAccountKeyEnv) {
    try {
      credential = cert(JSON.parse(serviceAccountKeyEnv));
    } catch {}
  } else if (fs.existsSync(serviceAccountKeyPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountKeyPath, 'utf8'));
      credential = cert(serviceAccount);
    } catch {}
  }

  if (credential) {
    const existingApps = getApps();
    adminApp = existingApps.length > 0 ? existingApps[0] : initializeApp({
      credential,
      projectId: FIREBASE_PROJECT_ID,
    });
    firestoreDb = getFirestore(adminApp);
    firestoreAdminEnabled = true;
    console.log(`[Firebase Admin] Authenticated with service account for: ${FIREBASE_PROJECT_ID}`);
  } else {
    console.log(`[Firestore Service] In-memory cache active for '${PARKING_COLLECTION}'. Client-side Firestore sync is enabled.`);
  }
} catch (e) {
  console.log('[Firestore Service] In-memory cache mode enabled.');
}

// Lazy Gemini AI initialization for vision validation
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// In-memory synced records cache for fast response
const memoryRecords: Map<string, any> = new Map();

/**
 * Format Malaysian registration number
 * e.g. JGN7676 -> JGN 7676, VAA8829 -> VAA 8829, W8829K -> W 8829 K
 */
function formatMalaysianPlate(rawCleaned: string): string {
  const m = rawCleaned.match(/^([A-Z]{1,3})([0-9]{1,4})([A-Z]?)$/);
  if (m) {
    const prefix = m[1];
    const digits = m[2];
    const suffix = m[3] ? ` ${m[3]}` : '';
    return `${prefix} ${digits}${suffix}`.trim();
  }
  return rawCleaned;
}

/**
 * Parse and clean OCR text from raw Tesseract stream:
 * 1. Clean spaces and special characters: re.sub(r'[^A-Z0-9]', '', text.upper())
 * 2. Match standard alphanumeric plate patterns
 * 3. Pick candidate with highest confidence & longest digit count
 */
function parsePlateCandidates(data: any): { plate_number: string; confidence: number; all_candidates: string[] } {
  if (!data || !data.lines || data.lines.length === 0) {
    // Fallback if data is just a string (for safety)
    if (typeof data === 'string' && data.length > 0) {
      data = { lines: data.split(/[\r\n]+/).map(t => ({ text: t, confidence: 90, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } })) };
    } else {
      return { plate_number: 'UNREADABLE', confidence: 0.0, all_candidates: [] };
    }
  }

  const lines = data.lines;
  const candidates: { formatted: string; digitsCount: number; ocrConfidence: number; boxArea: number }[] = [];

  for (const line of lines) {
    const text = (line.text || '').toUpperCase().trim();
    if (!text) continue;

    const box = line.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
    const boxArea = (box.y1 - box.y0) * (box.x1 - box.x0);
    const ocrConfidence = line.confidence || 0;

    // Pass 1: Multi-word space patterns (e.g. "JGN 7676", "VAA 8829", "BKV 7711", "PNE 3320")
    const cleanedWithSpaces = text.replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const match = cleanedWithSpaces.match(/\b([A-Z]{1,3})\s+([0-9]{1,4})(\s+[A-Z])?\b/);
    if (match) {
      const suffix = match[3] ? ` ${match[3].trim()}` : '';
      const numStr = match[2];
      candidates.push({
        formatted: `${match[1]} ${numStr}${suffix}`,
        digitsCount: numStr.length,
        ocrConfidence,
        boxArea
      });
      continue;
    }

    // Pass 2: Clean single lines without spaces (e.g. "JGN7676", "VAA8829")
    const cleaned = text.replace(/[^A-Z0-9]/g, '');
    if (cleaned.length >= 3 && cleaned.length <= 10) {
      const formatted = formatMalaysianPlate(cleaned);
      const digitsMatch = cleaned.match(/[0-9]+/);
      const digitsCount = digitsMatch ? digitsMatch[0].length : 0;
      candidates.push({
        formatted,
        digitsCount,
        ocrConfidence,
        boxArea
      });
    }
  }

  // Pass 3: Handle split lines across line breaks (e.g. Line 1: "JGN", Line 2: "7676")
  for (let i = 0; i < lines.length - 1; i++) {
    const l1 = (lines[i].text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const l2 = (lines[i+1].text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    const m1 = l1.match(/^([A-Z]{1,3})([0-9]{0,2})$/);
    const m2 = l2.match(/^([0-9]{1,4})([A-Z]?)$/);
    
    if (m1 && m2) {
      const combined = `${m1[2] || ''}${m2[1]}`;
      if (combined.length >= 1) {
        const suffix = m2[2] ? ` ${m2[2]}` : '';
        const b1 = lines[i].bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
        const b2 = lines[i+1].bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
        
        // Calculate combined bounding box area
        const minX = Math.min(b1.x0, b2.x0);
        const maxX = Math.max(b1.x1, b2.x1);
        const minY = Math.min(b1.y0, b2.y0);
        const maxY = Math.max(b1.y1, b2.y1);
        const combinedArea = (maxY - minY) * (maxX - minX);
        const avgConf = ((lines[i].confidence || 0) + (lines[i+1].confidence || 0)) / 2;

        candidates.push({
          formatted: `${m1[1]} ${combined}${suffix}`.trim(),
          digitsCount: combined.length,
          ocrConfidence: avgConf,
          boxArea: combinedArea
        });
      }
    }
  }

  // Sort candidates by size (closest) and confidence (clearest)
  candidates.sort((a, b) => {
    // Score based on area (closeness/size) * confidence (clarity) * completeness (digitsCount)
    // Tesseract confidence is 0-100, Area can be large.
    const scoreA = (a.boxArea || 1) * (a.ocrConfidence / 100) * a.digitsCount;
    const scoreB = (b.boxArea || 1) * (b.ocrConfidence / 100) * b.digitsCount;
    return scoreB - scoreA;
  });

  if (candidates.length > 0) {
    const best = candidates[0];
    const normalizedConf = Math.min(best.ocrConfidence / 100, 1.0);
    return {
      plate_number: best.formatted,
      confidence: normalizedConf > 0 ? normalizedConf : 0.9,
      all_candidates: candidates.map((c) => c.formatted),
    };
  }

  return {
    plate_number: 'UNREADABLE',
    confidence: 0.0,
    all_candidates: [],
  };
}

/**
 * Resolve any image representation (HTTP URL, Data URI, or raw Base64) to a clean base64 string, MIME type, and Buffer
 */
async function resolveImageBufferAndBase64(input: string): Promise<{ base64: string; mimeType: string; buffer: Buffer }> {
  if (!input) {
    throw new Error('No image data provided');
  }

  if (input.startsWith('http://') || input.startsWith('https://')) {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from URL (${response.status} ${response.statusText})`);
    }
    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const mimeType = contentType.split(';')[0].trim() || 'image/jpeg';
    const base64 = buffer.toString('base64');
    return { base64, mimeType, buffer };
  }

  if (input.startsWith('data:')) {
    const mimeMatch = input.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const cleanBase64 = input.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    return { base64: cleanBase64, mimeType, buffer };
  }

  const buffer = Buffer.from(input, 'base64');
  return { base64: input, mimeType: 'image/jpeg', buffer };
}

/**
 * Perform local neural OCR on image buffer
 */
async function performLocalOcr(imageInput: string): Promise<{ plate_number: string; confidence: number; rawText: string }> {
  try {
    const { base64 } = await resolveImageBufferAndBase64(imageInput);
    
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      const pythonProcess = spawn('./venv/bin/python', ['ocr_wrapper.py']);
      
      let stdoutData = '';
      let stderrData = '';
      
      pythonProcess.stdout.on('data', (data: Buffer) => {
        stdoutData += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data: Buffer) => {
        stderrData += data.toString();
      });
      
      pythonProcess.on('close', (code: number) => {
        if (code !== 0) {
          console.error('Python script exited with code:', code);
          console.error('Stderr:', stderrData);
          resolve({ plate_number: 'UNREADABLE', confidence: 0.0, rawText: '' });
          return;
        }
        
        try {
          const result = JSON.parse(stdoutData.trim());
          if (result.error) {
            console.error('OCR Error:', result.error);
            resolve({ plate_number: 'UNREADABLE', confidence: 0.0, rawText: '' });
          } else {
            resolve({
              plate_number: result.plate_number || 'UNREADABLE',
              confidence: result.confidence || 0.0,
              rawText: result.rawText || ''
            });
          }
        } catch (err) {
          console.error('Error parsing Python output:', err, stdoutData);
          resolve({ plate_number: 'UNREADABLE', confidence: 0.0, rawText: '' });
        }
      });
      
      pythonProcess.stdin.write(base64);
      pythonProcess.stdin.end();
    });
  } catch (err) {
    console.error('Local OCR error:', err);
    return {
      plate_number: 'UNREADABLE',
      confidence: 0.0,
      rawText: '',
    };
  }
}

/**
 * Helper to normalize license plate for deduplication and matching
 */
function normalizePlate(plate?: string): string {
  if (!plate) return '';
  return plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

/**
 * Record or toggle vehicle status in Firestore collection 'parking_records'
 * - If vehicle exists with status 'INSIDE' -> toggle/overwrite status to 'EXITED'
 * - If vehicle exists with status 'EXITED' -> toggle/overwrite status to 'INSIDE'
 * - Enforces zero duplicate plate numbers in database (single record per plate)
 */
async function recordVehicleWithFirestore(recordData: {
  plate_number: string;
  confidence?: number;
  vehicle_type?: string;
  vehicle_color?: string;
  image_url?: string;
  raw_ocr?: string;
  id?: string;
  requested_status?: 'INSIDE' | 'EXITED';
}) {
  const timestamp = new Date().toISOString();
  const rawPlate = recordData.plate_number || 'UNKNOWN';
  const cleanPlate = normalizePlate(rawPlate) || 'UNKNOWN';
  const docId = `plate_${cleanPlate}`;

  // 1. Check for existing record in memory by normalized plate
  let existing: any = null;
  for (const [key, val] of memoryRecords.entries()) {
    if (normalizePlate(val.plate_number || val.plateNumber) === cleanPlate) {
      existing = val;
      // Remove under old key if different to guarantee deduplication
      if (key !== docId) {
        memoryRecords.delete(key);
      }
      break;
    }
  }

  // 2. Check in Firestore if enabled
  if (!existing && firestoreDb && firestoreAdminEnabled) {
    try {
      const docSnap = await firestoreDb.collection(PARKING_COLLECTION).doc(docId).get();
      if (docSnap.exists) {
        existing = { id: docSnap.id, ...docSnap.data() };
      }
    } catch (e: any) {
      if (e?.code === 7 || e?.message?.includes('PERMISSION_DENIED')) {
        firestoreAdminEnabled = false;
      }
    }
  }

  // 3. Determine status toggle:
  // If exists with INSIDE -> EXITED. If exists with EXITED -> INSIDE.
  let nextStatus: 'INSIDE' | 'EXITED' = 'INSIDE';
  let lastAction: 'ENTRY' | 'EXIT' = 'ENTRY';
  let entryTime = existing?.entry_time || timestamp;
  let exitTime = existing?.exit_time;

  if (recordData.requested_status) {
    nextStatus = recordData.requested_status;
    lastAction = nextStatus === 'INSIDE' ? 'ENTRY' : 'EXIT';
    if (nextStatus === 'INSIDE') entryTime = timestamp;
    if (nextStatus === 'EXITED') exitTime = timestamp;
  } else if (existing) {
    const currentStatus = String(existing.status || '').toUpperCase();
    if (currentStatus === 'INSIDE' || currentStatus === 'COMPLETED') {
      nextStatus = 'EXITED';
      lastAction = 'EXIT';
      exitTime = timestamp;
    } else {
      nextStatus = 'INSIDE';
      lastAction = 'ENTRY';
      entryTime = timestamp;
    }
  } else {
    nextStatus = 'INSIDE';
    lastAction = 'ENTRY';
    entryTime = timestamp;
  }

  const parkingRecord = {
    id: docId,
    plate_number: rawPlate,
    plateNumber: rawPlate,
    entry_time: entryTime,
    exit_time: exitTime || null,
    status: nextStatus,
    last_action: lastAction,
    confidence: recordData.confidence || existing?.confidence || 0.95,
    vehicle_type: recordData.vehicle_type || existing?.vehicle_type || 'Vehicle',
    vehicle_color: recordData.vehicle_color || existing?.vehicle_color || 'Grey',
    country_or_state: 'Malaysia',
    image_url: recordData.image_url || existing?.image_url || '',
    imageUrl: recordData.image_url || existing?.image_url || '',
    raw_ocr: recordData.raw_ocr || existing?.raw_ocr || rawPlate,
    created_at: existing?.created_at || timestamp,
    updated_at: timestamp,
    toggle_count: (existing?.toggle_count || 0) + 1,
  };

  // Keep single unique record in memory map
  memoryRecords.set(docId, parkingRecord);

  if (firestoreDb && firestoreAdminEnabled) {
    try {
      await firestoreDb.collection(PARKING_COLLECTION).doc(docId).set({
        ...parkingRecord,
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log(`[Firestore] Vehicle record updated in '${PARKING_COLLECTION}' -> ID: ${docId}, Status: ${nextStatus}, Action: ${lastAction}`);
    } catch (dbErr: any) {
      if (dbErr?.code === 7 || dbErr?.message?.includes('PERMISSION_DENIED')) {
        firestoreAdminEnabled = false;
      } else {
        console.log('[Firestore] Write cached in memory');
      }
    }
  }

  return {
    ...parkingRecord,
    toggleAction: lastAction,
    isExisting: Boolean(existing),
    previousStatus: existing ? existing.status : null,
  };
}

// ==========================================
// API ROUTES
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    projectId: FIREBASE_PROJECT_ID,
    collection: PARKING_COLLECTION,
    appName: "Miezy's Car Plate Recognition",
    engine: 'EasyOCR & OpenCV Python Backend',
    firestoreAdmin: firestoreAdminEnabled ? 'active' : 'client_mode',
  });
});

/**
 * Resilient Multimodal Plate Recognition with multi-model fallback and error mitigation
 */
async function recognizePlateWithVisionAi(imageInput: string): Promise<{
  plate_number?: string;
  confidence?: number;
  vehicle_type?: string;
  vehicle_color?: string;
  country_or_state?: string;
  raw_ocr?: string;
  engine?: string;
} | null> {
  const ai = getGeminiClient();
  if (!ai) return null;

  try {
    const { base64, mimeType } = await resolveImageBufferAndBase64(imageInput);

    const prompt = `You are a high-accuracy Automated License Plate Recognition (ALPR/ANPR) computer vision engine.

TASK:
1. Examine this vehicle image carefully. Locate the MAIN license plate / number plate on the front or rear of the PRIMARY, LARGEST vehicle in the foreground.
2. CRITICAL: Ignore any vehicles in the background. ONLY read the license plate of the main subject vehicle.
3. Read and transcribe the EXACT visible registration characters printed on the plate without guessing or hallucinating:
   - Identify letters and numbers accurately.
   - Separate the letter prefix and numbers with a single space (e.g., "ABC 1234" not "ABC1234").
   - DO NOT read random badges, decals, stickers, or watermark text. ONLY read the official vehicle license plate.
   - If no vehicle license plate is visible or readable on the MAIN vehicle, set "plate_number": null.
4. Identify vehicle attributes from visual pixel inspection of the MAIN vehicle:
   - "vehicle_type": Sedan, SUV, Hatchback, Pickup Truck, Motorcycle, Van, Bus, MPV, Coupe, Classic, or Other.
   - "vehicle_color": Exact visual color (e.g. Grey, Silver, Black, White, Red, Blue, Sage Green, Yellow).
   - "country_or_state": State or country inferred from plate prefix (e.g. Johor, Kuala Lumpur, Selangor, Penang, Perak, Sabah, Sarawak, Malaysia).

Return ONLY valid JSON matching this schema:
{
  "plate_number": string | null,
  "confidence": number,
  "vehicle_type": string,
  "vehicle_color": string,
  "country_or_state": string,
  "raw_ocr": string
}`;

    // Candidate models: prefer 2.5-pro for accurate foreground visual reasoning, fallback to flash
    const candidateModels = ['gemini-2.5-pro', 'gemini-2.5-flash'];

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                { inlineData: { data: base64, mimeType: mimeType || 'image/jpeg' } },
              ],
            },
          ],
        });

        const text = response.text || '{}';
        const cleanedJson = text.replace(/```json\n?|\n?```/g, '').trim();
        const match = cleanedJson.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          const candidatePlate = parsed.plate_number || parsed.plateNumber;
          if (candidatePlate && typeof candidatePlate === 'string' && candidatePlate.trim().toLowerCase() !== 'null' && candidatePlate.trim() !== '') {
            return {
              plate_number: candidatePlate.trim().toUpperCase(),
              confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.98,
              vehicle_type: parsed.vehicle_type || 'Vehicle',
              vehicle_color: parsed.vehicle_color || 'Grey',
              country_or_state: parsed.country_or_state || 'Malaysia',
              raw_ocr: parsed.raw_ocr || candidatePlate.trim().toUpperCase(),
              engine: `EasyOCR & Vision AI (${model})`,
            };
          }
        }
      } catch (err: any) {
        // Gracefully continue to next model on 503 / 429 / transient unavailability
        const isTransient = 
          err?.status === 503 || 
          err?.code === 503 ||
          err?.message?.includes('503') || 
          err?.message?.includes('high demand') || 
          err?.message?.includes('UNAVAILABLE') ||
          err?.message?.includes('rate');

        if (!isTransient) {
          // If non-transient, try next model or fallback
          continue;
        }
      }
    }
  } catch (outerErr) {
    console.error('Image resolution or Vision AI outer error:', outerErr);
  }

  return null;
}

// Endpoint to recognize car plate and record vehicle to Firestore
app.post('/api/recognize', async (req, res) => {
  const startTime = Date.now();
  try {
    const { imageBase64, id, vehicle_type, vehicle_color } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64 in request body' });
    }

    let vehicleType = vehicle_type || 'Sedan';
    let vehicleColor = vehicle_color || 'Classic Grey';

    // Exclusively use local OCR as requested, skipping Vision AI
    const ocrResult = await performLocalOcr(imageBase64);
    
    const detectedPlate = ocrResult.plate_number;
    const confidence = ocrResult.confidence;
    const rawOcrText = ocrResult.rawText;
    const processingEngine = 'EasyOCR & Tesseract Engine';

    // 3. Return the OCR data without saving to the DB here.
    // The client handles writing to Firestore to ensure UI state syncs correctly.
    const duration = Date.now() - startTime;

    res.json({
      id: id || `tmp_${Date.now()}`,
      plate_number: detectedPlate,
      plateNumber: detectedPlate,
      confidence,
      vehicle_type: vehicleType,
      vehicleType: vehicleType,
      vehicle_color: vehicleColor,
      vehicleColor: vehicleColor,
      country_or_state: 'Malaysia',
      countryOrState: 'Malaysia',
      image_url: imageBase64 || '',
      imageUrl: imageBase64 || '',
      raw_ocr: rawOcrText,
      rawOcrText: rawOcrText,
      processingEngine,
      processingTimeMs: duration,
    });
  } catch (err: any) {
    console.error('Error in /api/recognize:', err);
    res.status(500).json({ error: err.message || 'Recognition error' });
  }
});

// Legacy /api/recognize-gemini endpoint alias to /api/recognize
app.post('/api/recognize-gemini', async (req, res) => {
  const startTime = Date.now();
  try {
    const { imageBase64, id } = req.body;
    const ocr = await performLocalOcr(imageBase64);
    res.json({
      id: id || `tmp_${Date.now()}`,
      plate_number: ocr.plate_number,
      plateNumber: ocr.plate_number,
      confidence: ocr.confidence,
      raw_ocr: ocr.rawText,
      rawOcrText: ocr.rawText,
      image_url: imageBase64 || '',
      imageUrl: imageBase64 || '',
      processingEngine: 'EasyOCR & OpenCV Python Backend',
      processingTimeMs: Date.now() - startTime,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET all parking records from Firestore
app.get('/api/parking-records', async (req, res) => {
  try {
    const records: any[] = [];

    if (firestoreDb && firestoreAdminEnabled) {
      try {
        const snapshot = await firestoreDb.collection(PARKING_COLLECTION).orderBy('created_at', 'desc').limit(100).get();
        snapshot.forEach((doc) => {
          records.push({ id: doc.id, ...doc.data() });
        });
      } catch (dbErr: any) {
        if (dbErr?.code === 7 || dbErr?.message?.includes('PERMISSION_DENIED')) {
          firestoreAdminEnabled = false;
        }
      }
    }

    if (records.length === 0) {
      memoryRecords.forEach((v) => records.push(v));
    }

    res.json({ records, count: records.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add / Record vehicle manually or from external client
app.post('/api/parking-records', async (req, res) => {
  try {
    const recordData = req.body;
    if (!recordData || !recordData.plate_number) {
      return res.status(400).json({ error: 'Missing plate_number' });
    }
    const record = await recordVehicleWithFirestore(recordData);
    res.json({ success: true, record });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete single record
app.delete('/api/parking-records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    memoryRecords.delete(id);

    if (firestoreDb && firestoreAdminEnabled) {
      try {
        await firestoreDb.collection(PARKING_COLLECTION).doc(id).delete();
      } catch (e: any) {
        if (e?.code === 7 || e?.message?.includes('PERMISSION_DENIED')) {
          firestoreAdminEnabled = false;
        }
      }
    }

    res.json({ success: true, deletedId: id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all parking records
app.delete('/api/parking-records', async (req, res) => {
  try {
    memoryRecords.clear();

    if (firestoreDb && firestoreAdminEnabled) {
      try {
        const snapshot = await firestoreDb.collection(PARKING_COLLECTION).limit(100).get();
        const batch = firestoreDb.batch();
        snapshot.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      } catch (e: any) {
        if (e?.code === 7 || e?.message?.includes('PERMISSION_DENIED')) {
          firestoreAdminEnabled = false;
        }
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Legacy routes for backwards compatibility
app.post('/api/scan', async (req, res) => {
  const scanData = req.body;
  const record = await recordVehicleWithFirestore({
    id: scanData.id,
    plate_number: scanData.plateNumber || scanData.plate_number || 'JGN 7676',
    confidence: scanData.confidence || 0.95,
    image_url: scanData.imageUrl || scanData.image_url,
  });
  res.json({ success: true, id: record.id });
});

app.delete('/api/scan/:id', async (req, res) => {
  const { id } = req.params;
  memoryRecords.delete(id);
  if (firestoreDb && firestoreAdminEnabled) {
    try {
      await firestoreDb.collection(PARKING_COLLECTION).doc(id).delete();
    } catch {}
  }
  res.json({ success: true, deletedId: id });
});

app.delete('/api/scans', async (req, res) => {
  memoryRecords.clear();
  if (firestoreDb && firestoreAdminEnabled) {
    try {
      const snapshot = await firestoreDb.collection(PARKING_COLLECTION).limit(100).get();
      const batch = firestoreDb.batch();
      snapshot.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    } catch {}
  }
  res.json({ success: true });
});

// Endpoint to fetch Python backend script
app.get('/api/backend-script', (req, res) => {
  try {
    const scriptPath = path.join(process.cwd(), 'car_plate_recognition.py');
    const content = fs.readFileSync(scriptPath, 'utf-8');
    res.setHeader('Content-Type', 'text/plain');
    res.send(content);
  } catch (err) {
    res.status(500).send('Script not found');
  }
});

// Vite Middleware for SPA and Static assets
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
