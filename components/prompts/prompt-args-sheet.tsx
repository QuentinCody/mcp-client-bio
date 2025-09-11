"use client";
export function PromptArgsSheet({
  args,
  values,
  onChange,
}: {
  args: { name: string; description?: string; required?: boolean; placeholder?: string }[];
  values: Record<string, string>;
  onChange: (k: string, v: string) => void;
}) {
  if (!args?.length) return null;
  return (
    <div className="mt-2 grid gap-2">
      {args.map((a) => (
        <label key={a.name} className="text-sm">
          {a.name}
          {a.required ? " *" : ""}
          <input
            className="w-full mt-1 rounded-lg border px-3 py-2"
            placeholder={a.placeholder || a.description || ""}
            value={values[a.name] ?? ""}
            onChange={(e) => onChange(a.name, e.target.value)}
          />
        </label>
      ))}
    </div>
  );
}

