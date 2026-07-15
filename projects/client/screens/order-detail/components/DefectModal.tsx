import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SelectField } from './SelectField';
import { DecisionField } from './DecisionField';
import type { LocalDefect } from '../types';
import type { SelectModalOption } from './SelectModal';
import {
  DEFECT_TYPE_OPTIONS,
  DEFECT_REASON_OPTIONS,
  DEFECT_LEVEL_OPTIONS,
  DEFECT_RESULT_OPTIONS,
} from '../constants';

interface DefectModalProps {
  visible: boolean;
  editingDefect: Partial<LocalDefect>;
  onClose: () => void;
  onSave: () => void;
  onChange: (patch: Partial<LocalDefect>) => void;
  openSelect: (label: string, value: string, options: string[] | SelectModalOption[], onChange: (v: string) => void) => void;
}

export function DefectModal({
  visible,
  editingDefect,
  onClose,
  onSave,
  onChange,
  openSelect,
}: DefectModalProps) {
  const isEdit = !!editingDefect.detail_id && !editingDefect.detail_id.startsWith('temp_');

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{isEdit ? '编辑缺陷' : '新增缺陷'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.label}>缺陷类型</Text>
              <SelectField
                label=""
                value={editingDefect.defect_type || ''}
                onPress={() =>
                  openSelect('缺陷类型', editingDefect.defect_type || '', DEFECT_TYPE_OPTIONS, (v) =>
                    onChange({ defect_type: v })
                  )
                }
                placeholder="请选择缺陷类型"
              />
            </View>
            <DecisionField
              label="缺陷数量"
              value={String(editingDefect.defect_qty || '')}
              onChange={(v) => onChange({ defect_qty: Number(v) || 0 })}
              keyboardType="numeric"
            />
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.label}>缺陷原因</Text>
              <SelectField
                label=""
                value={editingDefect.defect_reason || ''}
                onPress={() =>
                  openSelect('缺陷原因', editingDefect.defect_reason || '', DEFECT_REASON_OPTIONS, (v) =>
                    onChange({ defect_reason: v })
                  )
                }
                placeholder="请选择缺陷原因"
              />
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.label}>缺陷等级</Text>
              <SelectField
                label=""
                value={editingDefect.defect_level || ''}
                onPress={() =>
                  openSelect('缺陷等级', editingDefect.defect_level || '', DEFECT_LEVEL_OPTIONS, (v) =>
                    onChange({ defect_level: v })
                  )
                }
                placeholder="请选择缺陷等级"
              />
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.label}>缺陷后果</Text>
              <SelectField
                label=""
                value={editingDefect.defect_result || ''}
                onPress={() =>
                  openSelect('缺陷后果', editingDefect.defect_result || '', DEFECT_RESULT_OPTIONS, (v) =>
                    onChange({ defect_result: v })
                  )
                }
                placeholder="请选择缺陷后果"
              />
            </View>
          </ScrollView>
          <TouchableOpacity style={styles.saveBtn} onPress={onSave}>
            <Text style={styles.saveText}>保存</Text>
          </TouchableOpacity>
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
  label: { fontSize: 13, color: '#64748B', marginBottom: 4 },
  saveBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
