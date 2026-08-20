export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh min-h-0 min-w-0 max-w-full flex-col overflow-x-hidden overflow-y-auto bg-[#111214]">
      {children}
    </div>
  );
}
