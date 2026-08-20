import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoryxShell } from "@/components/noryx/NoryxShell";
import { NORYX_GATE } from "@/lib/noryx";

export const metadata: Metadata = {
  title: "NORYX",
  description: "Painel administrativo",
};

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ noryxGate: NORYX_GATE }];
}

export default async function NoryxLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ noryxGate: string }>;
}) {
  const { noryxGate } = await params;
  if (noryxGate !== NORYX_GATE) notFound();

  return <NoryxShell>{children}</NoryxShell>;
}
