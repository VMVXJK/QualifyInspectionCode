import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';

interface DecisionFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: 'default' | 'numeric';
}

export function DecisionField({ label, value, onChange, keyboardType }: DecisionFieldProps) {
  return (
    <View style={styles.decisionField}>
      <Text style={styles.decisionLabel}>{label}</Text>
      <TextInput
        style={styles.decisionInput}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        placeholderTextColor="#94A3B8"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  decisionField: { flex: 1, minWidth: '30%' },
  decisionLabel: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  decisionInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
  },
});
