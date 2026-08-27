import React, { useState, useEffect } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Download, 
  Terminal, 
  FileCode,
  Flame,
  Database,
  Play
} from 'lucide-react';

interface PythonScriptModalProps {
  onClose: () => void;
}

export const PythonScriptModal: React.FC<PythonScriptModalProps> = ({ onClose }) => {
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'script' | 'schema' | 'cli'>('script');

  useEffect(() => {
    fetch('/car_plate_recognition.py')
      .then((res) => res.text())
      .then((text) => setCode(text))
      .catch(() => {});
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPy = () => {
    const element = document.createElement('a');
    element.href = '/car_plate_recognition.py';
    element.download = 'car_plate_recognition.py';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-neutral-200 shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-neutral-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-neutral-800 text-amber-400 border border-neutral-700">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Python Backend & Firestore Integration
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Active Backend Script
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                EasyOCR + OpenCV + Firestore <code className="text-amber-300 font-mono">parking_records</code> Storage
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation & Actions */}
        <div className="bg-neutral-50 px-6 py-3 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 p-1 bg-neutral-200/70 rounded-lg">
            <button
              onClick={() => setActiveTab('script')}
              className={`px-3 py-1.5 font-medium rounded-md transition flex items-center gap-1.5 ${
                activeTab === 'script'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <FileCode className="w-3.5 h-3.5 text-amber-600" />
              <span>car_plate_recognition.py</span>
            </button>
            <button
              onClick={() => setActiveTab('schema')}
              className={`px-3 py-1.5 font-medium rounded-md transition flex items-center gap-1.5 ${
                activeTab === 'schema'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              <span>Firestore Schema (parking_records)</span>
            </button>
            <button
              onClick={() => setActiveTab('cli')}
              className={`px-3 py-1.5 font-medium rounded-md transition flex items-center gap-1.5 ${
                activeTab === 'cli'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Play className="w-3.5 h-3.5 text-indigo-500" />
              <span>CLI Usage</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 font-medium text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-lg shadow-2xs transition"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Copy Code</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadPy}
              className="flex items-center gap-1.5 px-3 py-1.5 font-medium text-neutral-900 bg-amber-400 hover:bg-amber-500 rounded-lg shadow-2xs transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .py</span>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6 bg-neutral-950 text-neutral-200 max-h-[520px] overflow-y-auto font-mono text-xs leading-relaxed">
          {activeTab === 'script' && (
            <pre className="overflow-x-auto whitespace-pre">
              <code>{code || 'Loading Python script...'}</code>
            </pre>
          )}

          {activeTab === 'schema' && (
            <div className="space-y-4 font-sans text-neutral-300">
              <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
                <div className="flex items-center gap-2 text-amber-400 font-semibold mb-2 font-mono text-sm">
                  <Database className="w-4 h-4" />
                  <span>Firestore Collection: parking_records</span>
                </div>
                <p className="text-xs text-neutral-400 mb-4">
                  Each vehicle entry detected by EasyOCR is automatically recorded in this schema:
                </p>
                <pre className="bg-neutral-950 p-4 rounded-lg text-emerald-400 font-mono text-xs overflow-x-auto border border-neutral-800">
{`{
  "plate_number": "JGN 7676",      // Cleaned Malaysian plate number
  "entry_time": "2026-08-27T03:20:00.000Z", // Timestamp of vehicle entry
  "status": "INSIDE",             // "INSIDE" or "EXITED"
  "confidence": 0.985,            // OCR model detection confidence
  "vehicle_type": "Sedan",        // Vehicle class
  "vehicle_color": "Grey",        // Vehicle body color
  "created_at": "2026-08-27T03:20:00.000Z"
}`}
                </pre>
              </div>

              <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
                <h4 className="text-sm font-semibold text-white mb-2">How it works:</h4>
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-neutral-400">
                  <li>EasyOCR detects alphanumeric text bounding boxes in the vehicle image.</li>
                  <li>Confidence filter drops low-quality noise (<code className="text-amber-300 font-mono">confidence &gt; 0.3</code>).</li>
                  <li>Special characters and whitespace are stripped using regex (<code className="text-amber-300 font-mono">re.sub(r'[^A-Z0-9]', '', text.upper())</code>).</li>
                  <li>Candidate with the highest confidence is selected and formatted.</li>
                  <li><code className="text-amber-300 font-mono">record_vehicle_with_firestore(plate_number)</code> executes and writes to Firestore.</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'cli' && (
            <div className="space-y-4 font-sans text-neutral-300">
              <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
                <h4 className="text-sm font-semibold text-white mb-2 font-mono flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-400" />
                  <span>Run locally on your machine</span>
                </h4>
                <div className="space-y-3 font-mono text-xs">
                  <div>
                    <span className="text-neutral-500"># 1. Install dependencies</span>
                    <pre className="bg-neutral-950 p-2.5 rounded-md text-amber-300 mt-1 border border-neutral-800">
pip install easyocr opencv-python-headless firebase-admin matplotlib pillow
                    </pre>
                  </div>

                  <div>
                    <span className="text-neutral-500"># 2. Run plate recognition on a vehicle image</span>
                    <pre className="bg-neutral-950 p-2.5 rounded-md text-amber-300 mt-1 border border-neutral-800">
python car_plate_recognition.py car_sample.jpg
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white border-t border-neutral-200 flex items-center justify-between">
          <span className="text-xs text-neutral-500 font-medium">
            File available at: <code className="font-mono text-neutral-800 font-semibold">/car_plate_recognition.py</code>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
