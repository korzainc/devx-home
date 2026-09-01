export function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0">
      <span className="text-[0.65rem] tracking-wide text-ink-faint uppercase">
        {label}
      </span>
      <span className="text-right text-sm text-ink">{children}</span>
    </div>
  );
}
