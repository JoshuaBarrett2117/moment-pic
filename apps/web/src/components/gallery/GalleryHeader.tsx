import { ArrowLeft } from 'lucide-react';

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
        <h1 className={`font-script font-bold leading-tight tracking-tighter text-on-surface ${isWideMobile ? 'text-3xl' : 'text-2xl md:text-6xl'}`}>
          {title}
        </h1>
        <p className={`font-body text-base text-outline/70 ${isMobile ? 'block text-sm' : 'hidden md:block md:text-xl'}`}>
          {description}
        </p>
      </div>
      <button
        onClick={onProfileClick}
        title="退出登录"
        className={`cursor-pointer overflow-hidden rounded-full border-2 border-white shadow-md transition-transform hover:scale-105 ${isWideMobile ? 'h-12 w-12' : 'h-11 w-11 md:h-14 md:w-14 md:border-4 md:shadow-xl'}`}
      >
        <img
          alt="退出登录"
          className="h-full w-full object-cover"
          src="https://picsum.photos/seed/portrait/200/200"
        />
      </button>
    </header>
  );
}
