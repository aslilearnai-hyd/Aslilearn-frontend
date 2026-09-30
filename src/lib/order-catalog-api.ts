import { API_BASE_URL } from '@/lib/api-config';
import type { ProductBundle } from '@/components/CreateOrder/types';
import { getAuthToken } from '@/lib/auth-utils';

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

function parseMessage(json: Record<string, unknown>, status: number, fallback: string) {
  const message = json.message ?? json.error;
  if (typeof message === 'string' && message.trim()) return message;
  return `${fallback} (${status})`;
}

function normalizeBundle(raw: Record<string, unknown>): ProductBundle {
  const id = String(raw.id ?? raw.catalogId ?? '');
  return {
    id,
    name: String(raw.name ?? ''),
    classLabel: String(raw.classLabel ?? ''),
    price: Number(raw.price) || 0,
  };
}

export async function fetchOrderCatalog(): Promise<ProductBundle[]> {
  const res = await fetch(`${API_BASE_URL}/api/super-admin/order-catalog`, {
    headers: authHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(parseMessage(json, res.status, 'Failed to load catalog'));
  }
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows.map((row: unknown) => normalizeBundle(row as Record<string, unknown>));
}

export async function createCatalogProduct(
  product: ProductBundle & { isCustom?: boolean },
): Promise<{ success: boolean; message?: string; data?: ProductBundle }> {
  const res = await fetch(`${API_BASE_URL}/api/super-admin/order-catalog`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      id: product.id,
      name: product.name,
      classLabel: product.classLabel,
      price: product.price,
      isCustom: product.isCustom ?? product.id.startsWith('custom-'),
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok && json.success !== false) {
    return {
      success: true,
      message: json.message || 'Product added to catalog',
      data: json.data ? normalizeBundle(json.data as Record<string, unknown>) : product,
    };
  }
  return { success: false, message: parseMessage(json, res.status, 'Failed to add product') };
}

export async function updateCatalogProduct(
  id: string,
  patch: Partial<Pick<ProductBundle, 'name' | 'classLabel' | 'price'>>,
): Promise<{ success: boolean; message?: string; data?: ProductBundle }> {
  const res = await fetch(`${API_BASE_URL}/api/super-admin/order-catalog/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok && json.success !== false) {
    return {
      success: true,
      message: json.message || 'Product updated',
      data: json.data ? normalizeBundle(json.data as Record<string, unknown>) : undefined,
    };
  }
  return { success: false, message: parseMessage(json, res.status, 'Failed to update product') };
}

export async function deleteCatalogProduct(
  id: string,
): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`${API_BASE_URL}/api/super-admin/order-catalog/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok && json.success !== false) {
    return { success: true, message: json.message || 'Product deleted' };
  }
  return { success: false, message: parseMessage(json, res.status, 'Failed to delete product') };
}
