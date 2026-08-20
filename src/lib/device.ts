const DEVICE_KEY = "sap_device_id";
const MEDIA_KEY = "sap_media_granted";

export function getOrCreateDeviceId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const created =
    window.crypto?.randomUUID?.() ??
    `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(DEVICE_KEY, created);
  return created;
}

export function getMediaGranted() {
  if (typeof window === "undefined") return { mic: false, share: false };
  try {
    const raw = window.localStorage.getItem(MEDIA_KEY);
    if (!raw) return { mic: false, share: false };
    const parsed = JSON.parse(raw) as { mic?: boolean; share?: boolean };
    return { mic: Boolean(parsed.mic), share: Boolean(parsed.share) };
  } catch {
    return { mic: false, share: false };
  }
}

export function rememberMediaGranted(patch: { mic?: boolean; share?: boolean }) {
  if (typeof window === "undefined") return;
  const current = getMediaGranted();
  window.localStorage.setItem(
    MEDIA_KEY,
    JSON.stringify({
      mic: patch.mic ?? current.mic,
      share: patch.share ?? current.share,
    }),
  );
}

export async function syncBrowserMediaGrants() {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    if (status.state === "granted") rememberMediaGranted({ mic: true });
  } catch {
    // Safari pode não expor o status do microfone.
  }
}
