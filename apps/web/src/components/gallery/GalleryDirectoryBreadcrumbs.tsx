import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { DirectoryAlbumBreadcrumbDTO } from '../../types/api';

type GalleryDirectoryBreadcrumbsProps = {
  breadcrumbs: DirectoryAlbumBreadcrumbDTO[];
  onBreadcrumbClick?: (crumb: DirectoryAlbumBreadcrumbDTO) => void;
};

export function GalleryDirectoryBreadcrumbs({
  breadcrumbs,
  onBreadcrumbClick,
}: GalleryDirectoryBreadcrumbsProps) {
  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-outline">
      {breadcrumbs.map((crumb, index) => (
        <React.Fragment key={`${crumb.libraryRootId ?? 'root'}:${crumb.relativePath}:${index}`}>
          {index > 0 && <ChevronRight className="h-4 w-4 text-outline/50" />}
          <button
            onClick={() => onBreadcrumbClick?.(crumb)}
            className="rounded-lg bg-surface-container-high px-3 py-1.5 font-medium transition-colors hover:bg-primary-container/20 hover:text-on-surface"
          >
            {crumb.name}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
