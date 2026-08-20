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

type DisplayCaptureFn = (options?: DisplayMediaStreamOptions) => Promise<MediaStream>;

export function isIosWebkit() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function resolveDisplayCapture(): DisplayCaptureFn | null {
  const media = navigator.mediaDevices as
    | (MediaDevices & {
        webkitGetDisplayMedia?: DisplayCaptureFn;
      })
    | undefined;
  const nav = navigator as Navigator & {
    getDisplayMedia?: DisplayCaptureFn;
    webkitGetDisplayMedia?: DisplayCaptureFn;
  };
  const candidates: Array<DisplayCaptureFn | undefined> = [
    media?.getDisplayMedia?.bind(media),
    media?.webkitGetDisplayMedia?.bind(media),
    nav.getDisplayMedia?.bind(nav),
    nav.webkitGetDisplayMedia?.bind(nav),
  ];
  return candidates.find((fn) => typeof fn === "function") ?? null;
}

export function canCaptureDisplay() {
  return Boolean(window.isSecureContext && resolveDisplayCapture());
}

function displayCaptureOptions(): DisplayMediaStreamOptions[] {
  const base: DisplayMediaStreamOptions[] = [{ video: true, audio: false }];
  if (isIosWebkit()) {
    base.push(
      {
        video: true,
        audio: false,
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions,
      {
        video: { displaySurface: "browser" },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: "include",
      } as DisplayMediaStreamOptions,
    );
  }
  base.push({
    video: {
      frameRate: { ideal: 15, max: 30 },
    },
    audio: false,
  });
  return base;
}

export async function captureDisplay() {
  if (!window.isSecureContext) {
    throw new Error("INSECURE_CONTEXT");
  }

  const invoke = async (options: DisplayMediaStreamOptions) => {
    const resolved = resolveDisplayCapture();
    if (resolved) return resolved(options);
    const media = navigator.mediaDevices;
    if (!media) throw new Error("DISPLAY_UNSUPPORTED");
    return media.getDisplayMedia(options);
  };

  let last: unknown;
  for (const options of displayCaptureOptions()) {
    try {
      const stream = await invoke(options);
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          videoTrack.contentHint = "detail";
        } catch {
          // Safari antigo pode não expor contentHint.
        }
      }
      rememberMediaGranted({ share: true });
      return stream;
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "NotAllowedError" || name === "AbortError") throw error;
      if (name === "TypeError") {
        throw new Error("DISPLAY_UNSUPPORTED");
      }
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("DISPLAY_UNSUPPORTED");
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
  (stream as MediaStream & { oninactive?: () => void }).oninactive = finish;

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
  if (message === "DISPLAY_UNSUPPORTED") {
    if (isIosWebkit()) {
      return "Este Safari/Chrome do iPhone ainda não expõe captura de tela para sites. Toque de novo em Transmitir tela — se o iOS abrir o seletor, a transmissão começa na hora. Assistir a tela de outra pessoa continua normal.";
    }
    return "Este navegador não oferece captura de tela. Toque de novo em Transmitir tela para tentar outra vez.";
  }
  if (name === "InvalidStateError") {
    return "O iOS só pede a tela no toque. Toque de novo em Transmitir tela.";
  }
  if (name === "NotFoundError") {
    return "Nenhuma fonte de tela foi oferecida neste aparelho.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "O iOS iniciou a captura, mas não conseguiu ler a tela. Pare a gravação no iOS e toque de novo.";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "AbortError") {
    if (isIosWebkit()) {
      return "O iOS não liberou a tela desta vez. Toque de novo em Transmitir tela para abrir o seletor.";
    }
    return "Toque em Permitir na janela do navegador para transmitir a tela.";
  }
  return "Toque em Transmitir tela para o navegador pedir a captura.";
}
