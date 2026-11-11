import React from 'react';

/** 全局背景层：底色 + 照片墙（或自定义图片）+ 遮罩 + 纸纹，观感全部由当前主题的 --mp-* 变量决定。 */
export const ThemeBackdrop: React.FC = () => (
  <div aria-hidden="true" className="mp-backdrop pointer-events-none fixed inset-0 -z-10">
    <div className="mp-backdrop-grain" />
  </div>
);
