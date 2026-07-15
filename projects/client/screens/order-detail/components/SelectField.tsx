import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SelectFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  onPress: () => void;
}

export function SelectField({ label, value, placeholder, onPress }: SelectFieldProps) {
  return (
    <TouchableOpacity style={styles.selectField} onPress={onPress} activeOpacity={0.7}>
      {label ? <Text style={styles.selectLabel}>{label}</Text> : null}
      <View style={styles.selectValueBox}>
        <Text style={[styles.selectValue, !value && styles.selectPlaceholder]}>
          {value || placeholder || '请选择'}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#94A3B8" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  selectField: { flex: 1, minWidth: '30%' },
  selectLabel: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  selectValueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
  },
  selectValue: { fontSize: 13, color: '#1E293B' },
  selectPlaceholder: { color: '#94A3B8' },
});
