export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-bg">
      <div className="mx-auto flex h-full w-full max-w-[1920px] flex-col overflow-hidden px-3 py-3 sm:px-5 sm:py-4">
        {children}
      </div>
    </div>
  );
}
