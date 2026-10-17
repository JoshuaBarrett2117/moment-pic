import type { AssetListItemDTO } from '../types/api';

export const getAssetThumbnailPresentation = (asset: Pick<AssetListItemDTO, 'thumbnailUrl' | 'width' | 'height'>): { src: string; fit: 'inside'; aspectRatio: number } => {
  const [path, query] = asset.thumbnailUrl.split('?');
  const params = new URLSearchParams(query);
  params.set('fit', 'inside');
  return {
    src: `${path}?${params}`,
    fit: 'inside',
    aspectRatio: asset.width && asset.height && asset.width > 0 && asset.height > 0 ? asset.width / asset.height : 1,
  };
};
