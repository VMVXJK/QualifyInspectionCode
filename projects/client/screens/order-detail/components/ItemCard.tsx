import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { LocalItem } from '../types';

interface ItemCardProps {
  item: LocalItem;
  inputVal: string;
  onChange: (detailId: string, val: string) => void;
}

export function ItemCard({ item, inputVal, onChange }: ItemCardProps) {
  const method = (item.analysis_method || '').trim();

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name}>{item.item_name || item.item_id || '未命名项目'}</Text>
        <Text style={styles.method}>{method || '未指定'}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>检测值</Text>
        <TextInput
          style={styles.input}
          value={inputVal}
          onChangeText={(v) => onChange(item.detail_id || item.item_id, v)}
          placeholder="请输入检测值"
          keyboardType={method.includes('定量') ? 'decimal-pad' : 'default'}
        />
      </View>
      {item.target_val !== undefined && item.target_val !== '' && (
        <View style={styles.row}>
          <Text style={styles.label}>目标值</Text>
          <Text style={styles.readonly}>{item.target_val}</Text>
        </View>
      )}
      {item.upper_limit !== undefined && item.lower_limit !== undefined && (
        <View style={styles.row}>
          <Text style={styles.label}>标准范围</Text>
          <Text style={styles.readonly}>
            {item.lower_limit} ~ {item.upper_limit}
          </Text>
        </View>
      )}
      {item.result && (
        <View style={styles.row}>
          <Text style={styles.label}>判定结果</Text>
          <Text
            style={[
              styles.readonly,
              item.result === '合格' && styles.pass,
              item.result === '不合格' && styles.fail,
            ]}
          >
            {item.result}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  method: {
    fontSize: 12,
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  label: {
    fontSize: 13,
    color: '#64748B',
    width: 70,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
    minHeight: 40,
  },
  readonly: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
    textAlign: 'right',
  },
  pass: {
    color: '#16A34A',
    fontWeight: '600',
  },
  fail: {
    color: '#DC2626',
    fontWeight: '600',
  },
});
