"use client";

import { useState } from "react";
import { RECOMMENDED_MODELS, type RecommendedModel } from "@/lib/ai/client";

interface ModelSelectorProps {
  workspaceId: string;
  currentModel: string;
}

export function ModelSelector({
  workspaceId,
  currentModel,
}: ModelSelectorProps) {
  const [selected, setSelected] = useState(currentModel);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSelect = async (modelId: string) => {
    setSelected(modelId);
    setSaving(true);
    setSaved(false);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelId }),
      });

      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (error) {
      console.error("Failed to save model:", error);
    } finally {
      setSaving(false);
    }
  };

  const tierOrder = { recommended: 0, good: 1, budget: 2 };
  const sortedModels = [...RECOMMENDED_MODELS].sort(
    (a, b) => tierOrder[a.tier] - tierOrder[b.tier]
  );

  const tierLabels = {
    recommended: "Recommended",
    good: "Good",
    budget: "Budget",
  };

  const tierStyles = {
    recommended: {
      background: 'var(--success-muted)',
      color: 'var(--success)',
    },
    good: {
      background: 'var(--background-tertiary)',
      color: 'var(--accent)',
    },
    budget: {
      background: 'var(--background-secondary)',
      color: 'var(--foreground-muted)',
    },
  };

  return (
    <div className="space-y-3">
      {sortedModels.map((model) => {
        const isSelected = selected === model.id;
        return (
          <button
            key={model.id}
            onClick={() => handleSelect(model.id)}
            disabled={saving}
            className="w-full p-4 text-left transition-colors"
            style={{
              border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: isSelected ? 'var(--background-secondary)' : 'transparent',
              borderRadius: '2px',
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium" style={{ color: 'var(--foreground)' }}>
                    {model.name}
                  </span>
                  <span
                    className="px-2 py-0.5 text-xs"
                    style={{
                      ...tierStyles[model.tier],
                      borderRadius: '2px',
                    }}
                  >
                    {tierLabels[model.tier]}
                  </span>
                </div>
                <p className="text-sm mt-1" style={{ color: 'var(--foreground-subtle)' }}>
                  {model.provider}
                </p>
                <p className="text-sm mt-2 font-sans" style={{ color: 'var(--foreground-muted)' }}>
                  {model.description}
                </p>
              </div>
              <div className="flex items-center">
                {isSelected && (
                  <div
                    className="w-5 h-5 flex items-center justify-center"
                    style={{
                      background: 'var(--accent)',
                      borderRadius: '2px',
                    }}
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="#0f172a"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}

      {saved && (
        <p className="text-sm" style={{ color: 'var(--success)' }}>
          Model saved successfully
        </p>
      )}
    </div>
  );
}
