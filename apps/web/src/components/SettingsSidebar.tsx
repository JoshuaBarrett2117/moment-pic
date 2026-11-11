import type { FC } from 'react';
import { ArrowLeft, Database, Images, Palette, Settings, Sparkles, UserRound, Users } from 'lucide-react';

export type SettingsTab = 'basic' | 'advanced' | 'smart' | 'account' | 'users' | 'appearance';

type SettingsSidebarProps = {
  activeTab: SettingsTab;
  onBack: () => void;
  onTabChange: (tab: SettingsTab) => void;
  isAdmin?: boolean;
};

const getTabButtonClassName = (activeTab: SettingsTab, tab: SettingsTab) =>
  `flex shrink-0 items-center gap-3 font-headline font-medium px-4 py-2.5 rounded-xl transition-all ${
    activeTab === tab
      ? 'bg-primary-container text-primary'
      : 'text-outline hover:text-on-surface hover:bg-surface-container-high'
  }`;

export const SettingsSidebar: FC<SettingsSidebarProps> = ({ activeTab, onBack, onTabChange, isAdmin = true }) => (
  <aside className="mp-glass-panel w-full md:w-80 md:m-3 md:mr-0 md:rounded-[20px] border-x-0 border-t-0 md:border p-3 md:p-8 flex flex-row md:flex-col overflow-x-auto shrink-0 z-20 items-center md:items-stretch scrollbar-hide">
    <div className="md:mb-10 mr-6 md:mr-0 flex items-center gap-2 md:gap-3 shrink-0">
      <Database className="text-primary w-6 h-6 md:w-7 md:h-7" />
      <h1 className="text-xl md:text-2xl font-bold text-on-primary-container font-script">设置</h1>
    </div>

    <nav className="flex flex-row md:flex-col gap-2 md:gap-4 shrink-0">
      <button
        onClick={onBack}
        className="flex shrink-0 items-center gap-3 text-outline hover:text-on-surface font-headline font-medium px-4 py-2.5 rounded-xl hover:bg-surface-container-high transition-all"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>返回</span>
      </button>
      {isAdmin && (
        <>
          <button onClick={() => onTabChange('basic')} className={getTabButtonClassName(activeTab, 'basic')}>
            <Images className="w-5 h-5" />
            <span>基础设置</span>
          </button>
          <button onClick={() => onTabChange('advanced')} className={getTabButtonClassName(activeTab, 'advanced')}>
            <Settings className="w-5 h-5" />
            <span>高级设置</span>
          </button>
          <button onClick={() => onTabChange('smart')} className={getTabButtonClassName(activeTab, 'smart')}>
            <Sparkles className="w-5 h-5" />
            <span>智能归纳</span>
          </button>
          <button onClick={() => onTabChange('users')} className={getTabButtonClassName(activeTab, 'users')}>
            <Users className="w-5 h-5" />
            <span>用户管理</span>
          </button>
        </>
      )}
      <button onClick={() => onTabChange('account')} className={getTabButtonClassName(activeTab, 'account')}>
        <UserRound className="w-5 h-5" />
        <span>账号</span>
      </button>
      <button onClick={() => onTabChange('appearance')} className={getTabButtonClassName(activeTab, 'appearance')}>
        <Palette className="w-5 h-5" />
        <span>外观</span>
      </button>
    </nav>
  </aside>
);
