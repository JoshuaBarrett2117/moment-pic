export enum Screen {
  LOGIN = 'LOGIN',
  GALLERY = 'GALLERY',
  ALBUM_DETAIL = 'ALBUM_DETAIL',
  SMART_ALBUM_DETAIL = 'SMART_ALBUM_DETAIL',
  SHARE_MANAGEMENT = 'SHARE_MANAGEMENT',
  SETTINGS = 'SETTINGS',
}

export type NavigationState = {
  currentScreen: Screen;
  previousScreen?: Screen;
};
