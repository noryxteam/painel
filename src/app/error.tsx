"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-400">
        Sistema de Análise
      </p>
      <h2 className="mt-3 text-2xl font-bold text-zinc-50">
        Não foi possível carregar esta tela
      </h2>
      <p className="mt-3 text-sm text-zinc-400">
        Recarregue a página ou volte ao início e entre de novo no perfil.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Tentar de novo</Button>
        <Button variant="secondary" onClick={() => (window.location.href = "/")}>
          Ir ao início
        </Button>
      </div>
    </div>
  );
}
