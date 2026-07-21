import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useFocusEffect, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { queryInspectBills } from '@/api/kingdee/inspect';
import { useAuth } from '@/contexts/AuthContext';
import { showError, showSuccess } from '@/utils/toast';
import { getBillTypeName, loadBillTypeMapFromStorageLocal } from '@/screens/order-detail/data/bill-type-map';

const { width: SCREEN_W } = Dimensions.get('window');
const IS_PORTRAIT = Dimensions.get('window').height >= Dimensions.get('window').width;

const GAP = 16;
const PAD = IS_PORTRAIT ? 16 : 20;
const CARD_RADIUS = 16;

/** 检验单列表本地缓存键 */
const ORDERS_CACHE_KEY = 'cached_inspect_orders';
/** 缓存有效期（毫秒）：5 分钟 */
const CACHE_TTL = 5 * 60 * 1000;
// 注意：不再自动轮询，只在打开页面和手动刷新时请求

interface InspectionOrder {
  id: string;
  order_no: string;
  type: string;
  type_id: string;
  date: string;
  status: string;
  document_status: string;
  material_code?: string;
  material_name?: string;
  material_count?: number;
}

const TYPE_MAP: Record<string, { label: string; color: string }> = {
  incoming: { label: '来料检验', color: '#3B82F6' },
  process: { label: '过程检验', color: '#8B5CF6' },
  shipping: { label: '出货检验', color: '#10B981' },
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '待检', color: '#D97706', bg: '#FEF3C7' },
  inspecting: { label: '审批中', color: '#2563EB', bg: '#DBEAFE' },
  completed: { label: '已完成', color: '#059669', bg: '#D1FAE5' },
};

export default function OrderListScreen() {
  const [orders, setOrders] = useState<InspectionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showList, setShowList] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchType, setSearchType] = useState<'order_no' | 'type'>('order_no');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const router = useSafeRouter();
  const { isAuthenticated, logout, isLoading: authLoading } = useAuth();
  const hasFetchedRef = useRef(false);

  /** 从本地缓存加载检验单列表（离线时也展示，仅标记为缓存） */
  const loadCachedOrders = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem(ORDERS_CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached) as { data: InspectionOrder[]; timestamp: number };
        setOrders(data);
        const isFresh = Date.now() - timestamp < CACHE_TTL;
        setLastSyncTime(new Date(timestamp).toLocaleString('zh-CN') + (isFresh ? '' : '（缓存）'));
        return true;
      }
    } catch {
      // 缓存读取失败忽略
    }
    return false;
  }, []);

  /** 保存检验单列表到本地缓存 */
  const saveCachedOrders = useCallback(async (data: InspectionOrder[]) => {
    try {
      await AsyncStorage.setItem(ORDERS_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch {
      // 缓存写入失败忽略
    }
  }, []);

  const fetchOrders = useCallback(async (opts?: { silent?: boolean; status?: string }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const result = await queryInspectBills({
        status: opts?.status ?? statusFilter,
        searchKeyword: searchKeyword.trim(),
        searchType: searchType === 'type' ? 'type' : 'order_no',
        limit: 200,
      });

      const mapped = result.rows.map((r) => ({
        id: r.id,
        order_no: r.order_no,
        type: r.type_name || getBillTypeName(r.type_id || r.type) || r.type_id || r.type,
        type_id: r.type_id || r.type,
        date: r.date,
        status: r.status,
        document_status: r.document_status,
        material_code: r.material_code,
        material_name: r.material_name,
        material_count: r.material_count,
      }));

      setOrders(mapped);
      setLastSyncTime(new Date().toLocaleString('zh-CN'));
      await saveCachedOrders(mapped);
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取检验单失败';
      console.error('[fetchOrders]', error);
      if (message === 'SESSION_LOST') {
        // 由 UI 横幅提示登录，不跳转
      } else {
        // 有本地缓存时优先展示缓存并提示离线，无缓存才跳转调试
        const cached = await AsyncStorage.getItem(ORDERS_CACHE_KEY);
        if (cached) {
          showError('网络异常，已显示本地缓存数据');
        } else {
          router.push('/debug-response');
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, searchKeyword, searchType, saveCachedOrders]);

  // 进入列表页：先读缓存，再拉取最新（只执行一次）
  // 同时启动5分钟轮询
  useFocusEffect(
    useCallback(() => {
      const init = async () => {
        // 预加载单据类型映射表
        loadBillTypeMapFromStorageLocal().catch(() => {
          /* ignore */
        });

        if (showList && !hasFetchedRef.current) {
          hasFetchedRef.current = true;
          const hasCache = await loadCachedOrders();
          if (!hasCache) setLoading(true);
          fetchOrders({ silent: hasCache });
        } else if (!showList) {
          setLoading(false);
        }
      };
      init();

      // 启动5分钟轮询（300000ms）
      const intervalId = setInterval(() => {
        if (showList) {
          fetchOrders({ silent: true });
        }
      }, 300000);

      return () => {
        clearInterval(intervalId);
      };
    }, [fetchOrders, loadCachedOrders, showList])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    hasFetchedRef.current = false; // 重置，允许重新请求
    fetchOrders();
  }, [fetchOrders]);
  const handleSearch = () => { setLoading(true); fetchOrders(); };
  const handleClearSearch = () => { setSearchKeyword(''); setLoading(true); fetchOrders(); };
  const handleOrderPress = (order: InspectionOrder) => router.push('/order-detail', { orderId: order.id, orderNo: order.order_no });

  const handleLogout = useCallback(() => {
    Alert.alert(
      '确认退出',
      '确定要退出金蝶云星空登录吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '退出',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
              showSuccess('已退出登录');
            } catch (error) {
              showError(error instanceof Error ? error.message : '退出失败');
            }
          },
        },
      ]
    );
  }, [logout]);

  const renderOrderCard = ({ item }: { item: InspectionOrder }) => {
    const status = STATUS_MAP[item.status] || STATUS_MAP.pending;
    const typeMeta = TYPE_MAP[item.type] || { label: item.type, color: '#64748B' };
    return (
      <TouchableOpacity style={styles.card} onPress={() => handleOrderPress(item)} activeOpacity={0.75}>
        {/* 左侧色带 */}
        <View style={[styles.cardStripe, { backgroundColor: status.color }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardNo} numberOfLines={1}>
                {item.order_no}
                {item.material_name ? (
                  <Text style={styles.cardMaterialInline}>
                    {'  ·  '}
                    {item.material_name}
                    {(item.material_count ?? 1) > 1 ? ` 等${item.material_count}种` : ''}
                  </Text>
                ) : null}
              </Text>
            </View>
            <View style={[styles.pill, { backgroundColor: status.bg }]}>
              <Text style={[styles.pillText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
          <View style={styles.cardMeta}>
            <View style={styles.metaChip}>
              <View style={[styles.dot, { backgroundColor: typeMeta.color }]} />
              <Text style={styles.metaText}>{typeMeta.label}</Text>
            </View>
          </View>
          <View style={styles.cardBottom}>
            <Text style={styles.dateText}>
              <Ionicons name="calendar-outline" size={12} color="#94A3B8" />  {new Date(item.date).toLocaleDateString('zh-CN')}
            </Text>
            <Text style={styles.actionText}>查看详情 <Text style={{ color: '#2563EB' }}>→</Text></Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyBox}>
      <Ionicons name="document-text-outline" size={56} color="#CBD5E1" />
      <Text style={styles.emptyTitle}>暂无检验单</Text>
      <Text style={styles.emptySub}>{statusFilter === 'all' ? '当前没有待检验的检验单' : `当前没有${STATUS_MAP[statusFilter]?.label || ''}的检验单`}</Text>
    </View>
  );

  if (authLoading) {
    return (
      <Screen>
        <View style={styles.authLoadingBox}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </Screen>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  if (!showList) {
    return (
      <Screen>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.hero}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="shield-checkmark" size={40} color="#FFFFFF" />
            </View>
            <Text style={styles.heroTitle}>QualifyInspection</Text>
            <Text style={styles.heroSub}>Quality Inspection Workbench</Text>
          </View>

          {/* 登录/退出提示 */}
          <TouchableOpacity style={styles.logoutBannerHome} onPress={handleLogout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={22} color="#B91C1C" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.logoutBannerHomeTitle}>已登录金蝶云星空</Text>
              <Text style={styles.logoutBannerHomeSub}>点击此处退出当前账号</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#DC2626" />
          </TouchableOpacity>

          {/* 入口卡片 */}
          <View style={styles.grid}>
            <TouchableOpacity style={styles.bigCard} onPress={() => setShowList(true)} activeOpacity={0.8}>
              <View style={[styles.bigCardIcon, { backgroundColor: '#2563EB' }]}>
                <Ionicons name="clipboard-outline" size={32} color="#FFFFFF" />
              </View>
              <View style={styles.bigCardTextBox}>
                <Text style={styles.bigCardTitle}>检验单管理</Text>
                <Text style={styles.bigCardSub}>{loading ? '加载中…' : `${orders.length} 张待检验单`}</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#94A3B8" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.bigCard} onPress={() => router.push('/settings')} activeOpacity={0.8}>
              <View style={[styles.bigCardIcon, { backgroundColor: '#059669' }]}>
                <Ionicons name="cog-outline" size={32} color="#FFFFFF" />
              </View>
              <View style={styles.bigCardTextBox}>
                <Text style={styles.bigCardTitle}>系统设置</Text>
                <Text style={styles.bigCardSub}>查看连接状态</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.container}>
        {/* 顶部工具栏 */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => setShowList(false)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.pageTitle}>检验单列表</Text>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.backBtn}>
            <Ionicons name="settings-outline" size={22} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* 登录/退出提示 */}
        <View style={styles.logoutBanner}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#059669" />
          <Text style={styles.logoutBannerText}>已登录金蝶云星空</Text>
          <TouchableOpacity onPress={handleLogout} style={{ marginLeft: 'auto' }}>
            <Text style={styles.logoutBannerAction}>退出</Text>
          </TouchableOpacity>
        </View>

        {/* 搜索 */}
        <View style={styles.searchPanel}>
          <View style={styles.searchTabs}>
            {[{ k: 'order_no', l: '单号' }, { k: 'type', l: '类型' }].map((t) => (
              <TouchableOpacity
                key={t.k}
                style={[styles.searchTab, searchType === t.k && styles.searchTabOn]}
                onPress={() => setSearchType(t.k as typeof searchType)}
              >
                <Text style={[styles.searchTabText, searchType === t.k && styles.searchTabTextOn]}>{t.l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.searchInputBox}>
            <Ionicons name="search" size={18} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder={`搜索${searchType === 'order_no' ? '单号' : '类型'}`}
              value={searchKeyword}
              onChangeText={setSearchKeyword}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
              placeholderTextColor="#94A3B8"
            />
            {searchKeyword ? (
              <TouchableOpacity onPress={handleClearSearch} style={{ marginRight: 8 }}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} activeOpacity={0.8}>
              <Text style={styles.searchBtnText}>搜索</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 筛选 */}
        <View style={styles.filterBar}>
          {[
            { k: 'all', l: '全部' },
            { k: 'pending', l: '待检' },
            { k: 'inspecting', l: '审批中' },
            { k: 'completed', l: '已完成' },
          ].map((f) => (
            <TouchableOpacity
              key={f.k}
              style={[styles.filterChip, statusFilter === f.k && styles.filterChipOn]}
              onPress={() => {
                setStatusFilter(f.k);
                fetchOrders({ status: f.k });
              }}
            >
              <Text style={[styles.filterChipText, statusFilter === f.k && styles.filterChipTextOn]}>{f.l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 同步状态 */}
        {lastSyncTime && (
          <View style={styles.syncBar}>
            <Ionicons name="time-outline" size={12} color="#94A3B8" />
            <Text style={styles.syncText}>上次同步：{lastSyncTime}</Text>
          </View>
        )}

        {/* 列表 */}
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrderCard}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },

  /* ===== 首页 Hero ===== */
  hero: {
    backgroundColor: '#2563EB',
    paddingTop: 32,
    paddingBottom: 48,
    paddingHorizontal: PAD,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 6, letterSpacing: 2 },

  /* ===== 首页退出提示 ===== */
  logoutBannerHome: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    marginHorizontal: PAD,
    marginTop: 16,
    padding: PAD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutBannerHomeTitle: { fontSize: 15, fontWeight: '700', color: '#B91C1C' },
  logoutBannerHomeSub: { fontSize: 12, color: '#DC2626', marginTop: 2 },

  /* ===== 列表页退出提示 ===== */
  logoutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: PAD,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
  },
  logoutBannerText: { fontSize: 13, color: '#059669', fontWeight: '600', flex: 1 },
  logoutBannerAction: { fontSize: 13, color: '#DC2626', fontWeight: '700' },

  /* ===== 入口大卡片 ===== */
  grid: { padding: PAD, gap: GAP },
  bigCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: CARD_RADIUS,
    padding: PAD,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
  },
  bigCardIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bigCardTextBox: { flex: 1, marginLeft: 14 },
  bigCardTitle: { fontSize: 17, fontWeight: '700', color: '#1E293B' },
  bigCardSub: { fontSize: 13, color: '#64748B', marginTop: 2 },

  /* ===== 顶部工具栏 ===== */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: PAD,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: { padding: 4 },
  pageTitle: { fontSize: 17, fontWeight: '700', color: '#1E293B' },

  /* ===== 认证中 ===== */
  authLoadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  /* ===== 搜索 ===== */
  searchPanel: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: PAD,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  searchTabs: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  searchTab: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  searchTabOn: { backgroundColor: '#2563EB' },
  searchTabText: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  searchTabTextOn: { color: '#FFFFFF', fontWeight: '600' },
  searchInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
    paddingVertical: 8,
    marginLeft: 6,
  },

  searchBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  searchBtnText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  /* ===== 筛选标签 ===== */
  filterBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: PAD,
    gap: 8,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  filterChipOn: { backgroundColor: '#2563EB' },
  filterChipText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  filterChipTextOn: { color: '#FFFFFF', fontWeight: '600' },

  /* ===== 同步状态条 ===== */
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: PAD,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  syncText: { fontSize: 11, color: '#94A3B8' },

  /* ===== 列表 ===== */
  listContent: { padding: PAD, paddingBottom: 32 },

  /* ===== 检验单卡片（左侧色带） ===== */
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: CARD_RADIUS,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  cardStripe: { width: 4 },
  cardBody: { flex: 1, padding: PAD },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardNo: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  cardMaterialInline: { fontSize: 13, fontWeight: '400', color: '#64748B' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pillText: { fontSize: 11, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  metaText: { fontSize: 13, color: '#64748B' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText: { fontSize: 12, color: '#94A3B8' },
  actionText: { fontSize: 13, color: '#64748B', fontWeight: '600' },

  /* ===== 空状态 ===== */
  emptyBox: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#64748B', marginTop: 14 },
  emptySub: { fontSize: 13, color: '#94A3B8', marginTop: 6 },
});
