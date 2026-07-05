import type { FC } from 'react';
import { Database, Images, RefreshCw, Settings } from 'lucide-react';

export type SettingsTab = 'basic' | 'advanced' | 'smart';

type SettingsSidebarProps = {
  activeTab: SettingsTab;
  onBack: () => void;
  onTabChange: (tab: SettingsTab) => void;
};

const getTabButtonClassName = (activeTab: SettingsTab, tab: SettingsTab) =>
  `flex items-center gap-3 font-headline font-semibold px-4 py-2 rounded-lg transition-all ${
    activeTab === tab
      ? 'bg-primary-container text-on-primary-container'
      : 'text-outline hover:text-on-primary-container hover:bg-primary-container/10'
  }`;

export const SettingsSidebar: FC<SettingsSidebarProps> = ({ activeTab, onBack, onTabChange }) => (
  <aside className="w-full md:w-80 bg-surface-container-low p-3 md:p-8 flex flex-row md:flex-col border-b md:border-b-0 md:border-r border-outline/5 overflow-x-auto shrink-0 z-20 items-center md:items-stretch scrollbar-hide">
    <div className="md:mb-10 mr-6 md:mr-0 flex items-center gap-2 md:gap-3 shrink-0">
      <Database className="text-on-primary-container w-6 h-6 md:w-8 md:h-8" />
      <h1 className="text-xl md:text-2xl font-bold text-on-primary-container font-script">设置</h1>
    </div>

    <nav className="flex flex-row md:flex-col gap-2 md:gap-4 shrink-0">
      <button
        onClick={onBack}
        className="flex items-center gap-3 text-outline hover:text-on-primary-container font-headline font-semibold px-4 py-2 rounded-lg hover:bg-primary-container/10 transition-all"
      >
        <RefreshCw className="w-5 h-5" />
        <span>返回</span>
      </button>
      <button onClick={() => onTabChange('basic')} className={getTabButtonClassName(activeTab, 'basic')}>
        <Images className="w-5 h-5" />
        <span>基础设置</span>
      </button>
      <button onClick={() => onTabChange('advanced')} className={getTabButtonClassName(activeTab, 'advanced')}>
        <Settings className="w-5 h-5" />
        <span>高级设置</span>
      </button>
      <button onClick={() => onTabChange('smart')} className={getTabButtonClassName(activeTab, 'smart')}>
        <Images className="w-5 h-5" />
        <span>智能归纳</span>
      </button>
    </nav>
  </aside>
);
