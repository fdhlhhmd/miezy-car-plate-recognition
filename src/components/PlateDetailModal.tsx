import React, { useState } from 'react';
import { PlateScanRecord } from '../types';
import { 
  X, 
  Car, 
  CheckCircle, 
  Edit3, 
  Save, 
  Trash2, 
  Flame, 
  Copy, 
  Check
} from 'lucide-react';

interface PlateDetailModalProps {
  scan: PlateScanRecord;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<PlateScanRecord>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onToggleStatus?: (scan: PlateScanRecord) => void;
}

export const PlateDetailModal: React.FC<PlateDetailModalProps> = ({
  scan,
  onClose,
  onUpdate,
  onDelete,
  onToggleStatus,
}) => {
  const plate = scan.plate_number || scan.plateNumber || '';
  const vehicleType = scan.vehicle_type || scan.vehicleType || 'Sedan';
  const vehicleColor = scan.vehicle_color || scan.vehicleColor || 'Classic Grey';
  const img = scan.image_url || scan.imageUrl;

  const [isEditing, setIsEditing] = useState(false);
  const [editedPlate, setEditedPlate] = useState(plate);
  const [editedVehicleType, setEditedVehicleType] = useState(vehicleType);
  const [editedStatus, setEditedStatus] = useState<'INSIDE' | 'EXITED'>(
    (scan.status === 'EXITED' ? 'EXITED' : 'INSIDE')
  );
  const [copiedJson, setCopiedJson] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(scan.id);
      onClose();
    } catch (err) {
      console.error('Error deleting scan:', err);
      setIsDeleting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate(scan.id, {
        plate_number: editedPlate.toUpperCase(),
        plateNumber: editedPlate.toUpperCase(),
        vehicle_type: editedVehicleType,
        vehicleType: editedVehicleType,
        status: editedStatus,
      });
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving updates:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(scan, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const isInside = scan.status === 'INSIDE' || scan.status === 'completed';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full border border-neutral-200 shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-neutral-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-neutral-900 text-amber-400">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <span>Parking Vehicle Record</span>
                <span className="text-xs font-normal text-neutral-500 font-mono">
                  ({scan.id})
                </span>
              </h3>
              <p className="text-xs text-neutral-500">
                Single unique document maintained in Firestore <code className="font-mono text-neutral-700">parking_records</code>
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

        {/* Content Body */}
        <div className="p-6 space-y-6">
          {/* Top Section: Vehicle Image & Plate Badge */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Image Preview */}
            <div className="relative rounded-xl overflow-hidden bg-neutral-900 border border-neutral-200 aspect-video flex items-center justify-center">
              {img ? (
                <img
                  src={img}
                  alt={plate || 'Vehicle'}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Car className="w-12 h-12 text-neutral-600" />
              )}
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-mono text-white">
                Vehicle Image
              </div>
            </div>

            {/* License Plate & Quick Form */}
            <div className="flex flex-col justify-between space-y-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Recognized Registration Plate
                </span>

                {isEditing ? (
                  <div className="space-y-3 mt-2">
                    <div>
                      <label className="text-xs text-neutral-600 block mb-1">Plate Number</label>
                      <input
                        type="text"
                        value={editedPlate}
                        onChange={(e) => setEditedPlate(e.target.value.toUpperCase())}
                        className="w-full font-mono text-lg font-bold px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-amber-500 uppercase"
                        placeholder="e.g. JGN 7676"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-600 block mb-1">Vehicle Classification</label>
                      <select
                        value={editedVehicleType}
                        onChange={(e) => setEditedVehicleType(e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-lg"
                      >
                        <option value="Classic Sedan">Classic Sedan</option>
                        <option value="Sedan">Sedan</option>
                        <option value="SUV">SUV</option>
                        <option value="Truck">Truck</option>
                        <option value="Motorcycle">Motorcycle</option>
                        <option value="Van">Van</option>
                        <option value="Bus">Bus</option>
                        <option value="Unknown">Unknown</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-neutral-600 block mb-1">Parking Status</label>
                      <select
                        value={editedStatus}
                        onChange={(e) => setEditedStatus(e.target.value as any)}
                        className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-lg font-semibold"
                      >
                        <option value="INSIDE">INSIDE (Active Entry)</option>
                        <option value="EXITED">EXITED (Vehicle Exited)</option>
                      </select>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{isSaving ? 'Updating...' : 'Save to Firestore'}</span>
                      </button>
                      <button
                        onClick={() => setIsEditing(false)}
                        className="px-3 py-1.5 border border-neutral-300 text-neutral-700 rounded-lg text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 space-y-3">
                    {/* Malaysian Plate Display */}
                    <div className="bg-neutral-900 rounded-xl p-4 text-center border-2 border-neutral-700 shadow-md">
                      <div className="text-[10px] text-neutral-400 font-mono tracking-widest uppercase mb-1">
                        MALAYSIA
                      </div>
                      <div className="text-3xl font-mono font-black text-white tracking-widest">
                        {plate || 'PENDING OCR'}
                      </div>
                      <div className="text-[10px] text-amber-400/90 font-sans mt-1">
                        {scan.country_or_state || scan.countryOrState || 'State Registration'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <button
                        onClick={() => setIsEditing(true)}
                        className="text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1 text-xs"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Details</span>
                      </button>
                      <span className="text-neutral-500 font-medium flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Confidence: {Math.round((scan.confidence || 0.95) * 100)}%</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Specs & Status Actions */}
              <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 font-medium">Status:</span>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                      scan.status === 'EXITED' ? 'bg-neutral-200 text-neutral-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {scan.status || 'INSIDE'}
                    </span>
                    {onToggleStatus && (
                      <button
                        type="button"
                        onClick={() => onToggleStatus(scan)}
                        className="px-2 py-0.5 bg-neutral-900 hover:bg-black text-amber-300 font-semibold rounded text-[11px] transition flex items-center gap-1 shadow-2xs"
                      >
                        {isInside ? 'Toggle to EXITED' : 'Toggle to INSIDE'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Entry Time:</span>
                  <span className="font-mono text-neutral-700 font-medium">{String(scan.entry_time || scan.created_at || 'Now')}</span>
                </div>
                {scan.exit_time && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Exit Time:</span>
                    <span className="font-mono text-neutral-700 font-medium">{String(scan.exit_time)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-neutral-500">Classification:</span>
                  <span className="font-semibold text-neutral-800">{vehicleType} • {vehicleColor}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Section: Live Firestore Document JSON Payload */}
          <div className="border border-neutral-200 rounded-xl overflow-hidden">
            <div className="bg-neutral-100 px-4 py-2.5 flex items-center justify-between border-b border-neutral-200">
              <span className="text-xs font-semibold text-neutral-800 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span>Firestore Document (Collection: <code className="font-mono text-neutral-800">parking_records</code>)</span>
              </span>
              <button
                onClick={handleCopyJson}
                className="text-xs text-neutral-600 hover:text-neutral-900 flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-neutral-200 transition"
              >
                {copiedJson ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-600 font-medium">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 bg-neutral-900 text-amber-300 font-mono text-xs overflow-x-auto max-h-48">
              {JSON.stringify(scan, null, 2)}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
          {isConfirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600 font-medium">Delete this record?</span>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>{isDeleting ? 'Deleting...' : 'Yes, Delete'}</span>
              </button>
              <button
                onClick={() => setIsConfirmingDelete(false)}
                className="px-2.5 py-1 border border-neutral-300 text-neutral-600 hover:bg-neutral-100 rounded-lg text-xs transition"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsConfirmingDelete(true)}
              className="px-3.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Document</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
