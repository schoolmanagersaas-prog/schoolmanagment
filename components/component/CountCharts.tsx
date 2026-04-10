"use client";

import type { StaffGenderChartPayload } from "@/actions/staff-dashboard";
import maleFemaleIcon from "@/app/images/maleFemale.png";
import moreIcon from "@/app/images/moreDark.png";
import Image from "next/image";
import { RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";

export type CountChartsProps = {
  payload: StaffGenderChartPayload | null;
};

const fallbackPayload: StaffGenderChartPayload = {
  totalActive: 0,
  maleCount: 0,
  femaleCount: 0,
  malePercent: 0,
  femalePercent: 0,
  radialData: [
    { name: "الكلي", count: 1, fill: "#f3f4f6" },
    { name: "إناث", count: 0, fill: "#fae27c" },
    { name: "ذكور", count: 0, fill: "#c3ebfa" },
  ],
};

export default function CountCharts({ payload }: CountChartsProps) {
  const p = payload ?? fallbackPayload;

  return (
    <div className="bg-white rounded-xl w-full h-full p-6 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-gray-800">الطلاب</h1>
        <div className="p-2 hover:bg-gray-200 transition-colors duration-200 cursor-pointer">
          <Image src={moreIcon} alt="المزيد من الخيارات" width={20} height={20} />
        </div>
      </div>

      <div className="relative flex-1 mb-4 min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="40%"
            outerRadius="80%"
            barSize={32}
            data={p.radialData}
          >
            <RadialBar
              label={{ position: "insideStart", fill: "#fff", fontSize: "12px" }}
              background
              dataKey="count"
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <Image
          src={maleFemaleIcon}
          alt="ذكور وإناث"
          width={50}
          height={50}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 object-contain pointer-events-none"
        />
      </div>

      <div className="flex justify-center gap-16 mt-auto">
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 bg-sky rounded-full" />
          <h1 className="font-bold text-xl text-gray-800 tabular-nums">
            {p.maleCount.toLocaleString("en-US")}
          </h1>
          <h2 className="text-xs text-gray-500">ذكور ({p.malePercent}%)</h2>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 bg-Yellow rounded-full" />
          <h1 className="font-bold text-xl text-gray-800 tabular-nums">
            {p.femaleCount.toLocaleString("en-US")}
          </h1>
          <h2 className="text-xs text-gray-500">إناث ({p.femalePercent}%)</h2>
        </div>
      </div>
    </div>
  );
}
