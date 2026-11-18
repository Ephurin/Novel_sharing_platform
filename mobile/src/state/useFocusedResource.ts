import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useNetInfo } from '@react-native-community/netinfo';
import { getApiErrorMessage } from '../api/api-client';

// No persistence or offline fallback for private data. Hidden screens discard it.
export function useFocusedResource<T>(key: string, load: () => Promise<T>) {
  const focused = useIsFocused();
  const network = useNetInfo();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [revision, setRevision] = useState(0);
  const loader = useRef(load); loader.current = load;
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key });
  useEffect(() => { const subscription = AppState.addEventListener('change', next => setActive(next === 'active')); return () => subscription.remove(); }, []);
  useEffect(() => {
    let current = true;
    setState({ key });
    if (focused && active && online) void loader.current().then(data => { if (current) setState({ key, data }); }, error => { if (current) setState({ key, error: getApiErrorMessage(error) }); });
    return () => { current = false; };
  }, [key, focused, active, online, revision]);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  const visible = focused && active && online && state.key === key;
  return { data: visible ? state.data : undefined, error: !online ? 'Ngoại tuyến. Kết nối lại để kiểm tra quyền xem.' : visible ? state.error : undefined, loading: online && (!visible || (!state.data && !state.error)), reload };
}
