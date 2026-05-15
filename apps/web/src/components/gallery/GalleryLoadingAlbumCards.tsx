export function GalleryLoadingAlbumCards({ isMobile }: { isMobile: boolean }) {
  return (
    <>
      {Array.from({ length: isMobile ? 8 : 16 }).map((_, index) => (
        <div key={index} className="animate-pulse relative rounded-xl bg-surface-container-highest p-4 shadow-md">
          <div className="absolute right-2 top-2 h-5 w-16 rounded-full bg-outline/10 px-4 py-1" />
          <div className="mb-5 aspect-square rounded-lg bg-outline/10" />
          <div className="px-2 pb-2">
            <div className="mb-3 h-6 w-3/4 rounded bg-outline/10" />
            <div className="h-4 w-1/2 rounded bg-outline/10" />
          </div>
        </div>
      ))}
    </>
  );
}
