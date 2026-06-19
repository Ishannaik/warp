const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL ?? 'ws://localhost:8787'

export default function App() {
  return (
    <main className="min-h-dvh grid place-items-center bg-black text-white">
      <div className="text-center px-6">
        <h1 className="text-6xl font-semibold tracking-tight">Warp</h1>
        <p className="mt-4 text-lg text-white/60">Send files directly between devices.</p>
        <p className="mt-8 text-xs text-white/30">signaling: {SIGNALING_URL}</p>
        {/* ponytail: placeholder hero. The over-the-top three.js/GSAP landing + transfer UI replace this. */}
      </div>
    </main>
  )
}
