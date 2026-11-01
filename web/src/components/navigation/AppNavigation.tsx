"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const destinations = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tasks", label: "Tasks" },
  { href: "/history", label: "History" },
  { href: "/redeem", label: "Redeem" },
  { href: "/profile", label: "Profile" },
];

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation">
      <ul className="navigation-list">
        {destinations.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined}>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
