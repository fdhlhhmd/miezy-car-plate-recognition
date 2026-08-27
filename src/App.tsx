import React, { useState, useEffect, useCallback } from 'react';
import { PlateScanRecord } from './types';
import { 
  subscribeToPlateScans, 
  createPlateScanRecord, 
  updatePlateScanRecord, 
  deletePlateScanRecord,
  clearAllPlateScans,
  togglePlateStatus,
  normalizePlateNumber
} from './lib/firebase';
import { performClientSideOcr } from './lib/ocrEngine';
import { Header } from './components/Header';
import { AnalyticsBar } from './components/AnalyticsBar';
import { UploadSection } from './components/UploadSection';
import { LivePlateFeed } from './components/LivePlateFeed';
import { PlateDetailModal } from './components/PlateDetailModal';
import { PythonScriptModal } from './components/PythonScriptModal';
import { FirebaseSettingsModal } from './components/FirebaseSettingsModal';
import { LogIn, LogOut, X, AlertTriangle } from 'lucide-react';

export default function App() {
  const [scans, setScans] = useState<PlateScanRecord[]>([]);
  const [isFirestoreLive, setIsFirestoreLive] = useState(false);
  const [selectedScan, setSelectedScan] = useState<PlateScanRecord | null>(null);
  const [isPythonScriptOpen, setIsPythonScriptOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toggleToast, setToggleToast] = useState<{
    plate: string;
    status: 'INSIDE' | 'EXITED';
    action: 'ENTRY' | 'EXIT';
    isExisting: boolean;
  } | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // Auto-dismiss error toast after 8 seconds
  useEffect(() => {
    if (errorToast) {
      const timer = setTimeout(() => setErrorToast(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [errorToast]);

  // Auto-dismiss status change toast after 6 seconds
  useEffect(() => {
    if (toggleToast) {
      const timer = setTimeout(() => setToggleToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toggleToast]);

  // Subscribe to real-time Firestore synchronization for parking_records
  const initSubscriptions = useCallback(() => {
    const unsubscribeScans = subscribeToPlateScans((records, isRealtime) => {
      setScans(records);
      setIsFirestoreLive(isRealtime);
    });

    return () => {
      unsubscribeScans();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = initSubscriptions();
    return () => unsubscribe();
  }, [initSubscriptions]);

  // Sync selected scan if records update in the background
  useEffect(() => {
    if (selectedScan) {
      const cleanTarget = normalizePlateNumber(selectedScan.plate_number || selectedScan.plateNumber);
      const updated = scans.find((s) => s.id === selectedScan.id || normalizePlateNumber(s.plate_number || s.plateNumber) === cleanTarget);
      if (updated) {
        setSelectedScan(updated);
      }
    }
  }, [scans]);

  // Handle new vehicle scan submitted from Upload Section (Camera, File upload, or Sample click)
  const handleScanSubmitted = async (scanData: Partial<PlateScanRecord>) => {
    setIsProcessing(true);
    try {
      const img = scanData.image_url || scanData.imageUrl || '';
      let recognitionResult: any = null;

      if (img) {
        try {
          const res = await fetch('/api/recognize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: img,
              vehicle_type: scanData.vehicle_type || scanData.vehicleType || 'Sedan',
              vehicle_color: scanData.vehicle_color || scanData.vehicleColor || 'Classic Grey',
            }),
          });
          if (res.ok) {
            recognitionResult = await res.json();
          }
        } catch (serverErr) {
          console.warn('Backend server recognition warning, running client fallback:', serverErr);
        }
      }

      if (!recognitionResult && img) {
        const ocrResult = await performClientSideOcr(img);
        recognitionResult = {
          plate_number: ocrResult.plateNumber,
          plateNumber: ocrResult.plateNumber,
          confidence: ocrResult.confidence,
          raw_ocr: ocrResult.rawOcrText,
        };
      }

      // Handle OCR / Vision result
      let detectedPlate = recognitionResult?.plate_number || recognitionResult?.plateNumber;

      if (!detectedPlate || detectedPlate === 'UNREADABLE' || detectedPlate === 'UNKNOWN') {
        setErrorToast('Could not detect a legible license plate in this image. Please upload a clear, well-lit photo showing the vehicle registration number.');
        return;
      }
      
      // Always save to Firestore via the frontend client to guarantee UI synchronization
      // and prevent double-writing.
      const saveResult = await createPlateScanRecord({
        ...scanData,
        ...recognitionResult,
        plate_number: detectedPlate,
        plateNumber: detectedPlate,
        image_url: img || recognitionResult?.image_url || recognitionResult?.imageUrl,
        imageUrl: img || recognitionResult?.image_url || recognitionResult?.imageUrl,
      });

      setToggleToast({
        plate: detectedPlate,
        status: saveResult.status,
        action: saveResult.action || (saveResult.status === 'EXITED' ? 'EXIT' : 'ENTRY'),
        isExisting: saveResult.action === 'EXIT' || saveResult.status === 'EXITED',
      });
    } catch (err) {
      console.error('Error submitting scan record:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Direct toggle status for a vehicle (INSIDE <-> EXITED)
  const handleToggleStatus = async (scan: PlateScanRecord) => {
    const newStatus = await togglePlateStatus(scan.id);
    const plate = scan.plate_number || scan.plateNumber || 'Vehicle';
    setToggleToast({
      plate,
      status: newStatus,
      action: newStatus === 'INSIDE' ? 'ENTRY' : 'EXIT',
      isExisting: true,
    });
  };

  // Update existing parking record in Firestore
  const handleUpdateScan = async (id: string, updates: Partial<PlateScanRecord>) => {
    await updatePlateScanRecord(id, updates);
    if (selectedScan && selectedScan.id === id) {
      setSelectedScan((prev) => (prev ? { ...prev, ...updates } : null));
    }
  };

  // Delete record from Firestore
  const handleDeleteScan = async (id: string) => {
    setScans((prev) => prev.filter((s) => s.id !== id));
    if (selectedScan && selectedScan.id === id) {
      setSelectedScan(null);
    }
    await deletePlateScanRecord(id);
  };

  // Clear all records from Firestore and local storage
  const handleClearAllScans = async () => {
    setScans([]);
    setSelectedScan(null);
    await clearAllPlateScans();
  };

  // Reprocess existing record
  const handleReprocessScan = async (scan: PlateScanRecord) => {
    await updatePlateScanRecord(scan.id, { status: 'processing' });
    const img = scan.image_url || scan.imageUrl;
    if (!img) return;

    try {
      const res = await fetch('/api/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: scan.id,
          imageBase64: img,
        }),
      });
      const result = await res.json();
      await updatePlateScanRecord(scan.id, {
        ...result,
        plate_number: result.plate_number || result.plateNumber || scan.plate_number,
        plateNumber: result.plate_number || result.plateNumber || scan.plate_number,
        image_url: img || result.image_url || result.imageUrl,
        imageUrl: img || result.image_url || result.imageUrl,
      });
    } catch (err) {
      console.warn('Reprocess server error, running client OCR:', err);
      const ocrResult = await performClientSideOcr(img);
      await updatePlateScanRecord(scan.id, {
        ...ocrResult,
        plate_number: ocrResult.plateNumber,
        plateNumber: ocrResult.plateNumber,
        image_url: img,
        imageUrl: img,
      });
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100/70 text-neutral-900 flex flex-col font-sans selection:bg-amber-200 selection:text-neutral-900">
      {/* Navigation Header */}
      <Header
        isFirestoreLive={isFirestoreLive}
        onOpenPythonScript={() => setIsPythonScriptOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Real-time Error Toast Banner */}
        {errorToast && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 shadow-md flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-3 duration-300">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-100 text-red-700">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-red-900 text-sm">Scan Failed</h3>
                <p className="text-sm text-red-700 mt-0.5">{errorToast}</p>
              </div>
            </div>
            <button
              onClick={() => setErrorToast(null)}
              className="p-1.5 text-red-400 hover:text-red-700 hover:bg-red-100 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Real-time Status Toggle Toast Banner */}
        {toggleToast && (
          <div className="mb-6 bg-white border border-neutral-200 rounded-2xl p-4 shadow-md flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-3 duration-300">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${
                toggleToast.status === 'INSIDE' 
                  ? 'bg-emerald-100 text-emerald-700' 
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {toggleToast.status === 'INSIDE' ? (
                  <LogIn className="w-5 h-5" />
                ) : (
                  <LogOut className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm bg-neutral-900 text-amber-300 px-2 py-0.5 rounded">
                    {toggleToast.plate}
                  </span>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    toggleToast.status === 'INSIDE'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-neutral-800 text-neutral-200'
                  }`}>
                    {toggleToast.status}
                  </span>
                  <span className="text-xs text-neutral-500 font-medium hidden sm:inline">
                    (Auto-Toggled &amp; Deduplicated)
                  </span>
                </div>
                <p className="text-xs text-neutral-600 mt-0.5">
                  {toggleToast.status === 'EXITED'
                    ? `Existing vehicle with status INSIDE detected. Status overwritten to EXITED.`
                    : `Vehicle detected. Status updated to INSIDE in Firestore collection parking_records.`}
                  <span className="text-neutral-400 ml-1.5 font-medium">Single unique record kept (No duplicates).</span>
                </p>
              </div>
            </div>

            <button
              onClick={() => setToggleToast(null)}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* KPI Analytics */}
        <AnalyticsBar scans={scans} isFirestoreLive={isFirestoreLive} />

        {/* Vehicle Image Upload & Camera Capture */}
        <UploadSection
          onScanSubmitted={handleScanSubmitted}
          isProcessing={isProcessing}
        />

        {/* Live Synced Parking Records & Plate Feed */}
        <LivePlateFeed
          scans={scans}
          onSelectScan={(scan) => setSelectedScan(scan)}
          onDeleteScan={handleDeleteScan}
          onReprocessScan={handleReprocessScan}
          onClearAll={handleClearAllScans}
          onToggleStatus={handleToggleStatus}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200/80 bg-white py-6 text-center text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong>Miezy's Car Plate Recognition</strong> • EasyOCR &amp; Python Firestore Backend
          </div>
          <div className="flex items-center gap-3">
            <span>Project: <code className="text-neutral-700 font-mono">car-plate-recognition-48cf1</code></span>
            <span className="text-neutral-300">•</span>
            <span>Collection: <code className="text-neutral-700 font-mono">parking_records</code></span>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="text-amber-600 hover:underline"
            >
              Firestore Config
            </button>
            <button
              onClick={() => setIsPythonScriptOpen(true)}
              className="text-amber-600 hover:underline"
            >
              Python Script (.py)
            </button>
          </div>
        </div>
      </footer>

      {/* Modal Dialogs */}
      {selectedScan && (
        <PlateDetailModal
          scan={selectedScan}
          onClose={() => setSelectedScan(null)}
          onUpdate={handleUpdateScan}
          onDelete={handleDeleteScan}
          onToggleStatus={handleToggleStatus}
        />
      )}

      {isPythonScriptOpen && (
        <PythonScriptModal onClose={() => setIsPythonScriptOpen(false)} />
      )}

      {isSettingsOpen && (
        <FirebaseSettingsModal
          onClose={() => setIsSettingsOpen(false)}
          onRefresh={() => initSubscriptions()}
        />
      )}
    </div>
  );
}
