import { Layers3 } from 'lucide-react';
import type { SmartAlbumListItemDTO } from '../../types/api';
import { CoverCard } from './CoverCard';

type SmartAlbumCardProps = {
  album: SmartAlbumListItemDTO;
  index: number;
  isMobile: boolean;
  onNavigateToAlbum: (albumId: string) => void;
};

export function SmartAlbumCard({ album, index, onNavigateToAlbum }: SmartAlbumCardProps) {
  return (
    <CoverCard
      index={index}
      title={album.name}
      meta={`${album.assetCount} 张`}
      coverUrl={album.coverUrl}
      placeholderIcon={<Layers3 className="h-12 w-12" />}
      tag={`${album.albumCount} 套图集`}
      onOpen={() => onNavigateToAlbum(album.id)}
    />
  );
}
