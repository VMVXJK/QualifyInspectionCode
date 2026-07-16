import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { loadHistory, type HistoryKind, type OperationHistoryItem } from '@/utils/operationHistory';

const TABS: { key: HistoryKind; label: string }[] = [
  { key: 'login', label: '登录' },
  { key: 'save', label: '保存' },
  { key: 'submit', label: '提交' },
];

const EMPTY_TEXT: Record<HistoryKind, { title: string; sub: string }> = {
  login: { title: '暂无登录记录', sub: '登录成功后，账号记录将显示在此处' },
  save: { title: '暂无保存记录', sub: '保存检验结果后，记录将显示在此处' },
  submit: { title: '暂无提交记录', sub: '提交单据后，记录将显示在此处' },
};

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export default function LoginHistoryScreen() {
  const router = useSafeRouter();
  const [activeTab, setActiveTab] = useState<HistoryKind>('login');
  const [history, setHistory] = useState<OperationHistoryItem[]>([]);

  const load = useCallback(async (kind: HistoryKind) => {
    const data = await loadHistory(kind);
    setHistory(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(activeTab);
    }, [load, activeTab])
  );

  const handleTabPress = (kind: HistoryKind) => {
    setActiveTab(kind);
    load(kind);
  };

  const renderItem = ({ item, index }: { item: OperationHistoryItem; index: number }) => {
    if (item.kind === 'login') {
      return (
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <View style={styles.numberBadge}>
              <Text style={styles.numberText}>{index + 1}</Text>
            </View>
            <View>
              <Text style={styles.username}>{item.username}</Text>
              <Text style={styles.time}>{formatTime(item.time)}</Text>
            </View>
          </View>
          <Ionicons name="person-outline" size={18} color="#CBD5E1" />
        </View>
      );
    }

    const isSuccess = item.success !== false;
    return (
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <View
            style={[
              styles.numberBadge,
              { backgroundColor: isSuccess ? '#ECFDF5' : '#FEF2F2' },
            ]}
          >
            <Text style={[styles.numberText, { color: isSuccess ? '#059669' : '#DC2626' }]}>
              {index + 1}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.username}>{item.orderNo || '未知单据'}</Text>
            <Text style={styles.time}>{formatTime(item.time)}</Text>
            {!isSuccess && item.detail ? (
              <Text style={styles.detailText} numberOfLines={2}>
                {item.detail}
              </Text>
            ) : null}
          </View>
        </View>
        <Ionicons
          name={isSuccess ? 'checkmark-circle' : 'close-circle'}
          size={20}
          color={isSuccess ? '#10B981' : '#EF4444'}
        />
      </View>
    );
  };

  const emptyText = EMPTY_TEXT[activeTab];
  const renderEmpty = () => (
    <View style={styles.emptyBox}>
      <Ionicons name="document-text-outline" size={48} color="#CBD5E1" />
      <Text style={styles.emptyTitle}>{emptyText.title}</Text>
      <Text style={styles.emptySub}>{emptyText.sub}</Text>
    </View>
  );

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>查询记录</Text>
            <View style={{ width: 24 }} />
          </View>
        </View>

        {/* 分类 Tab */}
        <View style={styles.tabBar}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabChip, activeTab === tab.key && styles.tabChipOn]}
              onPress={() => handleTabPress(tab.key)}
            >
              <Text style={[styles.tabChipText, activeTab === tab.key && styles.tabChipTextOn]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlatList
          data={history}
          keyExtractor={(item, index) => `${item.kind}-${item.time}-${index}`}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </Screen>
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
    paddingBottom: 26,
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabChip: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  tabChipOn: { backgroundColor: '#2563EB' },
  tabChipText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  tabChipTextOn: { color: '#FFFFFF', fontWeight: '600' },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  numberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  username: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  time: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  detailText: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 4,
  },
  emptyBox: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 14,
  },
  emptySub: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 6,
  },
});
