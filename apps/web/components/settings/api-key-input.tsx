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
        <div className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900">
          <span className="text-gray-500">sk-or-••••••••••••••••</span>
        </div>
        <button
          onClick={() => setIsEditing(true)}
          className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
        >
          Change
        </button>
        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400">
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
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-black text-white dark:bg-white dark:text-black rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {hasExistingKey && (
          <button
            onClick={() => setIsEditing(false)}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
