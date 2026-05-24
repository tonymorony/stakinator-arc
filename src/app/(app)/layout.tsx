import type { Metadata } from "next";
import { LogoBar } from "@/components/LogoBar";
import { PageTransition } from "@/components/PageTransition";

export const metadata: Metadata = {
  title: "Stakinator",
};

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <LogoBar />
      <PageTransition>{children}</PageTransition>
    </>
  );
}
