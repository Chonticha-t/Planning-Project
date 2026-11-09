import React from "react";
import dayjs from "dayjs";
import { AlertCircle, CheckCircle2, Calendar } from "lucide-react";
import type { LotItem } from "../types";

interface ListViewProps {
  lots: LotItem[];
  selectedLot: LotItem | null;
  onSelectLot: (lot: LotItem) => void;
  onDateChange: (lot: LotItem, newDate: string) => void;
}

export const ListView: React.FC<ListViewProps> = ({
  lots,
  selectedLot,
  onSelectLot,
  onDateChange,
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px]">
              <th className="p-3">LOT / PO</th>
              <th className="p-3">PRODUCT</th>
              <th className="p-3 text-right">QUANTITY</th>
              <th className="p-3">ROUTE</th>
              <th className="p-3">SYSTEM START</th>
              <th className="p-3">MUST START</th>
              <th className="p-3">RELEASE DATE</th>
              <th className="p-3">SLACK</th>
              <th className="p-3">STATUS</th>
              <th className="p-3">SHIP P1</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => {
              const isSelected = selectedLot?.id === lot.id;
              const isLate = dayjs(lot.releaseDate).isAfter(dayjs(lot.mustStartDate));
              const isMoved = lot.releaseDate !== lot.initialReleaseDate;
              const slackDays = dayjs(lot.mustStartDate).diff(dayjs(lot.releaseDate), "day");

              return (
                <tr
                  key={lot.id}
                  onClick={() => onSelectLot(lot)}
                  className={`border-b border-slate-100 hover:bg-slate-50/80 cursor-pointer transition-colors ${
                    isSelected ? "bg-indigo-50/60 font-semibold" : ""
                  }`}
                >
                  <td className="p-3 font-bold text-slate-900">{lot.id}</td>
                  <td className="p-3 text-slate-700">{lot.product}</td>
                  <td className="p-3 text-right font-mono">{lot.qty.toLocaleString()} pcs</td>
                  <td className="p-3 text-slate-600 font-medium">{lot.routeId}</td>
                  <td className="p-3 text-slate-500 font-mono">
                    {dayjs(lot.systemStartDate).format("DD/MM/YYYY")}
                  </td>
                  <td className="p-3 text-slate-500 font-mono">
                    {dayjs(lot.mustStartDate).format("DD/MM/YYYY")}
                  </td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="date"
                      value={lot.releaseDate}
                      onChange={(e) => onDateChange(lot, e.target.value)}
                      className="input input-xs input-bordered h-7 text-xs font-mono rounded-md"
                    />
                  </td>
                  <td className="p-3 font-mono font-bold">
                    <span className={slackDays < 0 ? "text-rose-600" : "text-emerald-700"}>
                      {slackDays >= 0 ? `+${slackDays}d` : `${slackDays}d`}
                    </span>
                  </td>
                  <td className="p-3">
                    {isLate ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                        <AlertCircle size={11} />
                        Late
                      </span>
                    ) : isMoved ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                        Moved (was {lot.wasDate || dayjs(lot.initialReleaseDate).format("DD/MM")})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <CheckCircle2 size={11} />
                        Fits
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-slate-600">{lot.shipDate}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
