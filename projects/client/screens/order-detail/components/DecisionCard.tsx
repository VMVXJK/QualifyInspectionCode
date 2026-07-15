import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SelectField } from './SelectField';
import { DecisionField } from './DecisionField';
import { CheckBox } from './CheckBox';
import type { LocalDecision } from '../types';
import type { SelectModalOption } from './SelectModal';
import { STATUS_OPTIONS, getUsePolicyOptions } from '../constants';

interface DecisionCardProps {
  index: number;
  decision: LocalDecision;
  onRemove: () => void;
  onUpdate: (patch: Partial<LocalDecision>) => void;
  openSelect: (label: string, value: string, options: string[] | SelectModalOption[], onChange: (v: string) => void) => void;
}

export function DecisionCard({ index, decision, onRemove, onUpdate, openSelect }: DecisionCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.rowHeader}>
        <Text style={styles.index}>第 {index + 1} 行</Text>
        <TouchableOpacity onPress={onRemove} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>
      <View style={styles.grid}>
        <SelectField
          label="状态"
          value={decision.policy_status || ''}
          onPress={() =>
            openSelect('状态', decision.policy_status || '', STATUS_OPTIONS, (v) => {
              const allowedPolicies = getUsePolicyOptions(v);
              const currentPolicy = decision.use_policy;
              const newPolicy = currentPolicy && allowedPolicies.includes(currentPolicy) ? currentPolicy : '';
              onUpdate({ policy_status: v, use_policy: newPolicy });
            })
          }
          placeholder="请选择状态"
        />
        <DecisionField
          label="数量"
          value={String(decision.policy_qty || '')}
          onChange={(v) => onUpdate({ policy_qty: Number(v) || 0 })}
          keyboardType="numeric"
        />
        <SelectField
          label="使用决策"
          value={decision.use_policy || ''}
          onPress={() => {
            const options = getUsePolicyOptions(decision.policy_status);
            openSelect('使用决策', decision.use_policy || '', options, (v) => onUpdate({ use_policy: v }));
          }}
          placeholder="请选择决策"
        />
      </View>
      <View style={styles.checkRow}>
        <CheckBox
          label="不良处理"
          value={!!decision.is_defect_process}
          onToggle={(v) => onUpdate({ is_defect_process: v })}
        />
        <CheckBox
          label="MRB评审"
          value={!!decision.is_mrb_review}
          onToggle={(v) => onUpdate({ is_mrb_review: v })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#F8FAFC',
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  index: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  iconBtn: { padding: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  checkRow: { flexDirection: 'row', gap: 20, marginTop: 12 },
});
