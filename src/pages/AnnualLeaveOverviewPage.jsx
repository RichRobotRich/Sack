import AnnualLeaveOverview from '@/components/AnnualLeaveOverview';
import { BarChart2 } from 'lucide-react';

export default function AnnualLeaveOverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] flex items-center gap-3">
          <BarChart2 className="w-8 h-8" />
          Jahresübersicht
        </h1>
        <p className="text-gray-500 mt-1">Übersicht aller Urlaubstage, Krankheitstage und Schulungen im Jahr</p>
      </div>
      
      <AnnualLeaveOverview />
    </div>
  );
}