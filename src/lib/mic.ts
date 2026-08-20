import { rememberMediaGranted } from "@/lib/device";

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
      const stream = await media.getUserMedia(constraints);
      rememberMediaGranted({ mic: true });
      return stream;
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("MIC_DENIED");
}

export async function captureDisplay() {
  if (!window.isSecureContext) {
    throw new Error("INSECURE_CONTEXT");
  }
  const media = navigator.mediaDevices;
  if (!media) {
    const error = new Error("MediaDevices unavailable");
    error.name = "NotSupportedError";
    throw error;
  }
  const stream = await media.getDisplayMedia({
    video: true,
    audio: false,
  });
  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack) {
    try {
      videoTrack.contentHint = "detail";
    } catch {
      // Alguns navegadores não expõem contentHint.
    }
  }
  rememberMediaGranted({ share: true });
  return stream;
}

export function watchDisplayCaptureEnd(stream: MediaStream, onEnd: () => void) {
  let finished = false;
  const finish = () => {
    if (finished) return;
    const live = stream.getVideoTracks().some((track) => track.readyState === "live");
    if (live) return;
    finished = true;
    onEnd();
  };

  const tracks = stream.getVideoTracks();
  for (const track of tracks) {
    track.onended = finish;
    track.addEventListener("ended", finish);
  }
  stream.addEventListener("inactive", finish);

  return () => {
    finished = true;
    for (const track of tracks) {
      track.removeEventListener("ended", finish);
      if (track.onended === finish) track.onended = null;
    }
    stream.removeEventListener("inactive", finish);
  };
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
  if (message === "INSECURE_CONTEXT") {
    return "Toque em Transmitir tela para o navegador pedir a captura em HTTPS.";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Toque em Permitir na janela do navegador para transmitir a tela.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Nenhuma tela foi encontrada para capturar.";
  }
  if (name === "AbortError") {
    return "A captura de tela foi cancelada. Toque de novo em Transmitir tela.";
  }
  if (name === "NotSupportedError" || name === "TypeError") {
    return "O navegador não iniciou a captura de tela nesta tentativa. Toque de novo em Transmitir tela.";
  }
  if (name === "InvalidStateError") {
    return "Toque de novo em Transmitir tela para o navegador pedir a captura.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "A captura começou, mas a tela não pôde ser lida. Pare e toque de novo em Transmitir tela.";
  }
  return "Toque em Transmitir tela para o navegador pedir a captura.";
}
