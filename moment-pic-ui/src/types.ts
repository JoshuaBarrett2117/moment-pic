export enum Screen {
  LOGIN = 'LOGIN',
  GALLERY = 'GALLERY',
  LOCAL_GALLERY = 'LOCAL_GALLERY',
  ALBUM_DETAIL = 'ALBUM_DETAIL',
}

export type NavigationState = {
  currentScreen: Screen;
  previousScreen?: Screen;
};
