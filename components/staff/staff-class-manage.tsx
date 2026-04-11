"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type StaffClassRow = {
  id: string;
  name: string;
  stage: string | null;
};

export type StudentInClassRow = {
  id: string;
  full_name: string;
  status: string | null;
};

type FormAction = (formData: FormData) => Promise<void>;

type Props = {
  classes: StaffClassRow[];
  studentsByClassId: Record<string, StudentInClassRow[]>;
  hasSchool: boolean;
  createClassAction: FormAction;
  updateClassAction: FormAction;
  deleteClassAction: FormAction;
  status?: string;
  message?: string;
};

function statusLabel(status: string | null): string {
  if (!status) return "—";
  if (status === "active") return "نشط";
  if (status === "withdrawn") return "منسحب";
  return status;
}

type ModalSize = "sm" | "md" | "lg";

function StaffModal({
  open,
  onClose,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  size?: ModalSize;
  children: ReactNode;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const maxW = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-lg" : "max-w-md";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex h-[100dvh] w-full items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`pointer-events-auto relative z-[1] w-full rounded-2xl border border-border bg-background p-5 shadow-lg ${maxW}`}
        dir="rtl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

const outlineBtnClass =
  "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground";

export default function StaffClassManage({
  classes,
  studentsByClassId,
  hasSchool,
  createClassAction,
  updateClassAction,
  deleteClassAction,
  status,
  message,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [studentsOpen, setStudentsOpen] = useState(false);
  const [activeClass, setActiveClass] = useState<StaffClassRow | null>(null);

  const studentsForActive = activeClass ? (studentsByClassId[activeClass.id] ?? []) : [];

  return (
    <div className="flex flex-col gap-8" dir="rtl">
      <div className="rounded-2xl bg-sky p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">إدارة الصفوف</h1>
            <p className="text-sm text-gray-600">عرض الصفوف الحالية وإضافة صفوف جديدة لمدرستك.</p>
          </div>
          <Button
            type="button"
            className="shrink-0 gap-1.5 rounded-xl bg-Yellow text-foreground shadow-sm hover:bg-Yellow/90 hover:scale-[1.02] transition-transform"
            onClick={() => setAddOpen(true)}
            disabled={!hasSchool}
            title={!hasSchool ? "لا توجد مدرسة مرتبطة بحسابك" : undefined}
          >
            <Plus className="size-4" />
            إضافة صف جديد
          </Button>
        </div>
      </div>

      {message ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            status === "success"
              ? "border-green-500/40 bg-green-500/10 text-green-800"
              : "border-red-500/40 bg-red-500/10 text-red-800"
          }`}
        >
          {message}
        </div>
      ) : null}

      <section className="rounded-xl border border-muted-foreground/20 bg-muted/20 p-4 sm:p-5">
        <h2 className="mb-4 text-lg font-semibold text-foreground">الصفوف الحالية</h2>
        {!hasSchool ? (
          <p className="text-sm text-amber-800">لا توجد مدرسة مرتبطة بحسابك حاليا.</p>
        ) : classes.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border/60 bg-background/60">
            <table className="w-full min-w-[600px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-right">
                  <th className="px-4 py-3 font-medium">اسم الصف</th>
                  <th className="px-4 py-3 font-medium">المرحلة</th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((classItem, index) => (
                  <tr
                    key={classItem.id}
                    className={`border-b border-border/80 last:border-0 ${
                      index % 2 === 0 ? "bg-background/40" : "bg-muted/10"
                    }`}
                  >
                    <td className="px-4 py-3 font-medium">{classItem.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{classItem.stage || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex flex-nowrap items-center justify-start gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0 gap-1 text-xs"
                          onClick={() => {
                            setActiveClass(classItem);
                            setStudentsOpen(true);
                          }}
                        >
                          <Users className="size-3.5 opacity-80" />
                          الطلاب
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0 gap-1 text-xs"
                          onClick={() => {
                            setActiveClass(classItem);
                            setEditOpen(true);
                          }}
                        >
                          <Pencil className="size-3.5 opacity-80" />
                          تعديل
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0 gap-1 text-xs text-destructive hover:text-destructive"
                          onClick={() => {
                            setActiveClass(classItem);
                            setDeleteOpen(true);
                          }}
                        >
                          <Trash2 className="size-3.5 opacity-80" />
                          حذف
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-background/40 p-8 text-center text-sm text-muted-foreground">
            لا توجد صفوف بعد. اضغط «إضافة صف جديد» لإنشاء أول صف.
          </div>
        )}
      </section>

      <StaffModal open={addOpen} onClose={() => setAddOpen(false)} size="md">
        <form action={createClassAction} className="space-y-4">
          <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
            <div className="min-w-0 space-y-1">
              <h3 className="text-base font-semibold">صف جديد</h3>
              <p className="text-xs text-muted-foreground">أدخل بيانات الصف ثم احفظ.</p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="إغلاق"
              onClick={() => setAddOpen(false)}
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="class-name">اسم الصف</Label>
            <Input
              id="class-name"
              name="name"
              required
              placeholder="مثال: الصف الأول أ"
              className="rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="class-stage">المرحلة (اختياري)</Label>
            <Input id="class-stage" name="stage" placeholder="مثال: ابتدائي" className="rounded-lg" />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" className={outlineBtnClass} onClick={() => setAddOpen(false)}>
              إلغاء
            </button>
            <Button type="submit" size="sm" className="bg-Yellow text-foreground hover:bg-Yellow/90">
              إنشاء الصف
            </Button>
          </div>
        </form>
      </StaffModal>

      <StaffModal open={editOpen && !!activeClass} onClose={() => setEditOpen(false)} size="md">
        {activeClass ? (
          <form key={activeClass.id} action={updateClassAction} className="space-y-4">
            <input type="hidden" name="classId" value={activeClass.id} />
            <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
              <div className="min-w-0 space-y-1">
                <h3 className="text-base font-semibold">تعديل الصف</h3>
                <p className="text-xs text-muted-foreground">{activeClass.name}</p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="إغلاق"
                onClick={() => setEditOpen(false)}
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-name-${activeClass.id}`}>اسم الصف</Label>
              <Input
                id={`edit-name-${activeClass.id}`}
                name="name"
                required
                defaultValue={activeClass.name}
                className="rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-stage-${activeClass.id}`}>المرحلة (اختياري)</Label>
              <Input
                id={`edit-stage-${activeClass.id}`}
                name="stage"
                defaultValue={activeClass.stage ?? ""}
                placeholder="مثال: ابتدائي"
                className="rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button type="button" className={outlineBtnClass} onClick={() => setEditOpen(false)}>
                إلغاء
              </button>
              <Button type="submit" size="sm" className="bg-Yellow text-foreground hover:bg-Yellow/90">
                حفظ التعديلات
              </Button>
            </div>
          </form>
        ) : null}
      </StaffModal>

      <StaffModal open={deleteOpen && !!activeClass} onClose={() => setDeleteOpen(false)} size="sm">
        {activeClass ? (
          <form key={`del-${activeClass.id}`} action={deleteClassAction} className="space-y-4">
            <input type="hidden" name="classId" value={activeClass.id} />
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold">حذف الصف</h3>
              <button
                type="button"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="إغلاق"
                onClick={() => setDeleteOpen(false)}
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              هل تريد حذف الصف «{activeClass.name}» نهائياً؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={outlineBtnClass} onClick={() => setDeleteOpen(false)}>
                إلغاء
              </button>
              <Button type="submit" variant="destructive" size="sm">
                حذف
              </Button>
            </div>
          </form>
        ) : null}
      </StaffModal>

      <StaffModal open={studentsOpen && !!activeClass} onClose={() => setStudentsOpen(false)} size="lg">
        {activeClass ? (
          <div key={`stu-${activeClass.id}`} className="space-y-4">
            <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
              <div className="min-w-0 space-y-1">
                <h3 className="text-base font-semibold">طلاب الصف</h3>
                <p className="text-sm text-muted-foreground">{activeClass.name}</p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="إغلاق"
                onClick={() => setStudentsOpen(false)}
              >
                <X className="size-4" />
              </button>
            </div>

            {studentsForActive.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا يوجد طلاب مسجّلون في هذا الصف حالياً.</p>
            ) : (
              <ul className="max-h-[min(60vh,22rem)] space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3">
                {studentsForActive.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{s.full_name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{statusLabel(s.status)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end border-t border-border pt-4">
              <button type="button" className={outlineBtnClass} onClick={() => setStudentsOpen(false)}>
                إغلاق
              </button>
            </div>
          </div>
        ) : null}
      </StaffModal>
    </div>
  );
}
