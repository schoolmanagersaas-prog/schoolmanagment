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

type TeacherItem = {
  id: string;
  fullName: string;
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
        إضافة معلم
      </Button>

      <dialog
        ref={addRef}
        className="fixed left-1/2 top-1/2 z-50 m-0 h-fit w-[min(92vw,42rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-4 shadow-lg [&::backdrop]:bg-black/40"
      >
        <form action={createTeacherAction} className="space-y-4">
          <PreserveHiddenInputs preserve={preserve} />
          <h3 className="text-base font-semibold">إضافة معلم جديد</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="create-fullName">الاسم الكامل</Label>
              <Input id="create-fullName" name="fullName" required placeholder="اسم المعلم" />
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
            تعديل المعلم
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              delRef.current?.showModal();
            }}
          >
            حذف المعلم
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <dialog
        ref={editRef}
        className="fixed left-1/2 top-1/2 z-50 m-0 h-fit w-[min(92vw,42rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-4 shadow-lg [&::backdrop]:bg-black/40"
      >
        <form action={updateTeacherAction} className="space-y-4">
          <PreserveHiddenInputs preserve={preserve} />
          <input type="hidden" name="teacherId" value={teacher.id} />
          <h3 className="text-base font-semibold">تعديل بيانات المعلم</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={`edit-fullName-${teacher.id}`}>الاسم الكامل</Label>
              <Input id={`edit-fullName-${teacher.id}`} name="fullName" required defaultValue={teacher.fullName} />
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
          <h3 className="text-base font-semibold">حذف المعلم</h3>
          <p className="text-sm text-muted-foreground">
            هل تريد حذف المعلم "{teacher.fullName}" نهائيًا؟ لا يمكن التراجع.
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
