"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SlotMachineIcon } from "./SlotMachineIcon";

const destinations = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tasks", label: "Tasks" },
  { href: "/create", label: "Create" },
  { href: "/tasks/runTracker", label: "Track Activity" },
  { href: "/tasks/studbot", label: "StudBot" },
  { href: "/history", label: "History" },
  { href: "/redeem", label: "Redeem" },
  { href: "/profile", label: "Profile" },
];

export function AppNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open]);

  function closeMenu() {
    if (open) {
      setOpen(false);
      menuButton.current?.focus();
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Link href="/sign-up" className="brand" aria-label="Sign up for Slotty" onClick={closeMenu}><SlotMachineIcon /></Link>
        <button
          ref={menuButton}
          className="menu-toggle"
          type="button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="app-navigation"
          onClick={() => setOpen(!open)}
        >
          <span className="menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>
      <nav id="app-navigation" aria-label="Main navigation" data-open={open}>
        <ul className="navigation-list">
          {destinations.map(({ href, label }) => {
            const active = href === "/tasks"
              ? pathname === "/tasks"
              : pathname === href || pathname.startsWith(`${href}/`);

            return (
              <li key={href}>
                <Link href={href} data-destination={label.toLowerCase()} aria-current={active ? "page" : undefined} onClick={closeMenu}>
                  {label === "Create" && <svg className="navigation-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M12 8v8M8 12h8" /></svg>}
                  {label === "Track Activity" && <svg className="navigation-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><circle cx="17" cy="5" r="2"/><circle cx="7" cy="19" r="2"/><path d="M15 5H8a4 4 0 0 0 0 8h8a3 3 0 0 1 0 6H9"/></svg>}
                  {label === "Profile" && <svg className="navigation-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>}
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
