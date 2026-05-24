"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountWidget } from "@/components/auth/AccountWidget";

export function LogoBar() {
  const pathname = usePathname();
  const hasSidebar = pathname === "/onboarding";
  const [logoHref, setLogoHref] = useState("/");

  useEffect(() => {
    fetch("/api/auth/bootstrap", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { defaultRoute?: string }) => {
        if (d.defaultRoute && d.defaultRoute !== "/") {
          setLogoHref(d.defaultRoute);
        }
      })
      .catch(() => {});
  }, [pathname]);

  return (
    <header className="sticky top-0 z-20 border-b border-border/50 bg-bg-base/90 backdrop-blur-md">
      <div
        className={`mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6 ${
          hasSidebar ? "lg:pr-64 xl:pr-72" : ""
        }`}
      >
        <Link
          href={logoHref}
          aria-label="Stakinator home"
          className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-90"
        >
          <Image
            src="/logo.png"
            alt="Stakinator"
            width={180}
            height={40}
            priority
            className="h-7 w-auto"
          />
        </Link>
        <AccountWidget />
      </div>
    </header>
  );
}
