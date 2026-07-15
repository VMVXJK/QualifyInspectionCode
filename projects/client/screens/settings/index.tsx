import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';

/** 金蝶云星空服务器地址 */
const KINGDEE_SERVER = 'https://121.37.216.69';

export default function SettingsScreen() {
  const router = useSafeRouter();
  const { isAuthenticated } = useAuth();

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>系统设置</Text>
            <View style={{ width: 24 }} />
          </View>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* 当前状态 */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>连接状态</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isAuthenticated ? '#10B981' : '#94A3B8' },
                ]}
              />
              <Text style={styles.statusText}>
                {isAuthenticated ? '已登录金蝶云星空' : '未登录'}
              </Text>
            </View>
          </View>

          {/* 金蝶服务器地址（只读） */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>金蝶服务器地址</Text>
            <View style={styles.readonlyBox}>
              <Ionicons name="server-outline" size={18} color="#2563EB" />
              <Text style={styles.readonlyUrl}>{KINGDEE_SERVER}</Text>
            </View>
          </View>

          {/* 查询记录 */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/login-history')}
            activeOpacity={0.75}
          >
            <View style={styles.actionRow}>
              <View style={styles.actionLeft}>
                <View style={[styles.actionIconWrap, { backgroundColor: '#EFF6FF' }]}>
                  <Ionicons name="time-outline" size={20} color="#2563EB" />
                </View>
                <View>
                  <Text style={styles.actionTitle}>查询记录</Text>
                  <Text style={styles.actionSub}>查看登录过的账号记录</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </View>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
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
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  readonlyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#DBEAFE',
  },
  readonlyUrl: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  actionSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
});
