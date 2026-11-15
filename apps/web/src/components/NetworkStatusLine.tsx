import { type FC, useEffect, useState } from 'react';
import { Wifi } from 'lucide-react';

import { fetchNetworkInfo, type NetworkInfo } from '../hooks/useNetworkInfo';

export const formatNetworkStatus = (info: NetworkInfo | null, loaded: boolean): string => {
  if (!loaded) return '当前网络：检测中…';
  if (!info) return '当前网络：未知（按外网处理）';
  return `当前网络：${info.network === 'lan' ? '内网' : '外网'}（${info.clientIp}）`;
};

/** 设置页只读行：服务端按本次请求 IP 判定的内网 / 外网。每次进入设置页都重新判定。 */
export const NetworkStatusLine: FC<{ className?: string }> = ({ className = '' }) => {
  const [state, setState] = useState<{ info: NetworkInfo | null; loaded: boolean }>({ info: null, loaded: false });
  useEffect(() => {
    let cancelled = false;
    void fetchNetworkInfo(true).then((info) => {
      if (!cancelled) setState({ info, loaded: true });
    });
    return () => { cancelled = true; };
  }, []);
  return (
    <p className={`flex items-center gap-2 text-sm text-outline ${className}`} data-testid="network-status">
      <Wifi className="h-4 w-4 shrink-0" />
      <span>{formatNetworkStatus(state.info, state.loaded)}</span>
    </p>
  );
};
