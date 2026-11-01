import { API_BASE_URL } from '@/lib/api-config';
import type { School } from '@/components/CreateOrder/types';
import { getAuthToken } from '@/lib/auth-utils';

type AdminSchoolRow = {
  id?: string;
  schoolId?: string;
  schoolName?: string;
  place?: string;
  state?: string;
  isAsliPrepExclusive?: boolean;
  curriculumBoard?: string;
  board?: string;
  status?: string;
  schoolDetails?: {
    city?: string;
    district?: string;
    state?: string;
  };
};

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export function mapAdminRowToSchool(row: AdminSchoolRow): School | null {
  const name = String(row.schoolName || '').trim();
  if (!name) return null;

  const city =
    String(row.schoolDetails?.city || row.place || row.state || '').trim() || '—';

  const brand = row.isAsliPrepExclusive
    ? 'Asli Prep'
    : String(row.curriculumBoard || row.board || 'Standard').trim();

  return {
    id: String(row.id || row.schoolId || ''),
    schoolId: String(row.schoolId || row.id || ''),
    name,
    city,
    brand,
    state: String(row.schoolDetails?.state || row.state || '').trim() || undefined,
  };
}

export async function fetchSchoolsForOrder(): Promise<School[]> {
  const res = await fetch(`${API_BASE_URL}/api/super-admin/admins?lite=1`, {
    headers: authHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to load schools (${res.status})`);
  }

  const json = await res.json();
  const rows: AdminSchoolRow[] = Array.isArray(json)
    ? json
    : Array.isArray(json?.data)
      ? json.data
      : [];

  return rows
    .map(mapAdminRowToSchool)
    .filter((s): s is School => s !== null && Boolean(s.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}
