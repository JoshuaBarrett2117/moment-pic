import React from 'react';

/** 全局背景层：由当前主题的 .mp-backdrop 决定观感（玻璃主题为深色底 + 光晕）。 */
export const ThemeBackdrop: React.FC = () => (
  <div aria-hidden="true" className="mp-backdrop pointer-events-none fixed inset-0 -z-10" />
);
