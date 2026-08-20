export function shouldUpgradeToHttps() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return false;
  return window.location.protocol === "http:";
}

export function canUseLiveMedia() {
  return Boolean(
    typeof navigator !== "undefined" &&
      window.isSecureContext &&
      navigator.mediaDevices?.getUserMedia,
  );
}

export function upgradeToHttps(reason: "mic" | "share" = "mic") {
  if (typeof window === "undefined") return false;
  if (window.location.protocol === "https:") return false;
  const url = new URL(window.location.href);
  url.protocol = "https:";
  url.searchParams.set(reason, "1");
  window.location.replace(url.toString());
  return true;
}

export async function captureMicrophone(inputDeviceId?: string) {
  const media = navigator.mediaDevices;
  if (!window.isSecureContext || !media?.getUserMedia) {
    throw new Error("INSECURE_CONTEXT");
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

export async function captureDisplay() {
  const media = navigator.mediaDevices;
  if (!window.isSecureContext || !media?.getDisplayMedia) {
    throw new Error("DISPLAY_UNSUPPORTED");
  }
  try {
    return await media.getDisplayMedia({
      video: true,
      audio: false,
    });
  } catch (first) {
    if (first instanceof Error && first.name === "NotAllowedError") throw first;
    return media.getDisplayMedia({
      video: {
        frameRate: { ideal: 30, max: 60 },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
  }
}

export function describeMicError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Toque em Permitir na janela do celular.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Nenhum microfone encontrado neste aparelho.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "O microfone está em uso por outro app. Feche o app e toque de novo.";
  }
  return "Toque em Permitir microfone para o celular pedir o acesso.";
}

export function describeShareError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  if (message === "DISPLAY_UNSUPPORTED") {
    return "Este celular não transmite tela. Transmita pelo computador.";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Toque em Permitir na janela do celular.";
  }
  return "Toque em transmitir tela para o celular pedir o acesso.";
}
