"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ClassItem = {
  id: string;
  name: string;
};

type StudentListFiltersProps = {
  classes: ClassItem[];
  initialQuery: string;
  initialClassId: string;
  initialDate: string;
};

const selectClassName = cn(
  "flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400",
);

export function StudentListFilters({ classes, initialQuery, initialClassId, initialDate }: StudentListFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const [classId, setClassId] = useState(initialClassId);
  const [date, setDate] = useState(initialDate);

  const baseParams = useMemo(() => {
    const sp = new URLSearchParams();
    if (classId.trim()) sp.set("classId", classId.trim());
    if (query.trim()) sp.set("q", query.trim());
    if (date.trim()) sp.set("date", date.trim());
    return sp;
  }, [classId, date, query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const qs = baseParams.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 300);
    return () => clearTimeout(timer);
  }, [baseParams, pathname, router]);

  return (
    <section className="bg-white rounded-3xl shadow-lg border p-6 space-y-5">
      <h2 className="text-lg font-semibold text-gray-800 border-b pb-2">تصفية الطلاب</h2>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="q">اسم الطالب</Label>
          <Input
            id="q"
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="اكتب اسم الطالب"
            className="rounded-xl focus-visible:ring-2 focus-visible:ring-yellow-400"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="classId">الصف</Label>
          <select
            id="classId"
            name="classId"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className={selectClassName}
          >
            <option value="">كل الصفوف</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">تاريخ الحضور اليومي</Label>
          <Input
            id="date"
            name="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl focus-visible:ring-2 focus-visible:ring-yellow-400"
          />
        </div>
      </div>
    </section>
  );
}
