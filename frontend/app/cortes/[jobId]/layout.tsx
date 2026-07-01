export default function CortesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-bg">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1920px] flex-col overflow-hidden px-3 py-3 sm:px-5 sm:py-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
