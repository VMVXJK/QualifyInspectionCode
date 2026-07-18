import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { LocalItem } from '../types';
import { getQualitativeText } from '../data/qualitative-values';
import { getInspectItemName } from '../data/item-name-map';
import { getInspectMethodName } from '../data/method-name-map';
import { getInspectInstrumentName } from '../data/instrument-name-map';

interface ItemCardProps {
  item: LocalItem;
  inputVal: string;
  methodVal?: string;
  instrumentVal?: string;
  onChange: (detailId: string, val: string) => void;
  onPressSelect?: (item: LocalItem) => void;
  onPressMethodSelect?: (item: LocalItem) => void;
  onPressInstrumentSelect?: (item: LocalItem) => void;
}

export function ItemCard({
  item,
  inputVal,
  methodVal,
  instrumentVal,
  onChange,
  onPressSelect,
  onPressMethodSelect,
  onPressInstrumentSelect,
}: ItemCardProps) {
  const method = (item.analysis_method || '').trim();
  const isQualitative = method.includes('定性');

  // 检验结果标签样式
  const resultMeta = (() => {
    const r = item.inspect_result1;
    if (r === '合格') return { label: '合格', color: '#059669', bg: '#D1FAE5' };
    if (r === '不合格') return { label: '不合格', color: '#DC2626', bg: '#FEE2E2' };
    return null;
  })();

  const methodDisplay = getInspectMethodName(methodVal || item.inspect_method_name) || methodVal || item.inspect_method_name || '请选择检验方法';
  const instrumentDisplay = getInspectInstrumentName(instrumentVal || item.inspect_instrument_name) || instrumentVal || item.inspect_instrument_name || '请选择检验仪器';

  return (
    <View style={styles.card}>
      {/* Header：项目名称 + 检验结果 + 分析方法 */}
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>
          {item.item_name || getInspectItemName(item.item_id) || item.item_id || '未命名项目'}
        </Text>
        <View style={styles.headerTags}>
          {resultMeta && (
            <View style={[styles.resultTag, { backgroundColor: resultMeta.bg }]}>
              <Text style={[styles.resultTagText, { color: resultMeta.color }]}>{resultMeta.label}</Text>
            </View>
          )}
          <Text style={styles.method}>{method || '未指定'}</Text>
        </View>
      </View>

      {/* 检测值 */}
      <View style={styles.row}>
        <Text style={styles.label}>检测值</Text>
        {isQualitative ? (
          <TouchableOpacity
            style={styles.selectorBtn}
            onPress={() => onPressSelect?.(item)}
            activeOpacity={0.75}
          >
            <Text style={styles.selectorBtnText} numberOfLines={0}>
              {getQualitativeText(inputVal) || '请选择检验值'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TextInput
            style={styles.input}
            value={inputVal}
            onChangeText={(v) => onChange(item.detail_id || item.item_id, v)}
            placeholder="请输入检测值"
            keyboardType={method.includes('定量') ? 'decimal-pad' : 'default'}
          />
        )}
      </View>

      {/* 标准范围 */}
      {item.upper_limit !== undefined && item.lower_limit !== undefined && (
        <View style={styles.row}>
          <Text style={styles.label}>标准范围</Text>
          <Text style={styles.readonly}>
            {item.lower_limit} ~ {item.upper_limit}
          </Text>
        </View>
      )}

      {/* 目标值 */}
      {item.target_val ? (
        <View style={styles.row}>
          <Text style={styles.label}>目标值</Text>
          <Text style={[styles.readonly, styles.targetVal]}>{item.target_val}</Text>
        </View>
      ) : null}

      {/* 判定结果 */}
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

      {/* 检验方法 */}
      <View style={styles.row}>
        <Text style={styles.label}>检验方法</Text>
        <TouchableOpacity
          style={styles.selectorBtn}
          onPress={() => onPressMethodSelect?.(item)}
          activeOpacity={0.75}
        >
          <Text style={styles.selectorBtnText} numberOfLines={0}>{methodDisplay}</Text>
        </TouchableOpacity>
      </View>

      {/* 检验仪器 */}
      <View style={styles.row}>
        <Text style={styles.label}>检验仪器</Text>
        <TouchableOpacity
          style={styles.selectorBtn}
          onPress={() => onPressInstrumentSelect?.(item)}
          activeOpacity={0.75}
        >
          <Text style={styles.selectorBtnText} numberOfLines={0}>{instrumentDisplay}</Text>
        </TouchableOpacity>
      </View>

      {/* 缺陷等级（FDefectLevel1） */}
      {item.defect_level1 && (
        <View style={styles.row}>
          <Text style={styles.label}>缺陷等级</Text>
          <Text style={[styles.readonly, styles.defectLevel]}>{item.defect_level1}</Text>
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
  headerTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resultTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  resultTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  method: {
    fontSize: 12,
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
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
  selectorBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    minHeight: 40,
    justifyContent: 'center',
  },
  selectorBtnText: {
    fontSize: 14,
    color: '#1E293B',
    lineHeight: 20,
  },
  readonly: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
    textAlign: 'right',
  },
  targetVal: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'right',
    flexShrink: 1,
  },
  pass: {
    color: '#16A34A',
    fontWeight: '600',
  },
  fail: {
    color: '#DC2626',
    fontWeight: '600',
  },
  defectLevel: {
    color: '#D97706',
    fontWeight: '600',
  },
});
