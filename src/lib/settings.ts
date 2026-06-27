export interface SettingsResponseOk {
  status: "ok";
  iso: number;
  aperture: string;
  shutter_speed: string;
  white_balance: string;
  color_temperature: string | null;
  assumptions: string[];
  warnings: string[];
  scene_summary?: string;
  credits_used: boolean;
  monthly_count: number;
  credits_remaining: number;
  session_id: string;
}

// "cloudy" → "Cloudy", "flash" → "Flash", etc.
// All WB enum values are single lowercase words so charAt(0) capitalize is safe.
export function formatWhiteBalanceEnum(wb: string): string {
  if (!wb) return wb;
  return wb.charAt(0).toUpperCase() + wb.slice(1);
}

// Canonical WB copy value shared by SettingsCubes and ResponseActions copy-all.
// color_temperature null → "Auto"; non-null → "5500K (Cloudy)" format.
export function formatWbCopyValue(
  color_temperature: string | null,
  wbLabel: string,
): string {
  return color_temperature !== null ? `${color_temperature} (${wbLabel})` : "Auto";
}
