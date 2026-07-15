import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

const LOGIN_HISTORY_KEY = 'auth_login_history';

interface LoginHistoryItem {
  username: string;
  time: string;
}

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
  const [history, setHistory] = useState<LoginHistoryItem[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const json = await AsyncStorage.getItem(LOGIN_HISTORY_KEY);
      if (json) {
        setHistory(JSON.parse(json));
      } else {
        setHistory([]);
      }
    } catch {
      setHistory([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  const renderItem = ({ item, index }: { item: LoginHistoryItem; index: number }) => (
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

  const renderEmpty = () => (
    <View style={styles.emptyBox}>
      <Ionicons name="document-text-outline" size={48} color="#CBD5E1" />
      <Text style={styles.emptyTitle}>暂无登录记录</Text>
      <Text style={styles.emptySub}>登录成功后，账号记录将显示在此处</Text>
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
            <Text style={styles.headerTitle}>登录记录</Text>
            <View style={{ width: 24 }} />
          </View>
        </View>

        <FlatList
          data={history}
          keyExtractor={(item, index) => `${item.username}-${item.time}-${index}`}
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
