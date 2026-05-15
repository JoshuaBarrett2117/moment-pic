import type { FC } from 'react';
import { Clock, Images, Settings } from 'lucide-react';

import type { SystemConfigDTO } from '../types/api';
import type { SystemConfigUpdates } from '../hooks/useSystemConfig';
import { clampGridWidth } from './settings-screen-utils';

type SettingsAdvancedPanelProps = {
  albumDetailItemMinWidthDesktop: number;
  albumDetailItemMinWidthMobile: number;
  albumListItemMinWidthDesktop: number;
  albumListItemMinWidthMobile: number;
  isSavingConfig: boolean;
  saveConfig: (updates: SystemConfigUpdates) => Promise<boolean>;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  setAlbumDetailItemMinWidthDesktop: (value: number) => void;
  setAlbumDetailItemMinWidthMobile: (value: number) => void;
  setAlbumListItemMinWidthDesktop: (value: number) => void;
  setAlbumListItemMinWidthMobile: (value: number) => void;
  systemConfig: SystemConfigDTO | null;
};

export const SettingsAdvancedPanel: FC<SettingsAdvancedPanelProps> = ({
  albumDetailItemMinWidthDesktop,
  albumDetailItemMinWidthMobile,
  albumListItemMinWidthDesktop,
  albumListItemMinWidthMobile,
  isSavingConfig,
  saveConfig,
  saveStatus,
  setAlbumDetailItemMinWidthDesktop,
  setAlbumDetailItemMinWidthMobile,
  setAlbumListItemMinWidthDesktop,
  setAlbumListItemMinWidthMobile,
  systemConfig,
}) => (
  <>
    <header className="mb-6 md:mb-12">
      <h2 className="text-2xl md:text-4xl font-headline font-black text-on-surface">高级设置</h2>
      <p className="text-outline mt-2 text-sm md:text-base">配置目录监控和轮询相关的系统级参数</p>
      <p className="mt-3 text-sm text-outline/80">
        {saveStatus === 'saving' && '正在保存设置...'}
        {saveStatus === 'saved' && '设置已自动保存'}
        {saveStatus === 'error' && '设置保存失败，请稍后重试'}
        {saveStatus === 'idle' && '开关会立即生效，数值会自动保存'}
      </p>
    </header>

    <div className="bg-surface-container-highest rounded-2xl p-6 mb-8">
      <h3 className="text-lg font-bold text-on-surface mb-4">目录监控</h3>
      <div className="space-y-6">
        <div className="flex items-start gap-4 rounded-xl bg-surface-container-high p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container shrink-0">
            <Clock className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="font-bold text-on-surface">启用轮询模式</p>
                <p className="mt-1 text-sm text-outline">适用于网络驱动器（如 NAS）或无法使用系统通知的场景</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={systemConfig?.enablePolling ?? true}
                  onChange={async (event) => {
                    await saveConfig({ enablePolling: event.target.checked });
                  }}
                  disabled={isSavingConfig}
                  className="sr-only peer"
                />
                <div className="w-14 h-7 bg-outline/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-primary" />
              </label>
            </div>
          </div>
        </div>

        {systemConfig?.enablePolling && (
          <div className="flex items-start gap-4 rounded-xl bg-surface-container-high p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container shrink-0">
              <Settings className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <p className="font-bold text-on-surface">轮询间隔</p>
                  <p className="mt-1 text-sm text-outline">每次检查文件变化的时间间隔</p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="5000"
                    max="600000"
                    step="1000"
                    value={systemConfig?.pollingInterval ?? 60000}
                    onChange={async (event) => {
                      const value = Number(event.target.value);
                      if (value >= 5000 && value <= 600000) {
                        await saveConfig({ pollingInterval: value });
                      }
                    }}
                    disabled={isSavingConfig}
                    className="w-28 rounded-xl border-2 border-outline/20 bg-surface px-3 py-2 text-center font-semibold text-on-surface outline-none focus:border-primary disabled:opacity-50"
                  />
                  <span className="text-sm text-outline">毫秒</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-outline/70">
                推荐值：30000-120000 毫秒（30秒-2分钟）。间隔过短会增加系统负载。
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <GridWidthCard
            title="相册页卡片宽度"
            description="分别控制移动端和桌面端的图集卡片最小宽度"
            mobileValue={albumListItemMinWidthMobile}
            desktopValue={albumListItemMinWidthDesktop}
            onMobileChange={setAlbumListItemMinWidthMobile}
            onDesktopChange={setAlbumListItemMinWidthDesktop}
            onSaveMobile={() => saveConfig({ albumListItemMinWidthMobile })}
            onSaveDesktop={() => saveConfig({ albumListItemMinWidthDesktop })}
            isSavingConfig={isSavingConfig}
            systemConfig={systemConfig}
          />
          <GridWidthCard
            title="相册详情页卡片宽度"
            description="分别控制移动端和桌面端的图片卡片最小宽度"
            mobileValue={albumDetailItemMinWidthMobile}
            desktopValue={albumDetailItemMinWidthDesktop}
            onMobileChange={setAlbumDetailItemMinWidthMobile}
            onDesktopChange={setAlbumDetailItemMinWidthDesktop}
            onSaveMobile={() => saveConfig({ albumDetailItemMinWidthMobile })}
            onSaveDesktop={() => saveConfig({ albumDetailItemMinWidthDesktop })}
            isSavingConfig={isSavingConfig}
            systemConfig={systemConfig}
          />
        </div>
      </div>
    </div>
  </>
);

type GridWidthCardProps = {
  title: string;
  description: string;
  mobileValue: number;
  desktopValue: number;
  onMobileChange: (value: number) => void;
  onDesktopChange: (value: number) => void;
  onSaveMobile: () => Promise<boolean>;
  onSaveDesktop: () => Promise<boolean>;
  isSavingConfig: boolean;
  systemConfig: SystemConfigDTO | null;
};

const GridWidthCard: FC<GridWidthCardProps> = ({
  title,
  description,
  mobileValue,
  desktopValue,
  onMobileChange,
  onDesktopChange,
  onSaveMobile,
  onSaveDesktop,
  isSavingConfig,
  systemConfig,
}) => (
  <div className="flex items-start gap-4 rounded-xl bg-surface-container-high p-4">
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container shrink-0">
      <Images className="h-6 w-6" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex flex-col gap-4">
        <div>
          <p className="font-bold text-on-surface">{title}</p>
          <p className="text-sm text-outline">{description}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <GridWidthInput
            label="移动端"
            description="手机和平板窄屏"
            value={mobileValue}
            onChange={onMobileChange}
            onSave={onSaveMobile}
            isSavingConfig={isSavingConfig}
            systemConfig={systemConfig}
          />
          <GridWidthInput
            label="桌面端"
            description="大屏和桌面浏览器"
            value={desktopValue}
            onChange={onDesktopChange}
            onSave={onSaveDesktop}
            isSavingConfig={isSavingConfig}
            systemConfig={systemConfig}
          />
        </div>
      </div>
    </div>
  </div>
);

type GridWidthInputProps = {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  onSave: () => Promise<boolean>;
  isSavingConfig: boolean;
  systemConfig: SystemConfigDTO | null;
};

const GridWidthInput: FC<GridWidthInputProps> = ({ label, description, value, onChange, onSave, isSavingConfig, systemConfig }) => (
  <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-3">
    <div>
      <p className="text-sm font-semibold text-on-surface">{label}</p>
      <p className="text-xs text-outline">{description}</p>
    </div>
    <div className="flex items-center gap-2">
      <input
        type="number"
        min="180"
        max="600"
        step="10"
        value={value}
        onChange={(event) => onChange(clampGridWidth(Number(event.target.value)))}
        onBlur={async () => {
          if (systemConfig) {
            await onSave();
          }
        }}
        disabled={isSavingConfig}
        className="w-24 rounded-xl border-2 border-outline/20 bg-surface-container-highest px-3 py-2 text-center font-semibold text-on-surface outline-none focus:border-primary disabled:opacity-50"
      />
      <span className="text-sm text-outline">px</span>
    </div>
  </div>
);
