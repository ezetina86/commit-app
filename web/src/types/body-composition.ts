export interface UserProfile {
  height_cm: number;
}

export interface WeightReading {
  id: string;
  weight: number;
  notes: string;
  recorded_at: string;
}

export interface CircumferenceReading {
  id: string;
  abdomen: number;
  biceps: number;
  quads: number;
  neck?: number;
  hip?: number;
  chest?: number;
  calf?: number;
  notes: string;
  recorded_at: string;
}

export interface BodyFatReading {
  id: string;
  body_fat_pct: number;
  notes: string;
  recorded_at: string;
}
