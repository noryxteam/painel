"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface AudioSettingsProps {
  open: boolean;
  onClose: () => void;
  inputDeviceId: string;
  outputDeviceId: string;
  outputVolume: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  sensitivity: number;
  onChange: (patch: Record<string, string | number | boolean>) => void;
}

export function AudioSettingsPanel({
  open,
  onClose,
  inputDeviceId,
  outputDeviceId,
  outputVolume,
  echoCancellation,
  noiseSuppression,
  autoGainControl,
  sensitivity,
  onChange,
}: AudioSettingsProps) {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!open) return;
    void navigator.mediaDevices.enumerateDevices().then((devices) => {
      setInputs(devices.filter((item) => item.kind === "audioinput"));
      setOutputs(devices.filter((item) => item.kind === "audiooutput"));
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let context: AudioContext | null = null;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: inputDeviceId ? { deviceId: { exact: inputDeviceId } } : true,
          video: false,
        });
        const Ctor =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return;
        context = new Ctor();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((sum, value) => sum + value, 0) / data.length;
          setLevel(Math.min(100, Math.round((avg / 80) * 100)));
          timer = window.setTimeout(tick, 80);
        };
        tick();
      } catch {
        // Sem permissão de microfone.
      }
    })();
    return () => {
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
    };
  }, [inputDeviceId, open]);

  if (!open) return null;

  return (
    <div className="absolute inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 max-h-[min(70dvh,34rem)] w-auto overflow-y-auto rounded-2xl border border-white/10 bg-[#16161f] p-4 shadow-2xl sm:inset-x-auto sm:left-3 sm:w-[320px]">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Configurações de áudio</p>
        <button type="button" className="text-zinc-500 hover:text-white" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 text-sm">
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">
            Microfone
          </p>
          <label className="mb-1 block text-xs text-zinc-500">Dispositivo de entrada</label>
          <select
            className="w-full rounded-lg border border-white/10 bg-[#0f0f15] px-3 py-2 text-zinc-200"
            value={inputDeviceId}
            onChange={(event) => onChange({ inputDeviceId: event.target.value })}
          >
            <option value="">Padrão do sistema</option>
            {inputs.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || "Microfone"}
              </option>
            ))}
          </select>
          <label className="mb-1 mt-3 block text-xs text-zinc-500">Teste do microfone</label>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-400 transition-[width]"
              style={{ width: `${level}%` }}
            />
          </div>
          <label className="mb-1 mt-3 block text-xs text-zinc-500">Sensibilidade</label>
          <input
            type="range"
            min={6}
            max={40}
            value={sensitivity}
            onChange={(event) => onChange({ sensitivity: Number(event.target.value) })}
            className="w-full accent-violet-500"
          />
        </section>

        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">
            Saída de áudio
          </p>
          <label className="mb-1 block text-xs text-zinc-500">Dispositivo</label>
          <select
            className="w-full rounded-lg border border-white/10 bg-[#0f0f15] px-3 py-2 text-zinc-200"
            value={outputDeviceId}
            onChange={(event) => onChange({ outputDeviceId: event.target.value })}
          >
            <option value="">Padrão do sistema</option>
            {outputs.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || "Alto-falante"}
              </option>
            ))}
          </select>
          <label className="mb-1 mt-3 block text-xs text-zinc-500">Volume de saída</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={outputVolume}
            onChange={(event) => onChange({ outputVolume: Number(event.target.value) })}
            className="w-full accent-violet-500"
          />
        </section>

        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">
            Tratamento de áudio
          </p>
          <label className="flex items-center justify-between py-1 text-zinc-300">
            Supressão de ruído
            <input
              type="checkbox"
              checked={noiseSuppression}
              onChange={(event) => onChange({ noiseSuppression: event.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between py-1 text-zinc-300">
            Cancelamento de eco
            <input
              type="checkbox"
              checked={echoCancellation}
              onChange={(event) => onChange({ echoCancellation: event.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between py-1 text-zinc-300">
            Ganho automático
            <input
              type="checkbox"
              checked={autoGainControl}
              onChange={(event) => onChange({ autoGainControl: event.target.checked })}
            />
          </label>
        </section>
      </div>
    </div>
  );
}

export function ControlButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-[4.6rem] flex-col items-center gap-1.5 min-[400px]:w-[5.5rem] sm:w-[7.5rem] sm:gap-2"
    >
      <span
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full text-lg transition min-[400px]:h-12 min-[400px]:w-12 sm:h-14 sm:w-14 [&_svg]:h-5 [&_svg]:w-5 sm:[&_svg]:h-6 sm:[&_svg]:w-6",
          danger
            ? "bg-red-600 text-white hover:bg-red-500"
            : "bg-[#111214] text-white hover:bg-[#1a1a1c]",
        )}
      >
        {children}
      </span>
      <span className="max-w-[7.5rem] text-center text-[10px] leading-tight text-zinc-400 sm:text-[11px]">
        {label}
      </span>
    </button>
  );
}
