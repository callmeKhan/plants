"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "🏠", title: "Home" },
  { href: "/plants", label: "🌱", title: "Plants" },
  { href: "/platforms", label: "📦", title: "Platforms" },
  { href: "/placement", label: "📍", title: "Placement" },
  { href: "/search", label: "🔍", title: "Search" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around py-2 z-50">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center text-xs gap-0.5 px-3 py-1 rounded ${
              active
                ? "text-green-700 font-bold"
                : "text-gray-500"
            }`}
          >
            <span className="text-xl">{tab.label}</span>
            <span>{tab.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
