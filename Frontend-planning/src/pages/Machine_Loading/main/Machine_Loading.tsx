import React from "react";
import { Cpu, Construction } from "lucide-react";

const Machine_Loading: React.FC = () => {
  return (
    <div className="flex flex-col gap-4 p-6 min-h-[calc(100vh-5rem)]">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-base-100 p-6 rounded-xl border border-base-300 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary rounded-xl">
            <Cpu className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-base-content">
              Machine Loading
            </h1>
            <p className="text-sm text-base-content/60 mt-0.5">
              Machine capacity allocation and workload tracking
            </p>
          </div>
        </div>
      </div>

      {/* Content placeholder */}
      <div className="flex-1 flex flex-col items-center justify-center bg-base-100 rounded-xl border border-dashed border-base-300 p-12 text-center shadow-sm min-h-[400px]">
        <div className="p-4 bg-base-200 rounded-full mb-4 text-base-content/50">
          <Construction className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-semibold text-base-content mb-2">
          Machine Loading Module Under Construction
        </h2>
        <p className="text-sm text-base-content/60 max-w-md">
          หน้า Machine Loading อยู่ระหว่างการพัฒนา สามารถเพิ่มตาราง กราฟ แสดงภาระงานของเครื่องจักร หรือการจัดสรร Capacity ได้ที่นี่
        </p>
      </div>
    </div>
  );
};

export default Machine_Loading;
