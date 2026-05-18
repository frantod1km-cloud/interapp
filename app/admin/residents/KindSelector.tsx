"use client";

import { useRef } from "react";
import { RESIDENT_KINDS, kindMeta } from "@/lib/resident-kinds";
import { updateResidentKindAction } from "./actions";

// Select inline para cambiar la categoría de un residente desde la tabla.
// Auto-submit al cambiar de valor. Es Client Component porque necesita
// onChange — los Server Components no pueden tener event handlers.

export default function KindSelector({
  residentId,
  currentKind,
}: {
  residentId: string;
  currentKind: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const meta = kindMeta(currentKind);

  return (
    <form action={updateResidentKindAction} ref={formRef}>
      <input type="hidden" name="resident_id" value={residentId} />
      <select
        name="kind"
        defaultValue={currentKind}
        onChange={() => formRef.current?.requestSubmit()}
        className={`bg-transparent border rounded px-2 py-1 text-xs ${meta.className}`}
      >
        {RESIDENT_KINDS.map((opt) => (
          <option key={opt.id} value={opt.id} className="bg-zinc-900 border border-zinc-800">
            {opt.emoji} {opt.short}
          </option>
        ))}
      </select>
    </form>
  );
}
