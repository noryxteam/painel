import { prisma } from "@/lib/prisma";

const GUEST_NAME = "teste";

export function normalizeDeviceId(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

export async function ensureGuestUser(deviceId: string) {
  const safeId = normalizeDeviceId(deviceId) || crypto.randomUUID().replaceAll("-", "");
  const id = `guest-${safeId}`;
  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true },
  });
  if (existing) {
    return existing;
  }

  const org =
    (await prisma.organization.findFirst({ select: { id: true } })) ??
    (await prisma.analysisRoom.findFirst({ select: { organizationId: true } }));
  const organizationId =
    org && "organizationId" in org ? org.organizationId : org?.id;
  if (!organizationId) {
    throw new Error("Organização não encontrada");
  }

  try {
    return await prisma.user.create({
      data: {
        id,
        name: GUEST_NAME,
        role: "PLAYER",
        organizationId,
      },
      select: { id: true, name: true, role: true },
    });
  } catch {
    const raced = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, role: true },
    });
    if (raced) return raced;
    throw new Error("Não foi possível identificar este dispositivo");
  }
}
