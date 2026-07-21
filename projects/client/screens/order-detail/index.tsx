import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';

import { useBillDetail } from './hooks/useBillDetail';
import { useInspectionForm } from './hooks/useInspectionForm';
import { viewQCScheme } from '@/api/kingdee/inspect';
import { showError } from '@/utils/toast';
import { showConfirm } from '@/utils/alert';

import { Section } from './components/Section';
import { InfoRow } from './components/InfoRow';
import { SelectField } from './components/SelectField';
import { CheckBox } from './components/CheckBox';
import { Empty } from './components/Empty';
import { ItemCard } from './components/ItemCard';
import { DecisionCard } from './components/DecisionCard';
import { DefectModal } from './components/DefectModal';
import { SelectModal } from './components/SelectModal';
import type { SelectModalOption } from './components/SelectModal';
import { QualitativeValueModal } from './components/QualitativeValueModal';
import { QCSchemeSelectModal } from './components/QCSchemeSelectModal';
import { SaveDiagnosticsPanel } from './components/SaveDiagnosticsPanel';

import { STATUS_MAP, getUsePolicyOptions } from './constants';
import { getQualitativeOptions, loadValueMapFromStorage } from './data/qualitative-values';
import { INSPECT_METHOD_NAME_MAP, loadMethodMapFromStorage } from './data/method-name-map';
import { INSPECT_INSTRUMENT_NAME_MAP, loadInstrumentMapFromStorage } from './data/instrument-name-map';
import { INSPECT_ITEM_NAME_MAP, loadItemMapFromStorage } from './data/item-name-map';
import { loadQCSchemeMapFromStorageLocal, getQCSchemeName, getCachedQCSchemeMap } from './data/qc-scheme-map';
import type { LocalDefect } from './types';

const { width: SCREEN_W } = Dimensions.get('window');
const IS_PORTRAIT = Dimensions.get('window').height >= Dimensions.get('window').width;
const PAD = IS_PORTRAIT ? 16 : 20;

export default function OrderDetailScreen() {
  const router = useSafeRouter();
  const { orderId, orderNo } = useSafeSearchParams<{ orderId: string; orderNo?: string }>();
  const { isAuthenticated } = useAuth();

  // 定性检验值选择器状态
  const [showQualitativeModal, setShowQualitativeModal] = useState(false);
  const [qualitativeDetailId, setQualitativeDetailId] = useState('');
  const [qualitativeValue, setQualitativeValue] = useState('');
  const [qualitativeOptions, setQualitativeOptions] = useState(getQualitativeOptions());

  // 检验方法选择器状态
  const [showMethodModal, setShowMethodModal] = useState(false);
  const [methodDetailId, setMethodDetailId] = useState('');
  const [methodValue, setMethodValue] = useState('');

  // 检验仪器选择器状态
  const [showInstrumentModal, setShowInstrumentModal] = useState(false);
  const [instrumentDetailId, setInstrumentDetailId] = useState('');
  const [instrumentValue, setInstrumentValue] = useState('');

  // 质检方案选择器状态
  const [showQCSchemeModal, setShowQCSchemeModal] = useState(false);
  const [qcSchemeLoading, setQCSchemeLoading] = useState(false);

  // 方法和仪器选项数据
  const METHOD_OPTIONS = Object.entries(INSPECT_METHOD_NAME_MAP).map(([code, text]) => ({ code, text }));
  const INSTRUMENT_OPTIONS = Object.entries(INSPECT_INSTRUMENT_NAME_MAP).map(([code, text]) => ({ code, text }));

  // 数据层
  const {
    loading,
    refreshing,
    rawBill,
    order,
    material,
    decisions,
    items,
    defects: remoteDefects,
    fetchDetail,
    onRefresh,
  } = useBillDetail(orderId, orderNo);

  // 预加载动态映射表（从 AsyncStorage）
  useEffect(() => {
    loadMethodMapFromStorage().catch(() => {
      /* ignore */
    });
    loadItemMapFromStorage().catch(() => {
      /* ignore */
    });
    loadInstrumentMapFromStorage().catch(() => {
      /* ignore */
    });
    loadQCSchemeMapFromStorageLocal().catch(() => {
      /* ignore */
    });
    loadValueMapFromStorage()
      .then(() => {
        setQualitativeOptions(getQualitativeOptions());
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  // 表单层
  const form = useInspectionForm({
    order,
    material,
    items,
    defects: remoteDefects,
    decisions,
    rawBill,
    fetchDetail,
  });

  const handleQualitativeSelect = useCallback((code: string) => {
    setQualitativeValue(code);
    form.handleItemChange(qualitativeDetailId, code);
    setShowQualitativeModal(false);
  }, [qualitativeDetailId, form]);

  const handleMethodSelect = useCallback((code: string) => {
    setMethodValue(code);
    form.handleMethodChange(methodDetailId, code);
    setShowMethodModal(false);
  }, [methodDetailId, form]);

  const handleInstrumentSelect = useCallback((code: string) => {
    setInstrumentValue(code);
    form.handleInstrumentChange(instrumentDetailId, code);
    setShowInstrumentModal(false);
  }, [instrumentDetailId, form]);

  const handleQCSchemeSelect = useCallback(async (code: string, name: string) => {
    setShowQCSchemeModal(false);
    if (form.items.length > 0) {
      const ok = await showConfirm(
        '切换质检方案',
        `当前已有 ${form.items.length} 条检验项目，切换质检方案将覆盖现有检验项目，是否继续？`
      );
      if (!ok) return;
    }
    setQCSchemeLoading(true);
    try {
      const schemeItems = await viewQCScheme(code);
      const newLocalItems = schemeItems.map((si) => ({
        detail_id: '0',
        item_id: si.item_code,
        item_name: si.item_name,
        analysis_method: si.analysis_method,
        target_val: si.target_val,
        upper_limit: si.upper_limit !== undefined ? Number(si.upper_limit) || undefined : undefined,
        lower_limit: si.lower_limit !== undefined ? Number(si.lower_limit) || undefined : undefined,
        inspect_method_name: si.method_name || si.method_code,
        inspect_instrument_name: si.instrument_name || si.instrument_code,
        method_code: si.method_code,
        instrument_code: si.instrument_code,
        quality_std_code: si.quality_std_code,
        inspect_val: '',
        result: undefined,
        inspect_result1: '',
        defect_level1: '',
      }));
      form.replaceItemsFromScheme(newLocalItems, code, name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载质检方案失败';
      showError(msg);
    } finally {
      setQCSchemeLoading(false);
    }
  }, [form]);

  // 通用选择器 Modal 状态
  const [showSelectModal, setShowSelectModal] = useState(false);
  const [selectOptions, setSelectOptions] = useState<string[] | SelectModalOption[]>([]);
  const [selectValue, setSelectValue] = useState('');
  const [selectLabel, setSelectLabel] = useState('');
  const selectCallbackRef = useRef<((v: string) => void) | null>(null);

  const openSelect = useCallback((label: string, value: string, options: string[] | SelectModalOption[], onChange: (v: string) => void) => {
    setSelectLabel(label);
    setSelectValue(value);
    setSelectOptions(options);
    selectCallbackRef.current = onChange;
    setShowSelectModal(true);
  }, []);

  // 缺陷 Modal
  const [showDefectModal, setShowDefectModal] = useState(false);
  const [editingDefect, setEditingDefect] = useState<Partial<LocalDefect>>({});

  const openDefectModal = useCallback((defect?: LocalDefect) => {
    if (defect) {
      setEditingDefect({ ...defect });
    } else {
      setEditingDefect({
        defect_type: '',
        defect_qty: 1,
        defect_level: '轻缺陷',
        defect_reason: '',
        defect_result: '',
      });
    }
    setShowDefectModal(true);
  }, []);

  const handleSaveDefect = useCallback(() => {
    const success = form.saveDefect(editingDefect as LocalDefect);
    if (success) setShowDefectModal(false);
  }, [form, editingDefect]);

  const statusMeta = order ? STATUS_MAP[order.status] || STATUS_MAP.pending : STATUS_MAP.pending;

  // 加载态
  if (loading) {
    return (
      <Screen>
        <View style={[styles.container, styles.center]}>
          <Ionicons name="cloud-download-outline" size={48} color="#CBD5E1" />
          <Text style={styles.loadingText}>正在从金蝶拉取单据…</Text>
        </View>
      </Screen>
    );
  }

  // 未登录且无缓存
  if (!isAuthenticated && !order) {
    return (
      <Screen>
        <View style={[styles.container, styles.center]}>
          <Ionicons name="log-in-outline" size={48} color="#D97706" />
          <Text style={styles.loadingText}>未登录金蝶云星空</Text>
          <Text style={styles.loginHint}>请先完成登录后再查看检验单详情</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {order?.order_no || '检验单详情'}
            </Text>
            <View style={styles.backBtn} />
          </View>
          <View style={styles.headerMeta}>
            <View style={[styles.statusPill, { backgroundColor: statusMeta.bg }]}>
              <Text style={[styles.statusPillText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
            </View>
            <Text style={styles.headerDate}>{order?.date}</Text>
          </View>
        </View>

        {/* 基本信息 */}
        <Section title="基本信息">
          <InfoRow label="检验单号" value={order?.order_no} />
          <InfoRow label="单据类型" value={order?.type} />
          <InfoRow label="单据日期" value={order?.date} />
          <InfoRow label="质检组织" value={order?.inspect_org_name} />
          <InfoRow label="来源组织" value={order?.source_org_name} />
          <InfoRow label="单据状态" value={statusMeta.label} />
          <InfoRow label="创建人" value={order?.creator_name || order?.creator_number} />
          <InfoRow label="审核人" value={order?.approver_name || order?.approver_number} />
          <InfoRow label="创建日期" value={order?.create_date} />
          <InfoRow label="审核日期" value={order?.approve_date} />
        </Section>

        {/* 分录明细 */}
        <Section title="分录明细">
          <InfoRow label="物料编码 *" value={material?.material_code} />
          <InfoRow label="物料名称" value={material?.material_name} />
          <InfoRow label="规格型号" value={material?.material_model} />
          <SelectField
            label="质检方案"
            value={form.selectedSchemeName || form.selectedSchemeCode || material?.qc_scheme_name || getQCSchemeName(material?.qc_scheme_code) || material?.qc_scheme_code || ''}
            placeholder="点击选择质检方案"
            onPress={() => setShowQCSchemeModal(true)}
          />
          <InfoRow label="单位 *" value={material?.unit} />
          <InfoRow label="检验数量" value={material?.inspect_qty?.toString()} />
          <InfoRow label="合格数" value={material?.qualified_qty?.toString()} />
          <InfoRow label="不合格数" value={material?.unqualified_qty?.toString()} />
          <View style={styles.resultSummary}>
            <Text style={styles.resultLabel}>检验结果:</Text>
            {(() => {
              const result = material?.inspect_result || '待检';
              const resultColor = result === '合格' ? '#059669' : result === '不合格' ? '#DC2626' : '#94A3B8';
              return (
                <View style={[styles.resultBadge, { backgroundColor: resultColor + '15' }]}>
                  <Text style={[styles.resultBadgeText, { color: resultColor }]}>{result}</Text>
                </View>
              );
            })()}
            <Text style={styles.qtyText}>
              合格 <Text style={{ color: '#059669', fontWeight: '700' }}>{material?.qualified_qty ?? '-'}</Text>
              {' / '}
              不合格 <Text style={{ color: '#DC2626', fontWeight: '700' }}>{material?.unqualified_qty ?? '-'}</Text>
            </Text>
          </View>
        </Section>

        {/* 使用决策 */}
        <Section
          title="使用决策"
          action={
            <TouchableOpacity style={styles.addBtn} onPress={form.addDecision}>
              <Ionicons name="add-circle" size={20} color="#2563EB" />
              <Text style={styles.addBtnText}>新增行</Text>
            </TouchableOpacity>
          }
        >
          {form.editingDecisions.length === 0 ? (
            <Empty text="暂无使用决策，点击右上角添加" />
          ) : (
            form.editingDecisions.map((dec, idx) => (
              <DecisionCard
                key={idx}
                index={idx}
                decision={dec}
                onRemove={() => form.removeDecision(idx)}
                onUpdate={(patch) => form.updateDecision(idx, patch)}
                openSelect={openSelect}
              />
            ))
          )}
        </Section>

        {/* 检验项目 */}
        <Section title="检验项目">
          {qcSchemeLoading ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: '#64748B', fontSize: 14 }}>正在加载质检方案检验项目...</Text>
            </View>
          ) : form.items.length === 0 ? (
            <Empty text="暂无检验项目，请在上方选择质检方案" />
          ) : (
            form.items.map((item) => (
              <ItemCard
                key={item.detail_id || item.item_id}
                item={item}
                inputVal={form.editingItems[item.detail_id || item.item_id] ?? item.inspect_val ?? ''}
                methodVal={form.editingMethods[item.detail_id || item.item_id]}
                instrumentVal={form.editingInstruments[item.detail_id || item.item_id]}
                onChange={form.handleItemChange}
                onPressSelect={(it) => {
                  setQualitativeDetailId(it.detail_id || it.item_id);
                  setQualitativeValue(form.editingItems[it.detail_id || it.item_id] ?? it.inspect_val ?? '');
                  setShowQualitativeModal(true);
                }}
                onPressMethodSelect={(it) => {
                  setMethodDetailId(it.detail_id || it.item_id);
                  setMethodValue(form.editingMethods[it.detail_id || it.item_id] ?? it.inspect_method_name ?? '');
                  setShowMethodModal(true);
                }}
                onPressInstrumentSelect={(it) => {
                  setInstrumentDetailId(it.detail_id || it.item_id);
                  setInstrumentValue(form.editingInstruments[it.detail_id || it.item_id] ?? it.inspect_instrument_name ?? '');
                  setShowInstrumentModal(true);
                }}
              />
            ))
          )}
        </Section>

        {/* 缺陷记录 */}
        <Section
          title="缺陷记录"
          action={
            <TouchableOpacity style={styles.addBtn} onPress={() => openDefectModal()}>
              <Ionicons name="add-circle" size={20} color="#2563EB" />
              <Text style={styles.addBtnText}>添加</Text>
            </TouchableOpacity>
          }
        >
          {form.defects.length === 0 ? (
            <Empty text="暂无缺陷记录" />
          ) : (
            form.defects.map((d) => (
              <View key={d.detail_id || d.defect_type + d.defect_qty} style={styles.defectCard}>
                <View style={styles.defectTop}>
                  <Text style={styles.defectType}>{d.defect_type}</Text>
                  <View style={styles.defectActions}>
                    <TouchableOpacity onPress={() => openDefectModal(d)} style={styles.iconBtn}>
                      <Ionicons name="create-outline" size={18} color="#64748B" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => form.removeDefect(d.detail_id)} style={styles.iconBtn}>
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.defectMetaRow}>
                  <Text style={styles.defectMeta}>数量: {d.defect_qty}</Text>
                  <Text style={styles.defectMeta}>等级: {d.defect_level}</Text>
                </View>
                {d.defect_reason ? <Text style={styles.defectMeta}>原因: {d.defect_reason}</Text> : null}
                {d.defect_result ? <Text style={styles.defectMeta}>后果: {d.defect_result}</Text> : null}
                {d.defect_memo ? <Text style={styles.defectMemo}>备注: {d.defect_memo}</Text> : null}
              </View>
            ))
          )}
        </Section>

        {/* 底部按钮 */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.submitBtn} onPress={form.handleSubmit} activeOpacity={0.85}>
            <Ionicons name="save-outline" size={20} color="#FFFFFF" />
            <Text style={styles.submitBtnText}>保存检验结果</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.workflowBtn} onPress={form.handleWorkflowSubmit} activeOpacity={0.85}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.workflowBtnText}>提交单据</Text>
          </TouchableOpacity>
        </View>

        {/* 保存诊断面板 */}
        <SaveDiagnosticsPanel
          diagnostics={form.saveDiagnostics}
          expanded={form.showSaveDiagnostics}
          onToggle={() => form.setShowSaveDiagnostics((v) => !v)}
        />

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* 缺陷录入 Modal */}
      <DefectModal
        visible={showDefectModal}
        editingDefect={editingDefect}
        onClose={() => setShowDefectModal(false)}
        onSave={handleSaveDefect}
        onChange={(patch) => setEditingDefect((prev) => ({ ...prev, ...patch }))}
        openSelect={openSelect}
      />

      {/* 通用选择器 Modal */}
      <SelectModal
        visible={showSelectModal}
        label={selectLabel}
        value={selectValue}
        options={selectOptions}
        onSelect={(v) => {
          selectCallbackRef.current?.(v);
          setShowSelectModal(false);
        }}
        onClose={() => setShowSelectModal(false)}
      />

      {/* 定性检验值选择器 Modal */}
      <QualitativeValueModal
        visible={showQualitativeModal}
        value={qualitativeValue}
        options={qualitativeOptions}
        onSelect={handleQualitativeSelect}
        onClose={() => setShowQualitativeModal(false)}
      />

      {/* 检验方法选择器 Modal */}
      <QualitativeValueModal
        visible={showMethodModal}
        title="选择检验方法"
        value={methodValue}
        options={METHOD_OPTIONS}
        onSelect={handleMethodSelect}
        onClose={() => setShowMethodModal(false)}
      />

      {/* 检验仪器选择器 Modal */}
      <QualitativeValueModal
        visible={showInstrumentModal}
        title="选择检验仪器"
        value={instrumentValue}
        options={INSTRUMENT_OPTIONS}
        onSelect={handleInstrumentSelect}
        onClose={() => setShowInstrumentModal(false)}
      />

      {/* 质检方案选择器 Modal */}
      <QCSchemeSelectModal
        visible={showQCSchemeModal}
        value={form.selectedSchemeCode || material?.qc_scheme_code || ''}
        schemes={getCachedQCSchemeMap() || {}}
        loading={qcSchemeLoading}
        onSelect={handleQCSchemeSelect}
        onClose={() => setShowQCSchemeModal(false)}
        onGoSync={() => {
          setShowQCSchemeModal(false);
          router.push('/data-sync');
        }}
      />
    </Screen>
  );
}

/* ════════════════════════════════════════
   样式
   ════════════════════════════════════════ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  center: { justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#64748B', marginTop: 8 },
  loginHint: { fontSize: 13, color: '#94A3B8', marginTop: 6 },

  /* Header */
  header: {
    backgroundColor: '#2563EB',
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: PAD,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', flex: 1, textAlign: 'center' },
  headerMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  headerDate: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },

  /* Info */
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 8 },

  /* Decision */
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { fontSize: 13, color: '#2563EB', fontWeight: '600' },

  /* Defect */
  defectCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#F8FAFC',
  },
  defectTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  defectType: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  defectActions: { flexDirection: 'row', gap: 12 },
  iconBtn: { padding: 2 },
  defectMetaRow: { flexDirection: 'row', gap: 12, marginBottom: 2 },
  defectMeta: { fontSize: 12, color: '#64748B' },
  defectMemo: { fontSize: 12, color: '#64748B', marginTop: 4, lineHeight: 18 },

  /* Result Summary */
  resultSummary: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8, flexWrap: 'wrap' },
  resultLabel: { fontSize: 13, color: '#64748B' },
  resultBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  resultBadgeText: { fontSize: 12, fontWeight: '700' },
  qtyText: { fontSize: 13, color: '#1E293B' },

  /* Footer */
  footer: { marginHorizontal: PAD, marginTop: 20, marginBottom: 10, gap: 10 },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  workflowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  workflowBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
