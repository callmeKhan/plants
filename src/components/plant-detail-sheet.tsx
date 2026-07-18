"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useData, type PlantNoteImage } from "@/lib/data";
import { round2 } from "@/lib/number";
import { currentDateString } from "@/lib/time";
import {
  BATCH_COLORS,
  BATCH_COLOR_META,
  getBatchColorRowClass,
  normalizeBatchColor,
  type BatchColor,
} from "@/lib/batch-color";
import { getSpecialPlatformStatus } from "@/lib/special-platform-status";
import { PLANT_LOCATION_STATUSES, getPlantLocationStatusMeta } from "@/lib/plant-location-status";
import { getPlantMaxImages, plantMaxImagesMessage, plantRemainingImagesMessage } from "@/lib/plant-notes-config";
import { compressPlantPhoto } from "@/lib/image-compression";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppDatePicker } from "@/components/ui/app-date-picker";
import { Select } from "@/components/ui/select";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { PlantImage } from "@/components/plant-image";
import { PotSizeInput } from "@/components/pot-size-input";
import { Toast } from "@/components/ui/toast";
import { formatPotSize } from "@/lib/pot-size";

import {
  X, Pencil, Check, Package, MapPin, Calendar, Trash2, Search,
  DollarSign, FileText, Images, Maximize2, RotateCcw, Upload, ChevronLeft, ChevronRight, Star, Plus,
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

  // Tags
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [isSavingTags, setIsSavingTags] = useState(false);

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

  // Edit batch
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [closingEditBatch, setClosingEditBatch] = useState(false);
  const [editOriginalQty, setEditOriginalQty] = useState(0);
  const [editSheetTitle, setEditSheetTitle] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editPotSize, setEditPotSize] = useState<number>(14);
  const [editDate, setEditDate] = useState("");
  const [editPlatformId, setEditPlatformId] = useState("");
  const [editPlatformSearch, setEditPlatformSearch] = useState("");
  const [showEditPlatformDropdown, setShowEditPlatformDropdown] = useState(false);
  const [editStatus, setEditStatus] = useState("");
  const [editColor, setEditColor] = useState<BatchColor>("white");

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
  const allPlantTags = useMemo(() => {
    const all = new Set<string>();
    plants.forEach((p) => (p.tags ?? []).forEach((tag) => all.add(tag)));
    return [...all].sort((a, b) => a.localeCompare(b, "vi"));
  }, [plants]);
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

  async function saveTags(nextTags: string[]) {
    if (!plant) return;
    setIsSavingTags(true);
    try {
      const res = await fetch(`/api/plants?id=${plantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...plant, tags: nextTags }),
      });
      if (!res.ok) throw new Error("Cannot update tags");
      mutate.upsertPlant(await res.json());
    } catch {
      setToast({ text: "Lỗi cập nhật đặc điểm cây", type: "error" });
      await refresh("plants");
    } finally {
      setIsSavingTags(false);
    }
  }

  function addTag(raw: string) {
    const tag = raw.trim();
    setTagInput("");
    if (!tag) return;
    const tags = plant?.tags ?? [];
    if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    saveTags([...tags, tag]);
  }

  function removeTag(tag: string) {
    saveTags((plant?.tags ?? []).filter((t) => t !== tag));
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
    if (selectedDetailImage) {
      setLargeImage(selectedDetailImage);
      return;
    }

    setLargeImage({ src: plant?.image_url, alt: plant?.name ?? "Plant" });
  }

  function selectDetailImage(image: PlantNoteImage, imageNumber: number) {
    setSelectedDetailImage(getDetailImageView(image, imageNumber, plant?.name ?? "Plant"));
  }

  function startEditBatch(b: { id: string; quantity: number; pot_size: number; planted_date: string; platform_id: string; price?: number; status?: string; color?: unknown }) {
    setClosingEditBatch(false);
    setEditingBatchId(b.id);
    setEditOriginalQty(b.quantity);
    setEditSheetTitle(`${b.quantity} tấm · ${formatPotSize(b.pot_size)}\n${platformLabelFull(b.platform_id)}`);
    setEditQty(String(b.quantity));
    setEditPrice(b.price != null ? String(b.price) : "");
    setEditPotSize(b.pot_size);
    setEditDate(b.planted_date);
    setEditPlatformId(b.platform_id);
    setEditPlatformSearch("");
    setEditStatus(b.status || "");
    setEditColor(normalizeBatchColor(b.color));
  }

  function requestCloseEditBatch() {
    setShowEditPlatformDropdown(false);
    setClosingEditBatch(true);
  }

  function finishCloseEditBatch() {
    setClosingEditBatch(false);
    setEditingBatchId(null);
    setEditPlatformSearch("");
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
        normalizeBatchColor(b.color) === editColor
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
          requestCloseEditBatch();
          return;
        }

        setToast({ text: `Đã chuyển ${newQty} tấm sang sàn ${platformLabelFull(editPlatformId)} thành công! (Gộp vào đợt cũ)`, type: "success" });
        requestCloseEditBatch();
        return;
      }
    }

    // No merge needed — standard update
    try {
      const updates = {
        quantity: newQty, pot_size: editPotSize, planted_date: targetPlantedDate, platform_id: editPlatformId,
        ...(editPrice ? { price: Number(editPrice) } : { price: undefined }),
        status: targetStatus,
        color: editColor,
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
    requestCloseEditBatch();
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
  const plantTags = plant.tags ?? [];
  const tagSuggestions = allPlantTags.filter((tag) =>
    !plantTags.some((t) => t.toLowerCase() === tag.toLowerCase()) &&
    tag.toLowerCase().includes(tagInput.trim().toLowerCase())
  );
  const mainImageSrc = selectedDetailImage?.src ?? plant.image_url;
  const mainImageAlt = selectedDetailImage?.alt ?? plant.name;
  const largeImageDetailIndex = largeImage?.imageId
    ? detailImages.findIndex(({ image }) => image.id === largeImage.imageId)
    : -1;
  const canNavigateLargeImage = !!largeImage && (
    detailImages.length > 1 || (detailImages.length === 1 && largeImageDetailIndex < 0)
  );
  const editPlatformOptions = (platforms ?? [])
    .filter((platform) => {
      if (!editPlatformSearch.trim()) return true;
      const query = editPlatformSearch.toLowerCase();
      const free = platform.capacity - ((locationsByPlatform.get(platform.id) ?? []).reduce((sum, location) => sum + location.quantity, 0));
      const gardenName = gardens?.find((garden) => garden.id === platform.garden_id)?.name ?? "";
      return `${gardenName} tầng ${platform.floor} ${platform.name} ${free}`.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      const gardenA = gardens?.find((garden) => garden.id === a.garden_id)?.name ?? "";
      const gardenB = gardens?.find((garden) => garden.id === b.garden_id)?.name ?? "";
      if (gardenA !== gardenB) return gardenA.localeCompare(gardenB);
      if (a.floor !== b.floor) return a.floor - b.floor;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });

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

            {/* Image: main on the left, vertical thumbnail list on the right */}
            <div className="flex gap-2">
              <div className="relative rounded-2xl overflow-hidden bg-gray-50 aspect-square flex-1 min-w-0">
                <button
                  type="button"
                  className="absolute inset-0 block cursor-zoom-in"
                  onClick={openDisplayedImageLarge}
                  aria-label="Xem ảnh lớn"
                >
                  <PlantImage
                    src={mainImageSrc}
                    alt={mainImageAlt}
                    sizes={detailImages.length > 0
                      ? "(max-width: 640px) calc(100vw - 128px), 384px"
                      : "(max-width: 640px) calc(100vw - 40px), 472px"}
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
                <div className="relative w-20 shrink-0">
                  <div className="absolute inset-0 flex flex-col gap-2 overflow-y-auto">
                    {detailImages.map(({ imageNumber, image }, index) => (
                      <div
                        key={image.id}
                        className={`relative aspect-square w-full shrink-0 overflow-hidden rounded-lg bg-gray-50 transition ${selectedDetailImage?.imageId === image.id ? "ring-2 ring-emerald-500 ring-offset-1" : "ring-1 ring-gray-100"}`}
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
                            sizes="80px"
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
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="flex flex-wrap items-center gap-1.5">
              {plantTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                >
                  {tag}
                  <button
                    type="button"
                    className="text-emerald-400 hover:text-emerald-700"
                    onClick={() => openConfirm(`Xoá đặc điểm "${tag}"?`, () => removeTag(tag))}
                    aria-label={`Xoá đặc điểm ${tag}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {showTagInput ? (
                <div className="relative">
                  <input
                    autoFocus
                    enterKeyHint="done"
                    className="h-7 w-40 rounded-full border border-emerald-200 bg-white pl-2.5 pr-8 text-xs outline-none focus:border-emerald-400"
                    placeholder="Đặc điểm mới"
                    value={tagInput}
                    disabled={isSavingTags}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); }
                      if (e.key === "Escape") { setShowTagInput(false); setTagInput(""); }
                    }}
                    onBlur={() => setTimeout(() => { setShowTagInput(false); setTagInput(""); }, 150)}
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-600 text-white disabled:opacity-40"
                    disabled={isSavingTags || !tagInput.trim()}
                    onMouseDown={(e) => { e.preventDefault(); addTag(tagInput); }}
                    aria-label="Thêm đặc điểm"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  {tagSuggestions.length > 0 && (
                    <ul className="absolute z-30 left-0 top-full mt-1 w-44 bg-white border border-gray-100 rounded-xl text-xs divide-y divide-gray-50 max-h-40 overflow-y-auto shadow">
                      {tagSuggestions.map((tag) => (
                        <li
                          key={tag}
                          className="px-3 py-1.5 cursor-pointer hover:bg-emerald-50 text-gray-800"
                          onMouseDown={() => addTag(tag)}
                        >
                          {tag}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-500 hover:border-emerald-300 hover:text-emerald-600"
                  disabled={isSavingTags}
                  onClick={() => setShowTagInput(true)}
                >
                  <Plus className="h-3 w-3" />
                  Đặc điểm
                </button>
              )}
            </div>

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
                      <div className="flex items-center justify-between">
                        <div className="text-sm space-y-0.5 min-w-0 w-full">
                          <div className="flex items-center justify-between gap-1.5 text-gray-800 font-medium">
                            <div className="flex items-center gap-1.5" >
                              <Package className="w-3.5 h-3.5" style={{ color: "#059669" }} />
                              {b.quantity} tấm · {formatPotSize(b.pot_size)}
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

      <BottomSheet
        open={editingBatchId !== null}
        closing={closingEditBatch}
        title={editSheetTitle}
        description={plant.name}
        icon={<Pencil className="h-5 w-5" />}
        onCloseRequest={requestCloseEditBatch}
        onClosed={finishCloseEditBatch}
        closeLabel="Đóng form sửa đợt trồng"
        zIndex={zIndex + 5}
        height="78vh"
        wrapTitle
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!editingBatchId) return;
            openConfirm(
              `Cập nhật đợt này thành ${editQty} tấm, ${formatPotSize(editPotSize)}?`,
              () => doUpdateBatch(editingBatchId, editOriginalQty),
            );
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Số lượng
              </label>
              <Input
                className="h-10"
                type="number"
                min={0}
                step="any"
                placeholder="📦 Số lượng"
                value={editQty}
                onChange={(event) => setEditQty(event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Giá tiền
              </label>
              <Input
                className="h-10"
                type="number"
                min={0}
                placeholder="💰 Tuỳ chọn"
                value={editPrice}
                onChange={(event) => setEditPrice(event.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,3fr)_minmax(160px,2fr)] gap-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Loại & cỡ
              </label>
              <PotSizeInput value={editPotSize} onChange={setEditPotSize} usedSizes={usedSizes} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Ngày trồng
              </label>
              <AppDatePicker
                ariaLabel="Ngày trồng"
                height={36}
                value={editDate}
                onValueChange={setEditDate}
              />
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,2fr)_132px] gap-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Trạng thái
              </label>
              <Select
                className="h-10"
                value={editStatus}
                onChange={(event) => setEditStatus(event.target.value)}
              >
                <option value="">Không có</option>
                {PLANT_LOCATION_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.icon} {status.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Màu
              </label>
              <div className="flex h-10 items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-2">
                {BATCH_COLORS.map((color) => {
                  const colorMeta = BATCH_COLOR_META[color];
                  const selected = editColor === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      className={`h-7 w-7 rounded-full border shadow-sm transition-all ${selected ? "ring-2 ring-emerald-500 ring-offset-1" : ""}`}
                      style={{
                        backgroundColor: colorMeta.backgroundColor,
                        borderColor: colorMeta.borderColor,
                      }}
                      aria-label={`Màu ${colorMeta.label}`}
                      aria-pressed={selected}
                      title={colorMeta.label}
                      onClick={() => setEditColor(color)}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Sàn
            </label>
            <div className="relative">
              <div
                className="flex h-10 cursor-text items-center gap-2 rounded-xl border border-gray-200 bg-white px-3"
                onClick={() => setShowEditPlatformDropdown(true)}
              >
                <Search className="h-4 w-4 shrink-0 text-gray-400" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
                  placeholder={editPlatformId ? platformLabelFull(editPlatformId) : "Chọn sàn"}
                  value={editPlatformSearch}
                  onChange={(event) => {
                    setEditPlatformSearch(event.target.value);
                    setShowEditPlatformDropdown(true);
                  }}
                  onFocus={() => setShowEditPlatformDropdown(true)}
                  onBlur={() => setTimeout(() => setShowEditPlatformDropdown(false), 150)}
                />
                {editPlatformId && (
                  <button
                    type="button"
                    className="shrink-0 text-gray-400 hover:text-gray-600"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setEditPlatformId("");
                      setEditPlatformSearch("");
                    }}
                    aria-label="Bỏ chọn sàn"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {showEditPlatformDropdown && (
                <ul className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white text-sm shadow-lg divide-y divide-gray-50">
                  {editPlatformOptions.map((platform) => {
                    const free = platform.capacity - ((locationsByPlatform.get(platform.id) ?? []).reduce((sum, location) => sum + location.quantity, 0));
                    const gardenName = gardens?.find((garden) => garden.id === platform.garden_id)?.name;
                    const label = `${gardenName ? `${gardenName} | ` : ""}Tầng ${platform.floor} - ${platform.name} (còn ${round2(free)})`;
                    return (
                      <li
                        key={platform.id}
                        className={`cursor-pointer px-3 py-2 hover:bg-emerald-50 ${editPlatformId === platform.id ? "bg-emerald-50 font-medium text-emerald-700" : "text-gray-800"}`}
                        onMouseDown={() => {
                          setEditPlatformId(platform.id);
                          setEditPlatformSearch("");
                          setShowEditPlatformDropdown(false);
                        }}
                      >
                        {label}
                      </li>
                    );
                  })}
                  {editPlatformOptions.length === 0 && (
                    <li className="px-3 py-2 text-center text-gray-400">Không tìm thấy</li>
                  )}
                </ul>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="h-11 flex-1 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
              onClick={requestCloseEditBatch}
            >
              Huỷ
            </button>
            <button
              type="submit"
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:bg-emerald-300"
              disabled={!editQty || !editPlatformId}
            >
              <Check className="h-4 w-4" />
              Lưu
            </button>
          </div>
        </form>
      </BottomSheet>

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
