import type { FC, ReactNode } from 'react';
import { Images, Palette, Settings, Sparkles, UserRound, Users } from 'lucide-react';

export type SettingsTab = 'basic' | 'advanced' | 'smart' | 'account' | 'users' | 'appearance';

type SettingsTabsProps = {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  isAdmin?: boolean;
};

const TABS: Array<{ id: SettingsTab; label: string; icon: ReactNode; adminOnly: boolean }> = [
  { id: 'basic', label: '图库与浏览', icon: <Images className="h-4 w-4" />, adminOnly: true },
  { id: 'advanced', label: '高级', icon: <Settings className="h-4 w-4" />, adminOnly: true },
  { id: 'smart', label: '智能相册', icon: <Sparkles className="h-4 w-4" />, adminOnly: true },
  { id: 'users', label: '用户管理', icon: <Users className="h-4 w-4" />, adminOnly: true },
  { id: 'account', label: '账号', icon: <UserRound className="h-4 w-4" />, adminOnly: false },
  { id: 'appearance', label: '外观', icon: <Palette className="h-4 w-4" />, adminOnly: false },
];

/** 设置分类：内容区顶部的标签页（主侧栏保持不变）。只读账号只看到账号和外观。 */
export const SettingsTabs: FC<SettingsTabsProps> = ({ activeTab, onTabChange, isAdmin = true }) => (
  <div className="sticky top-0 z-20 -mx-1 mb-6 px-1 pt-1">
    <nav role="tablist" aria-label="设置分类" className="mp-glass-panel custom-scrollbar flex gap-1 overflow-x-auto rounded-[14px] p-1.5">
      {TABS.filter((tab) => isAdmin || !tab.adminOnly).map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(tab.id)}
            className={`flex h-9 shrink-0 items-center gap-2 rounded-[10px] px-3.5 text-sm transition-colors ${
              active ? 'bg-primary-container font-medium text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className={active ? 'text-primary' : ''}>{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  </div>
);
