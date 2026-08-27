import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  Firestore,
  Unsubscribe,
} from 'firebase/firestore';
import { PlateScanRecord } from '../types';

// Default project configuration for Miezy's Car Plate Recognition
const DEFAULT_FIREBASE_CONFIG = {
  projectId: 'car-plate-recognition-48cf1',
  authDomain: 'car-plate-recognition-48cf1.firebaseapp.com',
  storageBucket: 'car-plate-recognition-48cf1.appspot.com',
  apiKey: typeof window !== 'undefined' ? (window as unknown as { __FIREBASE_API_KEY__?: string }).__FIREBASE_API_KEY__ || '' : '',
};

const LOCAL_STORAGE_CONFIG_KEY = 'miezy_firebase_custom_config';
const LOCAL_STORAGE_DATA_KEY = 'miezy_local_parking_records';
export const DEFAULT_COLLECTION = 'parking_records';

export function getStoredFirebaseConfig() {
  if (typeof window === 'undefined') return DEFAULT_FIREBASE_CONFIG;
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_CONFIG_KEY);
    if (saved) {
      return { ...DEFAULT_FIREBASE_CONFIG, ...JSON.parse(saved) };
    }
  } catch {
    // Ignore localStorage errors
  }
  return DEFAULT_FIREBASE_CONFIG;
}

export function saveStoredFirebaseConfig(config: Partial<typeof DEFAULT_FIREBASE_CONFIG>) {
  if (typeof window === 'undefined') return;
  try {
    const current = getStoredFirebaseConfig();
    localStorage.setItem(LOCAL_STORAGE_CONFIG_KEY, JSON.stringify({ ...current, ...config }));
  } catch (e) {
    console.error('Error saving firebase config to localStorage', e);
  }
}

let dbInstance: Firestore | null = null;
let isFirebaseConnected = false;

export function initializeFirebaseApp() {
  try {
    const config = getStoredFirebaseConfig();
    const apps = getApps();
    const app = apps.length > 0 ? getApp() : initializeApp(config);
    dbInstance = getFirestore(app);
    isFirebaseConnected = true;
    return { app, db: dbInstance, isConnected: true };
  } catch (err) {
    console.warn('Firebase client initialization note:', err);
    isFirebaseConnected = false;
    return { app: null, db: null, isConnected: false };
  }
}

export function getDb(): Firestore | null {
  if (!dbInstance) {
    initializeFirebaseApp();
  }
  return dbInstance;
}

// Initial Sample Scans
const SAMPLE_INITIAL_SCANS: PlateScanRecord[] = [
  {
    id: 'rec-sample-1',
    plate_number: 'JGN 7676',
    plateNumber: 'JGN 7676',
    entry_time: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    status: 'INSIDE',
    confidence: 0.98,
    vehicle_type: 'Classic Sedan',
    vehicleType: 'Classic Sedan',
    vehicle_color: 'Grey / Sage',
    vehicleColor: 'Grey / Sage',
    country_or_state: 'Johor, Malaysia',
    countryOrState: 'Johor, Malaysia',
    image_url: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=800&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=800&q=80',
    processingEngine: 'EasyOCR & OpenCV Python Backend',
    processingTimeMs: 340,
    raw_ocr: 'JGN 7676',
    rawOcrText: 'JGN 7676',
    notes: 'Classic Volkswagen Beetle with vintage Malaysian registration plate.',
    createdAt: Date.now() - 1000 * 60 * 8,
    created_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    id: 'rec-sample-2',
    plate_number: 'VAA 8829',
    plateNumber: 'VAA 8829',
    entry_time: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    status: 'INSIDE',
    confidence: 0.96,
    vehicle_type: 'Sedan',
    vehicleType: 'Sedan',
    vehicle_color: 'Silver',
    vehicleColor: 'Silver',
    country_or_state: 'Kuala Lumpur, Malaysia',
    countryOrState: 'Kuala Lumpur, Malaysia',
    image_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80',
    processingEngine: 'EasyOCR & OpenCV Python Backend',
    processingTimeMs: 290,
    raw_ocr: 'VAA 8829',
    rawOcrText: 'VAA 8829',
    notes: 'Clean reflection, high contrast embossed font.',
    createdAt: Date.now() - 1000 * 60 * 35,
    created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  },
  {
    id: 'rec-sample-3',
    plate_number: 'BKV 7711',
    plateNumber: 'BKV 7711',
    entry_time: new Date(Date.now() - 1000 * 60 * 70).toISOString(),
    status: 'INSIDE',
    confidence: 0.94,
    vehicle_type: 'SUV',
    vehicleType: 'SUV',
    vehicle_color: 'Deep Black',
    vehicleColor: 'Deep Black',
    country_or_state: 'Selangor, Malaysia',
    countryOrState: 'Selangor, Malaysia',
    image_url: 'https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80',
    processingEngine: 'EasyOCR & OpenCV Python Backend',
    processingTimeMs: 410,
    raw_ocr: 'BKV 7711',
    rawOcrText: 'BKV 7711',
    notes: 'Stored in parking_records collection.',
    createdAt: Date.now() - 1000 * 60 * 70,
    created_at: new Date(Date.now() - 1000 * 60 * 70).toISOString(),
  }
];

/**
 * Helper to normalize license plate for deduplication and matching
 */
export function normalizePlateNumber(plate?: string): string {
  if (!plate) return '';
  return plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

/**
 * Deduplicates records by license plate number, keeping the newest entry
 */
export function deduplicateRecords(records: PlateScanRecord[]): PlateScanRecord[] {
  const seen = new Set<string>();
  const unique: PlateScanRecord[] = [];

  for (const record of records) {
    const raw = record.plate_number || record.plateNumber || '';
    const norm = normalizePlateNumber(raw);
    if (!norm) {
      unique.push(record);
      continue;
    }
    if (!seen.has(norm)) {
      seen.add(norm);
      unique.push(record);
    }
  }
  return unique;
}

function getLocalRecords(): PlateScanRecord[] {
  if (typeof window === 'undefined') return SAMPLE_INITIAL_SCANS;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_DATA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return deduplicateRecords(parsed);
      }
    }
  } catch {
    // fallback
  }
  return deduplicateRecords(SAMPLE_INITIAL_SCANS);
}

function saveLocalRecords(records: PlateScanRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    const unique = deduplicateRecords(records);
    localStorage.setItem(LOCAL_STORAGE_DATA_KEY, JSON.stringify(unique));
  } catch {
    // ignore
  }
}

// Local reactive listener bus
const localListeners: Set<(records: PlateScanRecord[]) => void> = new Set();

function notifyLocalListeners() {
  const records = getLocalRecords();
  localListeners.forEach((cb) => cb(records));
}

/**
 * Normalizes document from Firestore to unified PlateScanRecord format
 */
function normalizeRecord(id: string, data: any): PlateScanRecord {
  const plate = data.plate_number || data.plateNumber || 'UNKNOWN';
  const entryTime = data.entry_time || data.entryTime || new Date().toISOString();
  const createdTime = typeof data.created_at === 'number' 
    ? data.created_at 
    : (data.created_at?.toMillis ? data.created_at.toMillis() : Date.now());

  return {
    id,
    plate_number: plate,
    plateNumber: plate,
    entry_time: entryTime,
    exit_time: data.exit_time || data.exitTime,
    status: data.status || 'INSIDE',
    last_action: data.last_action || (data.status === 'EXITED' ? 'EXIT' : 'ENTRY'),
    toggle_count: data.toggle_count || 1,
    confidence: data.confidence || 0.95,
    vehicle_type: data.vehicle_type || data.vehicleType || 'Sedan',
    vehicleType: data.vehicle_type || data.vehicleType || 'Sedan',
    vehicle_color: data.vehicle_color || data.vehicleColor || 'Classic Grey',
    vehicleColor: data.vehicle_color || data.vehicleColor || 'Classic Grey',
    country_or_state: data.country_or_state || data.countryOrState || 'Malaysia',
    countryOrState: data.country_or_state || data.countryOrState || 'Malaysia',
    image_url: data.image_url || data.imageUrl || '',
    imageUrl: data.image_url || data.imageUrl || '',
    raw_ocr: data.raw_ocr || data.rawOcrText || plate,
    rawOcrText: data.raw_ocr || data.rawOcrText || plate,
    processingEngine: data.processingEngine || 'EasyOCR & OpenCV Python Backend',
    processingTimeMs: data.processingTimeMs || 320,
    notes: data.notes,
    createdAt: createdTime,
    created_at: entryTime,
    updated_at: data.updated_at,
  };
}

/**
 * Real-time Firestore synchronization listener for collection 'parking_records'.
 */
export function subscribeToPlateScans(
  onUpdate: (records: PlateScanRecord[], isFromFirestore: boolean) => void,
  collectionName: string = DEFAULT_COLLECTION
): Unsubscribe {
  const db = getDb();

  if (db && isFirebaseConnected) {
    try {
      const colRef = collection(db, collectionName);
      const q = query(colRef, orderBy('created_at', 'desc'));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (!snapshot.empty) {
            const rawRecords = snapshot.docs.map((docSnap) => normalizeRecord(docSnap.id, docSnap.data()));
            const uniqueRecords = deduplicateRecords(rawRecords);
            onUpdate(uniqueRecords, true);
          } else {
            const local = getLocalRecords();
            onUpdate(local, true);
          }
        },
        (error) => {
          console.warn('Firestore subscription notice, using local synchronized state:', error);
          const local = getLocalRecords();
          onUpdate(local, false);
        }
      );

      return unsubscribe;
    } catch (e) {
      console.warn('Failed to attach Firestore snapshot listener:', e);
    }
  }

  // Fallback local subscription
  const callback = (records: PlateScanRecord[]) => onUpdate(records, false);
  localListeners.add(callback);
  onUpdate(getLocalRecords(), false);

  return () => {
    localListeners.delete(callback);
  };
}

/**
 * Add or toggle parking record in Firestore collection 'parking_records'
 * - If vehicle exists with status 'INSIDE' -> toggle/overwrite to 'EXITED'
 * - If vehicle exists with status 'EXITED' -> toggle/overwrite to 'INSIDE'
 * - Enforces zero duplicate plates in database (single record per plate)
 */
export async function createPlateScanRecord(
  record: Partial<PlateScanRecord>,
  collectionName: string = DEFAULT_COLLECTION
): Promise<{ id: string; status: 'INSIDE' | 'EXITED'; action: 'ENTRY' | 'EXIT' }> {
  const db = getDb();
  const rawPlate = record.plate_number || record.plateNumber || 'UNKNOWN';
  const cleanPlate = normalizePlateNumber(rawPlate) || 'UNKNOWN';
  const canonicalDocId = `plate_${cleanPlate}`;
  const now = new Date().toISOString();

  // 1. Look up existing record locally by normalized plate
  const localList = getLocalRecords();
  const existing = localList.find((r) => normalizePlateNumber(r.plate_number || r.plateNumber) === cleanPlate);

  // 2. Determine status toggle loop:
  // If exists with INSIDE -> EXITED. If exists with EXITED -> INSIDE.
  let nextStatus: 'INSIDE' | 'EXITED' = 'INSIDE';
  let nextAction: 'ENTRY' | 'EXIT' = 'ENTRY';
  let entryTime = existing?.entry_time || now;
  let exitTime = existing?.exit_time;

  if (record.status && (record.status === 'INSIDE' || record.status === 'EXITED')) {
    nextStatus = record.status;
    nextAction = nextStatus === 'INSIDE' ? 'ENTRY' : 'EXIT';
    if (nextStatus === 'INSIDE') entryTime = now;
    if (nextStatus === 'EXITED') exitTime = now;
  } else if (existing) {
    const cur = String(existing.status || '').toUpperCase();
    if (cur === 'INSIDE' || cur === 'COMPLETED') {
      nextStatus = 'EXITED';
      nextAction = 'EXIT';
      exitTime = now;
    } else {
      nextStatus = 'INSIDE';
      nextAction = 'ENTRY';
      entryTime = now;
    }
  } else {
    nextStatus = 'INSIDE';
    nextAction = 'ENTRY';
    entryTime = now;
  }

  const imageToKeep = record.image_url || record.imageUrl || existing?.image_url || existing?.imageUrl || '';

  const formattedRecord: PlateScanRecord = {
    id: canonicalDocId,
    plate_number: rawPlate,
    plateNumber: rawPlate,
    entry_time: entryTime,
    exit_time: exitTime,
    status: nextStatus,
    last_action: nextAction,
    toggle_count: (existing?.toggle_count || 0) + 1,
    confidence: record.confidence || existing?.confidence || 0.95,
    vehicle_type: record.vehicle_type || record.vehicleType || existing?.vehicle_type || existing?.vehicleType || 'Sedan',
    vehicleType: record.vehicle_type || record.vehicleType || existing?.vehicle_type || existing?.vehicleType || 'Sedan',
    vehicle_color: record.vehicle_color || record.vehicleColor || existing?.vehicle_color || existing?.vehicleColor || 'Classic Grey',
    vehicleColor: record.vehicle_color || record.vehicleColor || existing?.vehicle_color || existing?.vehicleColor || 'Classic Grey',
    country_or_state: record.country_or_state || record.countryOrState || 'Malaysia',
    countryOrState: record.country_or_state || record.countryOrState || 'Malaysia',
    image_url: imageToKeep,
    imageUrl: imageToKeep,
    raw_ocr: record.raw_ocr || record.rawOcrText || existing?.raw_ocr || rawPlate,
    rawOcrText: record.raw_ocr || record.rawOcrText || existing?.raw_ocr || rawPlate,
    processingEngine: record.processingEngine || 'EasyOCR & OpenCV Python Backend',
    createdAt: existing?.createdAt || Date.now(),
    created_at: existing?.created_at || entryTime,
    updated_at: now,
    updatedAt: Date.now(),
  };

  // 3. Update local state (remove any older duplicates with same plate, prepend updated record)
  const remaining = localList.filter((r) => normalizePlateNumber(r.plate_number || r.plateNumber) !== cleanPlate);
  saveLocalRecords([formattedRecord, ...remaining]);
  notifyLocalListeners();

  // 4. Write to Firestore collection 'parking_records' under deterministic docId
  if (db) {
    try {
      const docRef = doc(db, collectionName, canonicalDocId);
      await setDoc(docRef, {
        plate_number: formattedRecord.plate_number,
        entry_time: formattedRecord.entry_time,
        exit_time: formattedRecord.exit_time || null,
        status: formattedRecord.status,
        last_action: formattedRecord.last_action,
        toggle_count: formattedRecord.toggle_count,
        confidence: formattedRecord.confidence,
        vehicle_type: formattedRecord.vehicle_type,
        vehicle_color: formattedRecord.vehicle_color,
        country_or_state: formattedRecord.country_or_state,
        image_url: formattedRecord.image_url,
        raw_ocr: formattedRecord.raw_ocr,
        created_at: formattedRecord.created_at,
        updated_at: now,
      }, { merge: true });

      // Clean up any old duplicate document if existing ID differed from canonicalDocId
      if (existing?.id && existing.id !== canonicalDocId) {
        try {
          await deleteDoc(doc(db, collectionName, existing.id));
        } catch {}
      }
    } catch (err: any) {
      if (err?.code !== 'permission-denied') {
        console.warn('Firestore write note:', err?.message || err);
      }
    }
  }

  // 5. Inform backend server
  try {
    await fetch('/api/parking-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formattedRecord),
    });
  } catch {}

  return { id: canonicalDocId, status: nextStatus, action: nextAction };
}

/**
 * Toggle status of an existing car plate (INSIDE <-> EXITED)
 */
export async function togglePlateStatus(
  idOrPlate: string,
  collectionName: string = DEFAULT_COLLECTION
): Promise<'INSIDE' | 'EXITED'> {
  const localList = getLocalRecords();
  const clean = normalizePlateNumber(idOrPlate);
  const found = localList.find((r) => r.id === idOrPlate || normalizePlateNumber(r.plate_number || r.plateNumber) === clean);

  if (found) {
    const result = await createPlateScanRecord(
      {
        ...found,
        status: undefined, // trigger auto-toggle
      },
      collectionName
    );
    return result.status;
  }
  return 'INSIDE';
}

/**
 * Update an existing parking record
 */
export async function updatePlateScanRecord(
  id: string,
  updates: Partial<PlateScanRecord>,
  collectionName: string = DEFAULT_COLLECTION
): Promise<void> {
  const localList = getLocalRecords();
  const index = localList.findIndex((r) => r.id === id);
  if (index !== -1) {
    const existing = localList[index];
    const imageToKeep = updates.image_url || updates.imageUrl || existing.image_url || existing.imageUrl || '';
    localList[index] = {
      ...existing,
      ...updates,
      image_url: imageToKeep,
      imageUrl: imageToKeep,
      updatedAt: Date.now(),
    };
    saveLocalRecords(localList);
    notifyLocalListeners();
  }

  const db = getDb();
  if (db && isFirebaseConnected) {
    try {
      const docRef = doc(db, collectionName, id);
      const cleanUpdates: any = { ...updates, updated_at: new Date().toISOString() };
      if (!cleanUpdates.image_url && !cleanUpdates.imageUrl) {
        delete cleanUpdates.image_url;
        delete cleanUpdates.imageUrl;
      }
      await setDoc(docRef, cleanUpdates, { merge: true });
    } catch (err: any) {
      if (err?.code !== 'permission-denied') {
        console.warn('Firestore update notice:', err?.message || err);
      }
    }
  }
}

/**
 * Delete a parking record from Local Storage, Client SDK, and Server
 */
export async function deletePlateScanRecord(
  id: string,
  collectionName: string = DEFAULT_COLLECTION
): Promise<void> {
  const localList = getLocalRecords().filter((r) => r.id !== id);
  saveLocalRecords(localList);
  notifyLocalListeners();

  try {
    await fetch(`/api/parking-records/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (e) {
    console.warn('Server delete notice:', e);
  }

  const db = getDb();
  if (db) {
    try {
      const docRef = doc(db, collectionName, id);
      await deleteDoc(docRef);
    } catch (err: any) {
      if (err?.code !== 'permission-denied') {
        console.warn('Firestore delete note:', err?.message || err);
      }
    }
  }
}

/**
 * Clear all parking records
 */
export async function clearAllPlateScans(
  collectionName: string = DEFAULT_COLLECTION
): Promise<void> {
  saveLocalRecords([]);
  notifyLocalListeners();

  try {
    await fetch('/api/parking-records', {
      method: 'DELETE',
    });
  } catch (e) {
    console.warn('Server clear all notice:', e);
  }

  const db = getDb();
  if (db) {
    try {
      const colRef = collection(db, collectionName);
      const snapshot = await getDocs(colRef);
      const batchPromises = snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref));
      await Promise.all(batchPromises);
    } catch (err: any) {
      if (err?.code !== 'permission-denied') {
        console.warn('Firestore clear note:', err?.message || err);
      }
    }
  }
}
