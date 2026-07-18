import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import {
  syncInspectItems,
  syncInspectMethods,
  syncInspectInstruments,
  syncInspectValueOptions,
  syncBillTypes,
  syncQCSchemes,
} from '@/api/kingdee/inspect';
import { SaveDiagnosticsPanel } from '@/screens/order-detail/components/SaveDiagnosticsPanel';
import type { SaveDiagnostics } from '@/screens/order-detail/types';

export default function DataSyncScreen() {
  const router = useSafeRouter();

  // 各按钮同步状态
  const [syncingItem, setSyncingItem] = useState(false);
  const [syncingMethod, setSyncingMethod] = useState(false);
  const [syncingInstrument, setSyncingInstrument] = useState(false);
  const [syncingValue, setSyncingValue] = useState(false);
  const [syncingBillType, setSyncingBillType] = useState(false);
  const [syncingQCScheme, setSyncingQCScheme] = useState(false);

  // 诊断面板状态（记录最后一次同步的信息）
  const [lastSyncDiagnostics, setLastSyncDiagnostics] = useState<SaveDiagnostics | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const handleSyncItems = useCallback(async () => {
    setSyncingItem(true);
    setShowDiagnostics(true);

    const result = await syncInspectItems();

    setLastSyncDiagnostics({
      request: result.diagnostics.request,
      response: result.diagnostics.response,
      error: result.diagnostics.error,
    });

    if (result.success) {
      Toast.show({
        type: 'success',
        text1: `已同步 ${result.count} 条检验项目`,
        position: 'bottom',
      });
    } else {
      Toast.show({
        type: 'error',
        text1: '同步失败',
        text2: result.diagnostics.error || '未知错误',
        position: 'bottom',
      });
    }

    setSyncingItem(false);
  }, []);

  const handleSyncMethods = useCallback(async () => {
    setSyncingMethod(true);
    setShowDiagnostics(true);

    const result = await syncInspectMethods();

    setLastSyncDiagnostics({
      request: result.diagnostics.request,
      response: result.diagnostics.response,
      error: result.diagnostics.error,
    });

    if (result.success) {
      Toast.show({
        type: 'success',
        text1: `已同步 ${result.count} 条检验方法`,
        position: 'bottom',
      });
    } else {
      Toast.show({
        type: 'error',
        text1: '同步失败',
        text2: result.diagnostics.error || '未知错误',
        position: 'bottom',
      });
    }

    setSyncingMethod(false);
  }, []);

  const handleSyncInstruments = useCallback(async () => {
    setSyncingInstrument(true);
    setShowDiagnostics(true);

    const result = await syncInspectInstruments();

    setLastSyncDiagnostics({
      request: result.diagnostics.request,
      response: result.diagnostics.response,
      error: result.diagnostics.error,
    });

    if (result.success) {
      Toast.show({
        type: 'success',
        text1: `已同步 ${result.count} 条检验仪器`,
        position: 'bottom',
      });
    } else {
      Toast.show({
        type: 'error',
        text1: '同步失败',
        text2: result.diagnostics.error || '未知错误',
        position: 'bottom',
      });
    }

    setSyncingInstrument(false);
  }, []);

  const handleSyncValues = useCallback(async () => {
    setSyncingValue(true);
    setShowDiagnostics(true);

    const result = await syncInspectValueOptions();

    setLastSyncDiagnostics({
      request: result.diagnostics.request,
      response: result.diagnostics.response,
      error: result.diagnostics.error,
    });

    if (result.success) {
      Toast.show({
        type: 'success',
        text1: `已同步 ${result.count} 条检测值`,
        position: 'bottom',
      });
    } else {
      Toast.show({
        type: 'error',
        text1: '同步失败',
        text2: result.diagnostics.error || '未知错误',
        position: 'bottom',
      });
    }

    setSyncingValue(false);
  }, []);

  const handleSyncBillTypes = useCallback(async () => {
    setSyncingBillType(true);
    setShowDiagnostics(true);

    const result = await syncBillTypes();

    setLastSyncDiagnostics({
      request: result.diagnostics.request,
      response: result.diagnostics.response,
      error: result.diagnostics.error,
    });

    if (result.success) {
      Toast.show({
        type: 'success',
        text1: `已同步 ${result.count} 条单据类型`,
        position: 'bottom',
      });
    } else {
      Toast.show({
        type: 'error',
        text1: '同步失败',
        text2: result.diagnostics.error || '未知错误',
        position: 'bottom',
      });
    }

    setSyncingBillType(false);
  }, []);

  const handleSyncQCSchemes = useCallback(async () => {
    setSyncingQCScheme(true);
    setShowDiagnostics(true);

    const result = await syncQCSchemes();

    setLastSyncDiagnostics({
      request: result.diagnostics.request,
      response: result.diagnostics.response,
      error: result.diagnostics.error,
    });

    if (result.success) {
      Toast.show({
        type: 'success',
        text1: `已同步 ${result.count} 条质检方案`,
        position: 'bottom',
      });
    } else {
      Toast.show({
        type: 'error',
        text1: '同步失败',
        text2: result.diagnostics.error || '未知错误',
        position: 'bottom',
      });
    }

    setSyncingQCScheme(false);
  }, []);

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>数据同步</Text>
            <View style={{ width: 24 }} />
          </View>
          <Text style={styles.headerSub}>从金蝶云星空同步基础资料到本地映射表</Text>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>映射表同步</Text>
            <Text style={styles.cardDesc}>点击下方按钮同步各类基础资料编码与名称的对照关系</Text>

            <View style={styles.btnList}>
              <SyncButton
                icon="list-outline"
                title="同步检验项目映射表"
                subtitle="JYXM 编码 ↔ 检验项目名称"
                onPress={handleSyncItems}
                loading={syncingItem}
              />

              <SyncButton
                icon="flask-outline"
                title="同步检验方法映射表"
                subtitle="JYFF 编码 ↔ 检验方法名称"
                onPress={handleSyncMethods}
                loading={syncingMethod}
              />

              <SyncButton
                icon="hardware-chip-outline"
                title="同步检验仪器映射表"
                subtitle="JYYQ 编码 ↔ 检验仪器名称"
                onPress={handleSyncInstruments}
                loading={syncingInstrument}
              />

              <SyncButton
                icon="options-outline"
                title="同步检测值映射表"
                subtitle="JCZ/JYZ 编码 ↔ 检测值内容"
                onPress={handleSyncValues}
                loading={syncingValue}
              />

              <SyncButton
                icon="document-text-outline"
                title="同步单据类型映射表"
                subtitle="JYD 编码 ↔ 单据类型名称"
                onPress={handleSyncBillTypes}
                loading={syncingBillType}
              />

              <SyncButton
                icon="clipboard-outline"
                title="同步质检方案映射表"
                subtitle="编码 ↔ 质检方案名称"
                onPress={handleSyncQCSchemes}
                loading={syncingQCScheme}
              />
            </View>
          </View>

          {/* 诊断面板 */}
          {lastSyncDiagnostics && (
            <View style={[styles.card, { marginTop: 12 }]}>
              <SaveDiagnosticsPanel
                diagnostics={lastSyncDiagnostics}
                expanded={showDiagnostics}
                onToggle={() => setShowDiagnostics((v) => !v)}
              />
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Screen>
  );
}

function SyncButton({
  icon,
  title,
  subtitle,
  onPress,
  loading,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.syncBtn} onPress={onPress} activeOpacity={0.75} disabled={loading}>
      <View style={styles.syncIconWrap}>
        <Ionicons name={icon as any} size={22} color="#2563EB" />
      </View>
      <View style={styles.syncTextWrap}>
        <Text style={styles.syncTitle}>{title}</Text>
        <Text style={styles.syncSub}>{subtitle}</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color="#2563EB" />
      ) : (
        <Ionicons name="sync-outline" size={18} color="#94A3B8" />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#2563EB',
    paddingTop: 16,
    paddingBottom: 22,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 6,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
  },
  btnList: {
    gap: 10,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  syncIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  syncTextWrap: {
    flex: 1,
  },
  syncTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  syncSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
});
