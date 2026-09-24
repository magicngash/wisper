export default function AudioWaveIndicator() {
  return (
    <div className="flex items-center justify-center gap-1.5 h-10 px-4">
      {[0.4, 0.9, 0.6, 1.0, 0.7, 0.3, 0.8, 0.5, 0.9, 0.4, 0.7, 0.5].map((scale, i) => (
        <span
          key={i}
          className="w-1.5 rounded-full bg-rose-500 animate-pulse transition-all duration-300"
          style={{
            height: `${Math.max(8, scale * 36)}px`,
            animationDelay: `${(i % 5) * 120}ms`,
            animationDuration: '900ms',
          }}
        />
      ))}
    </div>
  );
}
