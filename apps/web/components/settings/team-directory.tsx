"use client";

import { useState, useTransition } from "react";
import type { WorkspaceKnowledge } from "@/lib/db/schema";

interface TeamDirectoryProps {
  workspaceId: string;
  people: WorkspaceKnowledge["people"];
}

interface Person {
  name: string;
  github?: string;
  linear?: string;
  role?: string;
  notes?: string;
}

export function TeamDirectory({ workspaceId, people: initialPeople }: TeamDirectoryProps) {
  const [people, setPeople] = useState<Record<string, Person>>(initialPeople || {});
  const [isPending, startTransition] = useTransition();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPerson, setNewPerson] = useState<{ key: string } & Person>({
    key: "",
    name: "",
    github: "",
    linear: "",
    role: "",
    notes: "",
  });

  async function savePeople(updatedPeople: Record<string, Person>) {
    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            knowledge: { people: updatedPeople },
          }),
        });

        if (!response.ok) throw new Error("Failed to save");

        setPeople(updatedPeople);
        setError(null);
      } catch (e) {
        setError("Failed to save changes");
      }
    });
  }

  function handleAddPerson() {
    if (!newPerson.key || !newPerson.name) {
      setError("Nickname and name are required");
      return;
    }

    const key = newPerson.key.toLowerCase().replace(/\s+/g, "-");
    const updatedPeople = {
      ...people,
      [key]: {
        name: newPerson.name,
        github: newPerson.github || undefined,
        linear: newPerson.linear || undefined,
        role: newPerson.role || undefined,
        notes: newPerson.notes || undefined,
      },
    };

    savePeople(updatedPeople);
    setNewPerson({ key: "", name: "", github: "", linear: "", role: "", notes: "" });
    setShowAddForm(false);
  }

  function handleDeletePerson(key: string) {
    const { [key]: _, ...rest } = people;
    savePeople(rest);
  }

  function handleUpdatePerson(key: string, updates: Partial<Person>) {
    const updatedPeople = {
      ...people,
      [key]: { ...people[key], ...updates },
    };
    savePeople(updatedPeople);
    setEditingKey(null);
  }

  const entries = Object.entries(people);

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
          No team members added yet. Add people so Levi can resolve names like "ian's PR" or "alex's issue".
        </p>
      )}

      <div className="space-y-3">
        {entries.map(([key, person]) => (
          <div
            key={key}
            className="p-4"
            style={{
              border: '1px solid var(--border)',
              borderRadius: '2px',
            }}
          >
            {editingKey === key ? (
              <EditPersonForm
                person={person}
                onSave={(updates) => handleUpdatePerson(key, updates)}
                onCancel={() => setEditingKey(null)}
                isPending={isPending}
              />
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="font-mono text-sm px-2 py-0.5"
                      style={{
                        background: 'var(--background-tertiary)',
                        borderRadius: '2px',
                      }}
                    >
                      {key}
                    </span>
                    <span className="font-medium">{person.name}</span>
                    {person.role && (
                      <span className="text-sm" style={{ color: 'var(--foreground-subtle)' }}>
                        • {person.role}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-4 mt-1 text-sm" style={{ color: 'var(--foreground-muted)' }}>
                    {person.github && <span>GitHub: @{person.github}</span>}
                    {person.linear && <span>Linear: {person.linear}</span>}
                  </div>
                  {person.notes && (
                    <p className="text-sm mt-1 font-sans" style={{ color: 'var(--foreground-muted)' }}>
                      {person.notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingKey(key)}
                    disabled={isPending}
                    className="btn btn-secondary text-sm disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeletePerson(key)}
                    disabled={isPending}
                    className="btn btn-danger text-sm disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
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
                Nickname *
              </label>
              <input
                type="text"
                placeholder="ian, alex, etc."
                value={newPerson.key}
                onChange={(e) => setNewPerson({ ...newPerson, key: e.target.value })}
                className="w-full"
              />
            </div>
            <div>
              <label
                className="block text-xs uppercase tracking-wide mb-2"
                style={{ color: 'var(--foreground-subtle)' }}
              >
                Full Name *
              </label>
              <input
                type="text"
                placeholder="Ian Smith"
                value={newPerson.name}
                onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })}
                className="w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="block text-xs uppercase tracking-wide mb-2"
                style={{ color: 'var(--foreground-subtle)' }}
              >
                GitHub Username
              </label>
              <input
                type="text"
                placeholder="iansmith"
                value={newPerson.github}
                onChange={(e) => setNewPerson({ ...newPerson, github: e.target.value })}
                className="w-full"
              />
            </div>
            <div>
              <label
                className="block text-xs uppercase tracking-wide mb-2"
                style={{ color: 'var(--foreground-subtle)' }}
              >
                Linear Name/Email
              </label>
              <input
                type="text"
                placeholder="ian@company.com"
                value={newPerson.linear}
                onChange={(e) => setNewPerson({ ...newPerson, linear: e.target.value })}
                className="w-full"
              />
            </div>
          </div>
          <div>
            <label
              className="block text-xs uppercase tracking-wide mb-2"
              style={{ color: 'var(--foreground-subtle)' }}
            >
              Role / Works On
            </label>
            <input
              type="text"
              placeholder="Backend, Frontend Lead, etc."
              value={newPerson.role}
              onChange={(e) => setNewPerson({ ...newPerson, role: e.target.value })}
              className="w-full"
            />
          </div>
          <div>
            <label
              className="block text-xs uppercase tracking-wide mb-2"
              style={{ color: 'var(--foreground-subtle)' }}
            >
              Notes
            </label>
            <input
              type="text"
              placeholder="Any other useful info"
              value={newPerson.notes}
              onChange={(e) => setNewPerson({ ...newPerson, notes: e.target.value })}
              className="w-full"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleAddPerson}
              disabled={isPending}
              className="btn btn-primary disabled:opacity-50"
            >
              {isPending ? "Adding..." : "Add Person"}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewPerson({ key: "", name: "", github: "", linear: "", role: "", notes: "" });
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
          + Add Team Member
        </button>
      )}
    </div>
  );
}

function EditPersonForm({
  person,
  onSave,
  onCancel,
  isPending,
}: {
  person: Person;
  onSave: (updates: Partial<Person>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState(person);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className="block text-xs uppercase tracking-wide mb-2"
            style={{ color: 'var(--foreground-subtle)' }}
          >
            Full Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full"
          />
        </div>
        <div>
          <label
            className="block text-xs uppercase tracking-wide mb-2"
            style={{ color: 'var(--foreground-subtle)' }}
          >
            Role
          </label>
          <input
            type="text"
            value={form.role || ""}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="w-full"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className="block text-xs uppercase tracking-wide mb-2"
            style={{ color: 'var(--foreground-subtle)' }}
          >
            GitHub
          </label>
          <input
            type="text"
            value={form.github || ""}
            onChange={(e) => setForm({ ...form, github: e.target.value })}
            className="w-full"
          />
        </div>
        <div>
          <label
            className="block text-xs uppercase tracking-wide mb-2"
            style={{ color: 'var(--foreground-subtle)' }}
          >
            Linear
          </label>
          <input
            type="text"
            value={form.linear || ""}
            onChange={(e) => setForm({ ...form, linear: e.target.value })}
            className="w-full"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSave(form)}
          disabled={isPending}
          className="btn btn-primary disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="btn btn-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
