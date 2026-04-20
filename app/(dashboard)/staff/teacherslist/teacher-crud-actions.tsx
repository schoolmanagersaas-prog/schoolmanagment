"use client";

import { useRef } from "react";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormAction = (formData: FormData) => Promise<void>;

type TeacherItem = {
  id: string;
  displayId?: number;
  fullName: string;
  academicQualification: string | null;
  certificateObtainedDate: string | null;
  certificateSource: string | null;
  yearsOfExperience: number | null;
  phone: string | null;
  salary: number;
  subject: string | null;
};

type PreserveState = {
  q: string;
  date: string;
  month: string;
};

type TeacherCreateDialogProps = {
  preserve: PreserveState;
  createTeacherAction: FormAction;
};

type TeacherRowActionsProps = {
  teacher: TeacherItem;
  preserve: PreserveState;
  updateTeacherAction: FormAction;
  deleteTeacherAction: FormAction;
};

function PreserveHiddenInputs({ preserve }: { preserve: PreserveState }) {
  return (
    <>
      <input type="hidden" name="preserveQ" value={preserve.q} />
      <input type="hidden" name="preserveDate" value={preserve.date} />
      <input type="hidden" name="preserveMonth" value={preserve.month} />
    </>
  );
}

export function TeacherCreateDialog({ preserve, createTeacherAction }: TeacherCreateDialogProps) {
  const addRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <Button
        type="button"
        className="gap-1 rounded-md bg-Yellow text-foreground hover:bg-Yellow/90"
        onClick={() => addRef.current?.showModal()}
      >
        <Plus className="size-4" />
        إضافة موظف
      </Button>

      <dialog
        ref={addRef}
        className="fixed left-1/2 top-1/2 z-50 m-0 h-fit w-[min(92vw,42rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-4 shadow-lg [&::backdrop]:bg-black/40"
      >
        <form action={createTeacherAction} className="space-y-4">
          <PreserveHiddenInputs preserve={preserve} />
          <h3 className="text-base font-semibold">إضافة موظف جديد</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="create-fullName">الاسم الثلاثي</Label>
              <Input id="create-fullName" name="fullName" required placeholder="اسم الموظف" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-academicQualification">المؤهل العلمي</Label>
              <Input id="create-academicQualification" name="academicQualification" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-certificateObtainedDate">تاريخ الحصول على الشهادة</Label>
              <Input id="create-certificateObtainedDate" name="certificateObtainedDate" type="date" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-certificateSource">مصدر الشهادة</Label>
              <Input id="create-certificateSource" name="certificateSource" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-yearsOfExperience">سنوات الخبرة</Label>
              <Input id="create-yearsOfExperience" name="yearsOfExperience" type="number" min="0" step="1" defaultValue="0" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-phone">الهاتف</Label>
              <Input id="create-phone" name="phone" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-salary">الراتب (أساس القسط)</Label>
              <Input id="create-salary" name="salary" type="number" min="0" step="0.01" defaultValue="0" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="create-salaryInstallmentDueDate">تاريخ استحقاق قسط الراتب الأول</Label>
              <Input id="create-salaryInstallmentDueDate" name="salaryInstallmentDueDate" type="date" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="create-subject">المادة / التخصص</Label>
              <Input id="create-subject" name="subject" placeholder="مثال: رياضيات، لغة عربية…" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => addRef.current?.close()}>
              إلغاء
            </Button>
            <Button type="submit" size="sm">
              حفظ
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function TeacherRowActions({
  teacher,
  preserve,
  updateTeacherAction,
  deleteTeacherAction,
}: TeacherRowActionsProps) {
  const viewRef = useRef<HTMLDialogElement>(null);
  const editRef = useRef<HTMLDialogElement>(null);
  const delRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="h-8 w-8 flex items-center justify-center rounded-full bg-Yellow text-foreground"
          onClick={() => viewRef.current?.showModal()}
          title="عرض"
        >
          <Eye className="size-4" />
        </button>
        <button
          type="button"
          className="h-8 w-8 flex items-center justify-center rounded-full bg-sky text-white"
          onClick={() => editRef.current?.showModal()}
          title="تعديل"
        >
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          className="h-8 w-8 flex items-center justify-center rounded-full bg-red-500 text-white"
          onClick={() => delRef.current?.showModal()}
          title="حذف"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <dialog
        ref={viewRef}
        className="fixed left-1/2 top-1/2 z-50 m-0 h-fit w-[min(92vw,50rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-5 shadow-lg [&::backdrop]:bg-black/40"
      >
        <div className="space-y-4">
          <div className="border-b pb-3">
            <h3 className="text-lg font-bold">ورقة بيانات الموظف</h3>
            <p className="text-xs text-muted-foreground">عرض فقط - غير قابل للتعديل</p>
          </div>
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            <div className="rounded-md border p-2"><span className="font-semibold">المعرّف:</span> {teacher.displayId ?? "—"}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">الاسم الثلاثي:</span> {teacher.fullName}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">المؤهل العلمي:</span> {teacher.academicQualification ?? "—"}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">تاريخ الشهادة:</span> {teacher.certificateObtainedDate ?? "—"}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">مصدر الشهادة:</span> {teacher.certificateSource ?? "—"}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">سنوات الخبرة:</span> {teacher.yearsOfExperience ?? "—"}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">المادة:</span> {teacher.subject ?? "—"}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">الهاتف:</span> {teacher.phone ?? "—"}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">الراتب:</span> ${teacher.salary.toLocaleString("en-US")}</div>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => viewRef.current?.close()}>
              إغلاق
            </Button>
          </div>
        </div>
      </dialog>

      <dialog
        ref={editRef}
        className="fixed left-1/2 top-1/2 z-50 m-0 h-fit w-[min(92vw,42rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-4 shadow-lg [&::backdrop]:bg-black/40"
      >
        <form action={updateTeacherAction} className="space-y-4">
          <PreserveHiddenInputs preserve={preserve} />
          <input type="hidden" name="teacherId" value={teacher.id} />
          <h3 className="text-base font-semibold">تعديل بيانات الموظف</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={`edit-fullName-${teacher.id}`}>الاسم الثلاثي</Label>
              <Input id={`edit-fullName-${teacher.id}`} name="fullName" required defaultValue={teacher.fullName} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-academicQualification-${teacher.id}`}>المؤهل العلمي</Label>
              <Input
                id={`edit-academicQualification-${teacher.id}`}
                name="academicQualification"
                defaultValue={teacher.academicQualification ?? ""}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-certificateObtainedDate-${teacher.id}`}>تاريخ الحصول على الشهادة</Label>
              <Input
                id={`edit-certificateObtainedDate-${teacher.id}`}
                name="certificateObtainedDate"
                type="date"
                defaultValue={teacher.certificateObtainedDate ?? ""}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-certificateSource-${teacher.id}`}>مصدر الشهادة</Label>
              <Input
                id={`edit-certificateSource-${teacher.id}`}
                name="certificateSource"
                defaultValue={teacher.certificateSource ?? ""}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-yearsOfExperience-${teacher.id}`}>سنوات الخبرة</Label>
              <Input
                id={`edit-yearsOfExperience-${teacher.id}`}
                name="yearsOfExperience"
                type="number"
                min="0"
                step="1"
                defaultValue={teacher.yearsOfExperience ?? 0}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-phone-${teacher.id}`}>الهاتف</Label>
              <Input id={`edit-phone-${teacher.id}`} name="phone" defaultValue={teacher.phone ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-salary-${teacher.id}`}>الراتب</Label>
              <Input
                id={`edit-salary-${teacher.id}`}
                name="salary"
                type="number"
                min="0"
                step="0.01"
                defaultValue={teacher.salary}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={`edit-subject-${teacher.id}`}>المادة / التخصص</Label>
              <Input id={`edit-subject-${teacher.id}`} name="subject" defaultValue={teacher.subject ?? ""} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => editRef.current?.close()}>
              إلغاء
            </Button>
            <Button type="submit" size="sm">
              حفظ
            </Button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={delRef}
        className="fixed left-1/2 top-1/2 z-50 m-0 h-fit w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-4 shadow-lg [&::backdrop]:bg-black/40"
      >
        <form action={deleteTeacherAction} className="space-y-3">
          <PreserveHiddenInputs preserve={preserve} />
          <input type="hidden" name="teacherId" value={teacher.id} />
          <h3 className="text-base font-semibold">حذف الموظف</h3>
          <p className="text-sm text-muted-foreground">
            هل تريد حذف الموظف "{teacher.fullName}" نهائيًا؟ لا يمكن التراجع.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => delRef.current?.close()}>
              إلغاء
            </Button>
            <Button type="submit" variant="destructive" size="sm">
              حذف
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
