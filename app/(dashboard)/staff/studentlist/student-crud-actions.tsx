"use client";

import { useRef } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormAction = (formData: FormData) => Promise<void>;

type ClassItem = {
  id: string;
  name: string;
};

type StudentItem = {
  id: string;
  fullName: string;
  classId: string | null;
  gender: "male" | "female";
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
        className="gap-1 rounded-md bg-Yellow text-foreground hover:bg-Yellow/90"
        onClick={() => addRef.current?.showModal()}
      >
        <Plus className="size-4" />
        إضافة طالب
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
              <Label htmlFor="create-fullName">الاسم الكامل</Label>
              <Input id="create-fullName" name="fullName" required placeholder="مثال: أحمد محمد" />
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
              <Label htmlFor="create-baseTuition">القسط الأساسي</Label>
              <Input id="create-baseTuition" name="baseTuition" type="number" min="0" step="0.01" defaultValue="0" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="create-installmentDueDate">تاريخ استحقاق القسط</Label>
              <Input
                id="create-installmentDueDate"
                name="installmentDueDate"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
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
  const editRef = useRef<HTMLDialogElement>(null);
  const delRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="gap-1">
            إجراءات
            <ChevronDown className="size-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[10rem]">
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={(e) => {
              e.preventDefault();
              editRef.current?.showModal();
            }}
          >
            تعديل الطالب
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              delRef.current?.showModal();
            }}
          >
            حذف الطالب
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
              <Label htmlFor={`edit-fullName-${student.id}`}>الاسم الكامل</Label>
              <Input id={`edit-fullName-${student.id}`} name="fullName" required defaultValue={student.fullName} />
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
