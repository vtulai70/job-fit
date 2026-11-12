type Props = { value: string; onChange: (value: string) => void };

/** Text area for the pasted target job description. */
export default function JobDescription({ value, onChange }: Props) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <label htmlFor="job-description" className="mb-2 block font-semibold">
        Job description
      </label>
      <textarea
        id="job-description"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste the full job description text"
        rows={6}
        className="w-full rounded border border-line bg-canvas p-2 text-sm focus:border-primary focus:outline-none"
      />
    </section>
  );
}
