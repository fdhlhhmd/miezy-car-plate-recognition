export interface ParkingRecord {
  id: string;
  plate_number: string;
  entry_time: string | number;
  exit_time?: string | number;
  status: 'INSIDE' | 'EXITED' | 'pending' | 'processing' | 'completed' | 'failed';
  confidence: number;
  vehicle_type?: string;
  vehicle_color?: string;
  country_or_state?: string;
  image_url?: string;
  raw_ocr?: string;
  notes?: string;
  last_action?: 'ENTRY' | 'EXIT';
  toggle_count?: number;
  bounding_boxes?: Array<{
    bbox: number[][];
    text: string;
    confidence: number;
  }>;
  created_at?: string | number;
  updated_at?: string | number;
}

// Alias for backward compatibility across UI components
export type PlateScanRecord = ParkingRecord & {
  imageUrl?: string;
  plateNumber?: string;
  exitTime?: string | number;
  vehicleType?: string;
  vehicleColor?: string;
  countryOrState?: string;
  processingEngine?: string;
  processingTimeMs?: number;
  rawOcrText?: string;
  createdAt?: number;
  updatedAt?: number;
};

export interface FirebaseConnectionConfig {
  apiKey?: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  collectionName: string;
}
