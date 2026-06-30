"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useData, type PlantNoteImage } from "@/lib/data";
import { round2 } from "@/lib/number";
import { currentDateString } from "@/lib/time";
import { getBatchColorRowClass, normalizeBatchColor } from "@/lib/batch-color";
import { getSpecialPlatformStatus } from "@/lib/special-platform-status";
import { PLANT_LOCATION_STATUSES, getPlantLocationStatusMeta } from "@/lib/plant-location-status";
import { getPlantMaxImages, plantMaxImagesMessage, plantRemainingImagesMessage } from "@/lib/plant-notes-config";
import { compressPlantPhoto } from "@/lib/image-compression";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlantImage } from "@/components/plant-image";
import { Toast } from "@/components/ui/toast";

import {
  X, Pencil, Check, Package, MapPin, Calendar, Trash2, Search,
  DollarSign, FileText, Images, Maximize2, RotateCcw, Upload, ChevronLeft, ChevronRight, Star,
} from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-modal";

type DetailTab = "batches" | "notes";

type SelectedDetailImage = {
  src: string;
  alt: string;
  imageId: string;
  imageNumber: number;
} | null;

type LargeImage = {
  src?: string | null;
  alt: string;
  imageId?: string;
  imageNumber?: number;
} | null;

type UploadedPlantImage = {
  image_url: string;
  object_key: string;
  content_type: "image/jpeg" | "image/webp";
  width: number;
  height: number;
  size_bytes: number;
};

type PlantImageDraft = {
  file: File;
  previewUrl: string;
};

function getDetailImageView(image: PlantNoteImage, imageNumber: number, plantName: string) {
  return {
    src: image.image_url,
    alt: `${plantName} detail image ${imageNumber}`,
    imageId: image.id,
    imageNumber,
  };
}

function fmtDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function PotSizeInput({ value, onChange, usedSizes }: { value: number; onChange: (v: number) => void; usedSizes: number[] }) {
  const [inputVal, setInputVal] = useState(String(value));
  const [showDrop, setShowDrop] = useState(false);

  const suggestions = [...new Set([...usedSizes, 14, 16, 21])]
    .filter((s) => String(s).startsWith(inputVal))
    .sort((a, b) => a - b)
    .slice(0, 6);

  function commit(val: string) {
    const n = Number(val);
    if (n > 0) { onChange(n); setInputVal(String(n)); }
    setShowDrop(false);
  }

  return (
    <div className="relative">
      <input
        type="number"
        min={1}
        className="w-full h-8 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-center"
        placeholder="🪴 Chậu"
        value={inputVal}
        onChange={(e) => { setInputVal(e.target.value); setShowDrop(true); }}
        onFocus={() => setShowDrop(true)}
        onBlur={() => setTimeout(() => { commit(inputVal); setShowDrop(false); }, 150)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(inputVal); } }}
      />
      {showDrop && suggestions.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl text-sm divide-y divide-gray-50 max-h-40 overflow-y-auto">
          {suggestions.map((s) => (
            <li
              key={s}
              className="px-3 py-1.5 cursor-pointer hover:bg-blue-50 text-gray-800"
              onMouseDown={() => { onChange(s); setInputVal(String(s)); setShowDrop(false); }}
            >
              Chậu {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const statusMeta = getPlantLocationStatusMeta(status);
  if (!statusMeta) return null;

  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none"
      style={{
        backgroundColor: statusMeta.badgeBgColor,
        color: statusMeta.badgeTextColor,
      }}
    >
      {statusMeta.icon && `${statusMeta.icon} `}{statusMeta.label}
    </span>
  );
}

interface PlantDetailSheetProps {
  plantId: string;
  onClose: () => void;
  highlightBatchId?: string;
  onShowPlatformDetail?: (platformId: string, batchId?: string, label?: string) => void;
  breadcrumb?: string[];
  zIndex?: number;
}

export function PlantDetailSheet({ plantId, onClose, highlightBatchId, onShowPlatformDetail, breadcrumb, zIndex = 50 }: PlantDetailSheetProps) {
  const [openConfirm, confirmModal] = useConfirm();
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Exit animation
  const [isClosing, setIsClosing] = useState(false);
  const handleClose = useCallback(() => {
    setIsClosing(true);
  }, []);
  const handleSheetAnimEnd = useCallback((e: React.AnimationEvent) => {
    if (e.animationName === "sheetSlideDown") {
      setIsClosing(false);
      onClose();
    }
  }, [onClose]);

  // Edit name
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");

  // Notes
  const [activeTab, setActiveTab] = useState<DetailTab>("batches");
  const [selectedDetailImage, setSelectedDetailImage] = useState<SelectedDetailImage>(null);
  const [largeImage, setLargeImage] = useState<LargeImage>(null);
  const [noteText, setNoteText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState("");
  const [plantImageFiles, setPlantImageFiles] = useState<PlantImageDraft[]>([]);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isSavingImages, setIsSavingImages] = useState(false);
  const plantImageFilesRef = useRef<PlantImageDraft[]>([]);
  const imageSwipeStartXRef = useRef<number | null>(null);
  const imageSwipeDidMoveRef = useRef(false);

  // Edit batch
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editPotSize, setEditPotSize] = useState<number>(14);
  const [editDate, setEditDate] = useState("");
  const [editPlatformId, setEditPlatformId] = useState("");
  const [editPlatformSearch, setEditPlatformSearch] = useState("");
  const [showEditPlatformDropdown, setShowEditPlatformDropdown] = useState(false);
  const [editStatus, setEditStatus] = useState("");

  const { plants, locations, platforms, gardens, locationsByPlatform, locationsByPlant, locationsById, salesByPlant, notesByPlant, imagesByPlant, mutate, refresh } = useData();

  const plant = plants.find((p) => p.id === plantId);
  const batches = locationsByPlant.get(plantId) ?? [];
  const totalSold = round2((salesByPlant.get(plantId) ?? []).reduce((sum, sale) => sum + sale.quantity, 0));
  const plantNotes = notesByPlant.get(plantId) ?? [];
  const detailImages = useMemo(() => (
    imagesByPlant.get(plantId) ?? []
  ).map((image, index) => ({
    imageNumber: index + 1,
    image,
  })), [imagesByPlant, plantId]);
  const plantMaxImages = getPlantMaxImages();
  const remainingImageSlots = Math.max(0, plantMaxImages - detailImages.length);
  const remainingDraftImageSlots = Math.max(0, remainingImageSlots - plantImageFiles.length);
  const canSelectPlantImages = remainingDraftImageSlots > 0;
  const imageLimitMessage = plantMaxImagesMessage(plantMaxImages);
  const draftNoteNumber = plantNotes.length + 1;

  useEffect(() => {
    plantImageFilesRef.current = plantImageFiles;
  }, [plantImageFiles]);

  useEffect(() => () => {
    plantImageFilesRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }, []);

  useEffect(() => {
    if (!largeImage) return;
    const activeLargeImage = largeImage;

    function showDetailImageFromKeyboard(direction: -1 | 1) {
      if (detailImages.length === 0) return;

      const currentIndex = activeLargeImage.imageId
        ? detailImages.findIndex(({ image }) => image.id === activeLargeImage.imageId)
        : -1;
      const nextIndex = currentIndex >= 0
        ? currentIndex + direction
        : direction > 0 ? 0 : detailImages.length - 1;
      const wrappedIndex = (nextIndex + detailImages.length) % detailImages.length;
      const { image, imageNumber } = detailImages[wrappedIndex];
      const nextImage = getDetailImageView(image, imageNumber, plant?.name ?? "Plant");
      setSelectedDetailImage(nextImage);
      setLargeImage(nextImage);
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLargeImage(null);
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        showDetailImageFromKeyboard(-1);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        showDetailImageFromKeyboard(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailImages, largeImage, plant?.name]);

  if (!plant) return null;

  function platformLabelFull(id: string) {
    const p = platforms?.find((p) => p.id === id);
    if (!p) return id;
    const g = gardens?.find((g) => g.id === p.garden_id);
    return `${g ? g.name + " | " : ""}Tầng ${p.floor} - ${p.name}`;
  }

  function platformLabelShort(id: string) {
    const p = platforms?.find((p) => p.id === id);
    return p ? `Sàn ${p.name}` : id;
  }

  async function handleUpdateName() {
    if (!newName.trim() || !plant) return;
    const exists = plants?.some((p) => p.id !== plantId && p.name.trim().toLowerCase() === newName.trim().toLowerCase());
    if (exists) return;
    try {
      const res = await fetch(`/api/plants?id=${plantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...plant, name: newName.trim() }),
      });
      if (res.ok) { mutate.upsertPlant(await res.json()); setEditingName(false); }
      else setToast({ text: "Lỗi cập nhật tên cây", type: "error" });
    } catch {
      setToast({ text: "Lỗi kết nối", type: "error" });
    }
  }

  function handleSelectPlantImageFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));

    if (selected.length > 0) {
      const availableSlots = remainingDraftImageSlots;
      const accepted = selected.slice(0, availableSlots);
      const rejected = selected.slice(availableSlots);

      rejected.forEach((item) => URL.revokeObjectURL(item.previewUrl));

      if (accepted.length > 0) {
        setPlantImageFiles((prev) => [...prev, ...accepted]);
      }

      if (rejected.length > 0) {
        setToast({ text: plantRemainingImagesMessage(availableSlots, plantMaxImages), type: "error" });
      }
    }

    e.currentTarget.value = "";
  }

  function removePlantImageFile(index: number) {
    setPlantImageFiles((prev) => {
      const item = prev[index];
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function clearPlantImageFiles() {
    setPlantImageFiles((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  }

  async function uploadPlantImage(file: File): Promise<UploadedPlantImage> {
    const compressed = await compressPlantPhoto(file);
    const signRes = await fetch("/api/r2-upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plantId,
        fileName: file.name,
        contentType: compressed.contentType,
      }),
    });

    if (!signRes.ok) throw new Error("Cannot create upload URL");
    const signed = await signRes.json() as { uploadUrl?: string; publicUrl?: string; key?: string };
    if (!signed.uploadUrl || !signed.publicUrl || !signed.key) throw new Error("Invalid upload URL");

    const uploadRes = await fetch(signed.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": compressed.contentType },
      body: compressed.blob,
    });

    if (!uploadRes.ok) throw new Error("Cannot upload image");

    return {
      image_url: signed.publicUrl,
      object_key: signed.key,
      content_type: compressed.contentType,
      width: compressed.width,
      height: compressed.height,
      size_bytes: compressed.blob.size,
    };
  }

  async function handleSaveNote() {
    if (!noteText.trim()) return;

    setIsSavingNote(true);
    try {
      const res = await fetch("/api/plant-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plant_id: plantId,
          content: noteText.trim(),
        }),
      });

      if (!res.ok) throw new Error("Cannot save note");

      mutate.upsertPlantNote(await res.json());
      setNoteText("");
      setToast({ text: "Đã lưu ghi chú", type: "success" });
    } catch {
      setToast({ text: "Lỗi lưu ghi chú", type: "error" });
      await refresh("notes");
    } finally {
      setIsSavingNote(false);
    }
  }

  async function handleSavePlantImages() {
    if (plantImageFiles.length === 0) return;
    if (plantImageFiles.length > remainingImageSlots) {
      setToast({ text: plantRemainingImagesMessage(remainingImageSlots, plantMaxImages), type: "error" });
      return;
    }

    setIsSavingImages(true);
    try {
      const images: UploadedPlantImage[] = [];
      for (let i = 0; i < plantImageFiles.length; i += 1) {
        images.push(await uploadPlantImage(plantImageFiles[i].file));
      }

      const res = await fetch("/api/plant-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plant_id: plantId,
          images,
        }),
      });

      if (!res.ok) {
        throw new Error(res.status === 409 ? "IMAGE_LIMIT" : "Cannot save images");
      }

      const savedImages = await res.json() as PlantNoteImage[];
      savedImages.forEach((image) => mutate.upsertPlantImage(image));
      clearPlantImageFiles();
      setToast({ text: "Đã lưu hình", type: "success" });
    } catch (error) {
      setToast({
        text: error instanceof Error && error.message === "IMAGE_LIMIT"
          ? imageLimitMessage
          : "Lỗi lưu hình",
        type: "error",
      });
      await refresh("images");
    } finally {
      setIsSavingImages(false);
    }
  }

  function startEditNote(note: { id: string; content: string }) {
    setEditingNoteId(note.id);
    setEditNoteText(note.content);
  }

  async function handleUpdateNote(noteId: string) {
    if (!editNoteText.trim()) return;

    setIsSavingNote(true);
    try {
      const res = await fetch(`/api/plant-notes?id=${noteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editNoteText.trim() }),
      });

      if (!res.ok) throw new Error("Cannot update note");

      mutate.upsertPlantNote(await res.json());
      setEditingNoteId(null);
      setEditNoteText("");
      setToast({ text: "Đã cập nhật ghi chú", type: "success" });
    } catch {
      setToast({ text: "Lỗi cập nhật ghi chú", type: "error" });
      await refresh("notes");
    } finally {
      setIsSavingNote(false);
    }
  }

  async function doDeleteNote(noteId: string) {
    try {
      const res = await fetch(`/api/plant-notes?id=${noteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Cannot delete note");
      mutate.removePlantNote(noteId);
      if (editingNoteId === noteId) {
        setEditingNoteId(null);
        setEditNoteText("");
      }
      setToast({ text: "Đã xoá ghi chú", type: "success" });
    } catch {
      setToast({ text: "Lỗi xoá ghi chú", type: "error" });
      await refresh("notes");
    }
  }

  async function doDeletePlantImage(imageId: string) {
    try {
      const res = await fetch(`/api/plant-images?id=${imageId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Cannot delete image");
      mutate.removePlantImage(imageId);
      if (selectedDetailImage?.imageId === imageId) setSelectedDetailImage(null);
      setToast({ text: "Đã xoá hình", type: "success" });
    } catch {
      setToast({ text: "Lỗi xoá hình", type: "error" });
      await refresh("images");
    }
  }

  async function doSetMainImage(image: PlantNoteImage) {
    if (!plant) return;

    try {
      const res = await fetch(`/api/plants?id=${plantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...plant, image_url: image.image_url }),
      });
      if (!res.ok) throw new Error("Cannot set main image");

      mutate.upsertPlant(await res.json());
      setToast({ text: "Đã đặt làm hình chính", type: "success" });
    } catch {
      setToast({ text: "Lỗi đặt hình chính", type: "error" });
      await refresh("plants");
    }
  }

  function showDetailImageAt(index: number, openLarge = false) {
    if (detailImages.length === 0) return;

    const wrappedIndex = (index + detailImages.length) % detailImages.length;
    const { image, imageNumber } = detailImages[wrappedIndex];
    const detailImage = getDetailImageView(image, imageNumber, plant?.name ?? "Plant");
    setSelectedDetailImage(detailImage);
    if (openLarge) setLargeImage(detailImage);
  }

  function showAdjacentDetailImage(currentImageId: string | undefined, direction: -1 | 1, openLarge = false) {
    if (detailImages.length === 0) return;

    const currentIndex = currentImageId
      ? detailImages.findIndex(({ image }) => image.id === currentImageId)
      : -1;
    const nextIndex = currentIndex >= 0
      ? currentIndex + direction
      : direction > 0 ? 0 : detailImages.length - 1;

    showDetailImageAt(nextIndex, openLarge);
  }

  function openDisplayedImageLarge() {
    if (imageSwipeDidMoveRef.current) {
      imageSwipeDidMoveRef.current = false;
      return;
    }

    if (selectedDetailImage) {
      setLargeImage(selectedDetailImage);
      return;
    }

    setLargeImage({ src: plant?.image_url, alt: plant?.name ?? "Plant" });
  }

  function handleImageSwipeStart(e: React.TouchEvent) {
    imageSwipeStartXRef.current = e.touches[0]?.clientX ?? null;
  }

  function handleDisplayedImageSwipeEnd(e: React.TouchEvent) {
    const startX = imageSwipeStartXRef.current;
    imageSwipeStartXRef.current = null;
    const endX = e.changedTouches[0]?.clientX;
    if (startX == null || endX == null) return;

    const deltaX = endX - startX;
    if (Math.abs(deltaX) < 48) return;

    imageSwipeDidMoveRef.current = true;
    showAdjacentDetailImage(selectedDetailImage?.imageId, deltaX < 0 ? 1 : -1);
  }

  function handleLargeImageSwipeEnd(e: React.TouchEvent) {
    const startX = imageSwipeStartXRef.current;
    imageSwipeStartXRef.current = null;
    const endX = e.changedTouches[0]?.clientX;
    if (startX == null || endX == null) return;

    const deltaX = endX - startX;
    if (Math.abs(deltaX) < 48) return;

    imageSwipeDidMoveRef.current = true;
    showAdjacentDetailImage(largeImage?.imageId, deltaX < 0 ? 1 : -1, true);
  }

  function selectDetailImage(image: PlantNoteImage, imageNumber: number) {
    setSelectedDetailImage(getDetailImageView(image, imageNumber, plant?.name ?? "Plant"));
  }

  function startEditBatch(b: { id: string; quantity: number; pot_size: number; planted_date: string; platform_id: string; price?: number; status?: string }) {
    setEditingBatchId(b.id);
    setEditQty(String(b.quantity));
    setEditPrice(b.price != null ? String(b.price) : "");
    setEditPotSize(b.pot_size);
    setEditDate(b.planted_date);
    setEditPlatformId(b.platform_id);
    setEditPlatformSearch("");
    setEditStatus(b.status || "");
  }

  async function doUpdateBatch(batchId: string, oldQty: number) {
    const newQty = Number(editQty);
    if (!newQty || !editPlatformId || !plant) return;

    const currentBatch = batches.find((b) => b.id === batchId);
    const targetPlatform = platforms?.find((p) => p.id === editPlatformId);
    const targetForcedStatus = getSpecialPlatformStatus(targetPlatform);
    const targetStatus = targetForcedStatus ?? (editStatus || null);
    const targetPlantedDate = targetForcedStatus && currentBatch && editPlatformId !== currentBatch.platform_id
      ? currentDateString()
      : editDate;

    if (currentBatch) {
      const targetPrice = editPrice ? Number(editPrice) : null;

      const existingBatch = batches.find((b) =>
        b.id !== batchId &&
        b.plant_id === currentBatch.plant_id &&
        b.platform_id === editPlatformId &&
        b.pot_size === editPotSize &&
        b.planted_date === targetPlantedDate &&
        (b.price ?? null) === targetPrice &&
        (b.status ?? null) === targetStatus &&
        normalizeBatchColor(b.color) === normalizeBatchColor(currentBatch.color)
      );

      if (existingBatch) {
        // Merge: add current quantity to existing batch, then delete current
        try {
          const mergedQty = round2(existingBatch.quantity + newQty);
          const mergeRes = await fetch(`/api/plant-locations?id=${existingBatch.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...existingBatch, quantity: mergedQty, planted_date: targetPlantedDate }),
          });
          const delRes = await fetch(`/api/plant-locations?id=${batchId}`, { method: "DELETE" });
          if (mergeRes.ok) mutate.upsertLocation(await mergeRes.json());
          if (delRes.ok) mutate.removeLocation(batchId);

          if (newQty !== oldQty) {
            const newTotal = Math.max(0, round2(plant.total_quantity - oldQty + newQty));
            const plantRes = await fetch(`/api/plants?id=${plantId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...plant, total_quantity: newTotal }),
            });
            if (plantRes.ok) mutate.upsertPlant(await plantRes.json());
          }
        } catch {
          await refresh("plants", "locations");
          setToast({ text: "Lỗi kết nối", type: "error" });
          setEditingBatchId(null);
          return;
        }

        setEditingBatchId(null);
        setToast({ text: `Đã chuyển ${newQty} tấm sang sàn ${platformLabelFull(editPlatformId)} thành công! (Gộp vào đợt cũ)`, type: "success" });
        return;
      }
    }

    // No merge needed — standard update
    try {
      const updates = {
        quantity: newQty, pot_size: editPotSize, planted_date: targetPlantedDate, platform_id: editPlatformId,
        ...(editPrice ? { price: Number(editPrice) } : { price: undefined }),
        status: targetStatus,
      };
      const batch = locationsById.get(batchId)
      const locRes = await fetch(`/api/plant-locations?id=${batchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(batch ?? {}), ...updates, id: batchId }),
      });
      if (locRes.ok) mutate.upsertLocation(await locRes.json());
      if (newQty !== oldQty) {
        const newTotal = Math.max(0, round2(plant.total_quantity - oldQty + newQty));
        const plantRes = await fetch(`/api/plants?id=${plantId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...plant, total_quantity: newTotal }),
        });
        if (plantRes.ok) mutate.upsertPlant(await plantRes.json());
      }
    } catch {
      await refresh("plants", "locations");
      setToast({ text: "Lỗi kết nối", type: "error" });
    }
    setEditingBatchId(null);
  }

  async function doDeleteBatch(batchId: string, qty: number) {
    if (!plant) return;
    try {
      const delRes = await fetch(`/api/plant-locations?id=${batchId}`, { method: "DELETE" });
      if (delRes.ok) mutate.removeLocation(batchId);
      const newTotal = Math.max(0, round2(plant.total_quantity - qty));
      const res = await fetch(`/api/plants?id=${plantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...plant, total_quantity: newTotal }),
      });
      if (res.ok) mutate.upsertPlant(await res.json());
    } catch {
      await refresh("plants", "locations");
      setToast({ text: "Lỗi kết nối", type: "error" });
    }
  }

  async function doDeletePlant() {
    try {
      for (const b of batches) {
        const res = await fetch(`/api/plant-locations?id=${b.id}`, { method: "DELETE" });
        if (res.ok) mutate.removeLocation(b.id);
      }
      const res = await fetch(`/api/plants?id=${plantId}`, { method: "DELETE" });
      if (res.ok) mutate.removePlant(plantId);
    } catch {
      await refresh("plants", "locations");
      setToast({ text: "Lỗi kết nối", type: "error" });
      return;
    }
    onClose();
  }

  const usedSizes = locations.map((l) => l.pot_size);
  const mainImageSrc = selectedDetailImage?.src ?? plant.image_url;
  const mainImageAlt = selectedDetailImage?.alt ?? plant.name;
  const largeImageDetailIndex = largeImage?.imageId
    ? detailImages.findIndex(({ image }) => image.id === largeImage.imageId)
    : -1;
  const canNavigateLargeImage = !!largeImage && (
    detailImages.length > 1 || (detailImages.length === 1 && largeImageDetailIndex < 0)
  );

  return (
    <>
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
      <div
        className={`fixed inset-0 flex flex-col justify-end sheet-backdrop${isClosing ? " closing" : ""}`}
        style={{ zIndex }}
        onClick={() => { handleClose(); setEditingName(false); }}
      >
        <div
          className={`bg-white rounded-t-3xl shadow-2xl h-[85vh] flex flex-col sheet-panel${isClosing ? " closing" : ""}`}
          style={{ marginBottom: "64px" }}
          onClick={(e) => e.stopPropagation()}
          onAnimationEnd={handleSheetAnimEnd}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white rounded-t-3xl z-10 px-5 pt-3 pb-3 border-b border-gray-100">
            <div className="flex justify-center mb-2">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0 mr-2">
                {breadcrumb && breadcrumb.length > 0 && (
                  <div className="flex flex-col text-xs text-gray-400 mb-2">
                    {breadcrumb.map((label, i) => (
                      <div key={i} className="flex items-center gap-1 leading-snug" style={{ paddingLeft: `${i * 10}px` }}>
                        {i == 0 && "──"}
                        {i > 0 && "└─"}
                        <span className="truncate">{label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {editingName ? (
                  <form onSubmit={(e) => { e.preventDefault(); handleUpdateName(); }} className="flex items-center gap-2">
                    <Input
                      autoFocus
                      className="h-8 text-lg font-bold px-2 py-0 w-full"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                    <button type="submit" className="text-emerald-600 p-1 shrink-0"><Check className="w-5 h-5" /></button>
                    <button type="button" onClick={() => setEditingName(false)} className="text-gray-400 p-1 shrink-0"><X className="w-5 h-5" /></button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2 text-gray-900">
                    <h2 className="text-xl font-bold truncate">{plant.name}</h2>
                    <button
                      onClick={() => { setNewName(plant.name); setEditingName(true); }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              <button
                className="w-12 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0"
                onClick={() => { handleClose(); setEditingName(false); }}
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto px-5 pb-6 space-y-4 pt-4">

            {/* Image */}
            <div className="relative rounded-2xl overflow-hidden bg-gray-50 aspect-square w-full">
              <button
                type="button"
                className="absolute inset-0 block cursor-zoom-in"
                onClick={openDisplayedImageLarge}
                onTouchStart={handleImageSwipeStart}
                onTouchEnd={handleDisplayedImageSwipeEnd}
                aria-label="Xem ảnh lớn"
              >
                <PlantImage
                  src={mainImageSrc}
                  alt={mainImageAlt}
                  sizes="(max-width: 640px) calc(100vw - 40px), 472px"
                />
                <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow" aria-hidden="true">
                  <Maximize2 className="h-4 w-4" />
                </span>
              </button>
              {selectedDetailImage && (
                <button
                  type="button"
                  className="absolute left-3 top-3 h-9 rounded-full bg-white/90 px-3 text-xs font-semibold text-gray-700 shadow flex items-center gap-1.5"
                  onClick={() => setSelectedDetailImage(null)}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Hình chính
                </button>
              )}
              {selectedDetailImage && (
                <span className="absolute right-3 top-3 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow">
                  #{selectedDetailImage.imageNumber}
                </span>
              )}
            </div>

            {detailImages.length > 0 && (
              <div className="grid grid-cols-5 gap-2">
                {detailImages.map(({ imageNumber, image }, index) => (
                  <div
                    key={image.id}
                    className={`relative aspect-square overflow-hidden rounded-lg bg-gray-50 transition ${selectedDetailImage?.imageId === image.id ? "ring-2 ring-emerald-500 ring-offset-1" : "ring-1 ring-gray-100"}`}
                  >
                    <button
                      type="button"
                      className="absolute inset-0"
                      onClick={() => selectDetailImage(image, imageNumber)}
                      aria-label={`Xem ảnh ${imageNumber}`}
                    >
                      <PlantImage
                        src={image.image_url}
                        alt={`${plant.name} detail ${index + 1}`}
                        sizes="(max-width: 640px) calc((100vw - 56px) / 5), 88px"
                      />
                      <span className="absolute left-1 top-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow">
                        #{imageNumber}
                      </span>
                    </button>
                    {activeTab === "notes" && (
                      <>
                        <button
                          type="button"
                          className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-red-500 shadow"
                          onClick={() => openConfirm("Xoá hình này?", () => doDeletePlantImage(image.id))}
                          aria-label={`Xoá ảnh ${imageNumber}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        {plant.image_url === image.image_url ? (
                          <span
                            className="absolute bottom-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white shadow"
                            aria-label={`Ảnh ${imageNumber} đang là ảnh chính`}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="absolute bottom-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-amber-500 shadow"
                            onClick={() => openConfirm("Đặt hình này làm hình chính?", () => doSetMainImage(image))}
                            aria-label={`Đặt ảnh ${imageNumber} làm ảnh chính`}
                          >
                            <Star className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-gray-100 p-1">
              <button
                type="button"
                className={`h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${activeTab === "batches" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500"}`}
                onClick={() => setActiveTab("batches")}
              >
                <Package className="w-4 h-4" />
                Đợt trồng
              </button>
              <button
                type="button"
                className={`h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${activeTab === "notes" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500"}`}
                onClick={() => setActiveTab("notes")}
              >
                <FileText className="w-4 h-4" />
                Ghi chú
              </button>
            </div>

            {activeTab === "batches" ? (
              <>
            {/* Stats */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: "#ecfdf5" }}>
              <div className="grid grid-cols-2 divide-x divide-emerald-100">
                <div className="flex items-center gap-2 pr-3">
                  <Package className="w-4 h-4 shrink-0" style={{ color: "#059669" }} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium" style={{ color: "#065f46" }}>Tổng số lượng</p>
                    <p className="text-lg font-bold leading-tight" style={{ color: "#059669" }}>{plant.total_quantity}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-3">
                  <Package className="w-4 h-4 shrink-0" style={{ color: "#0d9488" }} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium" style={{ color: "#0f766e" }}>Đã bán</p>
                    <p className="text-lg font-bold leading-tight" style={{ color: "#0d9488" }}>{totalSold}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Batches */}
            <div>
              <h3 className="font-semibold text-gray-800 mb-2 text-sm">Các đợt trồng ({batches.length})</h3>
              <div className="space-y-2">
                {batches.map((b) => {
                  const batchColorRowClass = getBatchColorRowClass(b.color);
                  return (
                    <div
                      key={b.id}
                      className={`rounded-xl px-3 py-2.5 space-y-2 transition-all duration-500 ${batchColorRowClass} ${b.id === highlightBatchId
                        ? "border-2 border-green-200"
                        : "border border-transparent"
                        }`}
                    >
                      {editingBatchId === b.id ? (
                      <>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            className="w-1/4 h-9 border border-gray-200 rounded-lg px-2 text-sm bg-white outline-none"
                            placeholder="SL"
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                          />
                          <input
                            type="number"
                            className="w-1/4 h-9 border border-gray-200 rounded-lg px-2 text-sm bg-white outline-none"
                            placeholder="Giá"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                          />
                          <div className="w-1/4">
                            <PotSizeInput value={editPotSize} onChange={setEditPotSize} usedSizes={usedSizes} />
                          </div>
                          <input
                            type="date"
                            className="w-1/4 h-9 border border-gray-200 rounded-lg px-2 text-sm bg-white outline-none"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                          />
                        </div>
                        {/* Status select */}
                        <select
                          className="w-full h-9 border border-gray-200 rounded-lg px-2 text-sm bg-white outline-none text-gray-700"
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                        >
                          <option value="">— Trạng thái —</option>
                          {PLANT_LOCATION_STATUSES.map((status) => (
                            <option key={status.value} value={status.value}>
                              {status.icon} {status.label}
                            </option>
                          ))}
                        </select>
                        {/* Platform search */}
                        <div className="relative">
                          <div
                            className="flex items-center border border-gray-200 rounded-lg bg-white px-2 h-9 gap-1 cursor-text"
                            onClick={() => setShowEditPlatformDropdown(true)}
                          >
                            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <input
                              className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400 min-w-0"
                              placeholder={editPlatformId ? platformLabelFull(editPlatformId) : "— Sàn —"}
                              value={editPlatformSearch}
                              onChange={(e) => { setEditPlatformSearch(e.target.value); setShowEditPlatformDropdown(true); }}
                              onFocus={() => setShowEditPlatformDropdown(true)}
                              onBlur={() => setTimeout(() => setShowEditPlatformDropdown(false), 150)}
                            />
                            {editPlatformId && (
                              <button
                                type="button"
                                className="shrink-0 text-gray-400 hover:text-gray-600"
                                onMouseDown={(e) => { e.preventDefault(); setEditPlatformId(""); setEditPlatformSearch(""); }}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          {showEditPlatformDropdown && (
                            <ul className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl max-h-48 overflow-y-auto text-sm divide-y divide-gray-50">
                              {(platforms ?? [])
                                .filter((p) => {
                                  if (!editPlatformSearch.trim()) return true;
                                  const q = editPlatformSearch.toLowerCase();
                                  const free = p.capacity - ((locationsByPlatform.get(p.id) ?? []).reduce((s, l) => s + l.quantity, 0));
                                  const g = gardens?.find((g) => g.id === p.garden_id)?.name ?? "";
                                  return `${g} tầng ${p.floor} ${p.name} ${free}`.toLowerCase().includes(q);
                                })
                                .sort((a, b) => {
                                  const gA = gardens?.find((g) => g.id === a.garden_id)?.name ?? "";
                                  const gB = gardens?.find((g) => g.id === b.garden_id)?.name ?? "";
                                  if (gA !== gB) return gA.localeCompare(gB);
                                  if (a.floor !== b.floor) return a.floor - b.floor;
                                  return a.name.localeCompare(b.name, undefined, { numeric: true });
                                })
                                .map((p) => {
                                  const free = p.capacity - ((locationsByPlatform.get(p.id) ?? []).reduce((s, l) => s + l.quantity, 0));
                                  const g = gardens?.find((g) => g.id === p.garden_id)?.name;
                                  const label = `${g ? g + " | " : ""}Tầng ${p.floor} - ${p.name} (còn ${round2(free)})`;
                                  return (
                                    <li
                                      key={p.id}
                                      className={`px-3 py-2 cursor-pointer hover:bg-emerald-50 ${editPlatformId === p.id ? "bg-emerald-50 font-medium text-emerald-700" : "text-gray-800"}`}
                                      onMouseDown={() => { setEditPlatformId(p.id); setEditPlatformSearch(""); setShowEditPlatformDropdown(false); }}
                                    >
                                      {label}
                                    </li>
                                  );
                                })}
                            </ul>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="flex-1 h-9 rounded-lg text-sm font-semibold text-white"
                            style={{ backgroundColor: "#059669" }}
                            onClick={() => openConfirm(
                              `Cập nhật đợt này thành ${editQty} tấm, chậu ${editPotSize}?`,
                              () => doUpdateBatch(b.id, b.quantity)
                            )}
                          >
                            Lưu
                          </button>
                          <button
                            className="flex-1 h-9 rounded-lg text-sm border border-gray-200 text-gray-600"
                            onClick={() => setEditingBatchId(null)}
                          >
                            Huỷ
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="text-sm space-y-0.5 min-w-0 w-full">
                          <div className="flex items-center justify-between gap-1.5 text-gray-800 font-medium">
                            <div className="flex items-center gap-1.5" >
                              <Package className="w-3.5 h-3.5" style={{ color: "#059669" }} />
                              {b.quantity} tấm · chậu {b.pot_size}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <StatusBadge status={b.status} />
                              {b.price != null && (
                                <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-sm">
                                  <DollarSign className="w-3 h-3" />
                                  {b.price.toLocaleString("vi-VN")}₫
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="w-full flex items-center justify-between gap-1.5 text-xs text-gray-500">
                            <div className="flex items-center gap-1.5 cursor-pointer underline"
                              onClick={() => onShowPlatformDetail?.(b.platform_id, b.id, platformLabelFull(b.platform_id))}
                            >
                              <MapPin className="w-3 h-3" />
                              <span className="truncate">{platformLabelFull(b.platform_id)}</span>
                            </div>
                            {b.planted_date && (<div className="flex items-center gap-1.5">
                              <Calendar className="w-3 h-3" />
                              {fmtDate(b.planted_date)}
                            </div>)
                            }
                          </div>
                        </div>
                        <div className="flex items-center">
                          <button
                            className="ml-2 w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ backgroundColor: "#fff7ed" }}
                            onClick={() => startEditBatch(b)}
                          >
                            <Pencil className="w-4 h-4" style={{ color: "#f97316" }} />
                          </button>
                          <button
                            className="ml-2 w-8 h-8 rounded-lg flex items-center justify-center text-red-500 shrink-0"
                            style={{ backgroundColor: "#fef2f2" }}
                            onClick={() => openConfirm(
                              `Xoá đợt ${b.quantity} tấm tại ${platformLabelShort(b.platform_id)}?`,
                              () => doDeleteBatch(b.id, b.quantity)
                            )}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-gray-100 bg-white p-3 space-y-2">
                  <textarea
                    rows={2}
                    className="w-full h-16 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 resize-none"
                    placeholder={`Ghi chú #${draftNoteNumber}`}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                  />

                  {plantImageFiles.length > 0 && (
                    <div className="grid grid-cols-5 gap-2">
                      {plantImageFiles.map((item, index) => (
                        <div key={`${item.previewUrl}-${index}`} className="relative aspect-square overflow-hidden rounded-md bg-gray-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                          <span className="absolute left-1 top-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow">
                            #{detailImages.length + index + 1}
                          </span>
                          <button
                            type="button"
                            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-gray-600 shadow"
                            onClick={() => removePlantImageFile(index)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={isSavingNote || !noteText.trim()}
                      onClick={() => openConfirm("Lưu ghi chú này?", handleSaveNote)}
                    >
                      <Check className="h-4 w-4" />
                      {isSavingNote ? "Đang lưu" : "Lưu note"}
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className={isSavingImages || !canSelectPlantImages ? "pointer-events-none opacity-50" : ""}
                    >
                      <label>
                        <Images className="h-4 w-4" />
                        Ảnh
                        <input
                          className="sr-only"
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleSelectPlantImageFiles}
                          disabled={isSavingImages || !canSelectPlantImages}
                        />
                      </label>
                    </Button>
                    <Button
                      size="sm"
                      variant={plantImageFiles.length === 0 ? "outline" : "default"}
                      disabled={isSavingImages || plantImageFiles.length === 0}
                      onClick={() => openConfirm("Lưu hình đã chọn?", handleSavePlantImages)}
                    >
                      <Upload className="h-4 w-4" />
                      {isSavingImages ? "Lưu..." : `${plantImageFiles.length || 0}/${remainingImageSlots}`}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold text-gray-800 text-sm">Ghi chú ({plantNotes.length})</h3>
                  {plantNotes.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-400">
                      Chưa có ghi chú
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white divide-y divide-gray-100">
                      {plantNotes.map((note, noteIndex) => (
                        <div key={note.id} className="p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-emerald-700">
                                #{noteIndex + 1}
                              </span>
                              <span className="text-xs font-medium text-gray-400">
                                {fmtDate(note.created_at.slice(0, 10))}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-orange-500 hover:bg-orange-50"
                                onClick={() => startEditNote(note)}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
                                onClick={() => openConfirm("Xoá ghi chú này?", () => doDeleteNote(note.id))}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {editingNoteId === note.id ? (
                            <div className="space-y-2">
                              <textarea
                                rows={2}
                                className="w-full h-16 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 resize-none"
                                value={editNoteText}
                                onChange={(e) => setEditNoteText(e.target.value)}
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="flex-1"
                                  disabled={isSavingNote || !editNoteText.trim()}
                                  onClick={() => openConfirm("Cập nhật ghi chú này?", () => handleUpdateNote(note.id))}
                                >
                                  <Check className="h-4 w-4" />
                                  Lưu
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1"
                                  disabled={isSavingNote}
                                  onClick={() => { setEditingNoteId(null); setEditNoteText(""); }}
                                >
                                  Huỷ
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap break-words text-sm leading-5 text-gray-700">
                              {note.content || "Ghi chú trống"}
                            </p>
                          )}

                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Delete plant */}
            <button
              className="w-full h-11 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{ backgroundColor: "#dc2626" }}
              onClick={() => openConfirm(
                `Xoá toàn bộ cây "${plant.name}" và tất cả ${batches.length} đợt trồng?`,
                doDeletePlant
              )}
            >
              <Trash2 className="w-4 h-4" />
              Xoá toàn bộ cây
            </button>
          </div>
        </div>
      </div>
      {largeImage && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/85 px-4 py-6"
          style={{ zIndex: zIndex + 160 }}
          role="dialog"
          aria-modal="true"
          onClick={() => setLargeImage(null)}
        >
          <div
            className="relative h-full w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleImageSwipeStart}
            onTouchEnd={handleLargeImageSwipeEnd}
          >
            <button
              type="button"
              className="absolute right-0 top-0 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow"
              onClick={() => setLargeImage(null)}
              aria-label="Đóng ảnh lớn"
            >
              <X className="h-5 w-5" />
            </button>
            {canNavigateLargeImage && (
              <>
                <button
                  type="button"
                  className="absolute left-0 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow"
                  onClick={() => showAdjacentDetailImage(largeImage.imageId, -1, true)}
                  aria-label="Ảnh trước"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  className="absolute right-0 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow"
                  onClick={() => showAdjacentDetailImage(largeImage.imageId, 1, true)}
                  aria-label="Ảnh sau"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
            {largeImageDetailIndex >= 0 && (
              <span className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-gray-700 shadow">
                {largeImageDetailIndex + 1}/{detailImages.length}
              </span>
            )}
            <div className="relative h-full w-full overflow-hidden rounded-2xl">
              <PlantImage
                src={largeImage.src}
                alt={largeImage.alt}
                sizes="100vw"
                className="object-contain"
              />
            </div>
          </div>
        </div>
      )}
      {confirmModal}
    </>
  );
}
