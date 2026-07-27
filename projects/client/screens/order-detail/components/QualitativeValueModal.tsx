import React, { useState, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface QualitativeOption {
  code: string;
  text: string;
}

interface QualitativeValueModalProps {
  visible: boolean;
  title?: string;
  value: string;
  options: QualitativeOption[];
  onSelect: (code: string) => void;
  onClose: () => void;
}

export function QualitativeValueModal({
  visible,
  title = '选择检验值',
  value,
  options,
  onSelect,
  onClose,
}: QualitativeValueModalProps) {
  const [searchText, setSearchText] = useState('');

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) => opt.code.toLowerCase().includes(q) || opt.text.toLowerCase().includes(q)
    );
  }, [options, searchText]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* 搜索框 */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="搜索编号或检验内容..."
              placeholderTextColor="#94A3B8"
              value={searchText}
              onChangeText={setSearchText}
              autoCorrect={false}
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* 表头 */}
          <View style={styles.tableHeader}>
            <Text style={[styles.headerText, styles.codeCol]}>编号</Text>
            <Text style={[styles.headerText, styles.textCol]}>检验内容</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {filtered.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>无匹配结果</Text>
              </View>
            ) : (
              filtered.map((opt) => {
                const isActive = value === opt.code;
                return (
                  <TouchableOpacity
                    key={opt.code}
                    style={[styles.row, isActive && styles.rowActive]}
                    onPress={() => onSelect(opt.code)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.codeCol}>
                      <Text style={[styles.codeText, isActive && styles.textActive]}>
                        {opt.code}
                      </Text>
                    </View>
                    <View style={styles.textCol}>
                      <Text style={[styles.textText, isActive && styles.textActive]}>
                        {opt.text}
                      </Text>
                    </View>
                    {isActive && (
                      <Ionicons name="checkmark" size={18} color="#2563EB" style={styles.checkIcon} />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
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
    maxHeight: '85%',
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
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
  },
  emptyBox: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    marginBottom: 4,
  },
  headerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
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
  codeCol: {
    width: 90,
    paddingRight: 8,
  },
  textCol: {
    flex: 1,
    paddingRight: 8,
  },
  codeText: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '600',
  },
  textText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  textActive: {
    color: '#2563EB',
    fontWeight: '600',
  },
  checkIcon: {
    marginTop: 2,
  },
});
