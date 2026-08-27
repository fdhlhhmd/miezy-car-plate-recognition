import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  Camera, 
  Image as ImageIcon, 
  RefreshCw, 
  X, 
  Check, 
  Zap,
  Info,
  Car
} from 'lucide-react';
import { PlateScanRecord } from '../types';

interface UploadSectionProps {
  onScanSubmitted: (scanData: Partial<PlateScanRecord>) => Promise<void>;
  isProcessing: boolean;
}

// Preset sample Malaysian vehicle images for pure OCR scanning testing (no prefilled plates or answers)
const SAMPLE_VEHICLES = [
  {
    id: 'sample-beetle',
    title: 'Vintage Beetle',
    imageUrl: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=800&q=80',
    description: 'Vehicle Image 1',
  },
  {
    id: 'sample-silver',
    title: 'Silver Compact Car',
    imageUrl: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80',
    description: 'Vehicle Image 2',
  },
  {
    id: 'sample-black',
    title: 'Black Sedan',
    imageUrl: 'https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80',
    description: 'Vehicle Image 3',
  },
  {
    id: 'sample-blue',
    title: 'Blue Compact SUV',
    imageUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80',
    description: 'Vehicle Image 4',
  },
];

export const UploadSection: React.FC<UploadSectionProps> = ({ onScanSubmitted, isProcessing }) => {
  const [imageQueue, setImageQueue] = useState<{ id: string, url: string, status: 'pending' | 'processing' | 'done' | 'error' }[]>([]);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(processFile);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (JPG, PNG, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const rawData = event.target?.result as string;
      if (!rawData) return;
      
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 1400; // Restored to 1400px to maintain OCR accuracy for distant plates
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.88);
          setImageQueue(prev => [...prev, { id: Math.random().toString(36).substring(7), url: compressed, status: 'pending' }]);
        } else {
          setImageQueue(prev => [...prev, { id: Math.random().toString(36).substring(7), url: rawData, status: 'pending' }]);
        }
      };
      img.onerror = () => {
        setImageQueue(prev => [...prev, { id: Math.random().toString(36).substring(7), url: rawData, status: 'pending' }]);
      };
      img.src = rawData;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(processFile);
    }
  };

  // Camera Handlers
  const startCamera = async () => {
    setCameraError(null);
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError(err.message || 'Camera access permission was denied or not supported.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
    setCameraError(null);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setImageQueue(prev => [...prev, { id: Math.random().toString(36).substring(7), url: dataUrl, status: 'pending' }]);
      stopCamera();
    }
  };

  const handleProcessQueue = async () => {
    const pendingItems = imageQueue.filter(img => img.status === 'pending');
    if (pendingItems.length === 0) return;
    
    setIsSubmitting(true);
    
    // Process one by one to prevent browser lag/overloading the server
    for (let i = 0; i < imageQueue.length; i++) {
      if (imageQueue[i].status !== 'pending') continue;
      
      setImageQueue(prev => prev.map((img, idx) => idx === i ? { ...img, status: 'processing' } : img));
      
      try {
        await onScanSubmitted({
          image_url: imageQueue[i].url,
          imageUrl: imageQueue[i].url,
          status: 'pending',
        });
        setImageQueue(prev => prev.map((img, idx) => idx === i ? { ...img, status: 'done' } : img));
      } catch (err) {
        console.error('Error processing scan:', err);
        setImageQueue(prev => prev.map((img, idx) => idx === i ? { ...img, status: 'error' } : img));
      }
    }
    
    setIsSubmitting(false);
  };

  const handleSelectSample = (sample: typeof SAMPLE_VEHICLES[0]) => {
    setImageQueue(prev => [...prev, { id: Math.random().toString(36).substring(7), url: sample.imageUrl, status: 'pending' }]);
  };

  const clearQueue = () => {
    setImageQueue([]);
  };

  const removeQueueItem = (id: string) => {
    setImageQueue(prev => prev.filter(img => img.id !== id));
  };

  const pendingCount = imageQueue.filter(img => img.status === 'pending').length;
  const isAllDone = imageQueue.length > 0 && pendingCount === 0;

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs p-5 md:p-6 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-neutral-100">
        <div>
          <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
            <span>Scan Vehicle & Record Entry</span>
            <span className="text-xs font-normal text-neutral-500">
              (Batch Processing Supported)
            </span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Upload multiple car photos, capture with camera, or select samples to queue.
          </p>
        </div>
      </div>

      {/* Main Upload / Camera / Preview Area */}
      {imageQueue.length === 0 && !isCameraActive && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center ${
            dragOver
              ? 'border-amber-500 bg-amber-50/50'
              : 'border-neutral-200 hover:border-neutral-400 bg-neutral-50/50 hover:bg-neutral-50'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            multiple
            className="hidden"
          />

          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-3">
            <UploadCloud className="w-6 h-6" />
          </div>

          <h3 className="text-sm font-bold text-neutral-900 mb-1">
            Click to upload car photos or drag & drop
          </h3>
          <p className="text-xs text-neutral-500 max-w-sm">
            Select multiple images to batch process (PNG, JPG, WEBP)
          </p>

          <div className="flex items-center gap-3 mt-4" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={startCamera}
              className="px-3.5 py-1.5 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Camera className="w-3.5 h-3.5 text-amber-400" />
              <span>Use Webcam / Camera</span>
            </button>
          </div>
        </div>
      )}

      {/* Camera Live Stream View */}
      {isCameraActive && (
        <div className="rounded-xl border border-neutral-300 bg-neutral-950 p-4 text-center mb-4">
          <div className="relative max-w-md mx-auto rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Guide overlay for license plate alignment */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-3/4 h-24 border-2 border-dashed border-amber-400/80 rounded-lg flex items-center justify-center">
                <span className="text-[10px] uppercase font-mono tracking-widest text-amber-300 bg-black/60 px-2 py-0.5 rounded">
                  Align Car Plate Inside Frame
                </span>
              </div>
            </div>
          </div>

          {cameraError && (
            <div className="mt-3 text-xs text-red-400 bg-red-950/40 border border-red-800/60 p-2 rounded-lg max-w-md mx-auto">
              {cameraError}
            </div>
          )}

          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              type="button"
              onClick={capturePhoto}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-500 text-neutral-900 font-bold text-xs rounded-lg transition flex items-center gap-2 shadow-sm"
            >
              <Camera className="w-4 h-4" />
              <span>Capture Image</span>
            </button>
            <button
              type="button"
              onClick={stopCamera}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-lg transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Queue View & Submit Action */}
      {imageQueue.length > 0 && (
        <div className="border border-neutral-200 rounded-xl p-4 bg-neutral-50 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Car className="w-4 h-4 text-amber-500" />
              <span>Batch Processing Queue ({imageQueue.length} {imageQueue.length === 1 ? 'image' : 'images'})</span>
            </h4>
            <div className="flex gap-2">
              {!isSubmitting && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-semibold px-3 py-1.5 bg-neutral-200 hover:bg-neutral-300 rounded-lg transition"
                >
                  Add More
                </button>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                multiple
                className="hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-4">
            {imageQueue.map((item) => (
              <div key={item.id} className={`relative rounded-lg overflow-hidden aspect-video border ${item.status === 'processing' ? 'border-amber-400 shadow-md' : 'border-neutral-200'}`}>
                <img
                  src={item.url}
                  alt="Vehicle Preview"
                  className={`w-full h-full object-cover ${item.status === 'done' ? 'opacity-50 grayscale' : ''}`}
                  referrerPolicy="no-referrer"
                />
                
                {/* Status Overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {item.status === 'processing' && (
                    <div className="bg-black/60 p-2 rounded-full backdrop-blur-sm">
                      <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                    </div>
                  )}
                  {item.status === 'done' && (
                    <div className="bg-emerald-500/80 p-1.5 rounded-full backdrop-blur-sm">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                  {item.status === 'error' && (
                    <div className="bg-red-500/80 p-1.5 rounded-full backdrop-blur-sm text-white text-[10px] font-bold">
                      Failed
                    </div>
                  )}
                </div>

                {item.status !== 'processing' && (
                  <button
                    type="button"
                    onClick={() => removeQueueItem(item.id)}
                    className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-black text-white rounded-full transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-neutral-200 mt-4">
            {!isAllDone ? (
              <button
                type="button"
                disabled={isSubmitting || isProcessing || pendingCount === 0}
                onClick={handleProcessQueue}
                className="px-5 py-2.5 bg-neutral-900 hover:bg-black text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-xs disabled:opacity-50"
              >
                {isSubmitting || isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                    <span>Processing {imageQueue.length - pendingCount + 1} of {imageQueue.length}...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>Scan {pendingCount} Pending {pendingCount === 1 ? 'Plate' : 'Plates'}</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={clearQueue}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>All Processed — Clear Queue</span>
              </button>
            )}

            {!isSubmitting && (
              <button
                type="button"
                onClick={clearQueue}
                className="px-3.5 py-2 text-xs font-semibold text-neutral-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sample Vehicle Photos for Live OCR Testing */}
      <div className="mt-5 pt-4 border-t border-neutral-100">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-neutral-400" />
            <span>Sample Test Images (Live OCR Scan)</span>
          </span>
          <span className="text-[11px] text-neutral-400">Click image to load into scanner</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SAMPLE_VEHICLES.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => handleSelectSample(v)}
              className="group text-left border border-neutral-200 hover:border-amber-400 rounded-xl p-2 bg-white hover:bg-amber-50/30 transition shadow-2xs overflow-hidden flex flex-col"
            >
              <div className="w-full aspect-video rounded-lg bg-neutral-100 overflow-hidden mb-2 relative">
                <img
                  src={v.imageUrl}
                  alt={v.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="font-semibold text-xs text-neutral-800 truncate">
                {v.title}
              </div>
              <div className="text-[11px] text-neutral-400 truncate">
                {v.description}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
