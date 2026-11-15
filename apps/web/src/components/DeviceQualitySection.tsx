import { type FC, useState } from 'react';

import { type DeviceQualityMode, readDeviceQualityMode, saveDeviceQualityMode } from '../lib/viewer-quality';
import { NetworkStatusLine } from './NetworkStatusLine';

const OPTIONS: Array<{ id: DeviceQualityMode; label: string; hint: string }> = [
  { id: 'follow-network', label: '跟随网络', hint: '内网用内网默认画质，外网用外网默认画质' },
  { id: 'always-original', label: '始终原图', hint: '本设备不论内外网都默认原图' },
];

/** 设置 → 外观：本设备画质（只保存在当前浏览器）。查看器内手动切换仍优先，且只对当前标签页生效。 */
export const DeviceQualitySection: FC = () => {
  const [mode, setMode] = useState<DeviceQualityMode>(() => readDeviceQualityMode());
  return (
    <section aria-label="本设备画质" className="mt-10">
      <h3 className="mp-eyebrow mb-3">Quality · 本设备画质</h3>
      <div role="radiogroup" aria-label="本设备画质" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const active = option.id === mode;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => { setMode(option.id); saveDeviceQualityMode(option.id); }}
              className={`mp-card flex flex-col gap-1 p-4 text-left ${active ? 'border-primary! ring-2 ring-primary/40' : ''}`}
            >
              <span className="font-semibold text-on-surface">{option.label}</span>
              <span className="text-sm text-on-surface-variant">{option.hint}</span>
            </button>
          );
        })}
      </div>
      <NetworkStatusLine className="mt-3" />
    </section>
  );
};
