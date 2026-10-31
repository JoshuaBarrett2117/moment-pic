import { FC } from "react";
import { FolderTree } from "lucide-react";

export interface AlbumPathTrailProps {
  rootName?: string;
  relativePath?: string;
  albumName: string;
  className?: string;
}

const splitSegments = (relativePath?: string): string[] =>
  (relativePath ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

/**
 * 图集所在路径：图库根 › 各级目录 › 当前图集。
 * 只做展示，不做目录树/导航。
 */
export const AlbumPathTrail: FC<AlbumPathTrailProps> = ({
  rootName,
  relativePath,
  albumName,
  className = ""
}) => {
  const segments = splitSegments(relativePath);
  const crumbs = [rootName?.trim() || "图库", ...segments, albumName].filter(Boolean);
  const fullPath = crumbs.join(" / ");

  return (
    <div
      className={`rounded-lg border border-black/5 bg-surface-container-low/70 px-3 py-2 text-xs text-on-surface-variant ${className}`}
      title={fullPath}
      aria-label={`所在路径：${fullPath}`}
    >
      <div className="mb-1 flex items-center gap-1.5 opacity-70">
        <FolderTree className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>所在路径</span>
      </div>
      {/* 换行展示完整路径：侧栏宽度有限，单行滚动会把当前图集名挤出可视区 */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 break-words leading-relaxed">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <span key={`${crumb}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 && <span className="opacity-40">/</span>}
              <span className={isLast ? "font-semibold text-on-surface" : "opacity-80"}>{crumb}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};
