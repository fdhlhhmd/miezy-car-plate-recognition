import React, { useState } from 'react';
import { 
  X, 
  Flame, 
  Save, 
  Check, 
  RefreshCw, 
  Database, 
  ShieldCheck,
} from 'lucide-react';
import { getStoredFirebaseConfig, saveStoredFirebaseConfig } from '../lib/firebase';

interface FirebaseSettingsModalProps {
  onClose: () => void;
  onRefresh: () => void;
}

export const FirebaseSettingsModal: React.FC<FirebaseSettingsModalProps> = ({
  onClose,
  onRefresh,
}) => {
  const current = getStoredFirebaseConfig();
  const [projectId, setProjectId] = useState(current.projectId || 'car-plate-recognition-48cf1');
  const [apiKey, setApiKey] = useState(current.apiKey || '');
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleSave = () => {
    saveStoredFirebaseConfig({
      projectId,
      apiKey,
    });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onRefresh();
    }, 1000);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (data.status === 'ok') {
        setTestResult(`✅ Server and Firestore service verified for project '${data.projectId}' (${data.collection})`);
      } else {
        setTestResult('⚠️ Backend health returned warning.');
      }
    } catch (e: any) {
      setTestResult(`❌ Connection check error: ${e.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-neutral-200 shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-neutral-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
              <Flame className="w-5 h-5 fill-amber-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900">
                Firebase Firestore Settings
              </h3>
              <p className="text-xs text-neutral-500">
                Database synchronization parameters
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/50 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-neutral-700 mb-1">
              Firebase Project ID
            </label>
            <input
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full font-mono px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              placeholder="car-plate-recognition-48cf1"
            />
            <span className="text-[11px] text-neutral-500 mt-1 block">
              Target Project: <code className="font-mono text-neutral-700">car-plate-recognition-48cf1</code>
            </span>
          </div>

          <div>
            <label className="block font-semibold text-neutral-700 mb-1">
              Firestore Collection Name
            </label>
            <input
              type="text"
              disabled
              value="parking_records"
              className="w-full font-mono px-3 py-2 border border-neutral-200 rounded-lg bg-neutral-100 text-neutral-600 font-bold"
            />
            <span className="text-[11px] text-neutral-500 mt-1 block">
              Target Firestore collection populated by EasyOCR backend Python script (<code className="font-mono text-neutral-700">db.collection('parking_records')</code>).
            </span>
          </div>

          <div>
            <label className="block font-semibold text-neutral-700 mb-1">
              Client Web API Key (Optional)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full font-mono px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              placeholder="AIzaSy..."
            />
            <span className="text-[11px] text-neutral-500 mt-1 block">
              From Firebase Console &gt; Project Settings &gt; General &gt; Web apps.
            </span>
          </div>

          {/* Test connection result */}
          {testResult && (
            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-neutral-800 text-xs">
              {testResult}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="px-3.5 py-1.5 text-neutral-700 hover:bg-neutral-200 border border-neutral-300 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
            <span>{testing ? 'Testing...' : 'Test Backend Connection'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 text-neutral-600 hover:bg-neutral-200/60 rounded-lg text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 bg-neutral-900 hover:bg-black text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
            >
              {saved ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 text-amber-400" />
                  <span>Save Config</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
