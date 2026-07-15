import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface EmptyProps {
  text: string;
}

export function Empty({ text }: EmptyProps) {
  return (
    <View style={styles.emptyBox}>
      <Ionicons name="document-text-outline" size={32} color="#CBD5E1" />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyBox: { alignItems: 'center', paddingVertical: 20 },
  emptyText: { fontSize: 13, color: '#94A3B8', marginTop: 6 },
});
