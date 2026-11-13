type Props = { id?: string; title: string; open: boolean; onToggle: () => void };

/** Panel heading whose title button expands and collapses the panel body. */
export default function PanelTitle({ id, title, open, onToggle }: Props) {
  return (
    <h2 id={id} className="font-semibold">
      <button aria-expanded={open} onClick={onToggle} className="flex items-center gap-2 hover:text-primary">
        <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}>
          <path d="M7 5l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        {title}
      </button>
    </h2>
  );
}
