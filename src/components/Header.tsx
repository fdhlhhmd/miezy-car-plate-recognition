import React from 'react';
import { 
  Car, 
  Flame, 
  Code2, 
  Settings2, 
  CheckCircle2
} from 'lucide-react';

interface HeaderProps {
  isFirestoreLive: boolean;
  onOpenPythonScript: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isFirestoreLive,
  onOpenPythonScript,
  onOpenSettings,
}) => {
  return (
    <header className="border-b border-neutral-200 bg-white/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center shadow-xs">
            <Car className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-neutral-900">
                Miezy's Car Plate Recognition
              </h1>
              <span className="text-[11px] font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Python & Firestore</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <span className="flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span>Firestore Collection: <strong className="text-neutral-700 font-medium">parking_records</strong></span>
              </span>
              <span className="text-neutral-300">•</span>
              <span className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${isFirestoreLive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                <span className="text-neutral-600 font-medium">
                  {isFirestoreLive ? 'Live Sync Active' : 'Synced'}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5">
          {/* Backend Script Viewer */}
          <button
            onClick={onOpenPythonScript}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-800 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 rounded-lg transition-colors shadow-2xs"
            title="View & Download car_plate_recognition.py Backend Script"
          >
            <Code2 className="w-3.5 h-3.5 text-neutral-700" />
            <span className="hidden sm:inline">Backend Script (.py)</span>
            <span className="sm:hidden">Script</span>
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
            title="Firebase Firestore Settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
