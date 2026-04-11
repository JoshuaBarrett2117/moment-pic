export enum Screen {
  LOGIN = 'LOGIN',
  GALLERY = 'GALLERY',
  ALBUM_DETAIL = 'ALBUM_DETAIL',
  SETTINGS = 'SETTINGS',
}

export type NavigationState = {
  currentScreen: Screen;
  previousScreen?: Screen;
};
