"use client";

import { useState, useTransition } from "react";

interface WorkspaceNotesProps {
  workspaceId: string;
  notes: string | undefined;
}

export function WorkspaceNotes({ workspaceId, notes: initialNotes }: WorkspaceNotesProps) {
  const [notes, setNotes] = useState(initialNotes || "");
  const [savedNotes, setSavedNotes] = useState(initialNotes || "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasChanges = notes !== savedNotes;

  async function handleSave() {
    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            knowledge: { notes: notes || undefined },
          }),
        });

        if (!response.ok) throw new Error("Failed to save");

        setSavedNotes(notes);
        setError(null);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2000);
      } catch (e) {
        setError("Failed to save notes");
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div
          className="p-3 text-sm"
          style={{
            background: 'var(--error-muted)',
            color: 'var(--error)',
            borderRadius: '2px',
          }}
        >
          {error}
        </div>
      )}

      <div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={`Add custom notes, context, or personality guidelines for Levi...

Examples:
- "We use trunk-based development, always merge to main"
- "Never create issues without an estimate"
- "Prefer concise responses, we're a fast-moving team"
- "Project X is our top priority this quarter"`}
          rows={8}
          className="w-full resize-y"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending || !hasChanges}
          className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Saving..." : "Save Notes"}
        </button>
        {hasChanges && (
          <span className="text-sm" style={{ color: 'var(--warning)' }}>
            Unsaved changes
          </span>
        )}
        {success && (
          <span className="text-sm" style={{ color: 'var(--success)' }}>
            Saved!
          </span>
        )}
      </div>
    </div>
  );
}
