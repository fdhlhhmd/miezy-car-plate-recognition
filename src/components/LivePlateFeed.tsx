import React, { useState } from 'react';
import { PlateScanRecord } from '../types';
import { 
  Search, 
  Trash2, 
  Eye, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  RefreshCw,
  Car,
  Flame,
  ArrowRightCircle,
  LogIn,
  LogOut,
  CheckCircle2
} from 'lucide-react';

interface LivePlateFeedProps {
  scans: PlateScanRecord[];
  onSelectScan: (scan: PlateScanRecord) => void;
  onDeleteScan: (id: string) => void;
  onReprocessScan: (scan: PlateScanRecord) => void;
  onClearAll?: () => void;
  onToggleStatus?: (scan: PlateScanRecord) => void;
}

export const LivePlateFeed: React.FC<LivePlateFeedProps> = ({
  scans,
  onSelectScan,
  onDeleteScan,
  onReprocessScan,
  onClearAll,
  onToggleStatus,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'INSIDE' | 'EXITED'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDeletingId(id);
    try {
      await onDeleteScan(id);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredScans = scans.filter((scan) => {
    const plate = scan.plate_number || scan.plateNumber || '';
    const vType = scan.vehicle_type || scan.vehicleType || '';
    const state = scan.country_or_state || scan.countryOrState || '';
    const rawOcr = scan.raw_ocr || scan.rawOcrText || '';

    const matchesSearch =
      !searchTerm ||
      plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      state.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rawOcr.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterStatus === 'all') return true;
    if (filterStatus === 'INSIDE') return scan.status === 'INSIDE' || scan.status === 'completed';
    if (filterStatus === 'EXITED') return scan.status === 'EXITED';
    return true;
  });

  const formatEntryTime = (timeVal?: string | number) => {
    if (!timeVal) return 'Just now';
    try {
      const d = typeof timeVal === 'number' ? new Date(timeVal) : new Date(timeVal);
      const diffMs = Date.now() - d.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return d.toLocaleDateString();
    } catch {
      return String(timeVal);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs p-5 md:p-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-neutral-100">
        <div>
          <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
            <span>Parking Records & Plate Detection Feed</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 font-semibold border border-neutral-200">
              {filteredScans.length} of {scans.length}
            </span>
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1">
            <Flame className="w-3 h-3 text-amber-500" />
            <span>Synced in real-time with Firestore collection <code className="font-mono text-neutral-700 font-medium">parking_records</code></span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-lg overflow-x-auto">
            {(['all', 'INSIDE', 'EXITED'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1 text-xs font-medium rounded-md uppercase tracking-wider transition-all whitespace-nowrap ${
                  filterStatus === status
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Clear All History Button */}
          {onClearAll && scans.length > 0 && (
            confirmClearAll ? (
              <div className="flex items-center gap-1 bg-red-50 border border-red-200 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                    setConfirmClearAll(false);
                  }}
                  className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-[11px] font-semibold transition"
                >
                  Confirm Clear
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="px-1.5 py-0.5 text-neutral-600 hover:bg-neutral-200 rounded text-[11px] transition"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                className="px-2.5 py-1 text-xs font-medium text-neutral-500 hover:text-red-600 hover:bg-red-50/60 border border-transparent hover:border-red-200 rounded-lg transition flex items-center gap-1"
                title="Clear all records from Firestore and local state"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Clear All</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Search Input */}
      <div className="relative mb-5">
        <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by license plate number (e.g. JGN 7676, VAA 8829), vehicle type, state..."
          className="w-full pl-10 pr-4 py-2 bg-neutral-50 hover:bg-neutral-100/70 focus:bg-white border border-neutral-200 rounded-xl text-xs text-neutral-800 placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* Scans Grid / List */}
      {filteredScans.length === 0 ? (
        <div className="border border-neutral-200 rounded-xl p-12 text-center bg-neutral-50/50">
          <Car className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
          <h4 className="text-sm font-semibold text-neutral-700">No Vehicle Records Found</h4>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto mt-1">
            {searchTerm
              ? `No records matching "${searchTerm}". Try a different search term.`
              : 'Upload a car image above or pick a sample Malaysian vehicle to trigger OCR detection.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredScans.map((scan) => {
            const plate = scan.plate_number || scan.plateNumber || 'Processing...';
            const isInside = scan.status === 'INSIDE' || scan.status === 'completed';
            const isPending = scan.status === 'pending' || scan.status === 'processing';
            const isFailed = scan.status === 'failed';
            const img = scan.image_url || scan.imageUrl;
            const vType = scan.vehicle_type || scan.vehicleType || 'Sedan';
            const vColor = scan.vehicle_color || scan.vehicleColor || 'Classic Grey';
            const vState = scan.country_or_state || scan.countryOrState || 'Malaysia';
            const conf = scan.confidence ? Math.round(scan.confidence * 100) : 95;

            return (
              <div
                key={scan.id}
                onClick={() => onSelectScan(scan)}
                className="group relative bg-white border border-neutral-200 hover:border-neutral-400 rounded-xl p-4 shadow-2xs hover:shadow-xs transition cursor-pointer flex flex-col justify-between"
              >
                <div>
                  {/* Top image and status badge */}
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-neutral-900 mb-3 border border-neutral-100">
                    {img ? (
                      <img
                        src={img}
                        alt={`Vehicle ${plate}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-500">
                        <Car className="w-8 h-8" />
                      </div>
                    )}

                    {/* Status Badge */}
                    <div className="absolute top-2 right-2">
                      {isInside && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500 text-white shadow-xs flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          <span>INSIDE</span>
                        </span>
                      )}
                      {scan.status === 'EXITED' && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-neutral-800 text-neutral-300">
                          EXITED
                        </span>
                      )}
                      {isPending && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500 text-white flex items-center gap-1 animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Processing</span>
                        </span>
                      )}
                      {isFailed && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-600 text-white">
                          Failed
                        </span>
                      )}
                    </div>

                    {/* Malaysian Plate Overlay Card */}
                    <div className="absolute bottom-2 left-2 bg-black/90 backdrop-blur-xs border border-neutral-700 px-2.5 py-1 rounded-md shadow-md">
                      <div className="font-mono font-black text-amber-300 text-sm tracking-wider">
                        {plate}
                      </div>
                    </div>
                  </div>

                  {/* Metadata Row */}
                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-neutral-900 truncate">
                        {vType} • {vColor}
                      </span>
                      <span className="text-neutral-500 font-mono text-[11px]">
                        {conf}% Conf
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-neutral-500">
                      <span className="truncate">{vState}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatEntryTime(scan.entry_time || scan.created_at)}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div
                  className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectScan(scan)}
                      className="text-neutral-700 hover:text-neutral-950 font-semibold flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Details</span>
                    </button>

                    {onToggleStatus && (
                      <button
                        type="button"
                        onClick={() => onToggleStatus(scan)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition flex items-center gap-1 ${
                          isInside
                            ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/60'
                        }`}
                        title={isInside ? 'Change status to EXITED' : 'Change status to INSIDE'}
                      >
                        {isInside ? (
                          <>
                            <LogOut className="w-3 h-3 text-neutral-600" />
                            <span>Mark Exit</span>
                          </>
                        ) : (
                          <>
                            <LogIn className="w-3 h-3 text-emerald-600" />
                            <span>Re-Enter</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onReprocessScan(scan)}
                      className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded transition"
                      title="Re-run EasyOCR on image"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      disabled={deletingId === scan.id}
                      onClick={(e) => handleDelete(e, scan.id)}
                      className="p-1 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                      title="Delete record from Firestore"
                    >
                      {deletingId === scan.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
