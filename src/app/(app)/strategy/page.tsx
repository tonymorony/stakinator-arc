import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StrategyView } from "@/components/strategy/StrategyView";
import { getAppContext, shouldSkipStrategy } from "@/lib/app/context";

export const metadata: Metadata = {
  title: "Your plan",
};

export default async function StrategyPage() {
  const ctx = await getAppContext();
  if (shouldSkipStrategy(ctx)) {
    redirect("/dashboard");
  }

  return <StrategyView initialAuthed={ctx.authenticated} />;
}
