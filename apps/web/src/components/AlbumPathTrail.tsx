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
      className={`flex items-center gap-2 rounded-lg border border-black/5 bg-surface-container-low/70 px-3 py-2 text-xs text-on-surface-variant ${className}`}
      title={fullPath}
      aria-label={`所在路径：${fullPath}`}
    >
      <FolderTree className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
      <span className="shrink-0 opacity-70">所在路径</span>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <span key={`${crumb}-${index}`} className="flex shrink-0 items-center gap-1">
              {index > 0 && <span className="opacity-40">/</span>}
              <span className={isLast ? "font-semibold text-on-surface" : "opacity-80"}>{crumb}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};
