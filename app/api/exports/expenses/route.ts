import { NextResponse } from "next/server";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { buildWorkbookBuffer } from "@/lib/excel/export-workbook";
import { createClient } from "@/lib/supabase/server";

type ManualExpenseRow = {
  id: string;
  title: string;
  amount: number | string;
  type: "salary" | "general";
  expense_date: string;
  created_at: string;
};

type TeacherPaymentRow = {
  id: string;
  amount: number | string;
  paid_at: string;
  teachers: { full_name: string } | { full_name: string }[] | null;
};

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "يجب تسجيل الدخول أولًا." }, { status: 401 });
  }

  const schoolId = await resolveSchoolId(supabase, user.id, user.email);
  if (!schoolId) {
    return NextResponse.json({ message: "لم يتم العثور على مدرسة مرتبطة بحسابك." }, { status: 400 });
  }

  const [manualRes, salaryRes] = await Promise.all([
    supabase
      .from("expenses")
      .select("id,title,amount,type,expense_date,created_at")
      .eq("school_id", schoolId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("teacher_payments")
      .select("id,amount,paid_at,teachers!teacher_payments_teacher_school_fk(full_name)")
      .eq("school_id", schoolId)
      .order("paid_at", { ascending: false }),
  ]);

  if (manualRes.error) {
    return NextResponse.json({ message: manualRes.error.message ?? "فشل جلب المصاريف." }, { status: 500 });
  }
  if (salaryRes.error) {
    return NextResponse.json({ message: salaryRes.error.message ?? "فشل جلب دفعات الرواتب." }, { status: 500 });
  }

  const manualRows = ((manualRes.data ?? []) as ManualExpenseRow[]).map((r) => [
    "مصروف يدوي",
    r.type === "salary" ? "راتب" : "عام",
    r.title,
    toNumber(r.amount),
    r.expense_date?.slice(0, 10) ?? "",
    r.created_at,
  ]);

  const salaryRows = ((salaryRes.data ?? []) as TeacherPaymentRow[]).map((r) => {
    const t = Array.isArray(r.teachers) ? r.teachers[0] : r.teachers;
    const teacherName = t?.full_name ?? "معلم";
    return [
      "دفعة راتب",
      "راتب",
      `صرف راتب — ${teacherName}`,
      toNumber(r.amount),
      r.paid_at?.slice(0, 10) ?? "",
      r.paid_at ?? "",
    ];
  });

  const workbook = buildWorkbookBuffer([
    {
      name: "expenses",
      header: ["المصدر", "النوع", "العنوان", "المبلغ", "التاريخ", "وقت الإنشاء"],
      rows: [...manualRows, ...salaryRows],
    },
  ]);

  const dateTag = new Date().toISOString().slice(0, 10);
  const bytes = new Uint8Array(workbook);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="expenses-export-${dateTag}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
