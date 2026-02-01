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

  const tierColors = {
    recommended: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    good: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    budget: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };

  return (
    <div className="space-y-3">
      {sortedModels.map((model) => (
        <button
          key={model.id}
          onClick={() => handleSelect(model.id)}
          disabled={saving}
          className={`w-full p-4 text-left border rounded-lg transition-colors ${
            selected === model.id
              ? "border-black dark:border-white bg-gray-50 dark:bg-gray-900"
              : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{model.name}</span>
                <span
                  className={`px-2 py-0.5 text-xs rounded-full ${tierColors[model.tier]}`}
                >
                  {tierLabels[model.tier]}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">{model.provider}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                {model.description}
              </p>
            </div>
            <div className="flex items-center">
              {selected === model.id && (
                <div className="w-5 h-5 rounded-full bg-black dark:bg-white flex items-center justify-center">
                  <svg
                    className="w-3 h-3 text-white dark:text-black"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
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
      ))}

      {saved && (
        <p className="text-sm text-green-600 dark:text-green-400">
          Model saved successfully
        </p>
      )}
    </div>
  );
}
