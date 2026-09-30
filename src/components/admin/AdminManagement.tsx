import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { UsersIcon, UserPlusIcon, EditIcon, TrashIcon, CrownIcon, GraduationCapIcon, BookOpenIcon, SearchIcon, Loader2, XIcon, EyeIcon, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/api-config";
import { getAuthToken } from "@/lib/auth-utils";
import { cn } from "@/lib/utils";
import { formatIitCategoryLabel, normalizeIitCategories, expandIitCategoriesByClass, flattenIitCategoriesByClass, classNumbersInRange, normalizeIitCategoriesByClass } from "@/lib/products";
import { useProductCategories } from "@/hooks/use-product-categories";
import { useBoards } from "@/hooks/use-boards";
import {
  sanitizePincodeInput,
  schoolAddressFieldError,
} from "@/lib/contact-validation";
import {
  defaultSchoolRoleAccess,
  schoolRoleAccessFromAdmin,
  buildRoleAccessPayload,
  validateRoleAccessState,
  SCHOOL_PORTAL_FEATURE_IDS,
  isUnlimitedPortalAccess,
  type SchoolRoleAccessState,
} from "@/lib/school-role-access";
import {
  SchoolRoleAccessPanel,
  type RoleKey,
} from "@/components/admin/SchoolRoleAccessPanel";
import { SchoolStudentBillingPanel } from '@/components/admin/SchoolStudentBillingPanel';

/** Visible borders/background on white dialogs (muted/40 was nearly invisible). */
const SCHOOL_FORM_FIELD_CLASS =
  "border border-slate-300 bg-slate-100 text-slate-900 shadow-sm placeholder:text-slate-500 focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/30";

/** Overrides default Dialog lg:max-w-2xl so school forms use full desktop width. */
const SCHOOL_DIALOG_CONTENT_CLASS =
  "flex max-h-[min(100dvh,100svh)] w-[min(96vw,42rem)] max-w-[min(96vw,42rem)] translate-x-[-50%] translate-y-[-50%] flex-col gap-0 overflow-hidden p-0 sm:max-h-[94vh] sm:w-[min(94vw,56rem)] sm:max-w-[min(94vw,56rem)] md:w-[min(92vw,64rem)] md:max-w-[min(92vw,64rem)] lg:w-[min(90vw,72rem)] lg:max-w-[min(90vw,72rem)] xl:w-[min(88vw,80rem)] xl:max-w-[min(88vw,80rem)] 2xl:w-[min(86vw,88rem)] 2xl:max-w-[min(86vw,88rem)]";

const SCHOOL_FORM_GRID_CLASS = "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3";

function syncIitTracksForClassRange<T extends {
  iitCategories: string[];
  iitCategoriesByClass: Record<string, string[]>;
  schoolDetails: { classesFrom: string; classesTo: string };
}>(prev: T, nextFrom: string, nextTo: string): T {
  if (!prev.iitCategories.length && !Object.keys(prev.iitCategoriesByClass || {}).length) {
    return {
      ...prev,
      schoolDetails: { ...prev.schoolDetails, classesFrom: nextFrom, classesTo: nextTo },
    };
  }
  const byClass = expandIitCategoriesByClass({
    iitCategories: prev.iitCategories,
    iitCategoriesByClass: prev.iitCategoriesByClass,
    classesFrom: nextFrom,
    classesTo: nextTo,
  });
  return {
    ...prev,
    schoolDetails: { ...prev.schoolDetails, classesFrom: nextFrom, classesTo: nextTo },
    iitCategoriesByClass: byClass,
    iitCategories: flattenIitCategoriesByClass(byClass).length
      ? flattenIitCategoriesByClass(byClass)
      : prev.iitCategories,
  };
}

function IitClassTrackMatrix({
  classNumbers,
  byClass,
  codes,
  labelMap,
  onChange,
}: {
  classNumbers: string[];
  byClass: Record<string, string[]>;
  codes: string[];
  labelMap: Record<string, string>;
  onChange: (next: Record<string, string[]>) => void;
}) {
  if (classNumbers.length === 0) {
    return (
      <p className="mt-2 text-xs text-amber-700">
        Set <span className="font-semibold">Classes From</span> and{" "}
        <span className="font-semibold">Classes To</span> below to assign tracks per class.
      </p>
    );
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-2 font-semibold">Class</th>
            {codes.map((cat) => (
              <th key={cat} className="px-3 py-2 font-semibold whitespace-nowrap">
                {formatIitCategoryLabel(cat, labelMap)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {classNumbers.map((cn) => {
            const row = byClass[cn] || [];
            return (
              <tr key={cn} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                  Class {cn}
                </td>
                {codes.map((cat) => {
                  const checked = row.includes(cat);
                  return (
                    <td key={cat} className="px-3 py-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const on = v === true;
                          const nextRow = on
                            ? normalizeIitCategories([...row, cat])
                            : row.filter((c) => c !== cat);
                          onChange({ ...byClass, [cn]: nextRow });
                        }}
                        aria-label={`Class ${cn} ${formatIitCategoryLabel(cat, labelMap)}`}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface SchoolDetailsForm {
  doorNo: string;
  street: string;
  area: string;
  city: string;
  district: string;
  /** May be present on API payloads; the form also keeps state on the parent object for selects. */
  state?: string;
  medium: string;
  classesFrom: string;
  classesTo: string;
  totalStrength: string;
  schoolType: string;
}

interface Admin {
  id: string;
  schoolId?: string;
  adminUserId?: string;
  name: string;
  email: string;
  board?: string;
  /** CBSE / STATE — curriculum (API); distinct from stored `board` for legacy rows */
  curriculumBoard?: string;
  isAsliPrepExclusive?: boolean;
  /** Assigned IIT tracks: ALPHA | BETA | GAMMA (union across classes) */
  iitCategories?: string[];
  /** Per-class IIT tracks, e.g. { "6": ["ALPHA"], "8": ["ALPHA","BETA"] } */
  iitCategoriesByClass?: Record<string, string[]>;
  state?: string;
  place?: string;
  schoolName?: string;
  schoolLogo?: string;
  phone?: string;
  pin?: string;
  contactPerson?: string;
  secondaryContactPerson?: string;
  secondaryContactPhone?: string;
  schoolDetails?: SchoolDetailsForm;
  permissions: string[];
  teacherPermissions?: string[];
  studentPermissions?: string[];
  vidyaEnabledForAdmins?: boolean;
  vidyaEnabledForTeachers?: boolean;
  vidyaEnabledForStudents?: boolean;
  vidyaRolePolicies?: Record<string, any>;
  vidyaUsageMode?: 'unlimited' | 'limited';
  vidyaLimitChatbot?: boolean;
  vidyaLimitTools?: boolean;
  vidyaChatPerDay?: number;
  vidyaGenerationsPerDay?: number;
  status: string;
  joinDate: string;
  licensedStudents?: number;
  licensedTeachers?: number;
  accountSeatsNotes?: string;
  studentBillingEnabled?: boolean;
  studentPaymentMode?: 'online' | 'offline' | 'both';
  studentAnnualPriceInr?: number;
  studentTrialDays?: number;
  stats: {
    students: number;
    teachers: number;
    videos: number;
    assessments: number;
    exams: number;
    totalExamsTaken: number;
    averageScore: string;
    averageAccuracy: string;
  };
  analytics: {
    topStudents: Array<{
      studentName: string;
      studentEmail: string;
      totalExams: number;
      averageScore: string;
    }>;
    recentResults: Array<{
      examTitle: string;
      studentName: string;
      score: number;
      marks: string;
      completedAt: string;
    }>;
    subjectPerformance: Array<{
      subject: string;
      accuracy: string;
      averageScore: string;
      totalQuestions: number;
      correctAnswers: number;
    }>;
  };
}

const resolveLogoUrl = (logoUrl?: string): string => {
  if (!logoUrl) return "";
  if (/^https?:\/\//i.test(logoUrl)) return logoUrl;
  return `${API_BASE_URL}${logoUrl.startsWith("/") ? logoUrl : `/${logoUrl}`}`;
};

/** Phone fields: digits only, maximum 10 (Indian mobile). */
const sanitizePhoneInput = (value: string) => value.replace(/\D/g, "").slice(0, 10);

const isValidOptionalPhone = (phone: string) => {
  const digits = sanitizePhoneInput(phone);
  return digits.length === 0 || digits.length === 10;
};

/** Values stored as `curriculumBoard` / non–Asli Prep `board`. */
const FALLBACK_CURRICULUM_BOARD_CODES = ["CBSE", "STATE", "SSC", "ICSE", "IB", "CAMBRIDGE"] as const;

function isAsliExclusiveBoardCode(b?: string): boolean {
  return String(b || "").toUpperCase().trim() === "ASLI_EXCLUSIVE_SCHOOLS";
}

function isIitBoardCode(b?: string): boolean {
  return String(b || "").toUpperCase().trim() === "IIT";
}

function isAssignableCurriculumCode(b?: string): boolean {
  const u = String(b || "").toUpperCase().trim();
  if (!u || isAsliExclusiveBoardCode(u) || isIitBoardCode(u)) return false;
  return true;
}

/** Curriculum dropdown value only — never the Asli Exclusive / IIT hub codes. */
function normalizeCurriculumSelection(b?: string, allowedCodes?: string[]): string {
  const u = String(b || "").toUpperCase().trim();
  if (isAsliExclusiveBoardCode(u) || isIitBoardCode(u) || !u) {
    return "CBSE";
  }
  if (allowedCodes?.length) {
    return allowedCodes.includes(u) ? u : "CBSE";
  }
  if ((FALLBACK_CURRICULUM_BOARD_CODES as readonly string[]).includes(u)) {
    return u;
  }
  return u || "CBSE";
}

function curriculumDisplayLabel(code?: string, nameMap?: Map<string, string>): string {
  const u = (code || "").toUpperCase();
  if (nameMap?.has(u)) return nameMap.get(u) || u;
  const labels: Record<string, string> = {
    CBSE: "CBSE",
    STATE: "State Board (generic)",
    SSC: "SSC / State Board",
    ICSE: "ICSE",
    IB: "IB",
    CAMBRIDGE: "Cambridge (CAIE)",
  };
  return labels[u] || code || "";
}

/** API uses "Active" / "Inactive"; treat anything else as inactive. */
function isSchoolActive(admin?: { status?: string; isActive?: boolean } | null): boolean {
  if (!admin) return false;
  if (typeof admin.isActive === 'boolean') return admin.isActive;
  return String(admin.status || '').trim().toLowerCase() === 'active';
}
function normalizeSchoolSearchText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s@.+_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Partial / multi-token match — substring match, not exact school name only. */
function schoolMatchesSearchQuery(
  admin: {
    schoolName?: string;
    name?: string;
    email?: string;
    state?: string;
    place?: string;
    board?: string;
    curriculumBoard?: string;
    phone?: string;
    contactPerson?: string;
    isAsliPrepExclusive?: boolean;
    schoolDetails?: { city?: string; district?: string; area?: string };
  },
  rawQuery: string,
  boardNameMap?: Map<string, string>
): boolean {
  const query = normalizeSchoolSearchText(rawQuery);
  if (!query) return true;

  const haystack = normalizeSchoolSearchText(
    [
      admin.schoolName,
      admin.name,
      admin.email,
      admin.state,
      admin.place,
      admin.board,
      admin.curriculumBoard,
      curriculumDisplayLabel(admin.curriculumBoard, boardNameMap),
      admin.phone,
      admin.contactPerson,
      admin.schoolDetails?.city,
      admin.schoolDetails?.district,
      admin.schoolDetails?.area,
      admin.isAsliPrepExclusive ? "asli prep exclusive" : "",
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (!haystack) return false;

  const tokens = query.split(" ").filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

export default function AdminManagement() {
  const [, setLocation] = useLocation();
  const { codes: iitCategoryCodes, labelMap: iitLabelMap } = useProductCategories();
  const { curriculumOptions, boards: allBoards } = useBoards();
  const boardNameMap = new Map(allBoards.map((b) => [b.code, b.name]));
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null);
  const [isUpdatingAdmin, setIsUpdatingAdmin] = useState(false);
  const [isDeletingAdmin, setIsDeletingAdmin] = useState(false);
  const [schoolActionTarget, setSchoolActionTarget] = useState<Admin | null>(null);
  const [hardDeleteEmail, setHardDeleteEmail] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const DEFAULT_CURRICULUM_BOARD = "CBSE";

  const filteredAdmins = useMemo(() => {
    const list = Array.isArray(admins) ? admins : [];
    const q = searchQuery.trim();
    if (!q) return list;
    const nameMap = new Map(allBoards.map((b) => [b.code, b.name]));
    return list.filter((admin) => schoolMatchesSearchQuery(admin, q, nameMap));
  }, [admins, searchQuery, allBoards]);

  const emptySchoolDetails = (): SchoolDetailsForm => ({
    doorNo: '',
    street: '',
    area: '',
    city: '',
    district: '',
    medium: '',
    classesFrom: '6',
    classesTo: '10',
    totalStrength: '',
    schoolType: ''
  });

  const [newAdmin, setNewAdmin] = useState({
    name: '',
    email: '',
    password: '',
    board: DEFAULT_CURRICULUM_BOARD,
    isAsliPrepExclusive: false,
    iitCategories: [] as string[],
    iitCategoriesByClass: {} as Record<string, string[]>,
    state: '',
    schoolName: '',
    schoolLogo: '',
    phone: '',
    pin: '',
    contactPerson: '',
    secondaryContactPerson: '',
    secondaryContactPhone: '',
    schoolDetails: emptySchoolDetails(),
    studentBillingEnabled: false,
    studentPaymentMode: 'offline' as 'online' | 'offline' | 'both',
    studentAnnualPriceInr: 0,
    studentTrialDays: 15,
  });
  const [newRoleAccess, setNewRoleAccess] = useState<SchoolRoleAccessState>(() =>
    defaultSchoolRoleAccess()
  );
  const [newRoleTab, setNewRoleTab] = useState<RoleKey>('admin');
  const [showNewAdminPassword, setShowNewAdminPassword] = useState(false);
  const [showEditPasswordChange, setShowEditPasswordChange] = useState(false);
  const [editNewPassword, setEditNewPassword] = useState("");
  const [showEditNewPassword, setShowEditNewPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const resetEditPasswordUi = () => {
    setShowEditPasswordChange(false);
    setEditNewPassword("");
    setShowEditNewPassword(false);
  };

  const isMutationBusy =
    isAddingAdmin || isUpdatingAdmin || isDeletingAdmin || isSavingPassword;

  const [editAdmin, setEditAdmin] = useState({
    name: '',
    email: '',
    board: DEFAULT_CURRICULUM_BOARD,
    isAsliPrepExclusive: false,
    iitCategories: [] as string[],
    iitCategoriesByClass: {} as Record<string, string[]>,
    state: '',
    schoolName: '',
    schoolLogo: '',
    phone: '',
    pin: '',
    contactPerson: '',
    secondaryContactPerson: '',
    secondaryContactPhone: '',
    schoolDetails: emptySchoolDetails(),
    isActive: true,
    studentBillingEnabled: false,
    studentPaymentMode: 'offline' as 'online' | 'offline' | 'both',
    studentAnnualPriceInr: 0,
    studentTrialDays: 15,
  });
  const [editRoleAccess, setEditRoleAccess] = useState<SchoolRoleAccessState>(() =>
    defaultSchoolRoleAccess()
  );
  const [editRoleTab, setEditRoleTab] = useState<RoleKey>('admin');
  const [isUploadingAddLogo, setIsUploadingAddLogo] = useState(false);
  const [isUploadingEditLogo, setIsUploadingEditLogo] = useState(false);
  const mapAdminState = (admin: any): Admin => {
    const sd = admin?.schoolDetails || {};
    return {
      ...admin,
      permissions: Array.isArray(admin.permissions) ? admin.permissions : [],
      state: admin?.state || sd?.state || admin?.place || '',
      schoolDetails: {
        doorNo: sd.doorNo || '',
        street: sd.street || '',
        area: sd.area || '',
        city: sd.city || '',
        district: sd.district || '',
        medium: sd.medium || '',
        classesFrom: sd.classesFrom || '6',
        classesTo: sd.classesTo || '10',
        totalStrength: sd.totalStrength || '',
        schoolType: sd.schoolType || ''
      }
    };
  };

  /**
   * Curriculum the school aligns to. Asli Prep vs normal usage is the toggle below (not a board value).
   */
  const boardOptions =
    curriculumOptions.length > 0
      ? curriculumOptions.map((b) => ({
          value: b.code,
          label: b.name,
        }))
      : [
          { value: "CBSE", label: "CBSE — Central Board of Secondary Education" },
          { value: "SSC", label: "SSC — State Board / Secondary School Certificate" },
          { value: "STATE", label: "State Board (generic)" },
          { value: "ICSE", label: "ICSE — Indian Certificate of Secondary Education" },
          { value: "IB", label: "IB — International Baccalaureate" },
          { value: "CAMBRIDGE", label: "Cambridge — CAIE / Cambridge International" },
        ];

  const allowedCurriculumCodes = boardOptions.map((o) => o.value);

  const normalizeCurriculumBoard = (b?: string): string => {
    return normalizeCurriculumSelection(b, allowedCurriculumCodes);
  };

  /** Curriculum boards for the dropdown (Asli Exclusive Schools is not a curriculum option). */
  const curriculumBoardOptions = boardOptions.filter(
    (o) => !isAsliExclusiveBoardCode(o.value) && !isIitBoardCode(o.value)
  );

  const mediumOptions = [
    { value: 'English', label: 'English' },
    { value: 'Hindi', label: 'Hindi' },
    { value: 'Telugu', label: 'Telugu' },
    { value: 'Tamil', label: 'Tamil' },
    { value: 'Kannada', label: 'Kannada' },
    { value: 'Malayalam', label: 'Malayalam' },
    { value: 'Marathi', label: 'Marathi' },
    { value: 'Gujarati', label: 'Gujarati' },
    { value: 'Bengali', label: 'Bengali' },
    { value: 'Urdu', label: 'Urdu' },
    { value: 'Other', label: 'Other' }
  ];

  const schoolTypeOptions = [
    { value: 'Government', label: 'Government' },
    { value: 'Private', label: 'Private' },
    { value: 'Aided', label: 'Aided' },
    { value: 'International', label: 'International' },
    { value: 'Other', label: 'Other' }
  ];

  // Indian states/UT labels with short codes
  const stateOptions = [
    { value: 'Andhra Pradesh', label: 'Andhra Pradesh (AP)' },
    { value: 'Arunachal Pradesh', label: 'Arunachal Pradesh (AR)' },
    { value: 'Assam', label: 'Assam (AS)' },
    { value: 'Bihar', label: 'Bihar (BR)' },
    { value: 'Chhattisgarh', label: 'Chhattisgarh (CG)' },
    { value: 'Goa', label: 'Goa (GA)' },
    { value: 'Gujarat', label: 'Gujarat (GJ)' },
    { value: 'Haryana', label: 'Haryana (HR)' },
    { value: 'Himachal Pradesh', label: 'Himachal Pradesh (HP)' },
    { value: 'Jharkhand', label: 'Jharkhand (JH)' },
    { value: 'Karnataka', label: 'Karnataka (KA)' },
    { value: 'Kerala', label: 'Kerala (KL)' },
    { value: 'Madhya Pradesh', label: 'Madhya Pradesh (MP)' },
    { value: 'Maharashtra', label: 'Maharashtra (MH)' },
    { value: 'Manipur', label: 'Manipur (MN)' },
    { value: 'Meghalaya', label: 'Meghalaya (ML)' },
    { value: 'Mizoram', label: 'Mizoram (MZ)' },
    { value: 'Nagaland', label: 'Nagaland (NL)' },
    { value: 'Odisha', label: 'Odisha (OD)' },
    { value: 'Punjab', label: 'Punjab (PB)' },
    { value: 'Rajasthan', label: 'Rajasthan (RJ)' },
    { value: 'Sikkim', label: 'Sikkim (SK)' },
    { value: 'Tamil Nadu', label: 'Tamil Nadu (TN)' },
    { value: 'Telangana', label: 'Telangana (TS)' },
    { value: 'Tripura', label: 'Tripura (TR)' },
    { value: 'Uttar Pradesh', label: 'Uttar Pradesh (UP)' },
    { value: 'Uttarakhand', label: 'Uttarakhand (UK)' },
    { value: 'West Bengal', label: 'West Bengal (WB)' },
    { value: 'Andaman and Nicobar Islands', label: 'Andaman and Nicobar Islands (AN)' },
    { value: 'Chandigarh', label: 'Chandigarh (CH)' },
    { value: 'Dadra and Nagar Haveli and Daman and Diu', label: 'Dadra and Nagar Haveli and Daman and Diu (DN)' },
    { value: 'Delhi', label: 'Delhi (DL)' },
    { value: 'Jammu and Kashmir', label: 'Jammu and Kashmir (JK)' },
    { value: 'Ladakh', label: 'Ladakh (LA)' },
    { value: 'Lakshadweep', label: 'Lakshadweep (LD)' },
    { value: 'Puducherry', label: 'Puducherry (PY)' }
  ];
  const stateCodeToName = stateOptions.reduce<Record<string, string>>((acc, option) => {
    const codeMatch = option.label.match(/\(([A-Z]{2})\)$/);
    if (codeMatch) {
      acc[codeMatch[1]] = option.value;
    }
    return acc;
  }, {});
  const { toast } = useToast();

  const normalizeStateValue = (state?: string): string => {
    if (!state) return '';
    const normalizedState = state.trim();
    if (!normalizedState) return '';

    const exactMatch = stateOptions.find(
      (option) => option.value.toLowerCase() === normalizedState.toLowerCase()
    );
    if (exactMatch) {
      return exactMatch.value;
    }

    const mappedByCode = stateCodeToName[normalizedState.toUpperCase()];
    if (mappedByCode) {
      return mappedByCode;
    }

    const labelMatch = stateOptions.find((option) =>
      option.label.toLowerCase().includes(normalizedState.toLowerCase())
    );
    return labelMatch?.value || '';
  };

  const uploadSchoolLogo = async (file: File): Promise<string | null> => {
    const token = getAuthToken();
    const formData = new FormData();
    formData.append('logo', file);

    const response = await fetch(`${API_BASE_URL}/api/super-admin/admins/upload-logo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData
    });

    const result = await response.json();
    if (!response.ok || !result?.success || !result?.logoUrl) {
      throw new Error(result?.message || 'Failed to upload school logo');
    }

    return result.logoUrl;
  };

  // Fetch admins from API
  useEffect(() => {
    const fetchAdmins = async () => {
      try {
        const token = getAuthToken();
        const response = await fetch(`${API_BASE_URL}/api/super-admin/admins`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('Fetched admins data:', data);
          
          // Handle both wrapped and direct array responses
          if (Array.isArray(data)) {
            setAdmins(data.map(mapAdminState));
          } else if (data.data && Array.isArray(data.data)) {
            setAdmins(data.data.map(mapAdminState));
          } else {
            console.log('No valid admin data found');
            setAdmins([]);
          }
        } else {
          console.error('API failed with status:', response.status);
          setAdmins([]);
        }
      } catch (error) {
        console.error('Error fetching admins:', error);
        setAdmins([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAdmins();
  }, []);

  const handleAddAdmin = async () => {
    if (isAddingAdmin) return; // Prevent multiple submissions
    
    const sd = newAdmin.schoolDetails;
    if (
      !newAdmin.name ||
      !newAdmin.email ||
      !newAdmin.password ||
      !newAdmin.board ||
      !newAdmin.state ||
      !newAdmin.schoolName ||
      !sd.city?.trim() ||
      !sd.district?.trim()
    ) {
      toast({
        title: "Error",
        description:
          "Please fill in administrator name, email, password, board, state, school name, city, and district",
        variant: "destructive",
      });
      return;
    }

    // Check if admin with this email already exists
    const existingAdmin = admins?.find(admin => 
      admin?.email?.toLowerCase() === newAdmin.email.toLowerCase()
    );
    
    if (existingAdmin) {
      toast({
        title: "Admin Already Exists",
        description: "A school with this email already exists. Please use a different email.",
        variant: "destructive",
      });
      return;
    }

    const roleAccessError = validateRoleAccessState(newRoleAccess);
    if (roleAccessError) {
      toast({
        title: "Role access",
        description: roleAccessError,
        variant: "destructive",
      });
      return;
    }

    if (!isValidOptionalPhone(newAdmin.phone) || !isValidOptionalPhone(newAdmin.secondaryContactPhone)) {
      toast({
        title: "Invalid phone number",
        description: "Primary and secondary contact numbers must be exactly 10 digits (or leave empty).",
        variant: "destructive",
      });
      return;
    }

    const addressError = schoolAddressFieldError({
      schoolName: newAdmin.schoolName,
      city: sd.city,
      district: sd.district,
      pin: newAdmin.pin,
      doorNo: sd.doorNo,
      street: sd.street,
      area: sd.area,
    });
    if (addressError) {
      toast({
        title: "Invalid school details",
        description: addressError,
        variant: "destructive",
      });
      return;
    }

    setIsAddingAdmin(true);
    try {
      const token = getAuthToken();
      
      const payload = {
        name: newAdmin.name,
        email: newAdmin.email,
        password: newAdmin.password,
        board: newAdmin.board,
        isAsliPrepExclusive: newAdmin.isAsliPrepExclusive,
        iitCategories: newAdmin.isAsliPrepExclusive
          ? flattenIitCategoriesByClass(newAdmin.iitCategoriesByClass).length
            ? flattenIitCategoriesByClass(newAdmin.iitCategoriesByClass)
            : normalizeIitCategories(newAdmin.iitCategories)
          : [],
        iitCategoriesByClass: newAdmin.isAsliPrepExclusive
          ? normalizeIitCategoriesByClass(newAdmin.iitCategoriesByClass)
          : {},
        state: newAdmin.state,
        schoolName: newAdmin.schoolName,
        schoolLogo: newAdmin.schoolLogo,
        contactPerson: newAdmin.contactPerson?.trim() || '',
        phone: sanitizePhoneInput(newAdmin.phone),
        secondaryContactPerson: newAdmin.secondaryContactPerson?.trim() || '',
        secondaryContactPhone: sanitizePhoneInput(newAdmin.secondaryContactPhone),
        pin: sanitizePincodeInput(newAdmin.pin),
        studentBillingEnabled: newAdmin.studentBillingEnabled,
        studentPaymentMode: newAdmin.studentPaymentMode,
        studentAnnualPriceInr: newAdmin.studentAnnualPriceInr,
        studentTrialDays: newAdmin.studentTrialDays,
        ...buildRoleAccessPayload(newRoleAccess),
        schoolDetails: {
          ...sd,
          state: newAdmin.state
        }
      };
      
      console.log('Creating admin with payload:', payload);
      console.log('API URL:', `${API_BASE_URL}/api/super-admin/admins`);
      
      const response = await fetch(`${API_BASE_URL}/api/super-admin/admins`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const fetchResponse = await fetch(`${API_BASE_URL}/api/super-admin/admins`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (fetchResponse.ok) {
          const fetchData = await fetchResponse.json();
          if (Array.isArray(fetchData)) {
            setAdmins(fetchData.map(mapAdminState));
          } else if (fetchData.data && Array.isArray(fetchData.data)) {
            setAdmins(fetchData.data.map(mapAdminState));
          }
        }
        setNewAdmin({
          name: '',
          email: '',
          password: '',
          board: DEFAULT_CURRICULUM_BOARD,
          isAsliPrepExclusive: false,
          iitCategories: [],
          iitCategoriesByClass: {},
          state: '',
          schoolName: '',
          schoolLogo: '',
          phone: '',
          pin: '',
          contactPerson: '',
          secondaryContactPerson: '',
          secondaryContactPhone: '',
          schoolDetails: emptySchoolDetails(),
          studentBillingEnabled: false,
          studentPaymentMode: 'offline',
          studentAnnualPriceInr: 0,
          studentTrialDays: 15,
        });
        setNewRoleAccess(defaultSchoolRoleAccess());
        setNewRoleTab('admin');
        setShowNewAdminPassword(false);
        setIsAddDialogOpen(false);
        toast({
          title: "Success",
          description: "School added successfully",
        });
      } else {
        const errorData = await response.json();
        console.log('API Error Response:', errorData);
        throw new Error(errorData.message || 'Failed to add school');
      }
    } catch (error) {
      console.error('Error adding admin:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to add admin";
      
      // Check for network errors
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('ERR_NAME_NOT_RESOLVED')) {
        toast({
          title: "Network Error",
          description: "Cannot connect to the server. Please check your internet connection and ensure the backend is running.",
          variant: "destructive",
        });
      } else if (errorMessage.includes('already exists')) {
        toast({
          title: "Admin Already Exists",
          description: "A school with this email already exists. Please use a different email.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage || "Failed to add school. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setIsAddingAdmin(false);
    }
  };

  const handleSaveEditPassword = async () => {
    if (!editingAdmin?.id || isSavingPassword) return;

    const plainPassword = editNewPassword.trim();
    if (plainPassword.length < 6) {
      toast({
        title: "Invalid password",
        description: "New password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingPassword(true);
    try {
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE_URL}/api/super-admin/admins/${editingAdmin.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password: plainPassword }),
        }
      );

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || "Failed to update password");
      }

      toast({
        title: "Password updated",
        description: "The school administrator can sign in with the new password.",
      });
      resetEditPasswordUi();
    } catch (error) {
      console.error("Save password error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update password",
        variant: "destructive",
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleEditClick = (admin: Admin) => {
    resetEditPasswordUi();
    setEditingAdmin(admin);
    const sd = admin.schoolDetails || emptySchoolDetails();
    const rawCurriculum =
      admin.curriculumBoard ||
      (isAssignableCurriculumCode(admin.board) ? String(admin.board).toUpperCase().trim() : "");
    const exclusive =
      admin.isAsliPrepExclusive === true ||
      String(admin.board || "").toUpperCase() === "ASLI_EXCLUSIVE_SCHOOLS";
    setEditAdmin({
      name: admin.name || '',
      email: admin.email || '',
      board: normalizeCurriculumBoard(rawCurriculum),
      isAsliPrepExclusive: exclusive,
      iitCategories: exclusive ? normalizeIitCategories(admin.iitCategories) : [],
      iitCategoriesByClass: exclusive
        ? expandIitCategoriesByClass({
            iitCategories: admin.iitCategories,
            iitCategoriesByClass: admin.iitCategoriesByClass,
            classesFrom: sd.classesFrom,
            classesTo: sd.classesTo,
          })
        : {},
      state: normalizeStateValue(admin.state || admin.place || sd.state),
      schoolName: admin.schoolName || '',
      schoolLogo: admin.schoolLogo || '',
      phone: sanitizePhoneInput(admin.phone || ''),
      pin: admin.pin || '',
      contactPerson: admin.contactPerson || '',
      secondaryContactPerson: admin.secondaryContactPerson || '',
      secondaryContactPhone: sanitizePhoneInput(admin.secondaryContactPhone || ''),
      schoolDetails: { ...emptySchoolDetails(), ...sd },
      isActive: admin.status === 'active' || admin.status === 'Active',
      studentBillingEnabled: Boolean(admin.studentBillingEnabled),
      studentPaymentMode: admin.studentPaymentMode || 'offline',
      studentAnnualPriceInr: Number(admin.studentAnnualPriceInr || 0),
      studentTrialDays: Number(admin.studentTrialDays || 15),
    });
    setEditRoleAccess(schoolRoleAccessFromAdmin(admin));
    setEditRoleTab('admin');
    setIsEditDialogOpen(true);
  };

  const handleUpdateAdmin = async () => {
    if (isUpdatingAdmin) return;

    if (!editingAdmin?.id) {
      toast({
        title: "Error",
        description: "Invalid school ID",
        variant: "destructive",
      });
      return;
    }

    const esd = editAdmin.schoolDetails;
    if (
      !editAdmin.name ||
      !editAdmin.email ||
      !editAdmin.board ||
      !editAdmin.state ||
      !editAdmin.schoolName ||
      !esd.city?.trim() ||
      !esd.district?.trim()
    ) {
      toast({
        title: "Error",
        description: "Please fill in all required fields including city and district",
        variant: "destructive",
      });
      return;
    }

    const roleAccessError = validateRoleAccessState(editRoleAccess);
    if (roleAccessError) {
      toast({
        title: "Role access",
        description: roleAccessError,
        variant: "destructive",
      });
      return;
    }

    if (!isValidOptionalPhone(editAdmin.phone) || !isValidOptionalPhone(editAdmin.secondaryContactPhone)) {
      toast({
        title: "Invalid phone number",
        description: "Primary and secondary contact numbers must be exactly 10 digits (or leave empty).",
        variant: "destructive",
      });
      return;
    }

    const addressError = schoolAddressFieldError({
      schoolName: editAdmin.schoolName,
      city: esd.city,
      district: esd.district,
      pin: editAdmin.pin,
      doorNo: esd.doorNo,
      street: esd.street,
      area: esd.area,
    });
    if (addressError) {
      toast({
        title: "Invalid school details",
        description: addressError,
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingAdmin(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/super-admin/admins/${editingAdmin.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editAdmin.name,
          email: editAdmin.email,
          board: editAdmin.board,
          isAsliPrepExclusive: editAdmin.isAsliPrepExclusive,
          iitCategories: editAdmin.isAsliPrepExclusive
            ? flattenIitCategoriesByClass(editAdmin.iitCategoriesByClass).length
              ? flattenIitCategoriesByClass(editAdmin.iitCategoriesByClass)
              : normalizeIitCategories(editAdmin.iitCategories)
            : [],
          iitCategoriesByClass: editAdmin.isAsliPrepExclusive
            ? normalizeIitCategoriesByClass(editAdmin.iitCategoriesByClass)
            : {},
          state: editAdmin.state,
          schoolName: editAdmin.schoolName,
          schoolLogo: editAdmin.schoolLogo,
          contactPerson: editAdmin.contactPerson?.trim() || '',
          phone: sanitizePhoneInput(editAdmin.phone),
          secondaryContactPerson: editAdmin.secondaryContactPerson?.trim() || '',
          secondaryContactPhone: sanitizePhoneInput(editAdmin.secondaryContactPhone),
          pin: sanitizePincodeInput(editAdmin.pin),
          schoolDetails: {
            ...esd,
            state: editAdmin.state
          },
          isActive: editAdmin.isActive,
          studentBillingEnabled: editAdmin.studentBillingEnabled,
          studentPaymentMode: editAdmin.studentPaymentMode,
          studentAnnualPriceInr: editAdmin.studentAnnualPriceInr,
          studentTrialDays: editAdmin.studentTrialDays,
          ...buildRoleAccessPayload(editRoleAccess),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Update admin success:', result);
        
        // Refresh the admins list
        const fetchResponse = await fetch(`${API_BASE_URL}/api/super-admin/admins`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (fetchResponse.ok) {
          const fetchData = await fetchResponse.json();
          console.log('Refreshed admins data:', fetchData);
          if (Array.isArray(fetchData)) {
            setAdmins(fetchData.map(mapAdminState));
          } else if (fetchData.data && Array.isArray(fetchData.data)) {
            setAdmins(fetchData.data.map(mapAdminState));
          }
        }
        
        setIsEditDialogOpen(false);
        setEditingAdmin(null);
        // Reset edit form
        setEditAdmin({
          name: '',
          email: '',
          board: DEFAULT_CURRICULUM_BOARD,
          isAsliPrepExclusive: false,
          iitCategories: [],
          iitCategoriesByClass: {},
          state: '',
          schoolName: '',
          schoolLogo: '',
          phone: '',
          pin: '',
          contactPerson: '',
          secondaryContactPerson: '',
          secondaryContactPhone: '',
          schoolDetails: emptySchoolDetails(),
          isActive: true,
          studentBillingEnabled: false,
          studentPaymentMode: 'offline',
          studentAnnualPriceInr: 0,
          studentTrialDays: 15,
        });
        setEditRoleAccess(defaultSchoolRoleAccess());
        setEditRoleTab('admin');
        toast({
          title: "Success",
          description: "School updated successfully",
        });
      } else {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { message: errorText || `Server error: ${response.status}` };
        }
        console.error('Update admin error response:', errorData);
        throw new Error(errorData.message || 'Failed to update school');
      }
    } catch (error) {
      console.error('Error updating admin:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update school",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingAdmin(false);
    }
  };

  const refreshAdminsAfterMutation = async (token: string, deleteId?: string, schoolId?: string) => {
    const fetchResponse = await fetch(`${API_BASE_URL}/api/super-admin/admins`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (fetchResponse.ok) {
      const fetchData = await fetchResponse.json();
      if (Array.isArray(fetchData)) {
        setAdmins(fetchData.map(mapAdminState));
      } else if (fetchData.data && Array.isArray(fetchData.data)) {
        setAdmins(fetchData.data.map(mapAdminState));
      } else if (deleteId) {
        setAdmins((admins || []).filter(
          (a) => a?.id !== deleteId && a?.schoolId !== deleteId && a?.schoolId !== schoolId
        ));
      }
    }
  };

  const handleReactivateAdmin = async (admin: Admin) => {
    if (isUpdatingAdmin) return;
    const adminId = admin?.id || '';
    if (!adminId) return;
    setIsUpdatingAdmin(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE_URL}/api/super-admin/admins/${adminId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive: true }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to reactivate school');
      }
      await refreshAdminsAfterMutation(token || '');
      setSchoolActionTarget(null);
      toast({
        title: 'School reactivated',
        description: `${admin.schoolName || admin.name || 'School'} can sign in again.`,
      });
      window.dispatchEvent(new CustomEvent('adminDeleted'));
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to reactivate school',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingAdmin(false);
    }
  };

  const handleDeleteAdmin = async (
    adminId: string,
    schoolId?: string,
    hardDelete = false
  ) => {
    if (isDeletingAdmin) return;

    const deleteId = adminId || schoolId || '';
    if (!deleteId) {
      toast({
        title: "Error",
        description: "Invalid school ID",
        variant: "destructive",
      });
      return;
    }

    setIsDeletingAdmin(true);
    try {
      const token = getAuthToken();
      const url = `${API_BASE_URL}/api/super-admin/admins/${deleteId}${hardDelete ? '?hard=1' : ''}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(
          hardDelete
            ? { hardDelete: true, confirmEmail: hardDeleteEmail.trim() }
            : {}
        ),
      });

      if (response.ok) {
        const deleteResult = await response.json();
        
        await new Promise(resolve => setTimeout(resolve, 500));
        await refreshAdminsAfterMutation(token || '', deleteId, schoolId);
        setSchoolActionTarget(null);
        setHardDeleteEmail('');

        toast({
          title: deleteResult?.soft ? 'School deactivated' : 'School permanently deleted',
          description: deleteResult?.soft
            ? (deleteResult.message ||
              'School login deactivated. Students and teachers were kept. Use Reactivate instead of creating a new school with the same email.')
            : (deleteResult?.message ||
              'School and all associated data deleted permanently.'),
        });
        
        // Dispatch custom event to notify dashboard to refresh admin summary
        window.dispatchEvent(new CustomEvent('adminDeleted'));
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete school');
      }
    } catch (error) {
      console.error('Error deleting admin:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete school",
        variant: "destructive",
      });
    } finally {
      setIsDeletingAdmin(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading schools...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">School Management</h2>
          <p className="text-gray-600">Manage schools and their associated data</p>
        </div>
        
        <Dialog
          open={isAddDialogOpen}
          onOpenChange={(open) => {
            setIsAddDialogOpen(open);
            if (!open) setShowNewAdminPassword(false);
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <UserPlusIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
              Add New School
            </Button>
          </DialogTrigger>
          <DialogContent
            className={SCHOOL_DIALOG_CONTENT_CLASS}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogHeader className="shrink-0 space-y-1 border-b px-4 sm:px-6 lg:px-8 py-4 text-left">
              <DialogTitle>Add New School</DialogTitle>
              <DialogDescription>
                Add administrator and school details. Fields spread across up to three columns on large screens.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 sm:px-6 lg:px-8 py-5 pb-8 [-webkit-overflow-scrolling:touch]">
              <p className="mb-3 text-xs sm:text-sm font-semibold text-gray-900">Administrator</p>
              <div className={SCHOOL_FORM_GRID_CLASS}>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    value={newAdmin.name}
                    onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                    placeholder="School administrator full name"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newAdmin.email}
                    onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                    placeholder="Administrator email"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password *</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showNewAdminPassword ? "text" : "password"}
                      value={newAdmin.password}
                      onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                      placeholder="Admin login password"
                      className={cn(SCHOOL_FORM_FIELD_CLASS, "pr-10")}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewAdminPassword((prev) => !prev)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
                      aria-label={showNewAdminPassword ? "Hide password" : "Show password"}
                      tabIndex={0}
                    >
                      {showNewAdminPassword ? (
                        <EyeOff className="h-3 w-3 sm:h-4 sm:w-4" />
                      ) : (
                        <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contactPerson">Primary contact name</Label>
                  <Input
                    id="contactPerson"
                    value={newAdmin.contactPerson}
                    onChange={(e) => setNewAdmin({ ...newAdmin, contactPerson: e.target.value })}
                    placeholder="Primary contact name"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Primary contact number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={10}
                    pattern="[0-9]{10}"
                    value={newAdmin.phone}
                    onChange={(e) =>
                      setNewAdmin({ ...newAdmin, phone: sanitizePhoneInput(e.target.value) })
                    }
                    placeholder="10-digit mobile number"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="secondaryContactPerson">Secondary contact name</Label>
                  <Input
                    id="secondaryContactPerson"
                    value={newAdmin.secondaryContactPerson}
                    onChange={(e) => setNewAdmin({ ...newAdmin, secondaryContactPerson: e.target.value })}
                    placeholder="Alternate contact person"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="secondaryContactPhone">Secondary contact number</Label>
                  <Input
                    id="secondaryContactPhone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={10}
                    pattern="[0-9]{10}"
                    value={newAdmin.secondaryContactPhone}
                    onChange={(e) =>
                      setNewAdmin({
                        ...newAdmin,
                        secondaryContactPhone: sanitizePhoneInput(e.target.value),
                      })
                    }
                    placeholder="10-digit mobile number"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
              </div>

              <p className="mb-3 mt-8 text-xs sm:text-sm font-semibold text-gray-900">School Information</p>
              <div className={SCHOOL_FORM_GRID_CLASS}>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                  <Label htmlFor="schoolName">School Name *</Label>
                  <Input
                    id="schoolName"
                    value={newAdmin.schoolName}
                    onChange={(e) => setNewAdmin({ ...newAdmin, schoolName: e.target.value })}
                    placeholder="School name"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="doorNo">Door No</Label>
                  <Input
                    id="doorNo"
                    value={newAdmin.schoolDetails.doorNo}
                    onChange={(e) =>
                      setNewAdmin({
                        ...newAdmin,
                        schoolDetails: { ...newAdmin.schoolDetails, doorNo: e.target.value }
                      })
                    }
                    placeholder="Door / plot no."
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="street">Street</Label>
                  <Input
                    id="street"
                    value={newAdmin.schoolDetails.street}
                    onChange={(e) =>
                      setNewAdmin({
                        ...newAdmin,
                        schoolDetails: { ...newAdmin.schoolDetails, street: e.target.value }
                      })
                    }
                    placeholder="Street"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="area">Area</Label>
                  <Input
                    id="area"
                    value={newAdmin.schoolDetails.area}
                    onChange={(e) =>
                      setNewAdmin({
                        ...newAdmin,
                        schoolDetails: { ...newAdmin.schoolDetails, area: e.target.value }
                      })
                    }
                    placeholder="Area / locality"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    value={newAdmin.schoolDetails.city}
                    onChange={(e) =>
                      setNewAdmin({
                        ...newAdmin,
                        schoolDetails: { ...newAdmin.schoolDetails, city: e.target.value }
                      })
                    }
                    placeholder="City"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="district">District *</Label>
                  <Input
                    id="district"
                    value={newAdmin.schoolDetails.district}
                    onChange={(e) =>
                      setNewAdmin({
                        ...newAdmin,
                        schoolDetails: { ...newAdmin.schoolDetails, district: e.target.value }
                      })
                    }
                    placeholder="District"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="state">State *</Label>
                  <Select
                    value={newAdmin.state}
                    onValueChange={(value) => setNewAdmin({ ...newAdmin, state: value })}
                  >
                    <SelectTrigger id="state" className={SCHOOL_FORM_FIELD_CLASS}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {stateOptions.map((state) => (
                        <SelectItem key={state.value} value={state.value}>
                          {state.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pin">Pincode</Label>
                  <Input
                    id="pin"
                    type="text"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    maxLength={6}
                    pattern="[1-9][0-9]{5}"
                    value={newAdmin.pin}
                    onChange={(e) =>
                      setNewAdmin({ ...newAdmin, pin: sanitizePincodeInput(e.target.value) })
                    }
                    placeholder="6-digit PIN (e.g. 500001)"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                  <p className="text-xs text-slate-500">Exactly 6 digits, or leave empty.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="board">Curriculum board *</Label>
                  <Select
                    value={newAdmin.board}
                    onValueChange={(value) => setNewAdmin({ ...newAdmin, board: value })}
                  >
                    <SelectTrigger id="board" className={SCHOOL_FORM_FIELD_CLASS}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {curriculumBoardOptions.map((board) => (
                        <SelectItem key={board.value} value={board.value}>
                          {board.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-xs sm:text-sm text-gray-800">School program</p>
                        <p className="text-xs text-gray-600">
                          Normal schools use the curriculum board only. Turn on Asli Prep for the Asli Prep track — keep the curriculum board above (CBSE, State, etc.); it is not replaced by Asli Exclusive Schools.
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span
                          className={cn(
                            "text-xs sm:text-sm",
                            !newAdmin.isAsliPrepExclusive ? "font-semibold text-gray-900" : "text-gray-500"
                          )}
                        >
                          Normal usage
                        </span>
                        <Switch
                          checked={newAdmin.isAsliPrepExclusive}
                          onCheckedChange={(checked) =>
                            setNewAdmin((prev) => ({
                              ...prev,
                              isAsliPrepExclusive: checked,
                              board: normalizeCurriculumSelection(prev.board, allowedCurriculumCodes),
                              iitCategories: checked ? prev.iitCategories : [],
                              iitCategoriesByClass: checked ? prev.iitCategoriesByClass : {},
                            }))
                          }
                          aria-label="Toggle Asli Prep school program"
                        />
                        <span
                          className={cn(
                            "text-xs sm:text-sm",
                            newAdmin.isAsliPrepExclusive ? "font-semibold text-orange-800" : "text-gray-500"
                          )}
                        >
                          Asli Prep
                        </span>
                      </div>
                    </div>
                    {newAdmin.isAsliPrepExclusive && (
                      <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="space-y-1">
                            <p className="text-xs sm:text-sm font-medium text-gray-800">IIT EduOTT</p>
                            <p className="text-xs text-gray-600">
                              Same idea as Asli Prep: turn on to give this school IIT videos in EduOTT and
                              IIT materials on Learning Paths. Off = curriculum Asli Prep only (no IIT).
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <span
                              className={cn(
                                "text-xs sm:text-sm",
                                newAdmin.iitCategories.length === 0
                                  ? "font-semibold text-gray-900"
                                  : "text-gray-500"
                              )}
                            >
                              Off
                            </span>
                            <Switch
                              checked={newAdmin.iitCategories.length > 0}
                              onCheckedChange={(checked) =>
                                setNewAdmin((prev) => {
                                  if (!checked) {
                                    return { ...prev, iitCategories: [], iitCategoriesByClass: {} };
                                  }
                                  const defaults = normalizeIitCategories(
                                    prev.iitCategories.length > 0
                                      ? prev.iitCategories
                                      : iitCategoryCodes.length > 0
                                        ? iitCategoryCodes
                                        : ["ALPHA", "BETA", "GAMMA"],
                                  );
                                  const byClass = expandIitCategoriesByClass({
                                    iitCategories: defaults,
                                    iitCategoriesByClass: prev.iitCategoriesByClass,
                                    classesFrom: prev.schoolDetails.classesFrom,
                                    classesTo: prev.schoolDetails.classesTo,
                                  });
                                  return {
                                    ...prev,
                                    iitCategories: flattenIitCategoriesByClass(byClass).length
                                      ? flattenIitCategoriesByClass(byClass)
                                      : defaults,
                                    iitCategoriesByClass: byClass,
                                  };
                                })
                              }
                              aria-label="Toggle IIT EduOTT for this school"
                            />
                            <span
                              className={cn(
                                "text-xs sm:text-sm",
                                newAdmin.iitCategories.length > 0
                                  ? "font-semibold text-violet-800"
                                  : "text-gray-500"
                              )}
                            >
                              IIT EduOTT
                            </span>
                          </div>
                        </div>
                        {newAdmin.iitCategories.length > 0 && (
                          <div>
                            <p className="text-xs sm:text-sm font-medium text-gray-800">
                              IIT product tracks by class
                            </p>
                            <p className="mt-1 text-xs text-gray-600">
                              Assign Alpha / Beta / Gamma per class (e.g. 6–7 Alpha only, 8+ Alpha + Beta).
                              Subjects without a track (e.g. Biology) stay general.
                            </p>
                            <IitClassTrackMatrix
                              classNumbers={classNumbersInRange(
                                newAdmin.schoolDetails.classesFrom,
                                newAdmin.schoolDetails.classesTo,
                              )}
                              byClass={normalizeIitCategoriesByClass(newAdmin.iitCategoriesByClass)}
                              codes={iitCategoryCodes}
                              labelMap={iitLabelMap}
                              onChange={(next) =>
                                setNewAdmin((prev) => ({
                                  ...prev,
                                  iitCategoriesByClass: next,
                                  iitCategories: flattenIitCategoriesByClass(next),
                                }))
                              }
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="medium">Medium</Label>
                  <Select
                    value={newAdmin.schoolDetails.medium || undefined}
                    onValueChange={(value) =>
                      setNewAdmin({
                        ...newAdmin,
                        schoolDetails: { ...newAdmin.schoolDetails, medium: value }
                      })
                    }
                  >
                    <SelectTrigger id="medium" className={SCHOOL_FORM_FIELD_CLASS}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {mediumOptions.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="classesFrom">Classes From</Label>
                  <Input
                    id="classesFrom"
                    value={newAdmin.schoolDetails.classesFrom}
                    onChange={(e) =>
                      setNewAdmin((prev) =>
                        syncIitTracksForClassRange(prev, e.target.value, prev.schoolDetails.classesTo),
                      )
                    }
                    placeholder="e.g. 6"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="classesTo">Classes To</Label>
                  <Input
                    id="classesTo"
                    value={newAdmin.schoolDetails.classesTo}
                    onChange={(e) =>
                      setNewAdmin((prev) =>
                        syncIitTracksForClassRange(prev, prev.schoolDetails.classesFrom, e.target.value),
                      )
                    }
                    placeholder="e.g. 10"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="totalStrength">Total Strength</Label>
                  <Input
                    id="totalStrength"
                    value={newAdmin.schoolDetails.totalStrength}
                    onChange={(e) =>
                      setNewAdmin({
                        ...newAdmin,
                        schoolDetails: { ...newAdmin.schoolDetails, totalStrength: e.target.value }
                      })
                    }
                    placeholder="Approx. student strength"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="schoolType">School Type</Label>
                  <Select
                    value={newAdmin.schoolDetails.schoolType || undefined}
                    onValueChange={(value) =>
                      setNewAdmin({
                        ...newAdmin,
                        schoolDetails: { ...newAdmin.schoolDetails, schoolType: value }
                      })
                    }
                  >
                    <SelectTrigger id="schoolType" className={SCHOOL_FORM_FIELD_CLASS}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {schoolTypeOptions.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
                  <Label htmlFor="schoolLogo">School Logo</Label>
                  <Input
                    id="schoolLogo"
                    type="file"
                    accept="image/*"
                    className={cn(
                      SCHOOL_FORM_FIELD_CLASS,
                      "cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-xs sm:text-sm file:font-medium file:text-orange-700 hover:file:bg-orange-100"
                    )}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsUploadingAddLogo(true);
                      try {
                        const logoUrl = await uploadSchoolLogo(file);
                        if (logoUrl) {
                          setNewAdmin({ ...newAdmin, schoolLogo: logoUrl });
                        }
                      } catch (error) {
                        toast({
                          title: "Logo upload failed",
                          description: error instanceof Error ? error.message : "Unable to upload school logo",
                          variant: "destructive",
                        });
                      } finally {
                        setIsUploadingAddLogo(false);
                        e.target.value = "";
                      }
                    }}
                  />
                  {isUploadingAddLogo && (
                    <p className="text-xs text-gray-500">Uploading logo...</p>
                  )}
                  {newAdmin.schoolLogo && (
                    <div className="mt-2 flex items-center gap-3 rounded-md border border-slate-300 bg-slate-50 p-2">
                      <img
                        src={resolveLogoUrl(newAdmin.schoolLogo)}
                        alt="School logo preview"
                        className="h-10 w-10 shrink-0 rounded border object-cover"
                      />
                      <p className="min-w-0 flex-1 truncate text-xs text-gray-600">{newAdmin.schoolLogo}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 shrink-0 text-slate-600 hover:bg-red-50 hover:text-red-600"
                        onClick={() => setNewAdmin({ ...newAdmin, schoolLogo: "" })}
                        aria-label="Remove school logo"
                      >
                        <XIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>

                            <div className="mt-8">
                <SchoolRoleAccessPanel
                  idPrefix="new-role-access"
                  value={newRoleAccess}
                  onChange={setNewRoleAccess}
                  activeRole={newRoleTab}
                  onActiveRoleChange={setNewRoleTab}
                />
                {newRoleTab === 'student' && (
                  <SchoolStudentBillingPanel
                    value={newAdmin}
                    onChange={(next) => setNewAdmin({ ...newAdmin, ...next })}
                  />
                )}
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-3 border-t bg-background px-4 sm:px-6 lg:px-8 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddAdmin} disabled={isAddingAdmin}>
                {isAddingAdmin ? "Adding..." : "Add School"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Admin Dialog */}
        <Dialog
          open={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) {
              setEditingAdmin(null);
              resetEditPasswordUi();
            }
          }}
        >
          <DialogContent
            className={SCHOOL_DIALOG_CONTENT_CLASS}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogHeader className="shrink-0 space-y-1 border-b px-4 sm:px-6 lg:px-8 py-4 text-left">
              <DialogTitle>Edit School</DialogTitle>
              <DialogDescription>
                Update administrator and school details. On desktop this panel uses a wide layout so fields are easier to read.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 sm:px-6 lg:px-8 py-5 pb-8 [-webkit-overflow-scrolling:touch]">
              <p className="mb-3 text-xs sm:text-sm font-semibold text-gray-900">Administrator</p>
              <div className={SCHOOL_FORM_GRID_CLASS}>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name">Full Name *</Label>
                  <Input
                    id="edit-name"
                    value={editAdmin.name}
                    onChange={(e) => setEditAdmin({ ...editAdmin, name: e.target.value })}
                    placeholder="School administrator full name"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-email">Email *</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={editAdmin.email}
                    onChange={(e) => setEditAdmin({ ...editAdmin, email: e.target.value })}
                    placeholder="Administrator email"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5 lg:col-span-1">
                  <Label htmlFor="edit-password-mask">Password</Label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      id="edit-password-mask"
                      type="password"
                      value="••••••••"
                      readOnly
                      disabled
                      className={cn(SCHOOL_FORM_FIELD_CLASS, "sm:flex-1")}
                      autoComplete="off"
                      aria-label="Current password is hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => {
                        if (showEditPasswordChange) {
                          resetEditPasswordUi();
                        } else {
                          setShowEditPasswordChange(true);
                        }
                      }}
                    >
                      {showEditPasswordChange ? "Cancel" : "Change password"}
                    </Button>
                  </div>
                  {showEditPasswordChange && (
                    <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50/80 p-3">
                      <Label htmlFor="edit-new-password">New password</Label>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative sm:flex-1">
                          <Input
                            id="edit-new-password"
                            type={showEditNewPassword ? "text" : "password"}
                            value={editNewPassword}
                            onChange={(e) => setEditNewPassword(e.target.value)}
                            placeholder="At least 6 characters"
                            className={cn(SCHOOL_FORM_FIELD_CLASS, "pr-10")}
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowEditNewPassword((prev) => !prev)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
                            aria-label={showEditNewPassword ? "Hide password" : "Show password"}
                          >
                            {showEditNewPassword ? (
                              <EyeOff className="h-3 w-3 sm:h-4 sm:w-4" />
                            ) : (
                              <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                            )}
                          </button>
                        </div>
                        <Button
                          type="button"
                          onClick={handleSaveEditPassword}
                          disabled={isSavingPassword || !editNewPassword.trim()}
                        >
                          {isSavingPassword ? "Saving..." : "Save password"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-contactPerson">Primary contact name</Label>
                  <Input
                    id="edit-contactPerson"
                    value={editAdmin.contactPerson}
                    onChange={(e) => setEditAdmin({ ...editAdmin, contactPerson: e.target.value })}
                    placeholder="Primary contact name"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-phone">Primary contact number</Label>
                  <Input
                    id="edit-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={10}
                    pattern="[0-9]{10}"
                    value={editAdmin.phone}
                    onChange={(e) =>
                      setEditAdmin({ ...editAdmin, phone: sanitizePhoneInput(e.target.value) })
                    }
                    placeholder="10-digit mobile number"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-secondaryContactPerson">Secondary contact name</Label>
                  <Input
                    id="edit-secondaryContactPerson"
                    value={editAdmin.secondaryContactPerson}
                    onChange={(e) => setEditAdmin({ ...editAdmin, secondaryContactPerson: e.target.value })}
                    placeholder="Alternate contact person"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-secondaryContactPhone">Secondary contact number</Label>
                  <Input
                    id="edit-secondaryContactPhone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={10}
                    pattern="[0-9]{10}"
                    value={editAdmin.secondaryContactPhone}
                    onChange={(e) =>
                      setEditAdmin({
                        ...editAdmin,
                        secondaryContactPhone: sanitizePhoneInput(e.target.value),
                      })
                    }
                    placeholder="10-digit mobile number"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="flex items-end space-x-2 pb-2 md:col-span-2 lg:col-span-3">
                  <input
                    type="checkbox"
                    id="edit-isActive"
                    checked={editAdmin.isActive}
                    onChange={(e) => setEditAdmin({ ...editAdmin, isActive: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="edit-isActive" className="cursor-pointer">
                    Active Account
                  </Label>
                </div>
              </div>

              <p className="mb-3 mt-8 text-xs sm:text-sm font-semibold text-gray-900">School Information</p>
              <div className={SCHOOL_FORM_GRID_CLASS}>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                  <Label htmlFor="edit-schoolName">School Name *</Label>
                  <Input
                    id="edit-schoolName"
                    value={editAdmin.schoolName}
                    onChange={(e) => setEditAdmin({ ...editAdmin, schoolName: e.target.value })}
                    placeholder="School name"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-doorNo">Door No</Label>
                  <Input
                    id="edit-doorNo"
                    value={editAdmin.schoolDetails.doorNo}
                    onChange={(e) =>
                      setEditAdmin({
                        ...editAdmin,
                        schoolDetails: { ...editAdmin.schoolDetails, doorNo: e.target.value }
                      })
                    }
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-street">Street</Label>
                  <Input
                    id="edit-street"
                    value={editAdmin.schoolDetails.street}
                    onChange={(e) =>
                      setEditAdmin({
                        ...editAdmin,
                        schoolDetails: { ...editAdmin.schoolDetails, street: e.target.value }
                      })
                    }
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-area">Area</Label>
                  <Input
                    id="edit-area"
                    value={editAdmin.schoolDetails.area}
                    onChange={(e) =>
                      setEditAdmin({
                        ...editAdmin,
                        schoolDetails: { ...editAdmin.schoolDetails, area: e.target.value }
                      })
                    }
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-city">City *</Label>
                  <Input
                    id="edit-city"
                    value={editAdmin.schoolDetails.city}
                    onChange={(e) =>
                      setEditAdmin({
                        ...editAdmin,
                        schoolDetails: { ...editAdmin.schoolDetails, city: e.target.value }
                      })
                    }
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-district">District *</Label>
                  <Input
                    id="edit-district"
                    value={editAdmin.schoolDetails.district}
                    onChange={(e) =>
                      setEditAdmin({
                        ...editAdmin,
                        schoolDetails: { ...editAdmin.schoolDetails, district: e.target.value }
                      })
                    }
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-state">State *</Label>
                  <Select
                    value={editAdmin.state}
                    onValueChange={(value) => setEditAdmin({ ...editAdmin, state: value })}
                  >
                    <SelectTrigger id="edit-state" className={SCHOOL_FORM_FIELD_CLASS}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {stateOptions.map((state) => (
                        <SelectItem key={state.value} value={state.value}>
                          {state.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-pin">Pincode</Label>
                  <Input
                    id="edit-pin"
                    type="text"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    maxLength={6}
                    pattern="[1-9][0-9]{5}"
                    value={editAdmin.pin}
                    onChange={(e) =>
                      setEditAdmin({ ...editAdmin, pin: sanitizePincodeInput(e.target.value) })
                    }
                    placeholder="6-digit PIN (e.g. 500001)"
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                  <p className="text-xs text-slate-500">Exactly 6 digits, or leave empty.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-board">Curriculum board *</Label>
                  <Select
                    value={editAdmin.board}
                    onValueChange={(value) => setEditAdmin({ ...editAdmin, board: value })}
                  >
                    <SelectTrigger id="edit-board" className={SCHOOL_FORM_FIELD_CLASS}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {curriculumBoardOptions.map((board) => (
                        <SelectItem key={board.value} value={board.value}>
                          {board.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-xs sm:text-sm text-gray-800">School program</p>
                        <p className="text-xs text-gray-600">
                          Normal schools use the curriculum board only. Turn on Asli Prep for the Asli Prep track — keep the curriculum board above; it is not replaced by Asli Exclusive Schools.
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span
                          className={cn(
                            "text-xs sm:text-sm",
                            !editAdmin.isAsliPrepExclusive ? "font-semibold text-gray-900" : "text-gray-500"
                          )}
                        >
                          Normal usage
                        </span>
                        <Switch
                          checked={editAdmin.isAsliPrepExclusive}
                          onCheckedChange={(checked) =>
                            setEditAdmin((prev) => ({
                              ...prev,
                              isAsliPrepExclusive: checked,
                              board: normalizeCurriculumSelection(prev.board, allowedCurriculumCodes),
                              iitCategories: checked ? prev.iitCategories : [],
                              iitCategoriesByClass: checked ? prev.iitCategoriesByClass : {},
                            }))
                          }
                          aria-label="Toggle Asli Prep school program"
                        />
                        <span
                          className={cn(
                            "text-xs sm:text-sm",
                            editAdmin.isAsliPrepExclusive ? "font-semibold text-orange-800" : "text-gray-500"
                          )}
                        >
                          Asli Prep
                        </span>
                      </div>
                    </div>
                    {editAdmin.isAsliPrepExclusive && (
                      <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="space-y-1">
                            <p className="text-xs sm:text-sm font-medium text-gray-800">IIT EduOTT</p>
                            <p className="text-xs text-gray-600">
                              Same idea as Asli Prep: turn on to give this school IIT videos in EduOTT and
                              IIT materials on Learning Paths. Off = curriculum Asli Prep only (no IIT).
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <span
                              className={cn(
                                "text-xs sm:text-sm",
                                editAdmin.iitCategories.length === 0
                                  ? "font-semibold text-gray-900"
                                  : "text-gray-500"
                              )}
                            >
                              Off
                            </span>
                            <Switch
                              checked={editAdmin.iitCategories.length > 0}
                              onCheckedChange={(checked) =>
                                setEditAdmin((prev) => {
                                  if (!checked) {
                                    return { ...prev, iitCategories: [], iitCategoriesByClass: {} };
                                  }
                                  const defaults = normalizeIitCategories(
                                    prev.iitCategories.length > 0
                                      ? prev.iitCategories
                                      : iitCategoryCodes.length > 0
                                        ? iitCategoryCodes
                                        : ["ALPHA", "BETA", "GAMMA"],
                                  );
                                  const byClass = expandIitCategoriesByClass({
                                    iitCategories: defaults,
                                    iitCategoriesByClass: prev.iitCategoriesByClass,
                                    classesFrom: prev.schoolDetails.classesFrom,
                                    classesTo: prev.schoolDetails.classesTo,
                                  });
                                  return {
                                    ...prev,
                                    iitCategories: flattenIitCategoriesByClass(byClass).length
                                      ? flattenIitCategoriesByClass(byClass)
                                      : defaults,
                                    iitCategoriesByClass: byClass,
                                  };
                                })
                              }
                              aria-label="Toggle IIT EduOTT for this school"
                            />
                            <span
                              className={cn(
                                "text-xs sm:text-sm",
                                editAdmin.iitCategories.length > 0
                                  ? "font-semibold text-violet-800"
                                  : "text-gray-500"
                              )}
                            >
                              IIT EduOTT
                            </span>
                          </div>
                        </div>
                        {editAdmin.iitCategories.length > 0 && (
                          <div>
                            <p className="text-xs sm:text-sm font-medium text-gray-800">
                              IIT product tracks by class
                            </p>
                            <p className="mt-1 text-xs text-gray-600">
                              Assign Alpha / Beta / Gamma per class (e.g. 6–7 Alpha only, 8+ Alpha + Beta).
                              Subjects without a track (e.g. Biology) stay general.
                            </p>
                            <IitClassTrackMatrix
                              classNumbers={classNumbersInRange(
                                editAdmin.schoolDetails.classesFrom,
                                editAdmin.schoolDetails.classesTo,
                              )}
                              byClass={normalizeIitCategoriesByClass(editAdmin.iitCategoriesByClass)}
                              codes={iitCategoryCodes}
                              labelMap={iitLabelMap}
                              onChange={(next) =>
                                setEditAdmin((prev) => ({
                                  ...prev,
                                  iitCategoriesByClass: next,
                                  iitCategories: flattenIitCategoriesByClass(next),
                                }))
                              }
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-medium">Medium</Label>
                  <Select
                    value={editAdmin.schoolDetails.medium || undefined}
                    onValueChange={(value) =>
                      setEditAdmin({
                        ...editAdmin,
                        schoolDetails: { ...editAdmin.schoolDetails, medium: value }
                      })
                    }
                  >
                    <SelectTrigger id="edit-medium" className={SCHOOL_FORM_FIELD_CLASS}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {mediumOptions.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-classesFrom">Classes From</Label>
                  <Input
                    id="edit-classesFrom"
                    value={editAdmin.schoolDetails.classesFrom}
                    onChange={(e) =>
                      setEditAdmin((prev) =>
                        syncIitTracksForClassRange(prev, e.target.value, prev.schoolDetails.classesTo),
                      )
                    }
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-classesTo">Classes To</Label>
                  <Input
                    id="edit-classesTo"
                    value={editAdmin.schoolDetails.classesTo}
                    onChange={(e) =>
                      setEditAdmin((prev) =>
                        syncIitTracksForClassRange(prev, prev.schoolDetails.classesFrom, e.target.value),
                      )
                    }
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-totalStrength">Total Strength</Label>
                  <Input
                    id="edit-totalStrength"
                    value={editAdmin.schoolDetails.totalStrength}
                    onChange={(e) =>
                      setEditAdmin({
                        ...editAdmin,
                        schoolDetails: { ...editAdmin.schoolDetails, totalStrength: e.target.value }
                      })
                    }
                    className={SCHOOL_FORM_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-schoolType">School Type</Label>
                  <Select
                    value={editAdmin.schoolDetails.schoolType || undefined}
                    onValueChange={(value) =>
                      setEditAdmin({
                        ...editAdmin,
                        schoolDetails: { ...editAdmin.schoolDetails, schoolType: value }
                      })
                    }
                  >
                    <SelectTrigger id="edit-schoolType" className={SCHOOL_FORM_FIELD_CLASS}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {schoolTypeOptions.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
                  <Label htmlFor="edit-schoolLogo">School Logo</Label>
                  <Input
                    id="edit-schoolLogo"
                    type="file"
                    accept="image/*"
                    className={cn(
                      SCHOOL_FORM_FIELD_CLASS,
                      "cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-xs sm:text-sm file:font-medium file:text-orange-700 hover:file:bg-orange-100"
                    )}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsUploadingEditLogo(true);
                      try {
                        const logoUrl = await uploadSchoolLogo(file);
                        if (logoUrl) {
                          setEditAdmin({ ...editAdmin, schoolLogo: logoUrl });
                        }
                      } catch (error) {
                        toast({
                          title: "Logo upload failed",
                          description: error instanceof Error ? error.message : "Unable to upload school logo",
                          variant: "destructive",
                        });
                      } finally {
                        setIsUploadingEditLogo(false);
                        e.target.value = "";
                      }
                    }}
                  />
                  {isUploadingEditLogo && (
                    <p className="text-xs text-gray-500">Uploading logo...</p>
                  )}
                  {editAdmin.schoolLogo && (
                    <div className="mt-2 flex items-center gap-3 rounded-md border border-slate-300 bg-slate-50 p-2">
                      <img
                        src={resolveLogoUrl(editAdmin.schoolLogo)}
                        alt="School logo preview"
                        className="h-10 w-10 shrink-0 rounded border object-cover"
                      />
                      <p className="min-w-0 flex-1 truncate text-xs text-gray-600">{editAdmin.schoolLogo}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 shrink-0 text-slate-600 hover:bg-red-50 hover:text-red-600"
                        onClick={() => setEditAdmin({ ...editAdmin, schoolLogo: "" })}
                        aria-label="Remove school logo"
                      >
                        <XIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>

                            <div className="mt-8">
                <SchoolRoleAccessPanel
                  idPrefix="edit-role-access"
                  value={editRoleAccess}
                  onChange={setEditRoleAccess}
                  activeRole={editRoleTab}
                  onActiveRoleChange={setEditRoleTab}
                />
                {editRoleTab === 'student' && (
                  <SchoolStudentBillingPanel
                    value={editAdmin}
                    onChange={(next) => setEditAdmin({ ...editAdmin, ...next })}
                    adminId={editingAdmin?.id}
                  />
                )}
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-3 border-t bg-background px-4 sm:px-6 lg:px-8 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setEditingAdmin(null);
                  resetEditPasswordUi();
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleUpdateAdmin} disabled={isUpdatingAdmin}>
                {isUpdatingAdmin ? "Updating..." : "Update School"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search Bar */}
      <div className="flex min-w-0 w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative min-w-0 w-full flex-1">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            placeholder="Search school, contact, email, city, state or board"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 min-w-0 w-full rounded-xl pl-11 pr-4 text-sm"
            aria-label="Search schools by name, contact, email, city, state or board"
          />
        </div>
        {searchQuery.trim() ? (
          <div className="flex shrink-0 items-center gap-2">
            <p className="whitespace-nowrap text-sm text-slate-600">
              Showing {filteredAdmins.length} of {admins?.length || 0}
            </p>
            <Button
              variant="outline"
              onClick={() => setSearchQuery('')}
              className="shrink-0"
            >
              Clear
            </Button>
          </div>
        ) : null}
      </div>

      {/* Admin Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:p-4 lg:p-6">
        {/* Total Schools - Orange (matching Asli Exclusive Schools) */}
        <Card className="bg-gradient-to-r from-orange-300 to-orange-400 text-white border-0 shadow-lg">
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Total Schools</p>
                <p className="text-2xl sm:text-3xl font-bold text-white">{admins?.length || 0}</p>
              </div>
              <CrownIcon className="h-12 w-12 text-white/80" />
            </div>
          </CardContent>
        </Card>

        {/* Total Students - Sky Blue (matching Content Management) */}
        <Card className="bg-gradient-to-br from-sky-300 to-sky-400 text-white border-0 shadow-lg">
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Total Students</p>
                <p className="text-2xl sm:text-3xl font-bold text-white">
                  {admins?.reduce((sum, admin) => sum + (admin?.stats?.students || 0), 0) || 0}
                </p>
              </div>
              <UsersIcon className="h-12 w-12 text-white/80" />
            </div>
          </CardContent>
        </Card>

        {/* Total Teachers - Teal (matching AI Analytics) */}
        <Card className="bg-gradient-to-br from-teal-400 to-teal-500 text-white border-0 shadow-lg">
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Total Teachers</p>
                <p className="text-2xl sm:text-3xl font-bold text-white">
                  {admins?.reduce((sum, admin) => sum + (admin?.stats?.teachers || 0), 0) || 0}
                </p>
              </div>
              <GraduationCapIcon className="h-12 w-12 text-white/80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admins List */}
      <>
            {filteredAdmins && filteredAdmins.length > 0 ? (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:p-4 lg:p-6 items-stretch">
                {filteredAdmins.map((admin) => (
          <Card key={admin?.id || Math.random().toString()} className="hover:shadow-lg transition-shadow h-full flex flex-col">
            <CardHeader className="flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start space-x-3 min-w-0 flex-1">
                  <div className="h-12 w-12 shrink-0 rounded-xl border border-orange-200 bg-white p-1.5 shadow-sm flex items-center justify-center overflow-hidden">
                    {admin?.schoolLogo ? (
                      <img
                        src={resolveLogoUrl(admin.schoolLogo)}
                        alt={`${admin?.schoolName || 'School'} logo`}
                        className="h-full w-full object-contain"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <CrownIcon className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm sm:text-base sm:text-lg leading-tight break-words">
                      {admin?.schoolName || admin?.name || 'Unknown School'}
                    </CardTitle>
                    {admin?.name && admin?.schoolName && (
                      <p className="text-xs sm:text-sm text-gray-600 break-words leading-snug">Contact: {admin.name}</p>
                    )}
                    {!admin?.schoolName && (
                    <p className="text-xs sm:text-sm text-gray-600 break-all leading-snug">{admin?.email || 'No email'}</p>
                    )}
                    {admin?.schoolName && (
                      <p className="text-xs sm:text-sm text-gray-500 break-all leading-snug">{admin?.email || 'No email'}</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {isUnlimitedPortalAccess(admin.permissions, SCHOOL_PORTAL_FEATURE_IDS) ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 text-xs text-emerald-900 break-all max-w-full"
                        >
                          Full portal access
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-200 bg-amber-50 text-xs text-amber-950 break-all max-w-full"
                        >
                          Limited access
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs break-all max-w-full">
                        {curriculumDisplayLabel(
                          normalizeCurriculumBoard(
                            admin.curriculumBoard ||
                              (isAssignableCurriculumCode(admin.board) ? String(admin.board) : "")
                          ),
                          boardNameMap
                        )}
                      </Badge>
                      {admin.isAsliPrepExclusive && (
                        <Badge
                          variant="outline"
                          className="border-orange-200 bg-orange-50 text-xs text-orange-950 break-all max-w-full"
                        >
                          Asli Prep
                        </Badge>
                      )}
                      {normalizeIitCategories(admin.iitCategories).length > 0 && (
                        <Badge
                          variant="outline"
                          className="border-violet-200 bg-violet-50 text-xs text-violet-950 break-all max-w-full"
                        >
                          IIT EduOTT
                        </Badge>
                      )}
                      {normalizeIitCategories(admin.iitCategories).map((cat) => (
                        <Badge
                          key={cat}
                          variant="outline"
                          className="border-sky-200 bg-sky-50 text-xs text-sky-950"
                        >
                          {formatIitCategoryLabel(cat, iitLabelMap)}
                        </Badge>
                      ))}
                      {admin?.state && (
                        <Badge variant="outline" className="text-xs break-all max-w-full">
                          {admin.state}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Badge className="shrink-0" variant={isSchoolActive(admin) ? 'default' : 'secondary'}>
                  {isSchoolActive(admin) ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="mt-auto">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Students - Orange gradient */}
                  <div className="text-center p-3 bg-gradient-to-br from-orange-300 to-orange-400 rounded-lg text-white">
                    <UsersIcon className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-white/80 mx-auto mb-2" />
                    <p className="text-xl sm:text-2xl font-bold text-white">
                      {admin?.stats?.students || 0}
                      <span className="text-sm font-semibold text-white/85">
                        {" "}/ {admin?.licensedStudents ?? 0}
                      </span>
                    </p>
                    <p className="text-xs sm:text-sm text-white/90">Students used / licensed</p>
                  </div>
                  {/* Teachers - Teal gradient */}
                  <div className="text-center p-3 bg-gradient-to-br from-teal-400 to-teal-500 rounded-lg text-white">
                    <GraduationCapIcon className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-white/80 mx-auto mb-2" />
                    <p className="text-xl sm:text-2xl font-bold text-white">
                      {admin?.stats?.teachers || 0}
                      <span className="text-sm font-semibold text-white/85">
                        {" "}/ {admin?.licensedTeachers ?? 0}
                      </span>
                    </p>
                    <p className="text-xs sm:text-sm text-white/90">Teachers used / licensed</p>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2 pt-4 border-t">
                  {!isSchoolActive(admin) ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                      Login is off. Students and teachers were kept. Reactivate this school instead of
                      creating a new one with the same email.
                    </div>
                  ) : null}
                  <div className="flex justify-between items-center gap-2">
                  <span className="text-xs sm:text-sm text-gray-500">
                    Added: {admin?.joinDate ? new Date(admin.joinDate).toLocaleDateString() : 'Unknown'}
                  </span>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => admin?.id && setLocation(`/super-admin/schools/${admin.id}`)}
                      className="hover:bg-orange-50 hover:text-orange-900"
                      title="View full details"
                    >
                      <EyeIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleEditClick(admin)}
                      className="hover:bg-orange-50 hover:text-orange-900"
                    >
                      <EditIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => {
                        setHardDeleteEmail('');
                        setSchoolActionTarget(admin);
                      }}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      title={isSchoolActive(admin) ? 'Deactivate or permanently delete' : 'Permanently delete'}
                    >
                      <TrashIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                      {isSchoolActive(admin) ? 'Remove' : 'Delete'}
                    </Button>
                  </div>
                  </div>
                  {!isSchoolActive(admin) ? (
                    <Button
                      size="sm"
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => void handleReactivateAdmin(admin)}
                    >
                      Reactivate school
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
            ) : searchQuery.trim() ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <SearchIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No Schools Found</h3>
                  <p className="text-gray-600 mb-4">
                    No schools match &quot;{searchQuery.trim()}&quot;. Try a partial name, city, email, or state.
                  </p>
                  <Button variant="outline" onClick={() => setSearchQuery('')}>
                    Clear Search
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </>

      {(!admins || admins.length === 0) && !searchQuery.trim() && (
        <Card>
          <CardContent className="p-12 text-center">
            <CrownIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No Schools Found</h3>
            <p className="text-gray-600 mb-4">Get started by adding your first school</p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <UserPlusIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
              Add First School
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={Boolean(schoolActionTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setSchoolActionTarget(null);
            setHardDeleteEmail('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {schoolActionTarget && !isSchoolActive(schoolActionTarget)
                ? 'Inactive school'
                : 'Remove school'}
            </DialogTitle>
            <DialogDescription>
              {schoolActionTarget && !isSchoolActive(schoolActionTarget)
                ? 'This school is deactivated and all of its data is preserved. You can reactivate it.'
                : 'Deactivate turns off the school login while preserving students, teachers, classes and academic history.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="font-medium text-slate-900">
              {schoolActionTarget?.schoolName || schoolActionTarget?.name || 'School'}
            </p>
            <p className="break-all text-slate-600">{schoolActionTarget?.email}</p>
            {(schoolActionTarget && !isSchoolActive(schoolActionTarget)) ? (
              <div className="space-y-3">
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-900">
                  Permanent deletion removes the school, its students, teachers, classes and academic data. This cannot be undone.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="hard-delete-school-email">
                    Type the school email to confirm permanent deletion
                  </Label>
                  <Input
                    id="hard-delete-school-email"
                    value={hardDeleteEmail}
                    onChange={(event) => setHardDeleteEmail(event.target.value)}
                    placeholder={schoolActionTarget.email || 'School email'}
                    autoComplete="off"
                  />
                </div>
              </div>
            ) : (
              <p className="text-slate-600">
                Deactivate turns off login and keeps all school data available for recovery.
              </p>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            {schoolActionTarget && !isSchoolActive(schoolActionTarget) ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  disabled={
                    isDeletingAdmin ||
                    hardDeleteEmail.trim().toLowerCase() !==
                      String(schoolActionTarget.email || '').trim().toLowerCase()
                  }
                  onClick={() =>
                    void handleDeleteAdmin(
                      schoolActionTarget.id || '',
                      schoolActionTarget.schoolId,
                      true
                    )
                  }
                >
                  Permanently delete school
                </Button>
                <Button
                  type="button"
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => schoolActionTarget && void handleReactivateAdmin(schoolActionTarget)}
                >
                  Reactivate school
                </Button>
              </>
            ) : (
              <Button
                type="button"
                className="w-full"
                onClick={() =>
                  void handleDeleteAdmin(
                    schoolActionTarget?.id || '',
                    schoolActionTarget?.schoolId
                  )
                }
              >
                Deactivate school
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setSchoolActionTarget(null);
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isMutationBusy && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-background px-10 py-4 sm:py-6 lg:py-8 shadow-lg">
            <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
            <p className="text-xs sm:text-sm text-muted-foreground">
              {isAddingAdmin
                ? "Adding school…"
                : isUpdatingAdmin
                  ? "Updating school…"
                  : isDeletingAdmin
                    ? "Deactivating school…"
                    : "Loading…"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
