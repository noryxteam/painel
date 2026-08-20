"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid h-dvh place-items-center bg-[#111214] px-6 text-center text-zinc-200">
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-zinc-400">Não foi possível abrir as salas.</p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
