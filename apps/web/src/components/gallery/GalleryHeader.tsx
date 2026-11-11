import { ArrowLeft, LogOut } from 'lucide-react';

type GalleryHeaderProps = {
  title: string;
  description: string;
  isMobile: boolean;
  isWideMobile: boolean;
  headerClass: string;
  onBack?: () => void;
  onProfileClick: () => void;
};

export function GalleryHeader({
  title,
  description,
  isMobile,
  isWideMobile,
  headerClass,
  onBack,
  onProfileClick,
}: GalleryHeaderProps) {
  return (
    <header className={headerClass}>
      <div className="flex flex-col gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="flex w-fit items-center gap-1 rounded-full bg-surface-container-high px-3 py-1.5 text-sm text-outline transition-colors hover:text-on-surface"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </button>
        )}
        <h1 className={`font-script font-bold leading-tight tracking-tight text-on-surface ${isWideMobile ? 'text-3xl' : 'text-2xl md:text-5xl'}`}>
          {title}
        </h1>
        <p className={`font-body text-base text-outline/70 ${isMobile ? 'block text-sm' : 'hidden md:block md:text-xl'}`}>
          {description}
        </p>
      </div>
      <button
        onClick={onProfileClick}
        title="退出登录"
        className={`cursor-pointer overflow-hidden mp-glass-overlay rounded-full transition-transform hover:scale-105 ${isWideMobile ? 'h-12 w-12' : 'h-11 w-11 md:h-14 md:w-14'}`}
      >
        <span aria-label="退出登录" className="flex h-full w-full items-center justify-center text-on-surface-variant hover:text-on-surface">
          <LogOut className="h-1/2 w-1/2" />
        </span>
      </button>
    </header>
  );
}
