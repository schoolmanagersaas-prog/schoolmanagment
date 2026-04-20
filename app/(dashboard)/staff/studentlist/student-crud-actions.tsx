"use client";

import { useRef } from "react";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormAction = (formData: FormData) => Promise<void>;

type ClassItem = {
  id: string;
  name: string;
};

type StudentItem = {
  id: string;
  displayId?: number;
  firstName: string;
  lastName: string;
  fatherName: string | null;
  motherName: string | null;
  fullName: string;
  classId: string | null;
  className?: string | null;
  gender: "male" | "female";
  birthPlace: string | null;
  birthDate: string | null;
  registryPlace: string | null;
  registryDate: string | null;
  enrollmentDate: string | null;
  previousSchool: string | null;
  baseTuition: number;
  guardianPhone: string | null;
  address: string | null;
  status: "active" | "withdrawn";
};

type PreserveState = {
  q: string;
  classId: string;
  date: string;
  page: string;
};

type StudentCreateDialogProps = {
  classes: ClassItem[];
  preserve: PreserveState;
  createStudentAction: FormAction;
};

type StudentRowActionsProps = {
  student: StudentItem;
  classes: ClassItem[];
  preserve: PreserveState;
  updateStudentAction: FormAction;
  deleteStudentAction: FormAction;
};

function PreserveHiddenInputs({ preserve }: { preserve: PreserveState }) {
  return (
    <>
      <input type="hidden" name="preserveQ" value={preserve.q} />
      <input type="hidden" name="preserveClassId" value={preserve.classId} />
      <input type="hidden" name="preserveDate" value={preserve.date} />
      <input type="hidden" name="preservePage" value={preserve.page} />
    </>
  );
}

export function StudentCreateDialog({ classes, preserve, createStudentAction }: StudentCreateDialogProps) {
  const addRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <Button
        type="button"
        className="h-8 w-8 rounded-full bg-Yellow p-0 text-foreground hover:bg-Yellow/90"
        onClick={() => addRef.current?.showModal()}
        title="إضافة طالب"
      >
        <Plus className="size-4" />
      </Button>

      <dialog
        ref={addRef}
        className="fixed left-1/2 top-1/2 z-50 m-0 h-fit w-[min(92vw,42rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-4 shadow-lg [&::backdrop]:bg-black/40"
      >
        <form action={createStudentAction} className="space-y-4">
          <PreserveHiddenInputs preserve={preserve} />
          <h3 className="text-base font-semibold">إضافة طالب جديد</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="create-firstName">الاسم</Label>
              <Input id="create-firstName" name="firstName" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-lastName">اللقب</Label>
              <Input id="create-lastName" name="lastName" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-fatherName">الأب</Label>
              <Input id="create-fatherName" name="fatherName" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-motherName">الأم</Label>
              <Input id="create-motherName" name="motherName" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-classId">الصف</Label>
              <select
                id="create-classId"
                name="classId"
                defaultValue=""
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">بدون صف</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-gender">النوع</Label>
              <select
                id="create-gender"
                name="gender"
                defaultValue="male"
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-birthPlace">مكان الولادة</Label>
              <Input id="create-birthPlace" name="birthPlace" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-birthDate">تاريخ الولادة</Label>
              <Input id="create-birthDate" name="birthDate" type="date" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-registryPlace">محل القيد</Label>
              <Input id="create-registryPlace" name="registryPlace" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-registryDate">تاريخ القيد</Label>
              <Input id="create-registryDate" name="registryDate" type="date" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-enrollmentDate">تاريخ الانتساب</Label>
              <Input id="create-enrollmentDate" name="enrollmentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-previousSchool">المدرسة السابقة</Label>
              <Input id="create-previousSchool" name="previousSchool" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-baseTuition">القسط الأساسي</Label>
              <Input id="create-baseTuition" name="baseTuition" type="number" min="0" step="0.01" defaultValue="0" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-status">الحالة</Label>
              <select
                id="create-status"
                name="status"
                defaultValue="active"
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="active">نشط</option>
                <option value="withdrawn">منسحب</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-guardianPhone">هاتف ولي الأمر</Label>
              <Input id="create-guardianPhone" name="guardianPhone" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-address">العنوان</Label>
              <Input id="create-address" name="address" />
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

export function StudentRowActions({
  student,
  classes,
  preserve,
  updateStudentAction,
  deleteStudentAction,
}: StudentRowActionsProps) {
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
            <h3 className="text-lg font-bold">ورقة بيانات الطالب</h3>
            <p className="text-xs text-muted-foreground">عرض فقط - غير قابل للتعديل</p>
          </div>
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            <div className="rounded-md border p-2"><span className="font-semibold">المعرّف:</span> {student.displayId ?? "—"}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">الاسم الكامل:</span> {student.fullName}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">الاسم:</span> {student.firstName}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">اللقب:</span> {student.lastName}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">الأب:</span> {student.fatherName ?? "—"}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">الأم:</span> {student.motherName ?? "—"}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">الجنس:</span> {student.gender === "male" ? "ذكر" : "أنثى"}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">الصف:</span> {student.className ?? "—"}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">مكان/تاريخ الولادة:</span> {(student.birthPlace || student.birthDate) ? `${student.birthPlace ?? "—"} / ${student.birthDate ?? "—"}` : "—"}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">محل/تاريخ القيد:</span> {(student.registryPlace || student.registryDate) ? `${student.registryPlace ?? "—"} / ${student.registryDate ?? "—"}` : "—"}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">تاريخ الانتساب:</span> {student.enrollmentDate ?? "—"}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">المدرسة السابقة:</span> {student.previousSchool ?? "—"}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">القسط الأساسي:</span> ${student.baseTuition.toLocaleString("en-US")}</div>
            <div className="rounded-md border p-2"><span className="font-semibold">هاتف ولي الأمر:</span> {student.guardianPhone ?? "—"}</div>
            <div className="rounded-md border p-2 md:col-span-2"><span className="font-semibold">العنوان:</span> {student.address ?? "—"}</div>
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
        <form action={updateStudentAction} className="space-y-4">
          <PreserveHiddenInputs preserve={preserve} />
          <input type="hidden" name="studentId" value={student.id} />
          <h3 className="text-base font-semibold">تعديل بيانات الطالب</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`edit-firstName-${student.id}`}>الاسم</Label>
              <Input id={`edit-firstName-${student.id}`} name="firstName" required defaultValue={student.firstName} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-lastName-${student.id}`}>اللقب</Label>
              <Input id={`edit-lastName-${student.id}`} name="lastName" required defaultValue={student.lastName} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-fatherName-${student.id}`}>الأب</Label>
              <Input id={`edit-fatherName-${student.id}`} name="fatherName" defaultValue={student.fatherName ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-motherName-${student.id}`}>الأم</Label>
              <Input id={`edit-motherName-${student.id}`} name="motherName" defaultValue={student.motherName ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-class-${student.id}`}>الصف</Label>
              <select
                id={`edit-class-${student.id}`}
                name="classId"
                defaultValue={student.classId ?? ""}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">بدون صف</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-gender-${student.id}`}>النوع</Label>
              <select
                id={`edit-gender-${student.id}`}
                name="gender"
                defaultValue={student.gender}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-birthPlace-${student.id}`}>مكان الولادة</Label>
              <Input id={`edit-birthPlace-${student.id}`} name="birthPlace" defaultValue={student.birthPlace ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-birthDate-${student.id}`}>تاريخ الولادة</Label>
              <Input id={`edit-birthDate-${student.id}`} name="birthDate" type="date" defaultValue={student.birthDate ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-registryPlace-${student.id}`}>محل القيد</Label>
              <Input id={`edit-registryPlace-${student.id}`} name="registryPlace" defaultValue={student.registryPlace ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-registryDate-${student.id}`}>تاريخ القيد</Label>
              <Input id={`edit-registryDate-${student.id}`} name="registryDate" type="date" defaultValue={student.registryDate ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-enrollmentDate-${student.id}`}>تاريخ الانتساب</Label>
              <Input
                id={`edit-enrollmentDate-${student.id}`}
                name="enrollmentDate"
                type="date"
                defaultValue={student.enrollmentDate ?? ""}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-previousSchool-${student.id}`}>المدرسة السابقة</Label>
              <Input id={`edit-previousSchool-${student.id}`} name="previousSchool" defaultValue={student.previousSchool ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-status-${student.id}`}>الحالة</Label>
              <select
                id={`edit-status-${student.id}`}
                name="status"
                defaultValue={student.status}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="active">نشط</option>
                <option value="withdrawn">منسحب</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-tuition-${student.id}`}>القسط الأساسي</Label>
              <Input
                id={`edit-tuition-${student.id}`}
                name="baseTuition"
                type="number"
                min="0"
                step="0.01"
                defaultValue={student.baseTuition}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`edit-phone-${student.id}`}>هاتف ولي الأمر</Label>
              <Input id={`edit-phone-${student.id}`} name="guardianPhone" defaultValue={student.guardianPhone ?? ""} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={`edit-address-${student.id}`}>العنوان</Label>
              <Input id={`edit-address-${student.id}`} name="address" defaultValue={student.address ?? ""} />
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
        <form action={deleteStudentAction} className="space-y-3">
          <PreserveHiddenInputs preserve={preserve} />
          <input type="hidden" name="studentId" value={student.id} />
          <h3 className="text-base font-semibold">حذف الطالب</h3>
          <p className="text-sm text-muted-foreground">
            هل تريد حذف الطالب "{student.fullName}" نهائيًا؟ لا يمكن التراجع.
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
