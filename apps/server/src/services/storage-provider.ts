import type { CacheStore } from "./cache-store.js";
import type { GalleryRepository } from "./gallery-repository.js";
import { MemoryCacheStore } from "./memory-cache-store.js";
import { sqliteGalleryRepository } from "./sqlite-gallery-repository.js";

let galleryRepository: GalleryRepository = sqliteGalleryRepository;
let cacheStore: CacheStore = new MemoryCacheStore();

export const getGalleryRepository = (): GalleryRepository => galleryRepository;
export const getCacheStore = (): CacheStore => cacheStore;

export const setGalleryRepository = (repository: GalleryRepository) => {
  galleryRepository = repository;
};

export const setCacheStore = (nextCacheStore: CacheStore) => {
  cacheStore = nextCacheStore;
};
