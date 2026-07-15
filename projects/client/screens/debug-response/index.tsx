import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { Ionicons } from '@expo/vector-icons';

const STORAGE_KEY = '__debug_last_kingdee_response';

interface DebugInfo {
  timestamp: string;
  service: string;
  stage?: string;
  error?: string;
  requestBody?: unknown;
  diagnostics?: Record<string, unknown>;
  rawResult: unknown;
}

export default function DebugResponseScreen() {
  const router = useSafeRouter();
  const [data, setData] = useState<DebugInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            setData(JSON.parse(raw) as DebugInfo);
          } catch {
            setData({
              timestamp: new Date().toISOString(),
              service: 'unknown',
              error: '调试数据 JSON 解析失败',
              rawResult: raw,
            });
          }
        } else {
          setData({
            timestamp: new Date().toISOString(),
            service: 'unknown',
            error: '暂无调试数据（__debug_last_kingdee_response 不存在）',
            rawResult: null,
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const displayText = useMemo(() => {
    if (!data) return '';
    try {
      return JSON.stringify(
        data,
        (key, value) => {
          if (typeof value === 'string' && value.length > 5000) {
            return value.substring(0, 5000) + '... [truncated]';
          }
          return value;
        },
        2
      );
    } catch (e) {
      return `数据无法序列化：${e instanceof Error ? e.message : String(e)}`;
    }
  }, [data]);

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.title}>调试响应</Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>阶段</Text>
              <Text style={styles.metaValue}>{data?.stage || '-'}</Text>

              <Text style={[styles.metaLabel, { marginTop: 12 }]}>错误信息</Text>
              <Text style={[styles.metaValue, { color: data?.error ? '#DC2626' : '#1E293B' }]}>
                {data?.error || '无错误'}
              </Text>

              <Text style={[styles.metaLabel, { marginTop: 12 }]}>接口</Text>
              <Text style={styles.metaValue}>{data?.service}</Text>

              <Text style={[styles.metaLabel, { marginTop: 12 }]}>时间</Text>
              <Text style={styles.metaValue}>{data?.timestamp}</Text>
            </View>

            <Text style={styles.sectionTitle}>原始响应体</Text>
            <View style={styles.codeCard}>
              <Text style={styles.codeText}>{displayText}</Text>
            </View>
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: { padding: 4, width: 40 },
  title: { fontSize: 17, fontWeight: '700', color: '#1E293B' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  metaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  metaLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  metaValue: { fontSize: 14, color: '#1E293B', marginTop: 4, fontWeight: '500' },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 10,
    marginLeft: 4,
  },
  codeCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
  },
  codeText: {
    fontSize: 12,
    color: '#E2E8F0',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
});
