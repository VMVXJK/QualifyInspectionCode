import { useState, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { viewInspectBill, convertBillToLocal } from '@/api/kingdee/inspect';
import { getKingdeeSessionCookie } from '@/api/kingdee/client';
import { showError } from '@/utils/toast';
import { BILL_DETAIL_CACHE_KEY } from '../constants';
import type { LocalOrder, LocalMaterial, LocalDecision, LocalItem, LocalDefect } from '../types';

interface BillDetailState {
  loading: boolean;
  refreshing: boolean;
  rawBill: unknown;
  order: LocalOrder | null;
  material: LocalMaterial | null;
  decisions: LocalDecision[];
  items: LocalItem[];
  defects: LocalDefect[];
}

interface UseBillDetailResult extends BillDetailState {
  fetchDetail: (opts?: { silent?: boolean }) => Promise<void>;
  onRefresh: () => void;
}

/**
 * 检验单详情数据获取 Hook
 * 负责：View 接口调用、本地缓存读写、错误处理
 */
export function useBillDetail(orderId?: string, orderNo?: string): UseBillDetailResult {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rawBill, setRawBill] = useState<unknown>(null);
  const [order, setOrder] = useState<LocalOrder | null>(null);
  const [material, setMaterial] = useState<LocalMaterial | null>(null);
  const [decisions, setDecisions] = useState<LocalDecision[]>([]);
  const [items, setItems] = useState<LocalItem[]>([]);
  const [defects, setDefects] = useState<LocalDefect[]>([]);

  const hasFetchedRef = useRef(false);
  const cacheKey = BILL_DETAIL_CACHE_KEY(orderId || orderNo || '');

  const fetchDetail = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);

    // 1. 先尝试加载本地缓存（离线时直接展示）
    let cachedLoaded = false;
    try {
      const cachedRaw = await AsyncStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as {
          bill: unknown;
          local: ReturnType<typeof convertBillToLocal>;
        };
        setRawBill(cached.bill);
        setOrder(cached.local.order as LocalOrder);
        setMaterial(cached.local.material as LocalMaterial);
        setDecisions((cached.local.decisions as LocalDecision[]) ?? []);
        setItems(cached.local.items as LocalItem[]);
        setDefects(cached.local.defects as LocalDefect[]);
        cachedLoaded = true;
      }
    } catch {
      // 缓存读取失败忽略
    }

    // 2. 尝试从金蝶获取最新数据并更新缓存
    try {
      const identifier = orderId ? { id: orderId } : { number: orderNo || '' };
      const bill = await viewInspectBill(identifier);
      setRawBill(bill);

      let local: ReturnType<typeof convertBillToLocal>;
      try {
        local = convertBillToLocal(bill);
      } catch (parseErr) {
        const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        showError('单据解析失败：' + parseMsg);
        local = {
          order: {
            id: orderId || orderNo || '',
            order_no: orderNo || '',
            type: '',
            type_id: '',
            date: '',
            status: 'pending',
            document_status: '',
          } as LocalOrder,
          material: undefined,
          decisions: [],
          items: [],
          defects: [],
        };
      }

      setOrder(local.order as LocalOrder);
      setMaterial(local.material as LocalMaterial);
      setDecisions(local.decisions as LocalDecision[]);
      setItems(local.items as LocalItem[]);
      setDefects(local.defects as LocalDefect[]);

      try {
        await AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({ bill, local, timestamp: Date.now() })
        );
      } catch {
        // 缓存保存失败忽略
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载检验单失败';

      if (message === 'SESSION_LOST') {
        // 由 UI 横幅处理登录提示
      } else if (cachedLoaded) {
        showError('网络异常，已显示本地缓存数据');
      } else {
        showError('加载检验单失败：' + message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId, orderNo, cacheKey]);

  useFocusEffect(
    useCallback(() => {
      const init = async () => {
        const hasCache = !!(await AsyncStorage.getItem(cacheKey));
        if (getKingdeeSessionCookie() || hasCache) {
          if (!hasFetchedRef.current) {
            hasFetchedRef.current = true;
            fetchDetail({ silent: hasCache });
          }
        } else {
          setLoading(false);
        }
      };
      init();
    }, [fetchDetail, cacheKey])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    hasFetchedRef.current = false;
    fetchDetail();
  }, [fetchDetail]);

  return {
    loading,
    refreshing,
    rawBill,
    order,
    material,
    decisions,
    items,
    defects,
    fetchDetail,
    onRefresh,
  };
}
