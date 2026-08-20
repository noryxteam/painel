export function isSecureMediaContext() {
  return typeof window !== "undefined" && window.isSecureContext;
}

export function isInAppBrowser() {
  if (typeof navigator === "undefined") return false;
  return /WhatsApp|FBAN|FBAV|Instagram|Line\/|Twitter/i.test(navigator.userAgent);
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
    return "Abra o painel no Chrome. O WhatsApp bloqueia o microfone.";
  }
  if (message === "INSECURE_CONTEXT" || !isSecureMediaContext()) {
    return "No celular o microfone só funciona em HTTPS. Abra no Chrome, não no WhatsApp.";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Toque em Permitir quando o celular pedir o microfone.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Nenhum microfone encontrado neste aparelho.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "O microfone está em uso por outro app. Feche o app e toque no mic de novo.";
  }
  return "Toque no microfone e permita o acesso para falar na call.";
}
