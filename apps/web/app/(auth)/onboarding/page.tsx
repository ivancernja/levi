"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    // Auto-generate slug from name
    setSlug(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to create workspace");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--background)' }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-3xl" style={{ color: 'var(--accent)' }}>⬢</span>
            <span className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>levi</span>
          </div>
          <h1 className="text-xl font-bold">Create your workspace</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--foreground-muted)' }}>
            Your team&apos;s home base
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <label
              htmlFor="name"
              className="block text-xs uppercase tracking-wide mb-2"
              style={{ color: 'var(--foreground-subtle)' }}
            >
              Workspace name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Acme Inc"
              required
              className="w-full"
            />
          </div>

          <div>
            <label
              htmlFor="slug"
              className="block text-xs uppercase tracking-wide mb-2"
              style={{ color: 'var(--foreground-subtle)' }}
            >
              Workspace URL
            </label>
            <div className="flex items-center">
              <span className="text-sm mr-1" style={{ color: 'var(--foreground-subtle)' }}>
                levi.so/
              </span>
              <input
                id="slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="acme"
                required
                pattern="[a-z0-9-]+"
                className="flex-1"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn btn-primary py-3 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create workspace"}
          </button>
        </form>
      </div>
    </div>
  );
}
