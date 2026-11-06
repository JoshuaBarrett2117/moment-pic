import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from '../lib/api';
import type { UserDTO } from '../types/api';

type CurrentUserState = {
  user: UserDTO | null;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  setUser: (user: UserDTO) => void;
};

const CurrentUserContext = createContext<CurrentUserState>({
  user: null,
  // 未加载前按管理员渲染，避免老接口/加载闪烁隐藏按钮；服务端仍会按角色拒绝越权请求
  isAdmin: true,
  refresh: async () => {},
  setUser: () => {},
});

export function CurrentUserProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [user, setUser] = useState<UserDTO | null>(null);
  const refresh = useCallback(async () => {
    try {
      setUser(await api.get<UserDTO>('/account'));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
    else setUser(null);
  }, [enabled, refresh]);

  return (
    <CurrentUserContext.Provider value={{ user, isAdmin: user ? user.role === 'admin' : true, refresh, setUser }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export const useCurrentUser = () => useContext(CurrentUserContext);
