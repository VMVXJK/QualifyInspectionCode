import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface SelectModalOption {
  label: string;
  value: string;
}

interface SelectModalProps {
  visible: boolean;
  label: string;
  value: string;
  options: string[] | SelectModalOption[];
  onSelect: (value: string) => void;
  onClose: () => void;
}

function normalizeOptions(options: string[] | SelectModalOption[]): SelectModalOption[] {
  if (options.length === 0) return [];
  if (typeof options[0] === 'string') {
    return (options as string[]).map((opt) => ({ label: opt, value: opt }));
  }
  return options as SelectModalOption[];
}

export function SelectModal({ visible, label, value, options, onSelect, onClose }: SelectModalProps) {
  const normalized = normalizeOptions(options);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{label || '请选择'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {normalized.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.option, value === opt.value && styles.optionActive]}
                onPress={() => onSelect(opt.value)}
              >
                <Text style={[styles.optionText, value === opt.value && styles.optionTextActive]}>
                  {opt.label}
                </Text>
                {value === opt.value && <Ionicons name="checkmark" size={20} color="#2563EB" />}
              </TouchableOpacity>
            ))}
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 17, fontWeight: '700', color: '#1E293B' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  optionActive: { backgroundColor: '#EFF6FF' },
  optionText: { fontSize: 15, color: '#1E293B' },
  optionTextActive: { color: '#2563EB', fontWeight: '600' },
});
