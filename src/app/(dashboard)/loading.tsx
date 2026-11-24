import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function DashboardLoading() {
  return (
    <div className="w-full min-h-[60vh] flex flex-col items-center justify-center space-y-4">
      <div className="relative flex items-center justify-center">
        <div className="w-14 h-14 rounded-full bg-[#635BFF]/10 animate-ping absolute" />
        <div className="w-14 h-14 rounded-full bg-[#EEF0FF] border border-[#C7CBFF] flex items-center justify-center shadow-xs">
          <LoadingSpinner size="lg" color="text-[#635BFF]" />
        </div>
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-bold text-[#20243A] animate-pulse">
          Loading IndiaCalling Console...
        </p>
        <p className="text-xs text-[#747B91]">
          Fetching dashboard metrics and voice agent data
        </p>
      </div>
    </div>
  );
}
