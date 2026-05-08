import { useSyncExternalStore } from "react";

export interface SellCartItem {
  locId: string;
  qty: number;
}

let cart: SellCartItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const sellCartStore = {
  get(): SellCartItem[] {
    return cart;
  },
  add(item: SellCartItem) {
    const idx = cart.findIndex((c) => c.locId === item.locId);
    if (idx >= 0) {
      cart = cart.map((c, i) => (i === idx ? { ...c, qty: c.qty + item.qty } : c));
    } else {
      cart = [...cart, item];
    }
    emit();
  },
  removeAt(idx: number) {
    cart = cart.filter((_, i) => i !== idx);
    emit();
  },
  clear() {
    cart = [];
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useSellCart(): SellCartItem[] {
  return useSyncExternalStore(
    sellCartStore.subscribe,
    sellCartStore.get,
    sellCartStore.get
  );
}
