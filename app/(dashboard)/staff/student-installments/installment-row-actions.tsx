"use client";

import { useRef } from "react";
import { ChevronDown } from "lucide-react";
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

type Props = {
  installmentId: string;
  studentId: string;
  totalAmount: number;
  dueDate: string;
  totalPaid: number;
  preserveStatus: string;
  preserveClassId: string;
  deleteInstallmentAction: FormAction;
  updateInstallmentAction: FormAction;
  createInstallmentAction: FormAction;
};

export function InstallmentRowActions({
  installmentId,
  studentId,
  totalAmount,
  dueDate,
  totalPaid,
  preserveStatus,
  preserveClassId,
  deleteInstallmentAction,
  updateInstallmentAction,
  createInstallmentAction,
}: Props) {
  const editRef = useRef<HTMLDialogElement>(null);
  const addRef = useRef<HTMLDialogElement>(null);
  const delRef = useRef<HTMLDialogElement>(null);
  const canDelete = totalPaid <= 0;

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
            تعديل القسط
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={(e) => {
              e.preventDefault();
              addRef.current?.showModal();
            }}
          >
            إضافة قسط جديد
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:text-destructive"
            disabled={!canDelete}
            title={!canDelete ? "لا يمكن الحذف مع وجود دفعات على هذا القسط" : undefined}
            onSelect={(e) => {
              e.preventDefault();
              if (canDelete) delRef.current?.showModal();
            }}
          >
            حذف القسط
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <dialog
        ref={editRef}
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-4 shadow-lg [&::backdrop]:bg-black/40"
      >
        <form action={updateInstallmentAction} className="space-y-3">
          <input type="hidden" name="installmentId" value={installmentId} />
          <input type="hidden" name="preserveStatus" value={preserveStatus} />
          <input type="hidden" name="preserveClassId" value={preserveClassId} />
          <h3 className="text-base font-semibold">تعديل القسط</h3>
          <div className="space-y-1">
            <Label htmlFor={`due-${installmentId}`}>تاريخ الاستحقاق</Label>
            <Input
              id={`due-${installmentId}`}
              name="dueDate"
              type="date"
              required
              defaultValue={dueDate}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`amt-${installmentId}`}>المبلغ</Label>
            <Input
              id={`amt-${installmentId}`}
              name="totalAmount"
              type="number"
              min="0.01"
              step="0.01"
              required
              defaultValue={totalAmount}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            إن وُجدت دفعات، لا يمكن جعل المبلغ أقل من إجمالي المدفوع ({totalPaid.toLocaleString("en-US")}).
          </p>
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
        ref={addRef}
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-4 shadow-lg [&::backdrop]:bg-black/40"
      >
        <form action={createInstallmentAction} className="space-y-3">
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="preserveStatus" value={preserveStatus} />
          <input type="hidden" name="preserveClassId" value={preserveClassId} />
          <h3 className="text-base font-semibold">قسط جديد لنفس الطالب</h3>
          <div className="space-y-1">
            <Label htmlFor={`new-due-${installmentId}`}>تاريخ الاستحقاق</Label>
            <Input id={`new-due-${installmentId}`} name="dueDate" type="date" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`new-amt-${installmentId}`}>المبلغ</Label>
            <Input
              id={`new-amt-${installmentId}`}
              name="totalAmount"
              type="number"
              min="0.01"
              step="0.01"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => addRef.current?.close()}>
              إلغاء
            </Button>
            <Button type="submit" size="sm">
              إضافة
            </Button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={delRef}
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-4 shadow-lg [&::backdrop]:bg-black/40"
      >
        <form action={deleteInstallmentAction} className="space-y-3">
          <input type="hidden" name="installmentId" value={installmentId} />
          <input type="hidden" name="preserveStatus" value={preserveStatus} />
          <input type="hidden" name="preserveClassId" value={preserveClassId} />
          <h3 className="text-base font-semibold">حذف القسط</h3>
          <p className="text-sm text-muted-foreground">هل تريد حذف هذا القسط نهائياً؟ لا يمكن التراجع.</p>
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
