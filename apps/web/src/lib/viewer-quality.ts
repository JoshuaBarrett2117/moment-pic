export type ImageQualityPreset = 'low' | 'balanced' | 'high' | 'original';

/** 查看器内手动切换的画质，只在当前标签页有效（sessionStorage）。 */
export const VIEWER_QUALITY_SESSION_KEY = 'moment_pic_viewer_quality_preset';
/** 本设备画质偏好（localStorage）：跟随网络 / 始终原图。 */
export const DEVICE_QUALITY_MODE_KEY = 'moment_pic_device_quality_mode';

export type NetworkKind = 'lan' | 'wan';
export type DeviceQualityMode = 'follow-network' | 'always-original';

export const isImageQualityPreset = (value: unknown): value is ImageQualityPreset =>
  value === 'low' || value === 'balanced' || value === 'high' || value === 'original';

/** 默认画质来自哪里：本标签页手动选择 / 本设备设置 / 内网默认 / 外网默认。 */
export type QualitySource = 'session' | 'device' | 'lan' | 'wan';

/**
 * 查看器打开时的默认画质：
 * 本标签页手动选择 > 本设备「始终原图」> （内网 ? 内网默认 : 外网默认）。
 * 网络未知（请求失败 / 尚未返回）时按外网处理，避免外网误用原图。
 */
export const resolveViewerDefaultQuality = (input: {
  sessionPreset: ImageQualityPreset | null;
  deviceMode: DeviceQualityMode;
  network: NetworkKind | null | undefined;
  lanPreset: ImageQualityPreset;
  wanPreset: ImageQualityPreset;
}): { preset: ImageQualityPreset; source: QualitySource } => {
  if (input.sessionPreset) return { preset: input.sessionPreset, source: 'session' };
  if (input.deviceMode === 'always-original') return { preset: 'original', source: 'device' };
  if (input.network === 'lan') return { preset: input.lanPreset, source: 'lan' };
  return { preset: input.wanPreset, source: 'wan' };
};

export const readDeviceQualityMode = (): DeviceQualityMode => {
  if (typeof window === 'undefined') return 'follow-network';
  try {
    return window.localStorage.getItem(DEVICE_QUALITY_MODE_KEY) === 'always-original' ? 'always-original' : 'follow-network';
  } catch {
    return 'follow-network';
  }
};

export const saveDeviceQualityMode = (mode: DeviceQualityMode): void => {
  if (typeof window === 'undefined') return;
  try {
    if (mode === 'always-original') window.localStorage.setItem(DEVICE_QUALITY_MODE_KEY, mode);
    else window.localStorage.removeItem(DEVICE_QUALITY_MODE_KEY);
  } catch {
    // 隐私模式等不可写时忽略
  }
};
