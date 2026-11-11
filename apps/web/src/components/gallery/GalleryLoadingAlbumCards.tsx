export function GalleryLoadingAlbumCards({ isMobile }: { isMobile: boolean }) {
  return (
    <>
      {Array.from({ length: isMobile ? 6 : 10 }).map((_, index) => (
        <div key={index} className="mp-cover-card animate-pulse" aria-hidden="true">
          <div className="aspect-[4/5] w-full bg-surface-container-high" />
        </div>
      ))}
    </>
  );
}
