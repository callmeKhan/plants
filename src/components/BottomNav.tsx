"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", icon: "home", title: "Nhà" },
  { href: "/plants", icon: "spa", title: "Hoa" },
  { href: "/platforms", icon: "dataset", title: "Vườn" },
];

const importsTabs = [
  { href: "/", icon: "home", title: "Nhà" },
  { href: "/imports", icon: "inventory_2", title: "Nhập" },
];

const salesTabs = [
  { href: "/", icon: "home", title: "Nhà" },
  { href: "/sales", icon: "point_of_sale", title: "Bán hàng" },
  { href: "/customers", icon: "groups", title: "Khách" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const visibleTabs = pathname === "/imports" || pathname.startsWith("/imports/")
    ? importsTabs
    : pathname === "/sales" || pathname.startsWith("/sales/") || pathname === "/customers" || pathname.startsWith("/customers/")
      ? salesTabs
      : tabs;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around py-2 z-[100]">
      {visibleTabs.map((tab) => {
        const active =
          pathname === tab.href ||
          (tab.href !== "/" && pathname.startsWith(`${tab.href}/`));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex w-20 shrink-0 flex-col items-center gap-0.5 rounded px-2 py-1 text-xs ${
              active
                ? "text-green-700"
                : "text-gray-500"
            }`}
          >
            <span className="material-symbols-outlined text-2xl">{tab.icon}</span>
            <span className={active ? "font-bold" : "font-normal"}>{tab.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
