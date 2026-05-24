import { redirect } from "next/navigation";
import { LogoBar } from "@/components/LogoBar";
import { HomeClient } from "@/components/HomeClient";
import { getAppContext } from "@/lib/app/context";

export default async function Home() {
  const ctx = await getAppContext();
  if (ctx.defaultRoute !== "/") {
    redirect(ctx.defaultRoute);
  }

  return (
    <>
      <LogoBar />
      <HomeClient />
    </>
  );
}
