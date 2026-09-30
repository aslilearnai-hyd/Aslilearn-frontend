import { getAuthToken } from '@/lib/auth-utils';
import { API_BASE_URL } from './api-config';
// API Configuration - Import from api-config for centralized management
export { API_BASE_URL } from './api-config';

// Helper function to make API calls
export const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  
  // Get JWT token from localStorage
  const token = getAuthToken();
  
  return fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  });
};

export const EDUCATION_STREAMS = [
  { value: "CBSE", label: "CBSE", ageRange: "5-18" },
  { value: "ICSE", label: "ICSE", ageRange: "5-18" },
  { value: "State_Board", label: "State Board", ageRange: "5-18" },
  { value: "JEE", label: "JEE Preparation", ageRange: "16-20" },
  { value: "NEET", label: "NEET Preparation", ageRange: "16-20" },
  { value: "CLAT", label: "CLAT Preparation", ageRange: "17-22" },
  { value: "CAT", label: "CAT Preparation", ageRange: "20-28" },
  { value: "GATE", label: "GATE Preparation", ageRange: "20-28" },
  { value: "Banking", label: "Banking Exams", ageRange: "18-28" },
  { value: "Government", label: "Government Exams", ageRange: "18-28" },
];

export const DIFFICULTY_LEVELS = [
  { value: "Easy", label: "Easy", color: "text-green-600" },
  { value: "Medium", label: "Medium", color: "text-yellow-600" },
  { value: "Hard", label: "Hard", color: "text-red-600" },
];

export const EXAM_TYPES = [
  { value: "JEE_MAIN", label: "JEE Main" },
  { value: "JEE_ADVANCED", label: "JEE Advanced" },
  { value: "NEET", label: "NEET" },
  { value: "CHAPTER_TEST", label: "Chapter Test" },
  { value: "MOCK_TEST", label: "Mock Test" },
  { value: "DAILY_QUIZ", label: "Daily Quiz" },
];

export const SUBJECTS = [
  { id: "1", name: "Physics", icon: "⚛️", color: "bg-blue-100 text-blue-600" },
  { id: "2", name: "Chemistry", icon: "🧪", color: "bg-green-100 text-green-600" },
  { id: "3", name: "Mathematics", icon: "📐", color: "bg-purple-100 text-purple-600" },
  { id: "4", name: "Biology", icon: "🧬", color: "bg-red-100 text-red-600" },
  { id: "5", name: "English", icon: "📚", color: "bg-yellow-100 text-yellow-600" },
];

export const AGE_GROUPS = [
  { min: 8, max: 12, label: "Elementary (8-12)", theme: "kid-friendly" },
  { min: 13, max: 15, label: "Middle School (13-15)", theme: "teen" },
  { min: 16, max: 18, label: "High School (16-18)", theme: "student" },
  { min: 19, max: 22, label: "College (19-22)", theme: "college" },
  { min: 23, max: 28, label: "Professional (23-28)", theme: "professional" },
];

export const getAgeGroup = (age: number) => {
  return AGE_GROUPS.find(group => age >= group.min && age <= group.max) || AGE_GROUPS[2];
};

export const getStreamsByAge = (age: number) => {
  if (age <= 18) {
    return EDUCATION_STREAMS.filter(stream => 
      stream.value === "CBSE" || stream.value === "ICSE" || stream.value === "State_Board"
    );
  } else if (age <= 22) {
    return EDUCATION_STREAMS.filter(stream => 
      stream.value === "JEE" || stream.value === "NEET" || stream.value === "CLAT"
    );
  } else {
    return EDUCATION_STREAMS.filter(stream => 
      stream.value === "CAT" || stream.value === "GATE" || stream.value === "Banking" || stream.value === "Government"
    );
  }
};
