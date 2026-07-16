import { useState, useCallback, useEffect } from 'react';
import { submitInspectionResult, submitInspectBill } from '@/api/kingdee/inspect';
import { autoJudge } from '@/api/kingdee/utils';
import { showSuccess, showError } from '@/utils/toast';
import { showConfirm } from '@/utils/alert';
import type { LocalItem, LocalDefect, LocalDecision, LocalMaterial, LocalOrder, SaveDiagnostics } from '../types';

interface UseInspectionFormParams {
  order: LocalOrder | null;
  material: LocalMaterial | null;
  items: LocalItem[];
  defects: LocalDefect[];
  decisions: LocalDecision[];
  rawBill: unknown;
  fetchDetail: (opts?: { silent?: boolean }) => Promise<void>;
}

interface UseInspectionFormResult {
  editingItems: Record<string, string>;
  editingMethods: Record<string, string>;
  editingInstruments: Record<string, string>;
  editingDecisions: LocalDecision[];
  saveDiagnostics: SaveDiagnostics | null;
  showSaveDiagnostics: boolean;
  setShowSaveDiagnostics: React.Dispatch<React.SetStateAction<boolean>>;
  handleItemChange: (detailId: string, val: string) => void;
  handleMethodChange: (detailId: string, val: string) => void;
  handleInstrumentChange: (detailId: string, val: string) => void;
  getItemResult: (item: LocalItem) => string;
  setEditingDecisions: React.Dispatch<React.SetStateAction<LocalDecision[]>>;
  addDecision: () => void;
  removeDecision: (idx: number) => void;
  updateDecision: (idx: number, patch: Partial<LocalDecision>) => void;
  saveDefect: (defect: LocalDefect) => boolean;
  removeDefect: (detailId?: string) => void;
  handleSubmit: () => Promise<void>;
  handleWorkflowSubmit: () => Promise<void>;
  defects: LocalDefect[];
}

/**
 * 检验表单状态管理 Hook
 * 负责：检测值编辑、决策编辑、缺陷管理、保存提交
 */
export function useInspectionForm(params: UseInspectionFormParams): UseInspectionFormResult {
  const { order, material, items, defects: initialDefects, decisions: initialDecisions, rawBill, fetchDetail } = params;

  // 检测值编辑态：detailId -> inspectVal
  const [editingItems, setEditingItems] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    items.forEach((it) => {
      if (it.detail_id) init[it.detail_id] = it.inspect_val || '';
    });
    return init;
  });

  // 检验方法编辑态：detailId -> methodCode
  const [editingMethods, setEditingMethods] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    items.forEach((it) => {
      if (it.detail_id) init[it.detail_id] = it.inspect_method_name || '';
    });
    return init;
  });

  // 检验仪器编辑态：detailId -> instrumentCode
  const [editingInstruments, setEditingInstruments] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    items.forEach((it) => {
      if (it.detail_id) init[it.detail_id] = it.inspect_instrument_name || '';
    });
    return init;
  });

  // 决策编辑态
  const [editingDecisions, setEditingDecisions] = useState<LocalDecision[]>(initialDecisions);

  // 缺陷记录（本地维护新增/删除，保存时回传）
  const [defects, setDefects] = useState<LocalDefect[]>(initialDefects);

  // 保存诊断
  const [saveDiagnostics, setSaveDiagnostics] = useState<SaveDiagnostics | null>(null);
  const [showSaveDiagnostics, setShowSaveDiagnostics] = useState(false);

  // 当外部数据刷新时同步状态
  useEffect(() => {
    const init: Record<string, string> = {};
    items.forEach((it) => {
      if (it.detail_id) init[it.detail_id] = it.inspect_val || '';
    });
    setEditingItems(init);
  }, [items]);

  useEffect(() => {
    const init: Record<string, string> = {};
    items.forEach((it) => {
      if (it.detail_id) init[it.detail_id] = it.inspect_method_name || '';
    });
    setEditingMethods(init);
  }, [items]);

  useEffect(() => {
    const init: Record<string, string> = {};
    items.forEach((it) => {
      if (it.detail_id) init[it.detail_id] = it.inspect_instrument_name || '';
    });
    setEditingInstruments(init);
  }, [items]);

  useEffect(() => {
    setEditingDecisions(initialDecisions);
  }, [initialDecisions]);

  useEffect(() => {
    setDefects(initialDefects);
  }, [initialDefects]);

  const handleItemChange = useCallback((detailId: string, val: string) => {
    setEditingItems((prev) => ({ ...prev, [detailId]: val }));
  }, []);

  const handleMethodChange = useCallback((detailId: string, val: string) => {
    setEditingMethods((prev) => ({ ...prev, [detailId]: val }));
  }, []);

  const handleInstrumentChange = useCallback((detailId: string, val: string) => {
    setEditingInstruments((prev) => ({ ...prev, [detailId]: val }));
  }, []);

  const getItemResult = useCallback((item: LocalItem): string => {
    const val = editingItems[item.detail_id || item.item_id] ?? item.inspect_val ?? '';
    return autoJudge(val, item.upper_limit, item.lower_limit);
  }, [editingItems]);

  const addDecision = useCallback(() => {
    setEditingDecisions((prev) => [
      ...prev,
      { policy_status: '', policy_qty: 0, use_policy: '', is_defect_process: false, is_mrb_review: false },
    ]);
  }, []);

  const removeDecision = useCallback((idx: number) => {
    setEditingDecisions((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateDecision = useCallback((idx: number, patch: Partial<LocalDecision>) => {
    setEditingDecisions((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d))
    );
  }, []);

  const saveDefect = useCallback((defect: LocalDefect) => {
    if (!defect.defect_type || !defect.defect_level) {
      showError('请填写缺陷类型和等级');
      return false;
    }
    setDefects((prev) => {
      const exists = prev.find((x) => x.detail_id === defect.detail_id);
      if (exists) {
        return prev.map((x) => (x.detail_id === defect.detail_id ? { ...defect } : x));
      }
      return [...prev, { ...defect, detail_id: defect.detail_id || `temp_${Date.now()}` }];
    });
    return true;
  }, []);

  const removeDefect = useCallback((detailId?: string) => {
    if (!detailId) return;
    setDefects((prev) => prev.filter((x) => x.detail_id !== detailId));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!order) return;
    const ok = await showConfirm('确认提交', '提交后检验数据将回传至金蝶云星空，是否继续？');
    if (!ok) return;

    try {
      const mappedItems = items.map((it) => ({
        detail_id: it.detail_id,
        item_id: it.item_id,
        inspect_val: editingItems[it.detail_id || it.item_id] ?? it.inspect_val ?? '',
        upper_limit: it.upper_limit,
        lower_limit: it.lower_limit,
        analysis_method: it.analysis_method,
      }));

      const mappedDefects = defects.map((d) => ({
        detail_id: d.detail_id?.startsWith('temp_') ? undefined : d.detail_id,
        defect_type: d.defect_type,
        defect_qty: d.defect_qty,
        defect_level: d.defect_level,
        defect_reason: d.defect_reason,
        defect_result: d.defect_result,
      }));

      const mappedDecisions = editingDecisions.length > 0
        ? editingDecisions.map((dec) => ({
            entryId: material?.entry_id || '',
            detail_id: dec.detail_id,
            policy_status: dec.policy_status,
            policy_qty: dec.policy_qty,
            use_policy: dec.use_policy,
            is_defect_process: dec.is_defect_process,
            is_mrb_review: dec.is_mrb_review,
          }))
        : undefined;

      const result = await submitInspectionResult({
        billId: order.id,
        entryId: material?.entry_id,
        inspector: '',
        billResult: mappedItems.every((it) => autoJudge(it.inspect_val, it.upper_limit, it.lower_limit) === '合格')
          ? '合格'
          : '不合格',
        items: mappedItems,
        defects: mappedDefects,
        decisions: mappedDecisions,
        rawBill: rawBill as any,
      });

      setSaveDiagnostics(result.diagnostics as SaveDiagnostics);
      setShowSaveDiagnostics(true);

      if (result.success) {
        showSuccess('检验结果已保存');
        fetchDetail();
      } else {
        showError(result.diagnostics.error || '保存失败');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '提交失败';
      showError(message);
    }
  }, [order, material, items, defects, editingDecisions, editingItems, rawBill, fetchDetail]);

  const handleWorkflowSubmit = useCallback(async () => {
    if (!order?.order_no) {
      showError('单据编号不存在，无法提交');
      return;
    }
    const ok = await showConfirm('确认提交', '提交后单据将进入审核流程，是否继续？');
    if (!ok) return;

    try {
      await submitInspectBill([order.order_no]);
      showSuccess('单据提交成功');
      fetchDetail();
    } catch (error) {
      const message = error instanceof Error ? error.message : '单据提交失败';
      showError(message);
    }
  }, [order, fetchDetail]);

  return {
    editingItems,
    editingMethods,
    editingInstruments,
    editingDecisions,
    saveDiagnostics,
    showSaveDiagnostics,
    setShowSaveDiagnostics,
    handleItemChange,
    handleMethodChange,
    handleInstrumentChange,
    getItemResult,
    setEditingDecisions,
    addDecision,
    removeDecision,
    updateDecision,
    saveDefect,
    removeDefect,
    handleSubmit,
    handleWorkflowSubmit,
    defects,
  };
}
