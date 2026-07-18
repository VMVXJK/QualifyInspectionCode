import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface QCSchemeSelectModalProps {
  visible: boolean;
  value: string;
  schemes: Record<string, string>; // code -> name，来自 getCachedQCSchemeMap()
  loading?: boolean;
  onSelect: (code: string, name: string) => void;
  onClose: () => void;
  onGoSync: () => void; // 缓存为空时跳转数据同步页面
}

export function QCSchemeSelectModal({
  visible,
  value,
  schemes,
  loading,
  onSelect,
  onClose,
  onGoSync,
}: QCSchemeSelectModalProps) {
  const [keyword, setKeyword] = useState('');

  const entries = useMemo(() => {
    return Object.entries(schemes).map(([code, name]) => ({ code, name }));
  }, [schemes]);

  const filtered = useMemo(() => {
    if (!keyword.trim()) return entries;
    const kw = keyword.trim().toLowerCase();
    return entries.filter(
      (it) => it.code.toLowerCase().includes(kw) || it.name.toLowerCase().includes(kw)
    );
  }, [entries, keyword]);

  const isEmpty = entries.length === 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>选择质检方案</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={styles.hintText}>加载中...</Text>
            </View>
          ) : isEmpty ? (
            <View style={styles.centerBox}>
              <Ionicons name="alert-circle-outline" size={48} color="#94A3B8" />
              <Text style={styles.hintText}>质检方案数据未同步</Text>
              <Text style={styles.hintSub}>请先到"设置 → 数据同步"页面同步质检方案映射表</Text>
              <TouchableOpacity style={styles.syncBtn} onPress={onGoSync}>
                <Ionicons name="sync-outline" size={16} color="#FFFFFF" />
                <Text style={styles.syncBtnText}>前往数据同步</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* 搜索框 */}
              <View style={styles.searchBox}>
                <Ionicons name="search" size={16} color="#94A3B8" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="搜索编码或名称"
                  value={keyword}
                  onChangeText={setKeyword}
                  placeholderTextColor="#94A3B8"
                  clearButtonMode="while-editing"
                />
                {keyword.length > 0 && (
                  <TouchableOpacity onPress={() => setKeyword('')}>
                    <Ionicons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              {/* 表头 */}
              <View style={styles.tableHeader}>
                <Text style={[styles.headerText, styles.codeCol]}>编码</Text>
                <Text style={[styles.headerText, styles.nameCol]}>方案名称</Text>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {filtered.length === 0 ? (
                  <View style={styles.emptyRow}>
                    <Text style={styles.emptyText}>无匹配结果</Text>
                  </View>
                ) : (
                  filtered.map((it) => {
                    const isActive = value === it.code;
                    return (
                      <TouchableOpacity
                        key={it.code}
                        style={[styles.row, isActive && styles.rowActive]}
                        onPress={() => onSelect(it.code, it.name)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.codeCol}>
                          <Text style={[styles.codeText, isActive && styles.textActive]} numberOfLines={1}>
                            {it.code}
                          </Text>
                        </View>
                        <View style={styles.nameCol}>
                          <Text style={[styles.nameText, isActive && styles.textActive]}>
                            {it.name}
                          </Text>
                        </View>
                        {isActive && (
                          <Ionicons name="checkmark" size={18} color="#2563EB" />
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    marginBottom: 10,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
    paddingVertical: 0,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    marginBottom: 4,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  codeCol: {
    width: 120,
    paddingRight: 8,
  },
  nameCol: {
    flex: 1,
    paddingRight: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rowActive: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    borderBottomColor: 'transparent',
  },
  codeText: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '600',
  },
  nameText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  textActive: {
    color: '#2563EB',
    fontWeight: '600',
  },
  centerBox: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  hintText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
  },
  hintSub: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  syncBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyRow: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
  },
});
