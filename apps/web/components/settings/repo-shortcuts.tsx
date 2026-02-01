"use client";

import { useState, useTransition } from "react";
import type { WorkspaceKnowledge } from "@/lib/db/schema";

interface RepoShortcutsProps {
  workspaceId: string;
  repos: WorkspaceKnowledge["repos"];
}

export function RepoShortcuts({ workspaceId, repos: initialRepos }: RepoShortcutsProps) {
  const [repos, setRepos] = useState<Record<string, string>>(initialRepos || {});
  const [isPending, startTransition] = useTransition();
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newRepo, setNewRepo] = useState({ shortcut: "", fullName: "" });

  async function saveRepos(updatedRepos: Record<string, string>) {
    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            knowledge: { repos: updatedRepos },
          }),
        });

        if (!response.ok) throw new Error("Failed to save");

        setRepos(updatedRepos);
        setError(null);
      } catch (e) {
        setError("Failed to save changes");
      }
    });
  }

  function handleAddRepo() {
    if (!newRepo.shortcut || !newRepo.fullName) {
      setError("Both fields are required");
      return;
    }

    if (!newRepo.fullName.includes("/")) {
      setError("Full name should be in owner/repo format");
      return;
    }

    const key = newRepo.shortcut.toLowerCase().replace(/\s+/g, "-").replace(/^the-/, "");
    const updatedRepos = {
      ...repos,
      [key]: newRepo.fullName,
    };

    saveRepos(updatedRepos);
    setNewRepo({ shortcut: "", fullName: "" });
    setShowAddForm(false);
  }

  function handleDeleteRepo(key: string) {
    const { [key]: _, ...rest } = repos;
    saveRepos(rest);
  }

  const entries = Object.entries(repos);

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

      {entries.length === 0 && !showAddForm && (
        <p className="text-sm font-sans" style={{ color: 'var(--foreground-muted)' }}>
          No repo shortcuts added yet. Add shortcuts so Levi understands "the api" or "frontend repo".
        </p>
      )}

      <div className="space-y-2">
        {entries.map(([shortcut, fullName]) => (
          <div
            key={shortcut}
            className="flex items-center justify-between p-3"
            style={{
              border: '1px solid var(--border)',
              borderRadius: '2px',
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="font-mono text-sm px-2 py-1"
                style={{
                  background: 'var(--background-tertiary)',
                  borderRadius: '2px',
                }}
              >
                "{shortcut}"
              </span>
              <span style={{ color: 'var(--foreground-subtle)' }}>→</span>
              <span className="font-mono text-sm">{fullName}</span>
            </div>
            <button
              onClick={() => handleDeleteRepo(shortcut)}
              disabled={isPending}
              className="btn btn-danger text-sm disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      {showAddForm ? (
        <div
          className="p-4 space-y-3"
          style={{
            border: '1px solid var(--border)',
            borderRadius: '2px',
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="block text-xs uppercase tracking-wide mb-2"
                style={{ color: 'var(--foreground-subtle)' }}
              >
                Shortcut
              </label>
              <input
                type="text"
                placeholder="api, frontend, the app"
                value={newRepo.shortcut}
                onChange={(e) => setNewRepo({ ...newRepo, shortcut: e.target.value })}
                className="w-full"
              />
            </div>
            <div>
              <label
                className="block text-xs uppercase tracking-wide mb-2"
                style={{ color: 'var(--foreground-subtle)' }}
              >
                Full Repo Name
              </label>
              <input
                type="text"
                placeholder="myorg/api-server"
                value={newRepo.fullName}
                onChange={(e) => setNewRepo({ ...newRepo, fullName: e.target.value })}
                className="w-full"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleAddRepo}
              disabled={isPending}
              className="btn btn-primary disabled:opacity-50"
            >
              {isPending ? "Adding..." : "Add Shortcut"}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewRepo({ shortcut: "", fullName: "" });
                setError(null);
              }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full px-4 py-2 transition-colors"
          style={{
            border: '1px dashed var(--border)',
            borderRadius: '2px',
            color: 'var(--foreground-muted)',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.borderColor = 'var(--foreground-subtle)';
            e.currentTarget.style.color = 'var(--foreground)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.color = 'var(--foreground-muted)';
          }}
        >
          + Add Repo Shortcut
        </button>
      )}
    </div>
  );
}
