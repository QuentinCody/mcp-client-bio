"use client";
export function PromptPreview({ header, body }: { header: string; body: string }) {
  return (
    <details className="mt-2 rounded-lg border p-3 bg-gray-50">
      <summary className="cursor-pointer text-sm font-medium">{header}</summary>
      <pre className="mt-2 whitespace-pre-wrap text-sm">{body}</pre>
    </details>
  );
}

