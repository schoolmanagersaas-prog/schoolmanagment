"use client";

import { upsertStudentAttendance } from "@/actions/students";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

type DailyAttendanceCheckboxProps = {
  studentId: string;
  attendanceDate: string;
  initialPresent: boolean;
};

export function DailyAttendanceCheckbox({
  studentId,
  attendanceDate,
  initialPresent,
}: DailyAttendanceCheckboxProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onChange(checked: boolean) {
    startTransition(async () => {
      const result = await upsertStudentAttendance({
        studentId,
        attendanceDate,
        status: checked ? "present" : "absent",
      });
      if (result.success) {
        router.refresh();
      } else {
        window.alert(result.message);
      }
    });
  }

  return (
    <label className="inline-flex cursor-pointer items-center justify-center gap-2">
      <input
        type="checkbox"
        checked={initialPresent}
        disabled={isPending}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 cursor-pointer rounded border border-input accent-primary disabled:opacity-50"
        aria-label="حاضر في التاريخ المحدد"
      />
      <span className="sr-only">حاضر</span>
    </label>
  );
}
