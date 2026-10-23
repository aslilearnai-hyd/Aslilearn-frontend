import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, School, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/lib/api-config';
import { getAuthToken, getUser as getStoredUser, setUser as persistUser } from '@/lib/auth-utils';

/**
 * School-admin Settings: the admin's own profile, school details and password.
 * Testers found no Settings option for school admins (teachers had one).
 */

const authHeaders = () => ({
  Authorization: `Bearer ${getAuthToken()}`,
  'Content-Type': 'application/json',
});

async function apiJson(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) throw new Error(json?.message || 'Request failed');
  return json;
}

function Section({ icon: Icon, title, children }: { icon: typeof School; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
        <Icon className="h-5 w-5 text-sky-600" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function AdminSettingsPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({ fullName: '', email: '', phone: '' });
  const [school, setSchool] = useState({ schoolName: '', board: '', workingHours: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSchool, setSavingSchool] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [me, settings] = await Promise.all([
          apiJson('/api/admin/me'),
          apiJson('/api/admin/school-settings'),
        ]);
        if (cancelled) return;
        setProfile({
          fullName: me.data?.fullName || '',
          email: me.data?.email || '',
          phone: me.data?.phone || '',
        });
        setSchool({
          schoolName: settings.settings?.schoolName || '',
          board: settings.settings?.board || '',
          workingHours: settings.settings?.workingHours || '',
        });
      } catch (error) {
        if (!cancelled) {
          toast({
            title: 'Could not load settings',
            description: error instanceof Error ? error.message : 'Please try again.',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const json = await apiJson('/api/admin/me', {
        method: 'PATCH',
        body: JSON.stringify({ fullName: profile.fullName, phone: profile.phone }),
      });
      const stored = getStoredUser();
      if (stored) persistUser({ ...stored, fullName: json.data?.fullName || profile.fullName });
      toast({ title: 'Profile saved' });
    } catch (error) {
      toast({ title: 'Could not save profile', description: error instanceof Error ? error.message : '', variant: 'destructive' });
    } finally {
      setSavingProfile(false);
    }
  };

  const saveSchool = async (e: FormEvent) => {
    e.preventDefault();
    setSavingSchool(true);
    try {
      await apiJson('/api/admin/school-settings', {
        method: 'PUT',
        body: JSON.stringify({ schoolName: school.schoolName, workingHours: school.workingHours }),
      });
      toast({ title: 'School details saved' });
    } catch (error) {
      toast({ title: 'Could not save school details', description: error instanceof Error ? error.message : '', variant: 'destructive' });
    } finally {
      setSavingSchool(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setSavingPassword(true);
    try {
      await apiJson('/api/admin/change-password', { method: 'POST', body: JSON.stringify(passwords) });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast({ title: 'Password updated' });
    } catch (error) {
      toast({ title: 'Could not change password', description: error instanceof Error ? error.message : '', variant: 'destructive' });
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
      </div>
    );
  }

  const passwordType = showPasswords ? 'text' : 'password';
  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">Your profile, school details and password.</p>
      </div>

      <Section icon={UserRound} title="Your profile">
        <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="admin-name">Full name</Label>
            <Input id="admin-name" value={profile.fullName} onChange={(e) => setProfile({ ...profile, fullName: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-phone">Phone</Label>
            <Input
              id="admin-phone"
              inputMode="numeric"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value.replace(/\D/g, '').slice(0, 15) })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="admin-email">Email (login)</Label>
            <Input id="admin-email" value={profile.email} readOnly disabled />
            <p className="text-xs text-slate-500">Contact AsliLearn support to change your login email.</p>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={savingProfile}>
              {savingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save profile
            </Button>
          </div>
        </form>
      </Section>

      <Section icon={School} title="School details">
        <form onSubmit={saveSchool} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="school-name">School name</Label>
            <Input id="school-name" value={school.schoolName} onChange={(e) => setSchool({ ...school, schoolName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="school-board">Board</Label>
            <Input id="school-board" value={school.board} readOnly disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="school-hours">Working hours</Label>
            <Input
              id="school-hours"
              placeholder="e.g. 8:40 AM – 4:25 PM"
              value={school.workingHours}
              onChange={(e) => setSchool({ ...school, workingHours: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={savingSchool}>
              {savingSchool ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save school details
            </Button>
          </div>
        </form>
      </Section>

      <Section icon={KeyRound} title="Change password">
        <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ['currentPassword', 'Current password'],
              ['newPassword', 'New password (8+ characters)'],
              ['confirmPassword', 'Confirm new password'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`admin-${key}`}>{label}</Label>
              <Input
                id={`admin-${key}`}
                type={passwordType}
                autoComplete={key === 'currentPassword' ? 'current-password' : 'new-password'}
                value={passwords[key]}
                onChange={(e) => setPasswords({ ...passwords, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
            <Button
              type="submit"
              disabled={savingPassword || !passwords.currentPassword || passwords.newPassword.length < 8 || !passwords.confirmPassword}
            >
              {savingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Update password
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowPasswords((v) => !v)}>
              {showPasswords ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
              {showPasswords ? 'Hide' : 'Show'} passwords
            </Button>
          </div>
        </form>
      </Section>
    </div>
  );
}
