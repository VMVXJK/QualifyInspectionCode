import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CheckBoxProps {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}

export function CheckBox({ label, value, onToggle }: CheckBoxProps) {
  return (
    <TouchableOpacity style={styles.checkBox} onPress={() => onToggle(!value)}>
      <Ionicons name={value ? 'checkbox-outline' : 'square-outline'} size={22} color={value ? '#2563EB' : '#94A3B8'} />
      <Text style={styles.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  checkBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkLabel: { fontSize: 13, color: '#374151' },
});
