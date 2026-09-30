import { API_BASE_URL } from '@/lib/api-config';
import type { CreateOrderState, SelectedProduct } from '@/components/CreateOrder/types';
import { ACADEMIC_YEAR } from '@/components/CreateOrder/types';
import { getAuthToken } from '@/lib/auth-utils';

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export type OrderFinancial = {
  orderType: string;
  category: string;
  paymentTerms: string;
  paymentDueDate: string;
  notes: string;
  documentName: string | null;
  documentUrl?: string | null;
  itemDiscount: number;
  specialDiscount: number;
  advanceReceived: number;
};

export type SavedOrder = {
  id: string;
  orderNumber: string;
  schoolId: string;
  adminId: string;
  schoolName: string;
  brand: string;
  academicYear: string;
  products: SelectedProduct[];
  financial: OrderFinancial;
  computed: CreateOrderState['computed'];
  status: 'draft' | 'confirmed';
  createdAt: string;
  updatedAt: string;
};

export type OrderPayload = {
  schoolId: string;
  adminId: string;
  schoolName: string;
  brand: string;
  academicYear: string;
  products: CreateOrderState['selectedProducts'];
  financial: Omit<
    CreateOrderState['financial'],
    'document' | 'documentPreviewUrl'
  > & { documentName: string | null; documentUrl: string | null };
  computed: CreateOrderState['computed'];
  status: 'draft' | 'confirmed';
};

function parseApiError(json: Record<string, unknown>, status: number, fallback: string) {
  const message = json.message ?? json.error;
  if (typeof message === 'string' && message.trim()) return message;
  return `${fallback} (${status})`;
}

function normalizeSavedOrder(raw: Record<string, unknown>): SavedOrder {
  const rawId = raw.id ?? raw._id;
  const id =
    typeof rawId === 'string'
      ? rawId
      : rawId != null && typeof rawId === 'object' && 'toString' in rawId
        ? String(rawId)
        : rawId != null
          ? String(rawId)
          : '';

  return {
    ...(raw as unknown as SavedOrder),
    id,
  };
}

function orderUrl(id: string) {
  const key = encodeURIComponent(String(id || '').trim());
  if (!key || key === 'undefined' || key === 'null') {
    throw new Error('Invalid order id. Refresh the orders list and try again.');
  }
  return `${API_BASE_URL}/api/super-admin/orders/${key}`;
}

function buildPayload(state: CreateOrderState, status: 'draft' | 'confirmed'): OrderPayload {
  const { document, documentPreviewUrl, ...financialRest } = state.financial;
  const documentUrl =
    documentPreviewUrl && !documentPreviewUrl.startsWith('blob:')
      ? documentPreviewUrl
      : null;

  return {
    schoolId: state.selectedSchool!.schoolId,
    adminId: state.selectedSchool!.id,
    schoolName: state.selectedSchool!.name,
    brand: state.selectedSchool!.brand,
    academicYear: ACADEMIC_YEAR,
    products: state.selectedProducts,
    financial: {
      ...financialRest,
      documentName: state.financial.documentName,
      documentUrl,
    },
    computed: state.computed,
    status,
  };
}

export async function fetchOrders(status?: 'draft' | 'confirmed'): Promise<SavedOrder[]> {
  const qs = status ? `?status=${status}` : '';
  const res = await fetch(`${API_BASE_URL}/api/super-admin/orders${qs}`, {
    headers: authHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(parseApiError(json, res.status, 'Failed to load orders'));
  }
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows.map((row: unknown) => normalizeSavedOrder(row as Record<string, unknown>));
}

export async function fetchOrderById(id: string): Promise<SavedOrder> {
  const res = await fetch(orderUrl(id), {
    headers: authHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(parseApiError(json, res.status, 'Order not found'));
  }
  return normalizeSavedOrder(json.data as Record<string, unknown>);
}

export async function saveOrderDraft(
  state: CreateOrderState,
  orderId?: string,
): Promise<{ success: boolean; message?: string; data?: SavedOrder }> {
  const payload = buildPayload(state, 'draft');
  try {
    const res = await fetch(
      orderId
        ? orderUrl(orderId)
        : `${API_BASE_URL}/api/super-admin/orders/draft`,
      {
        method: orderId ? 'PUT' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success !== false) {
      return {
        success: true,
        message: json.message || (orderId ? 'Draft updated successfully' : 'Draft saved successfully'),
        data: json.data ? normalizeSavedOrder(json.data as Record<string, unknown>) : undefined,
      };
    }
    return { success: false, message: parseApiError(json, res.status, 'Failed to save draft') };
  } catch (e: unknown) {
    return {
      success: false,
      message: e instanceof Error ? e.message : 'Failed to save draft',
    };
  }
}

export async function confirmOrder(
  state: CreateOrderState,
  orderId?: string,
): Promise<{ success: boolean; message?: string; data?: SavedOrder }> {
  const payload = buildPayload(state, 'confirmed');
  try {
    const res = await fetch(
      orderId
        ? orderUrl(orderId)
        : `${API_BASE_URL}/api/super-admin/orders`,
      {
        method: orderId ? 'PUT' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success !== false) {
      return {
        success: true,
        message: json.message || (orderId ? 'Order updated successfully' : 'Order confirmed successfully'),
        data: json.data ? normalizeSavedOrder(json.data as Record<string, unknown>) : undefined,
      };
    }
    return { success: false, message: parseApiError(json, res.status, 'Failed to update order') };
  } catch (e: unknown) {
    return {
      success: false,
      message: e instanceof Error ? e.message : 'Failed to update order',
    };
  }
}

export async function deleteOrder(id: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(orderUrl(id), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success !== false) {
      return { success: true, message: json.message || 'Order deleted successfully' };
    }
    return { success: false, message: parseApiError(json, res.status, 'Failed to delete order') };
  } catch (e: unknown) {
    return {
      success: false,
      message: e instanceof Error ? e.message : 'Failed to delete order',
    };
  }
}

export async function uploadOrderDocument(file: File): Promise<{ url: string; name: string }> {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append('document', file);

  const res = await fetch(`${API_BASE_URL}/api/super-admin/orders/documents`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok && json.data?.url) {
    const url = String(json.data.url).startsWith('http')
      ? json.data.url
      : `${API_BASE_URL}${json.data.url.startsWith('/') ? '' : '/'}${json.data.url}`;
    return { url, name: file.name };
  }
  throw new Error(json.message || 'Upload failed');
}
