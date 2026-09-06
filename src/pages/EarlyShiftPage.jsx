import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { Sun } from 'lucide-react';
import EarlyShiftOverview from '../components/EarlyShiftOverview';
import { Skeleton } from '@/components/ui/skeleton';

export default function EarlyShiftPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.entities.Employee.list()
      .then(setEmployees)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] dark:text-white flex items-center gap-3">
          <Sun className="w-8 h-8 dark:text-yellow-300" />
          Frühschicht-Jahresübersicht
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Jahresplanung für Frühschicht-Mitarbeiter
        </p>
      </div>
      <EarlyShiftOverview employees={employees} />
    </div>
  );
}