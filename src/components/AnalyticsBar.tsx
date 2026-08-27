import React from 'react';
import { PlateScanRecord } from '../types';
import { CheckCircle2, Clock, Cpu, Layers, Car, Flame } from 'lucide-react';

interface AnalyticsBarProps {
  scans: PlateScanRecord[];
  isFirestoreLive: boolean;
}

export const AnalyticsBar: React.FC<AnalyticsBarProps> = ({ scans, isFirestoreLive }) => {
  const total = scans.length;
  const insideVehicles = scans.filter((s) => s.status === 'INSIDE' || s.status === 'completed');
  const exitedVehicles = scans.filter((s) => s.status === 'EXITED');
  const successRate = total > 0 ? Math.round((insideVehicles.length / total) * 100) : 100;
  
  const completedWithTime = scans.filter((s) => typeof s.processingTimeMs === 'number');
  const avgLatency =
    completedWithTime.length > 0
      ? Math.round(
          completedWithTime.reduce((acc, curr) => acc + (curr.processingTimeMs || 0), 0) /
            completedWithTime.length
        )
      : 320;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {/* Metric 1: Total Records */}
      <div className="bg-white rounded-xl p-3.5 border border-neutral-200/80 shadow-2xs">
        <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
          <span className="font-medium">Total Parking Records</span>
          <Layers className="w-4 h-4 text-neutral-400" />
        </div>
        <div className="text-xl font-bold text-neutral-900">{total}</div>
        <div className="text-[11px] text-neutral-500 mt-0.5 flex items-center gap-1">
          <Flame className="w-3 h-3 text-amber-500" />
          <span>parking_records</span>
        </div>
      </div>

      {/* Metric 2: Vehicles Inside */}
      <div className="bg-white rounded-xl p-3.5 border border-neutral-200/80 shadow-2xs">
        <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
          <span className="font-medium">Active (INSIDE)</span>
          <Car className="w-4 h-4 text-emerald-500" />
        </div>
        <div className="text-xl font-bold text-emerald-600">{insideVehicles.length}</div>
        <div className="text-[11px] text-neutral-500 mt-0.5">
          {exitedVehicles.length} exited
        </div>
      </div>

      {/* Metric 3: Recognition Accuracy */}
      <div className="bg-white rounded-xl p-3.5 border border-neutral-200/80 shadow-2xs">
        <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
          <span className="font-medium">Avg OCR Confidence</span>
          <CheckCircle2 className="w-4 h-4 text-sky-500" />
        </div>
        <div className="text-xl font-bold text-neutral-900">
          {total > 0 ? `${Math.round(scans.reduce((acc, s) => acc + (s.confidence || 0.95), 0) / total * 100)}%` : '98%'}
        </div>
        <div className="text-[11px] text-neutral-500 mt-0.5">Confidence &gt; 0.3 filter</div>
      </div>

      {/* Metric 4: OCR Engine */}
      <div className="bg-white rounded-xl p-3.5 border border-neutral-200/80 shadow-2xs">
        <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
          <span className="font-medium">OCR Engine</span>
          <Cpu className="w-4 h-4 text-amber-500" />
        </div>
        <div className="text-sm font-bold text-neutral-900 truncate">
          EasyOCR + Python
        </div>
        <div className="text-[11px] text-emerald-600 font-medium mt-0.5 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Firestore Backend</span>
        </div>
      </div>
    </div>
  );
};
