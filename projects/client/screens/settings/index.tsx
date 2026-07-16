import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { getKingdeeBaseUrl, setKingdeeBaseUrl, DEFAULT_KINGDEE_BASE_URL } from '@/api/kingdee/client';
import { showSuccess, showError } from '@/utils/toast';

/** 从完整地址中提取纯 host（去掉协议前缀），供输入框展示 */
function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

const DEFAULT_HOST = stripProtocol(DEFAULT_KINGDEE_BASE_URL);

export default function SettingsScreen() {
  const router = useSafeRouter();
  const { isAuthenticated, logout } = useAuth();

  const [host, setHost] = useState(DEFAULT_HOST);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setHost(stripProtocol(getKingdeeBaseUrl()));
  }, []);

  const handleSaveServer = async () => {
    const trimmed = host.trim();
    if (!trimmed) {
      setErrorMsg('请输入服务器地址');
      return;
    }
    if (/\s/.test(trimmed)) {
      setErrorMsg('服务器地址不能包含空格');
      return;
    }

    setErrorMsg('');
    setSaving(true);
    try {
      const fullUrl = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
      await setKingdeeBaseUrl(fullUrl);
      setHost(stripProtocol(fullUrl));

      if (isAuthenticated) {
        await logout();
        showSuccess('服务器地址已更新，请重新登录');
      } else {
        showSuccess('服务器地址已更新');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败';
      showError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetServer = () => {
    setHost(DEFAULT_HOST);
    setErrorMsg('');
  };

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

          {/* 金蝶服务器地址（可编辑） */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>金蝶服务器地址</Text>
            <View style={styles.inputBox}>
              <Ionicons name="server-outline" size={18} color="#2563EB" />
              <TextInput
                style={styles.inputField}
                value={host}
                onChangeText={(v) => {
                  setHost(v);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder={DEFAULT_HOST}
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
            {errorMsg ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={14} color="#DC2626" />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}
            <Text style={styles.hintText}>修改后需要重新登录才能生效</Text>
            <View style={styles.serverActions}>
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={handleResetServer}
                activeOpacity={0.75}
              >
                <Text style={styles.resetBtnText}>重置为默认</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSaveServer}
                activeOpacity={0.85}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? '保存中…' : '保存'}</Text>
              </TouchableOpacity>
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
                  <Text style={styles.actionSub}>查看登录、保存、提交记录</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </View>
          </TouchableOpacity>

          {/* 数据同步 */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/data-sync')}
            activeOpacity={0.75}
          >
            <View style={styles.actionRow}>
              <View style={styles.actionLeft}>
                <View style={[styles.actionIconWrap, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="sync-outline" size={20} color="#059669" />
                </View>
                <View>
                  <Text style={styles.actionTitle}>数据同步</Text>
                  <Text style={styles.actionSub}>同步检验项目、方法、仪器映射表</Text>
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
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 4,
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  inputField: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '500',
    paddingVertical: 10,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
  },
  hintText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 8,
  },
  serverActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  resetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  saveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#2563EB',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
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
