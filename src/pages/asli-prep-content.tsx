import { useState } from 'react';
import { Link } from 'wouter';
import StudentShell from "@/components/layout/StudentShell";
import AsliPrepContent from '@/components/student/asli-prep-content';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import VidyaAIFloatingAssistant from '@/components/student/VidyaAIFloatingAssistant';

export default function AsliPrepContentPage() {
  const isMobile = useIsMobile();

  return (
    <StudentShell>
      <div className="min-h-screen bg-sky-50  pb-12 px-2 sm:px-4 lg:px-6 relative">
        <div className="w-full">
          
          {!isMobile && <VidyaAIFloatingAssistant />}
          <div className="mb-8">
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg sm:text-xl">AP</span>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Asli Prep</h1>
                <p className="text-gray-600">Premium study materials for your school</p>
              </div>
            </div>
          </div>
          <AsliPrepContent />
        </div>
      </div>
    </StudentShell>
  );
}

