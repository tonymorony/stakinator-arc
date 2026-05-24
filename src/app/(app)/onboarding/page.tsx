import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Dialogue } from "@/components/inquisitor/Dialogue";
import { getAppContext, shouldSkipOnboarding } from "@/lib/app/context";

export const metadata: Metadata = {
  title: "Let's get to know you",
};

export default async function OnboardingPage() {
  const ctx = await getAppContext();
  if (shouldSkipOnboarding(ctx)) {
    redirect(ctx.defaultRoute === "/onboarding" ? "/strategy" : ctx.defaultRoute);
  }

  return <Dialogue />;
}
