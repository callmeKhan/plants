"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, CheckCircle2, Circle, ClipboardList, GripVertical, ListOrdered, Plus, Trash2, X } from "lucide-react";
import { useData, type HomeTask } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-modal";

function sameStringArray(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function syncTaskOrder(draftOrder: string[], currentOrder: string[]) {
  const currentIds = new Set(currentOrder);
  const keptDraftIds = draftOrder.filter((id) => currentIds.has(id));
  const missingIds = currentOrder.filter((id) => !keptDraftIds.includes(id));
  return [...keptDraftIds, ...missingIds];
}

function fmtDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

type SortableTaskShellRenderArgs = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "listeners" | "setActivatorNodeRef" | "isDragging"
>;

function SortableTaskShell({
  id,
  disabled,
  className,
  children,
}: {
  id: string;
  disabled: boolean;
  className: string;
  children: (args: SortableTaskShellRenderArgs) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled, transition: null });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? "none" : transition ?? undefined,
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.85 : undefined,
    touchAction: disabled ? undefined : "pan-y",
  };

  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({ attributes, listeners, setActivatorNodeRef, isDragging })}
    </div>
  );
}

function TaskRow({
  task,
  isReordering,
  onToggle,
  onDelete,
}: {
  task: HomeTask;
  isReordering: boolean;
  onToggle: (task: HomeTask) => void;
  onDelete: (task: HomeTask) => void;
}) {
  const className = `rounded-xl border px-3 py-2.5 shadow-sm ${
    task.done
      ? "border-gray-100 bg-gray-50"
      : isReordering
        ? "w-[85%] border-blue-100 bg-white"
        : "border-gray-100 bg-white"
  }`;
  const renderContent = (drag?: SortableTaskShellRenderArgs) => (
    <div className="flex items-start gap-3">
      <button
        type="button"
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
          task.done ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-400 hover:text-emerald-600"
        } disabled:opacity-40`}
        onClick={() => onToggle(task)}
        disabled={isReordering}
        aria-label={task.done ? "Đánh dấu chưa xong" : "Đánh dấu hoàn thành"}
      >
        {task.done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold leading-snug ${task.done ? "text-gray-400 line-through" : "text-gray-900"}`}>
          {task.content}
        </p>
        <p className="mt-1 text-[11px] text-gray-400">
          Tạo lúc {fmtDateTime(task.created_at)}
        </p>
      </div>
      {isReordering && !task.done && drag ? (
        <button
          type="button"
          ref={drag.setActivatorNodeRef}
          {...drag.attributes}
          {...drag.listeners}
          className={`flex h-8 w-8 shrink-0 touch-none items-center justify-center rounded-lg ${
            drag.isDragging ? "cursor-grabbing bg-blue-50 text-blue-600" : "cursor-grab bg-gray-50 text-gray-400"
          }`}
          aria-label="Kéo để đổi vị trí"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500"
          onClick={() => onDelete(task)}
          aria-label="Xóa công việc"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  if (!isReordering || task.done) {
    return <div className={className}>{renderContent()}</div>;
  }

  return (
    <SortableTaskShell
      id={task.id}
      disabled={false}
      className={className}
    >
      {(drag) => renderContent(drag)}
    </SortableTaskShell>
  );
}

interface HomeTaskSheetProps {
  onClose: () => void;
  zIndex?: number;
}

export function HomeTaskSheet({ onClose, zIndex = 50 }: HomeTaskSheetProps) {
  const [openConfirm, confirmModal] = useConfirm();
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [isSavingNew, setIsSavingNew] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);

  const { homeTasks, mutate, refresh } = useData();
  const pendingTasks = useMemo(() => homeTasks.filter((task) => !task.done), [homeTasks]);
  const completedTasks = useMemo(() => homeTasks.filter((task) => task.done), [homeTasks]);
  const pendingTaskIds = useMemo(() => pendingTasks.map((task) => task.id), [pendingTasks]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const activeOrder = useMemo(
    () => isReordering ? syncTaskOrder(draftOrder, pendingTaskIds) : pendingTaskIds,
    [draftOrder, isReordering, pendingTaskIds],
  );

  const orderedPendingTasks = useMemo(() => {
    if (!isReordering) return pendingTasks;

    const tasksById = new Map(pendingTasks.map((task) => [task.id, task]));
    return activeOrder
      .map((id) => tasksById.get(id))
      .filter((task): task is HomeTask => Boolean(task));
  }, [activeOrder, isReordering, pendingTasks]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
  }, []);

  const handleSheetAnimEnd = useCallback((e: React.AnimationEvent) => {
    if (e.animationName === "sheetSlideDown") {
      setIsClosing(false);
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    const scrollY = window.scrollY;
    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    const previousBodyPosition = bodyStyle.position;
    const previousBodyTop = bodyStyle.top;
    const previousBodyLeft = bodyStyle.left;
    const previousBodyRight = bodyStyle.right;
    const previousBodyWidth = bodyStyle.width;
    const previousBodyOverflow = bodyStyle.overflow;
    const previousBodyOverscroll = bodyStyle.overscrollBehavior;
    const previousHtmlOverscroll = htmlStyle.overscrollBehavior;

    bodyStyle.position = "fixed";
    bodyStyle.top = `-${scrollY}px`;
    bodyStyle.left = "0";
    bodyStyle.right = "0";
    bodyStyle.width = "100%";
    bodyStyle.overflow = "hidden";
    bodyStyle.overscrollBehavior = "none";
    htmlStyle.overscrollBehavior = "none";

    return () => {
      bodyStyle.position = previousBodyPosition;
      bodyStyle.top = previousBodyTop;
      bodyStyle.left = previousBodyLeft;
      bodyStyle.right = previousBodyRight;
      bodyStyle.width = previousBodyWidth;
      bodyStyle.overflow = previousBodyOverflow;
      bodyStyle.overscrollBehavior = previousBodyOverscroll;
      htmlStyle.overscrollBehavior = previousHtmlOverscroll;
      window.scrollTo(0, scrollY);
    };
  }, []);

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    const content = newTask.trim();
    if (!content || isReordering) return;

    setIsSavingNew(true);
    try {
      const res = await fetch("/api/home-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Cannot add task");
      mutate.upsertHomeTask(await res.json());
      setNewTask("");
      setToast({ text: "Đã thêm công việc", type: "success" });
    } catch {
      await refresh("homeTasks");
      setToast({ text: "Lỗi thêm công việc", type: "error" });
    } finally {
      setIsSavingNew(false);
    }
  }

  async function toggleTask(task: HomeTask) {
    if (isReordering) return;

    try {
      const res = await fetch(`/api/home-tasks?id=${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !task.done }),
      });
      if (!res.ok) throw new Error("Cannot update task");
      mutate.upsertHomeTask(await res.json());
    } catch {
      await refresh("homeTasks");
      setToast({ text: "Lỗi cập nhật công việc", type: "error" });
    }
  }

  async function deleteTask(task: HomeTask) {
    try {
      const res = await fetch(`/api/home-tasks?id=${task.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Cannot delete task");
      mutate.removeHomeTask(task.id);
      setToast({ text: "Đã xóa công việc", type: "success" });
    } catch {
      await refresh("homeTasks");
      setToast({ text: "Lỗi xóa công việc", type: "error" });
    }
  }

  async function deleteCompletedTasks() {
    const fallbackDeletedIds = completedTasks.map((task) => task.id);
    if (fallbackDeletedIds.length === 0) return;

    try {
      const res = await fetch("/api/home-tasks?done=true", { method: "DELETE" });
      if (!res.ok) throw new Error("Cannot delete completed tasks");
      const body = await res.json() as { deleted?: string[] };
      const deletedIds = Array.isArray(body.deleted) ? body.deleted : fallbackDeletedIds;
      deletedIds.forEach((id) => mutate.removeHomeTask(id));
      setToast({ text: `Đã xóa ${deletedIds.length} công việc đã hoàn thành`, type: "success" });
    } catch {
      await refresh("homeTasks");
      setToast({ text: "Lỗi xóa công việc đã hoàn thành", type: "error" });
    }
  }

  async function saveTaskOrder() {
    setSavingOrder(true);
    try {
      const res = await fetch("/api/home-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_ids: activeOrder }),
      });
      if (!res.ok) throw new Error("Cannot save task order");
      const updatedTasks = await res.json() as HomeTask[];
      updatedTasks.forEach((task) => mutate.upsertHomeTask(task));
      setDraftOrder(updatedTasks.map((task) => task.id));
      setIsReordering(false);
      setToast({ text: "Đã lưu thứ tự công việc", type: "success" });
    } catch {
      await refresh("homeTasks");
      setToast({ text: "Lỗi lưu thứ tự công việc", type: "error" });
    } finally {
      setSavingOrder(false);
    }
  }

  function handleToggleReorder() {
    if (savingOrder) return;

    if (!isReordering) {
      setDraftOrder(pendingTaskIds);
      setIsReordering(true);
      return;
    }

    if (sameStringArray(activeOrder, pendingTaskIds)) {
      setIsReordering(false);
      return;
    }

    openConfirm(
      `Lưu thứ tự ${activeOrder.length} công việc chưa hoàn thành?`,
      () => { void saveTaskOrder(); },
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setDraftOrder((currentOrder) => {
      const syncedOrder = syncTaskOrder(currentOrder, pendingTaskIds);
      const oldIndex = syncedOrder.indexOf(String(active.id));
      const newIndex = syncedOrder.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return currentOrder;
      return arrayMove(syncedOrder, oldIndex, newIndex);
    });
  }

  return (
    <>
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
      <div
        className={`fixed inset-0 flex flex-col justify-end sheet-backdrop${isClosing ? " closing" : ""}`}
        style={{ zIndex, overscrollBehavior: "none" }}
        onClick={handleClose}
      >
        <div
          className={`bg-white rounded-t-3xl shadow-2xl h-[85vh] flex flex-col sheet-panel${isClosing ? " closing" : ""}`}
          style={{ marginBottom: "64px", overscrollBehavior: "contain" }}
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          onAnimationEnd={handleSheetAnimEnd}
        >
          <div className="sticky top-0 bg-white z-10 rounded-t-3xl border-b border-gray-100 px-5 pt-4 pb-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-bold text-gray-900">Công việc cần làm</h2>
                <p className="mt-0.5 text-xs text-gray-400">
                  {pendingTasks.length} chưa xong · {completedTasks.length} đã hoàn thành
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className={`flex h-8 w-10 items-center justify-center rounded-full transition-colors ${
                    isReordering
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-500 hover:text-gray-700"
                  } disabled:opacity-40 disabled:hover:text-gray-500`}
                  onClick={handleToggleReorder}
                  disabled={savingOrder || (!isReordering && pendingTasks.length < 2)}
                  aria-pressed={isReordering}
                  aria-label={isReordering ? "Lưu thứ tự công việc" : "Sắp xếp công việc"}
                  title={isReordering ? "Lưu thứ tự công việc" : "Sắp xếp công việc"}
                >
                  <ListOrdered className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="flex h-8 w-12 items-center justify-center rounded-full bg-gray-100"
                  onClick={handleClose}
                  aria-label="Đóng danh sách công việc"
                >
                  <X className="h-4 w-4 text-gray-600" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4" style={{ overscrollBehavior: "contain" }}>
            <form onSubmit={handleAddTask} className="flex gap-2">
              <Input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="Thêm công việc mới"
                disabled={isSavingNew || isReordering}
                className="h-10"
              />
              <Button
                type="submit"
                size="icon"
                disabled={isSavingNew || isReordering || !newTask.trim()}
                aria-label="Thêm công việc"
              >
                {isSavingNew ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </Button>
            </form>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">Chưa hoàn thành ({pendingTasks.length})</h3>
                {isReordering && (
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-600">
                    Đang sắp xếp
                  </span>
                )}
              </div>

              {pendingTasks.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-200 py-8 text-gray-400">
                  <CheckCircle2 className="mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm">Không còn việc chưa hoàn thành</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={orderedPendingTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {orderedPendingTasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          isReordering={isReordering}
                          onToggle={(nextTask) => { void toggleTask(nextTask); }}
                          onDelete={(nextTask) => openConfirm("Xóa công việc này?", () => { void deleteTask(nextTask); })}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>

            {completedTasks.length > 0 && (
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-gray-800">Đã hoàn thành ({completedTasks.length})</h3>
                  <button
                    type="button"
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-red-500 hover:bg-red-50"
                    onClick={() => openConfirm(
                      `Xóa tất cả ${completedTasks.length} công việc đã hoàn thành?`,
                      () => { void deleteCompletedTasks(); },
                    )}
                    aria-label="Xóa tất cả công việc đã hoàn thành"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Xóa tất cả
                  </button>
                </div>
                <div className="space-y-2">
                  {completedTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      isReordering={false}
                      onToggle={(nextTask) => { void toggleTask(nextTask); }}
                      onDelete={(nextTask) => openConfirm("Xóa công việc này?", () => { void deleteTask(nextTask); })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {confirmModal}
    </>
  );
}
