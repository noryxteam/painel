export function isSecureMediaContext() {
  return typeof window !== "undefined" && window.isSecureContext;
}

export function isInAppBrowser() {
  if (typeof navigator === "undefined") return false;
  return /WhatsApp|FBAN|FBAV|Instagram|Line\/|Twitter/i.test(navigator.userAgent);
}

export function httpsAppUrl() {
  if (typeof window === "undefined") return "";
  const { hostname, pathname, search, hash, protocol } = window.location;
  if (protocol === "https:") return window.location.href;
  const configured = process.env.NEXT_PUBLIC_HTTPS_PORT ?? "3443";
  const port = configured === "443" ? "" : `:${configured}`;
  return `https://${hostname}${port}${pathname}${search}${hash}`;
}

export async function captureMicrophone(inputDeviceId?: string) {
  const media = navigator.mediaDevices;
  if (!media?.getUserMedia) {
    const error = new Error(
      isSecureMediaContext() ? "MEDIA_UNSUPPORTED" : "INSECURE_CONTEXT",
    );
    throw error;
  }

  const attempts: MediaStreamConstraints[] = [];
  if (inputDeviceId) {
    attempts.push({
      audio: {
        deviceId: { ideal: inputDeviceId },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  }
  attempts.push({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
  attempts.push({ audio: true, video: false });

  let last: unknown;
  for (const constraints of attempts) {
    try {
      return await media.getUserMedia(constraints);
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("MIC_DENIED");
}

export function describeMicError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";

  if (isInAppBrowser()) {
    return "O WhatsApp bloqueia o microfone. Toque abaixo para abrir no Safari.";
  }
  if (message === "INSECURE_CONTEXT" || !isSecureMediaContext()) {
    return "O celular só libera o microfone em conexão segura. Toque abaixo para abrir.";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Toque em Permitir quando o celular pedir o microfone.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Nenhum microfone encontrado neste aparelho.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "O microfone está em uso por outro app. Feche o app e tente de novo.";
  }
  return "Toque abaixo e permita o microfone para falar na call.";
}
