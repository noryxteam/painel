"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-[#111214]">
        <div className="grid h-dvh place-items-center px-6 text-center text-zinc-200">
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-zinc-400">Não foi possível abrir o painel.</p>
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
            >
              Tentar de novo
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
