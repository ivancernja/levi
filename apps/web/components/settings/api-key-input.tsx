"use client";

import { useState } from "react";

interface ApiKeyInputProps {
  workspaceId: string;
  hasExistingKey: boolean;
}

export function ApiKeyInput({ workspaceId, hasExistingKey }: ApiKeyInputProps) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(!hasExistingKey);

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError("API key is required");
      return;
    }

    if (!apiKey.startsWith("sk-or-")) {
      setError("Invalid OpenRouter API key format (should start with sk-or-)");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openrouterApiKey: apiKey }),
      });

      if (response.ok) {
        setSaved(true);
        setIsEditing(false);
        setApiKey("");
        setTimeout(() => setSaved(false), 2000);
      } else {
        const data = await response.json();
        setError(data.error || "Failed to save");
      }
    } catch {
      setError("Failed to save API key");
    } finally {
      setSaving(false);
    }
  };

  if (!isEditing && hasExistingKey) {
    return (
      <div className="flex items-center gap-4">
        <div
          className="flex-1 px-3 py-2"
          style={{
            background: 'var(--background-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '2px',
          }}
        >
          <span style={{ color: 'var(--foreground-subtle)' }}>sk-or-••••••••••••••••</span>
        </div>
        <button
          onClick={() => setIsEditing(true)}
          className="btn btn-secondary"
        >
          Change
        </button>
        {saved && (
          <span className="text-sm" style={{ color: 'var(--success)' }}>
            Saved
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-or-..."
          className="flex-1"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {hasExistingKey && (
          <button
            onClick={() => setIsEditing(false)}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
      )}
    </div>
  );
}
