import { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '@/lib/api-config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { Edit, Link2, Plus, Search, Trash2, X } from 'lucide-react';
import { notifyCurriculumTaxonomyChanged } from '@/lib/curriculum-taxonomy-refresh';
import { formatIitCategoryLabel } from '@/lib/products';
import { sortChapterWiseLabels } from '@/lib/curriculum-chapter-sort';
import { getAuthToken } from '@/lib/auth-utils';

const NATURAL_COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const GENERAL_CATEGORY = '';

type Board = { code: string; name: string; product?: string };
type ProductCategoryOption = { code: string; label: string };
type TopicHierarchyTree = Record<string, Record<string, Record<string, string[]>>>;
type TopicRow = {
  _id: string;
  board: string;
  productCategory?: string;
  classLabel: string;
  subject: string;
  label: string;
  topicName: string;
  subTopic: string;
  updatedAt: string;
};

const defaultForm = {
  board: '',
  productCategory: GENERAL_CATEGORY,
  classLabel: '',
  subject: '',
  label: '',
  topicName: '',
  subTopic: '',
};

type DialogMode = 'create' | 'edit' | 'addSubTopic';

/** One category reusing another category's topics + generated content. */
type CategoryShare = {
  _id?: string;
  board: string;
  classLabel: string;
  subject: string;
  targetCategory: string;
  sourceCategory: string;
};

function categoryDisplayName(code: string, options: ProductCategoryOption[]) {
  const match = options.find((c) => c.code === code);
  if (match?.label) return match.label;
  return formatIitCategoryLabel(code) || 'General';
}

function shareScopeLabel(share: Pick<CategoryShare, 'classLabel' | 'subject'>) {
  return share.subject ? `${share.classLabel} · ${share.subject}` : `${share.classLabel} · all subjects`;
}

function authHeaders() {
  const token =
    getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function normalizeClassLabel(value: string) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `Class ${digits}` : '';
}

function classNumberFromLabel(value: string) {
  return String(value || '').replace(/\D/g, '');
}

function sortNatural(values: string[]) {
  return [...values].sort((a, b) => NATURAL_COLLATOR.compare(a, b));
}

function buildDisplayTopicName(label: string, topicName: string) {
  const safeLabel = String(label || '').trim();
  const safeTopic = String(topicName || '').trim();
  if (!safeLabel) return safeTopic;
  const prefix = `${safeLabel} - `;
  return safeTopic.startsWith(prefix) ? safeTopic : `${prefix}${safeTopic}`;
}

function splitTopicByLabel(label: string, topicName: string) {
  const safeLabel = String(label || '').trim();
  const safeTopicName = String(topicName || '').trim();
  if (!safeLabel) return { label: '', topicName: safeTopicName };
  const prefix = `${safeLabel} - `;
  if (safeTopicName.startsWith(prefix)) {
    return { label: safeLabel, topicName: safeTopicName.slice(prefix.length).trim() };
  }
  return { label: safeLabel, topicName: safeTopicName };
}

function normalizeBoardProductKey(value: string) {
  const compact = String(value || '')
    .toUpperCase()
    .replace(/[\s/\\-_]+/g, '');
  if (compact.includes('IIT') || compact.includes('NEET') || compact.includes('JEE')) {
    return 'IIT';
  }
  return String(value || '').toUpperCase().trim();
}

export default function AiToolTopicsManagement() {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [boards, setBoards] = useState<Board[]>([]);
  const [rows, setRows] = useState<TopicRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedBoard, setSelectedBoard] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<ProductCategoryOption[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedSubTopic, setSelectedSubTopic] = useState('');
  const [hierarchyTree, setHierarchyTree] = useState<TopicHierarchyTree | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [lockTopicFields, setLockTopicFields] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [pendingSubTopics, setPendingSubTopics] = useState<string[]>([]);
  const [subTopicInput, setSubTopicInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isCustomBoard, setIsCustomBoard] = useState(false);
  const [customBoard, setCustomBoard] = useState('');
  const [isCustomClass, setIsCustomClass] = useState(false);
  const [customClass, setCustomClass] = useState('');
  const [isCustomSubject, setIsCustomSubject] = useState(false);
  const [customSubject, setCustomSubject] = useState('');
  const [bulkDeleting, setBulkDeleting] = useState<'class' | 'subject' | null>(null);
  const [availableBoards, setAvailableBoards] = useState<string[]>([]);
  const [dialogClassOptions, setDialogClassOptions] = useState<string[]>([]);
  const [dialogSubjectOptions, setDialogSubjectOptions] = useState<string[]>([]);
  const [dialogCategoryOptions, setDialogCategoryOptions] = useState<ProductCategoryOption[]>([
    { code: '', label: 'General' },
  ]);
  const [borrowedShares, setBorrowedShares] = useState<CategoryShare[]>([]);
  const [outgoingShares, setOutgoingShares] = useState<CategoryShare[]>([]);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareTargets, setShareTargets] = useState<string[]>([]);
  const [shareWholeClass, setShareWholeClass] = useState(false);
  const [savingShare, setSavingShare] = useState(false);

  const reloadData = async () => {
    await Promise.all([fetchRows(), loadBoards(), loadBoardHierarchy(selectedBoard, selectedCategory)]);
  };

  const prefillFromSelection = () => ({
    board: selectedBoard || '',
    productCategory: selectedCategory ?? GENERAL_CATEGORY,
    classLabel: selectedClass || '',
    subject: selectedSubject || '',
    label: '',
    topicName: selectedTopic || '',
    subTopic: '',
  });

  const resetSubTopicEntry = () => {
    setPendingSubTopics([]);
    setSubTopicInput('');
  };

  const addSubTopicToList = () => {
    const trimmed = subTopicInput.trim();
    if (!trimmed) {
      toast({ title: 'Validation', description: 'Enter a sub-topic name first.', variant: 'destructive' });
      return;
    }
    const exists = pendingSubTopics.some(
      (item) => item.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) {
      toast({ title: 'Duplicate', description: 'This sub-topic is already in the list.', variant: 'destructive' });
      return;
    }
    setPendingSubTopics((prev) => [...prev, trimmed]);
    setSubTopicInput('');
  };

  const removePendingSubTopic = (index: number) => {
    setPendingSubTopics((prev) => prev.filter((_, i) => i !== index));
  };

  const collectSubTopicsForSave = () => {
    const list = [...pendingSubTopics];
    const draft = subTopicInput.trim();
    if (draft && !list.some((item) => item.toLowerCase() === draft.toLowerCase())) {
      list.push(draft);
    }
    return list;
  };

  const fetchBoards = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/super-admin/boards`, { headers: authHeaders() });
      if (!response.ok) return;
      const json = await response.json();
      const data = Array.isArray(json?.data) ? json.data : [];
      const mapped = data.map((b: any) => ({
        code: String(b.code || b.id || b.name),
        name: String(b.name || b.code || b.id),
        product: String(b.product || '').toUpperCase().trim(),
      }));
      setBoards(mapped);
      if (mapped.length > 0) {
        setAvailableBoards((prev) => {
          const merged = new Set([
            ...prev,
            ...mapped.map((b: { code: string }) => b.code.toUpperCase()),
          ]);
          return Array.from(merged).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
        });
      }
    } catch {
      // ignore and fallback to manual board entry from table values
    }
  };

  const fetchRows = async () => {
    if (!selectedTopic && !search.trim()) {
      setRows([]);
      setTotal(0);
      return;
    }

    try {
      const params = new URLSearchParams({ page: '1', limit: '200' });
      if (search.trim()) params.set('search', search.trim());
      if (selectedBoard) params.set('board', selectedBoard);
      if (selectedCategory !== null) params.set('productCategory', selectedCategory);
      if (selectedClass) params.set('classLabel', selectedClass);
      if (selectedSubject) params.set('subject', selectedSubject);
      if (selectedTopic) params.set('topicName', selectedTopic);
      if (selectedSubTopic) params.set('subTopic', selectedSubTopic);

      const response = await fetch(`${API_BASE_URL}/api/super-admin/ai-tool-topics?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error('Failed to load AI tool topics');
      const json = await response.json();
      setRows(json?.data?.items || []);
      setTotal(json?.data?.total || 0);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load AI tool topics',
        variant: 'destructive',
      });
    }
  };

  const loadBoards = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/super-admin/ai-tool-topics/hierarchy`, {
        headers: authHeaders(),
      });
      if (!response.ok) {
        setAvailableBoards([]);
        return;
      }
      const json = await response.json();
      setAvailableBoards(sortNatural(json?.data?.boards || []));
    } catch {
      setAvailableBoards([]);
    }
  };

  const loadBoardHierarchy = async (board: string, productCategory: string | null) => {
    if (!board) {
      setHierarchyTree(null);
      setCategoryOptions([]);
      return;
    }
    try {
      const params = new URLSearchParams({ board });
      if (productCategory !== null) {
        params.set('productCategory', productCategory);
      }
      const response = await fetch(
        `${API_BASE_URL}/api/super-admin/ai-tool-topics/hierarchy?${params.toString()}`,
        { headers: authHeaders() },
      );
      if (!response.ok) {
        setHierarchyTree(null);
        return;
      }
      const json = await response.json();
      const cats: ProductCategoryOption[] = Array.isArray(json?.data?.productCategories)
        ? json.data.productCategories.map((c: any) => ({
            code: String(c.code ?? ''),
            label: String(c.label || formatIitCategoryLabel(c.code) || 'General'),
          }))
        : [{ code: '', label: 'General' }];
      setCategoryOptions(cats.length ? cats : [{ code: '', label: 'General' }]);
      setHierarchyTree(productCategory !== null ? json?.data?.tree || {} : null);
      setBorrowedShares(Array.isArray(json?.data?.shares) ? json.data.shares : []);
    } catch {
      setHierarchyTree(null);
      setBorrowedShares([]);
    }
  };

  const loadOutgoingShares = async (board: string, sourceCategory: string | null) => {
    if (!board || sourceCategory === null) {
      setOutgoingShares([]);
      return;
    }
    try {
      const params = new URLSearchParams({ board, sourceCategory });
      const response = await fetch(
        `${API_BASE_URL}/api/super-admin/ai-tool-topics/category-shares?${params.toString()}`,
        { headers: authHeaders() },
      );
      if (!response.ok) {
        setOutgoingShares([]);
        return;
      }
      const json = await response.json();
      setOutgoingShares(Array.isArray(json?.data) ? json.data : []);
    } catch {
      setOutgoingShares([]);
    }
  };

  const shareableCategories = useMemo(
    () => categoryOptions.filter((cat) => cat.code && cat.code !== selectedCategory),
    [categoryOptions, selectedCategory],
  );

  const sharesForCurrentScope = useMemo(() => {
    if (!selectedClass) return outgoingShares;
    return outgoingShares.filter((share) => {
      const sameClass =
        String(share.classLabel || '').replace(/\D/g, '') === selectedClass.replace(/\D/g, '');
      if (!sameClass) return false;
      if (!share.subject) return true;
      return !selectedSubject || share.subject.toLowerCase() === selectedSubject.toLowerCase();
    });
  }, [outgoingShares, selectedClass, selectedSubject]);

  const openShareDialog = () => {
    if (!selectedBoard || selectedCategory === null || !selectedClass) {
      toast({
        title: 'Select a class first',
        description: 'Pick the board, category and class whose content should be shared.',
        variant: 'destructive',
      });
      return;
    }
    setShareWholeClass(!selectedSubject);
    setShareTargets(sharesForCurrentScope.map((share) => share.targetCategory));
    setShareDialogOpen(true);
  };

  const toggleShareTarget = (code: string) => {
    setShareTargets((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const saveCategoryShare = async () => {
    if (!shareTargets.length) {
      toast({
        title: 'Pick a category',
        description: 'Select at least one category that should use this content.',
        variant: 'destructive',
      });
      return;
    }
    setSavingShare(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/super-admin/ai-tool-topics/category-shares`,
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            board: selectedBoard,
            classLabel: selectedClass,
            subject: shareWholeClass ? '' : selectedSubject,
            sourceCategory: selectedCategory ?? '',
            targetCategories: shareTargets,
          }),
        },
      );
      const json = await response.json();
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to save share');
      }
      toast({ title: 'Content shared', description: json.message });
      setShareDialogOpen(false);
      await loadOutgoingShares(selectedBoard, selectedCategory);
      notifyCurriculumTaxonomyChanged();
    } catch (error) {
      toast({
        title: 'Share failed',
        description: error instanceof Error ? error.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setSavingShare(false);
    }
  };

  const removeCategoryShare = async (share: CategoryShare) => {
    if (!share._id) return;
    const ok = await confirm({
      title: 'Remove shared content?',
      description: `${categoryDisplayName(
        share.targetCategory,
        categoryOptions,
      )} will stop using ${categoryDisplayName(
        share.sourceCategory,
        categoryOptions,
      )} content for ${shareScopeLabel(share)}.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/super-admin/ai-tool-topics/category-shares/${share._id}`,
        { method: 'DELETE', headers: authHeaders() },
      );
      const json = await response.json();
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to remove share');
      }
      toast({ title: 'Share removed', description: json.message });
      await loadOutgoingShares(selectedBoard, selectedCategory);
      notifyCurriculumTaxonomyChanged();
    } catch (error) {
      toast({
        title: 'Remove failed',
        description: error instanceof Error ? error.message : 'Request failed',
        variant: 'destructive',
      });
    }
  };

  const hierarchyClasses = useMemo(
    () => (hierarchyTree ? sortNatural(Object.keys(hierarchyTree)) : []),
    [hierarchyTree],
  );

  const hierarchySubjects = useMemo(() => {
    if (!hierarchyTree || !selectedClass) return [];
    return sortNatural(Object.keys(hierarchyTree[selectedClass] || {}));
  }, [hierarchyTree, selectedClass]);

  const hierarchyTopics = useMemo(() => {
    if (!hierarchyTree || !selectedClass || !selectedSubject) return [];
    // Always chapter-wise (1,2,…10,11) — Object.keys / DB sortOrder alone shows 1,11,2 and jumps on delete.
    return sortChapterWiseLabels(
      Object.keys(hierarchyTree[selectedClass]?.[selectedSubject] || {}),
    );
  }, [hierarchyTree, selectedClass, selectedSubject]);

  const hierarchySubTopics = useMemo(() => {
    if (!hierarchyTree || !selectedClass || !selectedSubject || !selectedTopic) return [];
    return sortNatural(
      hierarchyTree[selectedClass]?.[selectedSubject]?.[selectedTopic] || [],
    );
  }, [hierarchyTree, selectedClass, selectedSubject, selectedTopic]);

  const fetchDialogOptions = async (
    boardValue: string,
    productCategoryValue: string,
    classLabelValue: string,
  ) => {
    try {
      const baseUrl = `${API_BASE_URL}/api/super-admin/ai-tool-topics/options`;
      const boardMeta = boards.find(
        (item) => normalizeBoardProductKey(item.code) === normalizeBoardProductKey(boardValue),
      );
      const linkedProduct = String(boardMeta?.product || '').toUpperCase().trim();
      const categoriesUrl = linkedProduct
        ? `${API_BASE_URL}/api/super-admin/product-categories?product=${encodeURIComponent(linkedProduct)}`
        : '';
      const classesParams = new URLSearchParams();
      if (boardValue) {
        classesParams.set('board', boardValue);
        if (productCategoryValue !== '') {
          classesParams.set('productCategory', productCategoryValue);
        }
      }
      const subjectsParams = new URLSearchParams(classesParams);
      if (classLabelValue) subjectsParams.set('classLabel', classLabelValue);

      const [categoriesRes, classesRes, subjectsRes] = await Promise.all([
        boardValue && categoriesUrl
          ? fetch(categoriesUrl, { headers: authHeaders() })
          : Promise.resolve(null),
        boardValue
          ? fetch(`${baseUrl}?${classesParams.toString()}`, { headers: authHeaders() })
          : Promise.resolve(null),
        boardValue && classLabelValue
          ? fetch(`${baseUrl}?${subjectsParams.toString()}`, { headers: authHeaders() })
          : Promise.resolve(null),
      ]);

      if (categoriesRes?.ok) {
        const categoriesJson = await categoriesRes.json();
        const categories: ProductCategoryOption[] = Array.isArray(categoriesJson?.data)
          ? categoriesJson.data
              .filter((c: any) => c?.isActive !== false)
              .map((c: any) => ({
                code: String(c.code ?? ''),
                label: String(c.label || formatIitCategoryLabel(c.code) || 'General'),
              }))
          : [{ code: '', label: 'General' }];
        const normalized = [{ code: '', label: 'General' }, ...categories.filter((c) => c.code)];
        setDialogCategoryOptions(normalized);
        if (!normalized.some((c) => c.code === (productCategoryValue || ''))) {
          setForm((prev) => ({ ...prev, productCategory: GENERAL_CATEGORY }));
        }
      } else {
        setDialogCategoryOptions([{ code: '', label: 'General' }]);
      }

      if (classesRes?.ok) {
        const classesJson = await classesRes.json();
        setDialogClassOptions(sortNatural(classesJson?.data?.classes || []));
      } else {
        setDialogClassOptions([]);
      }

      if (subjectsRes?.ok) {
        const subjectsJson = await subjectsRes.json();
        setDialogSubjectOptions(sortNatural(subjectsJson?.data?.subjects || []));
      } else {
        setDialogSubjectOptions([]);
      }
    } catch {
      setDialogCategoryOptions([{ code: '', label: 'General' }]);
      setDialogClassOptions([]);
      setDialogSubjectOptions([]);
    }
  };

  useEffect(() => {
    fetchBoards();
  }, []);

  useEffect(() => {
    if (!isDialogOpen) return;
    if (!form.board) {
      setDialogCategoryOptions([{ code: '', label: 'General' }]);
      setDialogClassOptions([]);
      setDialogSubjectOptions([]);
      return;
    }
    void fetchDialogOptions(form.board, form.productCategory || '', form.classLabel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDialogOpen, form.board, form.productCategory, form.classLabel, boards]);

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, selectedBoard, selectedCategory, selectedClass, selectedSubject, selectedTopic, selectedSubTopic]);

  useEffect(() => {
    void loadBoards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadBoardHierarchy(selectedBoard, selectedCategory);
    void loadOutgoingShares(selectedBoard, selectedCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBoard, selectedCategory]);

  useEffect(() => {
    if (selectedBoard || availableBoards.length === 0) return;
    setSelectedBoard(availableBoards[0]);
  }, [availableBoards, selectedBoard]);

  useEffect(() => {
    if (!selectedBoard || selectedCategory !== null) return;
    setSelectedCategory(GENERAL_CATEGORY);
  }, [selectedBoard, selectedCategory]);

  const boardTabs = useMemo(() => availableBoards, [availableBoards]);

  const visibleRows = useMemo(() => {
    if (!selectedTopic) return rows;
    return rows.filter(
      (row) => buildDisplayTopicName(row.label, row.topicName) === selectedTopic,
    );
  }, [rows, selectedTopic]);

  const openCreate = () => {
    setEditingId(null);
    setDialogMode('create');
    setLockTopicFields(false);
    setForm({ ...defaultForm, ...prefillFromSelection() });
    resetSubTopicEntry();
    setIsCustomBoard(false);
    setCustomBoard('');
    setIsCustomClass(false);
    setCustomClass('');
    setIsCustomSubject(false);
    setCustomSubject('');
    setIsDialogOpen(true);
  };

  const openAddSubTopic = () => {
    if (!selectedBoard || !selectedClass || !selectedSubject || !selectedTopic) {
      toast({
        title: 'Select hierarchy first',
        description: 'Pick board, class, subject, and topic before adding sub-topics.',
        variant: 'destructive',
      });
      return;
    }
    setEditingId(null);
    setDialogMode('addSubTopic');
    setLockTopicFields(true);
    setForm({ ...defaultForm, ...prefillFromSelection() });
    resetSubTopicEntry();
    setIsCustomBoard(false);
    setCustomBoard('');
    setIsCustomClass(false);
    setCustomClass('');
    setIsCustomSubject(false);
    setCustomSubject('');
    setIsDialogOpen(true);
  };

  const openEdit = (row: TopicRow) => {
    const classNumber = classNumberFromLabel(row.classLabel);
    const normalizedClass = normalizeClassLabel(classNumber);
    const splitTopic = splitTopicByLabel(row.label, row.topicName);
    setEditingId(row._id);
    setDialogMode('edit');
    setLockTopicFields(false);
    setForm({
      board: row.board,
      productCategory: String(row.productCategory || ''),
      classLabel: normalizedClass || row.classLabel,
      subject: row.subject,
      label: splitTopic.label,
      topicName: splitTopic.topicName,
      subTopic: row.subTopic,
    });
    resetSubTopicEntry();
    setIsCustomBoard(false);
    setCustomBoard('');
    setIsCustomClass(false);
    setCustomClass('');
    setIsCustomSubject(false);
    setCustomSubject('');
    setIsDialogOpen(true);
  };

  const save = async () => {
    if (!form.board || !form.classLabel || !form.subject || !form.topicName) {
      toast({ title: 'Validation', description: 'Board, class, subject, and topic name are required.', variant: 'destructive' });
      return;
    }

    const subTopicsList = editingId
      ? [form.subTopic.trim()].filter(Boolean)
      : collectSubTopicsForSave();

    if (subTopicsList.length === 0) {
      toast({
        title: 'Validation',
        description: 'Add at least one sub-topic using the Add button.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = editingId
        ? `${API_BASE_URL}/api/super-admin/ai-tool-topics/${editingId}`
        : `${API_BASE_URL}/api/super-admin/ai-tool-topics`;
      const method = editingId ? 'PUT' : 'POST';
      const basePayload = {
        board: form.board,
        productCategory: form.productCategory || '',
        classLabel: normalizeClassLabel(form.classLabel),
        subject: form.subject,
        label: form.label,
        topicName: form.topicName.trim(),
      };

      const response = await fetch(endpoint, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(
          editingId
            ? { ...basePayload, subTopic: subTopicsList[0] }
            : { ...basePayload, subTopics: subTopicsList },
        ),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.message || 'Failed to save topic');

      const createdCount = Number(json?.createdCount || (editingId ? 1 : subTopicsList.length));
      const skipped = Array.isArray(json?.skipped) ? json.skipped.length : 0;
      toast({
        title: 'Success',
        description: editingId
          ? 'Topic updated.'
          : `Created ${createdCount} sub-topic${createdCount === 1 ? '' : 's'}${skipped ? ` (${skipped} already existed)` : ''}.`,
      });
      setIsDialogOpen(false);
      setForm(defaultForm);
      resetSubTopicEntry();
      setDialogMode('create');
      setLockTopicFields(false);
      setIsCustomBoard(false);
      setCustomBoard('');
      setIsCustomClass(false);
      setCustomClass('');
      setIsCustomSubject(false);
      setCustomSubject('');
      setEditingId(null);
      notifyCurriculumTaxonomyChanged();
      await reloadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save topic',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: 'Delete this mapping?',
      description: 'Delete this topic/sub topic mapping?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/super-admin/ai-tool-topics/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.message || 'Failed to delete');
      toast({ title: 'Deleted', description: 'Topic mapping removed.' });
      notifyCurriculumTaxonomyChanged();
      await reloadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete topic',
        variant: 'destructive',
      });
    }
  };

  const bulkDelete = async (scope: 'class' | 'subject') => {
    if (!selectedBoard) {
      toast({ title: 'Validation', description: 'Please select a board first.', variant: 'destructive' });
      return;
    }
    if (scope === 'class' && !selectedClass) {
      toast({ title: 'Validation', description: 'Please select a class to delete.', variant: 'destructive' });
      return;
    }
    if (scope === 'subject' && (!selectedClass || !selectedSubject)) {
      toast({
        title: 'Validation',
        description: 'Please select board, class, and subject to delete subject mappings.',
        variant: 'destructive',
      });
      return;
    }

    const confirmMessage =
      scope === 'class'
        ? `Delete all AI Tool Topic mappings for ${selectedBoard} / ${selectedClass}?`
        : `Delete all AI Tool Topic mappings for ${selectedBoard} / ${selectedClass} / ${selectedSubject}?`;
    const ok = await confirm({
      title: 'Delete topic mappings?',
      description: confirmMessage,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    setBulkDeleting(scope);
    try {
      const payload: Record<string, string> = { board: selectedBoard };
      if (selectedCategory !== null) payload.productCategory = selectedCategory;
      if (selectedClass) payload.classLabel = selectedClass;
      if (scope === 'subject' && selectedSubject) payload.subject = selectedSubject;
      const response = await fetch(`${API_BASE_URL}/api/super-admin/ai-tool-topics/bulk-delete`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) throw new Error(json?.message || 'Failed to bulk delete');
      const count = Number(json?.data?.modifiedCount || 0);
      toast({ title: 'Deleted', description: `Deleted ${count} topic mappings.` });
      setSelectedTopic('');
      setSelectedSubTopic('');
      notifyCurriculumTaxonomyChanged();
      await reloadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to bulk delete',
        variant: 'destructive',
      });
    } finally {
      setBulkDeleting(null);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {ConfirmDialog}
      <Card>
        <CardHeader>
          <CardTitle>AI Tool Topics Management</CardTitle>
          <CardDescription>
            Manage Board → Product category → Class → Subject → Topic → Sub Topic hierarchy for AI tools.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 h-3 w-3 sm:h-4 sm:w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="px-0 pl-9 sm:pl-10"
                placeholder="Search label / topic / sub topic"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <Button type="button" onClick={openCreate} className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4 shrink-0" />
                Add Topic
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!selectedTopic}
                onClick={openAddSubTopic}
                className="w-full sm:w-auto"
              >
                <Plus className="mr-2 h-4 w-4 shrink-0" />
                Add Sub Topic
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!selectedClass}
                onClick={openShareDialog}
                className="w-full sm:w-auto"
              >
                <Link2 className="mr-2 h-4 w-4 shrink-0" />
                Share Content
              </Button>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-3 sm:p-4 shadow-sm overflow-hidden min-w-0">
            <div className="mb-4 flex flex-wrap gap-2">
              {boardTabs.map((board) => {
                const isActive = selectedBoard === board;
                return (
                  <Button
                    key={board}
                    type="button"
                    variant="outline"
                    className={`rounded-full border px-3 sm:px-5 py-2 text-xs sm:text-sm font-medium transition-all max-w-full whitespace-normal h-auto ${
                      isActive
                        ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/40'
                    }`}
                    onClick={() => {
                      if (selectedBoard === board) return;
                      setSelectedBoard(board);
                      setSelectedCategory(GENERAL_CATEGORY);
                      setSelectedClass('');
                      setSelectedSubject('');
                      setSelectedTopic('');
                      setSelectedSubTopic('');
                    }}
                  >
                    {board}
                  </Button>
                );
              })}
            </div>

            {selectedBoard ? (
              <div className="mb-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Product category
                </p>
                <div className="flex flex-wrap gap-2">
                  {(categoryOptions.length
                    ? categoryOptions
                    : [{ code: '', label: 'General' }]
                  ).map((cat) => {
                    const isActive = selectedCategory === cat.code;
                    return (
                      <Button
                        key={cat.code || '__general__'}
                        type="button"
                        variant="outline"
                        className={`rounded-full border px-4 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                          isActive
                            ? 'border-orange-500 bg-orange-50 text-orange-800 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50/40'
                        }`}
                        onClick={() => {
                          if (selectedCategory === cat.code) return;
                          setSelectedCategory(cat.code);
                          setSelectedClass('');
                          setSelectedSubject('');
                          setSelectedTopic('');
                          setSelectedSubTopic('');
                        }}
                      >
                        {cat.label || formatIitCategoryLabel(cat.code) || 'General'}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {borrowedShares.length > 0 ? (
              <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900 sm:text-sm">
                <p className="font-semibold">Shared content</p>
                <ul className="mt-1 space-y-0.5">
                  {borrowedShares.map((share, index) => (
                    <li key={`${share.classLabel}-${share.subject}-${index}`}>
                      {shareScopeLabel(share)} uses{' '}
                      <span className="font-semibold">
                        {categoryDisplayName(share.sourceCategory, categoryOptions)}
                      </span>{' '}
                      topics and AI tool content.
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {sharesForCurrentScope.length > 0 ? (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-xs font-semibold text-emerald-900 sm:text-sm">
                  Categories using this content
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sharesForCurrentScope.map((share) => (
                    <span
                      key={share._id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-900"
                    >
                      {categoryDisplayName(share.targetCategory, categoryOptions)}
                      <span className="text-emerald-600">· {shareScopeLabel(share)}</span>
                      <button
                        type="button"
                        onClick={() => void removeCategoryShare(share)}
                        className="text-emerald-600 hover:text-emerald-900"
                        aria-label="Remove share"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
              {[
                {
                  title: 'Classes',
                  items: hierarchyClasses,
                  selected: selectedClass,
                  disabled: !selectedBoard || selectedCategory === null,
                },
                { title: 'Subjects', items: hierarchySubjects, selected: selectedSubject, disabled: !selectedClass },
                { title: 'Topics', items: hierarchyTopics, selected: selectedTopic, disabled: !selectedSubject },
                { title: 'Sub Topics', items: hierarchySubTopics, selected: selectedSubTopic, disabled: !selectedTopic },
              ].map((column) => (
                <div
                  key={column.title}
                  className="flex h-[340px] flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <h3 className="mb-3 text-xs sm:text-sm font-semibold text-slate-800">{column.title}</h3>
                  <div className="space-y-2 overflow-y-auto pr-1">
                    {column.items.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                        {column.disabled ? 'Select previous level' : `No ${column.title.toLowerCase()} found`}
                      </p>
                    ) : (
                      column.items.map((item) => {
                        const isActive = column.selected === item;
                        return (
                          <button
                            key={item}
                            type="button"
                            className={`w-full rounded-lg border px-3 py-2 text-left text-xs sm:text-sm transition break-words whitespace-normal ${
                              isActive
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/40'
                            }`}
                            onClick={() => {
                              if (column.title === 'Classes') {
                                setSelectedClass(item);
                                setSelectedSubject('');
                                setSelectedTopic('');
                                setSelectedSubTopic('');
                              } else if (column.title === 'Subjects') {
                                setSelectedSubject(item);
                                setSelectedTopic('');
                                setSelectedSubTopic('');
                              } else if (column.title === 'Topics') {
                                setSelectedTopic(item);
                                setSelectedSubTopic('');
                              } else {
                                setSelectedSubTopic(item);
                              }
                            }}
                          >
                            {item}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t pt-4">
              <p className="text-xs text-slate-500 break-words leading-relaxed">
                {selectedTopic
                  ? `Selected topic: ${selectedTopic} — use “Add Sub Topic” in the toolbar to add more sub-topics.`
                  : 'Select a topic to add sub-topics or view records below.'}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto justify-center border-amber-300 text-amber-700 hover:bg-amber-50 whitespace-normal h-auto min-h-9 py-2"
                disabled={!selectedBoard || !selectedClass || bulkDeleting !== null}
                onClick={() => bulkDelete('class')}
              >
                <Trash2 className="mr-2 h-4 w-4 shrink-0" />
                {bulkDeleting === 'class' ? 'Deleting Class...' : 'Delete Selected Class'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto justify-center border-red-300 text-red-700 hover:bg-red-50 whitespace-normal h-auto min-h-9 py-2"
                disabled={!selectedBoard || !selectedClass || !selectedSubject || bulkDeleting !== null}
                onClick={() => bulkDelete('subject')}
              >
                <Trash2 className="mr-2 h-4 w-4 shrink-0" />
                {bulkDeleting === 'subject' ? 'Deleting Subject...' : 'Delete Selected Subject'}
              </Button>
              </div>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Board</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Topic Name</TableHead>
                  <TableHead>Sub Topic</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedTopic && !search.trim() ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Select a topic above to view its sub topics below.
                    </TableCell>
                  </TableRow>
                ) : visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No AI tool topics found.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRows.map((row) => (
                    <TableRow key={row._id}>
                      <TableCell>{row.board}</TableCell>
                      <TableCell>
                        {row.productCategory
                          ? formatIitCategoryLabel(row.productCategory)
                          : 'General'}
                      </TableCell>
                      <TableCell>{row.classLabel}</TableCell>
                      <TableCell>{row.subject}</TableCell>
                      <TableCell>{buildDisplayTopicName(row.label, row.topicName)}</TableCell>
                      <TableCell>{row.subTopic}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button size="icon" variant="outline" onClick={() => openEdit(row)}>
                            <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                          <Button size="icon" variant="outline" onClick={() => remove(row._id)}>
                            <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Total records: {selectedTopic || search.trim() ? visibleRows.length : 0}
          </p>
        </CardContent>
      </Card>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetSubTopicEntry();
        }}
      >
        <DialogContent
          className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
          aria-labelledby="ai-tool-topic-dialog-title"
          aria-describedby="ai-tool-topic-dialog-description"
        >
          <div className="shrink-0 border-b px-4 pb-4 pt-4 sm:px-6 sm:pt-6">
            <DialogHeader>
              <DialogTitle id="ai-tool-topic-dialog-title">
                {dialogMode === 'edit'
                  ? 'Edit AI Tool Topic'
                  : dialogMode === 'addSubTopic'
                    ? 'Add Sub Topics to Existing Topic'
                    : 'Add AI Tool Topic'}
              </DialogTitle>
              <DialogDescription id="ai-tool-topic-dialog-description">
                {dialogMode === 'addSubTopic'
                  ? 'Add sub-topics one at a time under the selected topic.'
                  : dialogMode === 'edit'
                    ? 'Update this topic mapping.'
                    : 'Pick product category (track), then board / class / subject. Categories hold subjects — not the other way around.'}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Product category *</Label>
              <Select
                value={form.productCategory || '__general__'}
                disabled={lockTopicFields}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    productCategory: v === '__general__' ? '' : v,
                    classLabel: '',
                    subject: '',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="General" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__general__">General</SelectItem>
                  {(dialogCategoryOptions.length ? dialogCategoryOptions : categoryOptions)
                    .filter((c) => c.code)
                    .map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.label || formatIitCategoryLabel(c.code)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-mini text-slate-500">
                Category track (Alpha / Beta / …). Subjects and topics sit inside this track.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Board</Label>
              <Select
                value={isCustomBoard ? '__custom__' : form.board}
                disabled={lockTopicFields}
                onValueChange={(v) => {
                  if (v === '__custom__') {
                    setIsCustomBoard(true);
                    setForm((p) => ({ ...p, board: customBoard || '' }));
                  } else {
                    setIsCustomBoard(false);
                    setCustomBoard('');
                    setForm((p) => ({ ...p, board: v }));
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select board" /></SelectTrigger>
                <SelectContent>
                  {availableBoards.map((board) => {
                    const meta = boards.find((b) => String(b.code).toUpperCase() === String(board).toUpperCase());
                    return (
                      <SelectItem key={board} value={board}>
                        {meta?.name || board}
                      </SelectItem>
                    );
                  })}
                  <SelectItem value="__custom__">+ New Board</SelectItem>
                </SelectContent>
              </Select>
              {isCustomBoard && !lockTopicFields && (
                <Input
                  placeholder="Enter board name"
                  value={customBoard}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCustomBoard(value);
                    setForm((p) => ({ ...p, board: value }));
                  }}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Class</Label>
              <Select
                value={isCustomClass ? '__custom__' : classNumberFromLabel(form.classLabel)}
                disabled={lockTopicFields}
                onValueChange={(v) => {
                  if (v === '__custom__') {
                    setIsCustomClass(true);
                    setForm((p) => ({ ...p, classLabel: customClass || '' }));
                  } else {
                    setIsCustomClass(false);
                    setCustomClass('');
                    setForm((p) => ({ ...p, classLabel: normalizeClassLabel(v) }));
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {dialogClassOptions.map((classValue) => (
                    <SelectItem key={classValue} value={classNumberFromLabel(classValue)}>{classValue}</SelectItem>
                  ))}
                  <SelectItem value="__custom__">+ New Class</SelectItem>
                </SelectContent>
              </Select>
              {isCustomClass && !lockTopicFields && (
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter class number"
                  value={customClass}
                  onChange={(e) => {
                    const digitsOnly = e.target.value.replace(/\D/g, '');
                    setCustomClass(digitsOnly);
                    setForm((p) => ({ ...p, classLabel: normalizeClassLabel(digitsOnly) }));
                  }}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Select
                value={isCustomSubject ? '__custom__' : form.subject}
                disabled={lockTopicFields}
                onValueChange={(v) => {
                  if (v === '__custom__') {
                    setIsCustomSubject(true);
                    setForm((p) => ({ ...p, subject: customSubject || '' }));
                  } else {
                    setIsCustomSubject(false);
                    setCustomSubject('');
                    setForm((p) => ({ ...p, subject: v }));
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                <SelectContent>
                  {dialogSubjectOptions.map((subjectValue) => (
                    <SelectItem key={subjectValue} value={subjectValue}>{subjectValue}</SelectItem>
                  ))}
                  <SelectItem value="__custom__">+ New Subject</SelectItem>
                </SelectContent>
              </Select>
              {isCustomSubject && !lockTopicFields && (
                <Input
                  type="text"
                  placeholder="Enter subject name"
                  value={customSubject}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCustomSubject(value);
                    setForm((p) => ({ ...p, subject: value }));
                  }}
                />
              )}
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs sm:text-sm font-semibold">Topic</p>
            </div>
            <div className="space-y-2">
              <Label>Label (Optional)</Label>
              <Input
                placeholder="e.g. Chapter 1"
                value={form.label}
                disabled={lockTopicFields}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="Enter topic name"
                value={form.topicName}
                disabled={lockTopicFields}
                onChange={(e) => setForm((p) => ({ ...p, topicName: e.target.value }))}
              />
            </div>
            {editingId ? (
              <div className="space-y-2 md:col-span-2">
                <Label>Sub Topic</Label>
                <Input
                  placeholder="Enter sub topic"
                  value={form.subTopic}
                  onChange={(e) => setForm((p) => ({ ...p, subTopic: e.target.value }))}
                />
              </div>
            ) : (
              <div className="space-y-3 md:col-span-2">
                <Label>Sub Topics</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    placeholder="Enter sub topic"
                    value={subTopicInput}
                    onChange={(e) => setSubTopicInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSubTopicToList();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    onClick={addSubTopicToList}
                  >
                    <Plus className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                    Add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add each sub-topic separately — press Add or Enter after each one.
                  {pendingSubTopics.length > 0 ? ` (${pendingSubTopics.length} added)` : ''}
                </p>
                {pendingSubTopics.length > 0 && (
                  <ul className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 sm:max-h-56">
                    {pendingSubTopics.map((item, index) => (
                      <li
                        key={`${item}-${index}`}
                        className="flex items-start justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 flex-1 break-words">{item}</span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-slate-500 hover:text-red-600"
                          onClick={() => removePendingSubTopic(index)}
                          aria-label={`Remove ${item}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          </div>

          <DialogFooter className="shrink-0 border-t bg-background px-4 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()} disabled={submitting}>
              {editingId ? 'Update' : dialogMode === 'addSubTopic' ? 'Add Sub Topics' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Share this content with other categories</DialogTitle>
            <DialogDescription>
              Selected categories will show the same topics and AI tool content instead of keeping
              their own copy. Edit once here and every linked category stays in sync.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Source</p>
              <p className="mt-0.5 font-semibold text-slate-900">
                {selectedBoard} · {categoryDisplayName(selectedCategory ?? '', categoryOptions)} ·{' '}
                {selectedClass}
                {!shareWholeClass && selectedSubject ? ` · ${selectedSubject}` : ' · all subjects'}
              </p>
            </div>

            {selectedSubject ? (
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                  checked={shareWholeClass}
                  onChange={(e) => setShareWholeClass(e.target.checked)}
                />
                <span>
                  Share every subject in {selectedClass}
                  <span className="block text-xs text-slate-500">
                    Leave unchecked to share only {selectedSubject}.
                  </span>
                </span>
              </label>
            ) : null}

            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Categories that will use this content
              </Label>
              {shareableCategories.length === 0 ? (
                <p className="mt-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                  No other categories are available for this board.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {shareableCategories.map((cat) => (
                    <label
                      key={cat.code}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:border-orange-300 hover:bg-orange-50/40"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={shareTargets.includes(cat.code)}
                        onChange={() => toggleShareTarget(cat.code)}
                      />
                      <span className="font-medium text-slate-800">
                        {cat.label || formatIitCategoryLabel(cat.code)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShareDialogOpen(false)}
              disabled={savingShare}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveCategoryShare()}
              disabled={savingShare || shareableCategories.length === 0}
            >
              {savingShare ? 'Saving…' : 'Share content'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
