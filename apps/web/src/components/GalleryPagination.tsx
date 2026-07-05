import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { PaginationDTO } from '../types/api';

interface GalleryPaginationProps {
  pagination: PaginationDTO | null;
  isLoading: boolean;
  onPageChange: (page: number) => void;
}

export const getVisiblePages = (currentPage: number, totalPages: number): number[] =>
  Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
    if (totalPages <= 5) {
      return index + 1;
    }
    if (currentPage <= 3) {
      return index + 1;
    }
    if (currentPage >= totalPages - 2) {
      return totalPages - 4 + index;
    }
    return currentPage - 2 + index;
  });

export const GalleryPagination = ({ pagination, isLoading, onPageChange }: GalleryPaginationProps) => {
  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;
  const currentPage = pagination?.page || 1;

  if (!pagination || totalPages <= 1) {
    return null;
  }

  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-2 md:mt-12 md:gap-4">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1 || isLoading}
        className="rounded-full bg-surface-container-high p-2 text-on-surface-variant transition-all hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-50"
        title="上一页"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-1">
        {getVisiblePages(currentPage, totalPages).map((pageNum) => (
          <button
            key={pageNum}
            onClick={() => onPageChange(pageNum)}
            className={`h-10 w-10 rounded-full text-sm font-medium transition-all ${
              currentPage === pageNum
                ? 'bg-primary-container text-on-primary-container'
                : 'text-outline hover:bg-primary-container/20'
            }`}
          >
            {pageNum}
          </button>
        ))}
      </div>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages || isLoading}
        className="rounded-full bg-surface-container-high p-2 text-on-surface-variant transition-all hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-50"
        title="下一页"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <span className="ml-2 text-xs text-outline md:ml-4 md:text-sm">
        共 {pagination.total} 项 / {totalPages} 页
      </span>
    </div>
  );
};
