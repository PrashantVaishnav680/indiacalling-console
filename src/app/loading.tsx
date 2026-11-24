import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function RootLoading() {
  return (
    <div className="min-h-screen bg-[#F7F8FC] flex flex-col items-center justify-center p-6 space-y-4">
      <div className="w-14 h-14 rounded-full bg-[#EEF0FF] border border-[#C7CBFF] flex items-center justify-center shadow-xs">
        <LoadingSpinner size="lg" color="text-[#635BFF]" />
      </div>
      <p className="text-sm font-bold text-[#20243A] animate-pulse">
        Loading...
      </p>
    </div>
  );
}
