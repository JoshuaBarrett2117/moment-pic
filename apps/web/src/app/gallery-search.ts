/** 侧栏「搜索相册」与快捷键 / ：跳到全部相册并聚焦工具栏搜索框。 */
export const GALLERY_SEARCH_EVENT = 'moment-pic:search';
let pendingFocus = false;

export const requestGallerySearch = () => {
  pendingFocus = true;
  window.dispatchEvent(new Event(GALLERY_SEARCH_EVENT));
};

/** 工具栏挂载或收到事件时调用：返回是否需要聚焦（只消费一次）。 */
export const consumeGallerySearchFocus = (): boolean => {
  const value = pendingFocus;
  pendingFocus = false;
  return value;
};
