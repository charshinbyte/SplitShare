"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Groups" },
  { href: "/users", label: "Users" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-2 border-b border-white/10 bg-black/20 p-4">
      {links.map((link) => {
        const isActive =
          link.href === "/"
            ? pathname === "/" || pathname.startsWith("/groups")
            : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded px-3 py-2 text-white hover:bg-white/10 ${
              isActive ? "bg-white/10" : ""
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
