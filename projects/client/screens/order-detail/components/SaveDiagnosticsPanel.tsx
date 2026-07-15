import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SaveDiagnostics } from '../types';

interface SaveDiagnosticsPanelProps {
  diagnostics: SaveDiagnostics | null;
  expanded: boolean;
  onToggle: () => void;
}

export function SaveDiagnosticsPanel({ diagnostics, expanded, onToggle }: SaveDiagnosticsPanelProps) {
  if (!diagnostics) return null;

  return (
    <View style={[styles.section, { marginTop: 8 }]}>
      <TouchableOpacity style={styles.toggle} onPress={onToggle}>
        <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={16} color="#64748B" />
        <Text style={styles.toggleText}>
          保存诊断 ({diagnostics.error ? '失败' : '成功'})
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View>
          {diagnostics.error && (
            <Text style={[styles.text, { color: '#DC2626' }]}>错误: {diagnostics.error}</Text>
          )}
          {!!diagnostics.fEntityDiagnostics && (
            <>
              <Text style={[styles.text, { fontWeight: '700', marginTop: 8 }]}>FEntity 诊断:</Text>
              <View style={styles.codeCard}>
                <Text style={styles.codeText}>
                  {JSON.stringify(diagnostics.fEntityDiagnostics, null, 2)}
                </Text>
              </View>
            </>
          )}
          <Text style={[styles.text, { fontWeight: '700', marginTop: 8 }]}>请求体 Model:</Text>
          <View style={styles.codeCard}>
            <Text style={styles.codeText}>
              {JSON.stringify(diagnostics.request, null, 2).substring(0, 3000)}
            </Text>
          </View>

          <Text style={[styles.text, { fontWeight: '700', marginTop: 8 }]}>响应体:</Text>
          <View style={styles.codeCard}>
            <Text style={styles.codeText}>
              {JSON.stringify(diagnostics.response, null, 2).substring(0, 3000)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 16, marginTop: 16 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  text: {
    fontSize: 12,
    color: '#1E293B',
    marginBottom: 4,
  },
  codeCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
  },
  codeText: {
    fontSize: 11,
    color: '#E2E8F0',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
});
