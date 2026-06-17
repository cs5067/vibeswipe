export default function SwipeLoading() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0f]">
      <div className="w-16 h-16 rounded-full border-2 border-white/10 border-t-indigo-500 animate-spin" />
      <p className="mt-6 text-white/30 text-sm">Loading...</p>
    </main>
  );
}
