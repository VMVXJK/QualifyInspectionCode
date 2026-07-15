import { useState, useEffect } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

/**
 * 网络状态 Hook
 * @returns { isConnected: boolean | null, isInternetReachable: boolean | null }
 */
export function useNetworkStatus() {
  const [state, setState] = useState<NetInfoState | null>(null);

  useEffect(() => {
    // 立即获取当前状态
    NetInfo.fetch().then(setState);

    // 监听变化
    const unsubscribe = NetInfo.addEventListener((netInfoState) => {
      setState(netInfoState);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    isConnected: state?.isConnected ?? null,
    isInternetReachable: state?.isInternetReachable ?? null,
    details: state?.details,
    type: state?.type,
  };
}
