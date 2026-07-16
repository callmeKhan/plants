"use client";

import { useMemo, useState } from "react";
import {
  decodePotSize,
  encodePotSize,
  POT_UNIT_LABELS,
  type PotUnit,
} from "@/lib/pot-size";

interface PotSizeInputProps {
  value: number;
  onChange: (value: number) => void;
  usedSizes: number[];
}

export function PotSizeInput({ value, onChange, usedSizes }: PotSizeInputProps) {
  const decoded = decodePotSize(value);
  const [inputValue, setInputValue] = useState(String(decoded.size));
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useMemo(() => {
    const sizesForUnit = usedSizes
      .map(decodePotSize)
      .filter((item) => item.unit === decoded.unit)
      .map((item) => item.size);

    return [...new Set([...sizesForUnit, 14, 16, 21])]
      .filter((size) => String(size).startsWith(inputValue))
      .sort((a, b) => a - b)
      .slice(0, 6);
  }, [decoded.unit, inputValue, usedSizes]);

  function commit(rawValue: string, unit: PotUnit = decoded.unit) {
    const size = Number(rawValue);
    if (Number.isInteger(size) && size > 0) {
      onChange(encodePotSize(size, unit));
      setInputValue(String(size));
    }
    setShowSuggestions(false);
  }

  function handleUnitChange(unit: PotUnit) {
    const currentSize = Number(inputValue);
    const size = Number.isInteger(currentSize) && currentSize > 0 ? currentSize : decoded.size;
    onChange(encodePotSize(size, unit));
  }

  return (
    <div className="grid grid-cols-[minmax(92px,1fr)_minmax(72px,1fr)] gap-2">
      <select
        aria-label="Loại vật chứa"
        data-pot-unit-select="true"
        className="h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-gray-700 outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-500"
        value={decoded.unit}
        onChange={(event) => handleUnitChange(event.target.value as PotUnit)}
      >
        <option value="pot">{POT_UNIT_LABELS.pot}</option>
        <option value="basket">{POT_UNIT_LABELS.basket}</option>
      </select>

      <div className="relative">
        <input
          aria-label="Kích cỡ vật chứa"
          type="number"
          min={1}
          step={1}
          className="h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-center text-gray-800 outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-500"
          placeholder="Cỡ"
          value={inputValue}
          onChange={(event) => {
            setInputValue(event.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={(event) => {
            const nextTarget = event.relatedTarget as HTMLElement | null;
            if (nextTarget?.dataset.potUnitSelect === "true") return;
            setTimeout(() => commit(inputValue), 150);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(inputValue);
            }
          }}
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-40 overflow-y-auto rounded-xl border border-gray-100 bg-white text-sm shadow-lg divide-y divide-gray-50">
            {suggestions.map((size) => (
              <li
                key={size}
                className="cursor-pointer px-3 py-2 text-gray-800 hover:bg-emerald-50"
                onMouseDown={() => commit(String(size))}
              >
                {POT_UNIT_LABELS[decoded.unit]} {size}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
