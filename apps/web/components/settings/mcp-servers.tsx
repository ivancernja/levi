"use client";

import { useState, useTransition } from "react";
import type { MCPServerConfig } from "@/lib/db/schema";

interface MCPServersProps {
  workspaceId: string;
  servers: MCPServerConfig[];
}

export function MCPServers({ workspaceId, servers: initialServers }: MCPServersProps) {
  const [servers, setServers] = useState<MCPServerConfig[]>(initialServers);
  const [isPending, startTransition] = useTransition();
  const [newServer, setNewServer] = useState({
    name: "",
    url: "",
    description: "",
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddServer() {
    if (!newServer.name || !newServer.url) {
      setError("Name and URL are required");
      return;
    }

    // Validate URL
    try {
      new URL(newServer.url);
    } catch {
      setError("Invalid URL format");
      return;
    }

    const server: MCPServerConfig = {
      id: crypto.randomUUID(),
      name: newServer.name,
      url: newServer.url,
      description: newServer.description || undefined,
      enabled: true,
    };

    const updatedServers = [...servers, server];

    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/mcp-servers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, servers: updatedServers }),
        });

        if (!response.ok) {
          throw new Error("Failed to save");
        }

        setServers(updatedServers);
        setNewServer({ name: "", url: "", description: "" });
        setShowAddForm(false);
        setError(null);
      } catch (e) {
        setError("Failed to add server");
      }
    });
  }

  async function handleToggleServer(serverId: string) {
    const updatedServers = servers.map((s) =>
      s.id === serverId ? { ...s, enabled: !s.enabled } : s
    );

    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/mcp-servers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, servers: updatedServers }),
        });

        if (!response.ok) {
          throw new Error("Failed to save");
        }

        setServers(updatedServers);
      } catch (e) {
        setError("Failed to update server");
      }
    });
  }

  async function handleDeleteServer(serverId: string) {
    const updatedServers = servers.filter((s) => s.id !== serverId);

    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/mcp-servers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, servers: updatedServers }),
        });

        if (!response.ok) {
          throw new Error("Failed to save");
        }

        setServers(updatedServers);
      } catch (e) {
        setError("Failed to delete server");
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

      {servers.length === 0 && !showAddForm && (
        <p className="text-sm font-sans" style={{ color: 'var(--foreground-muted)' }}>
          No MCP servers configured. Add one to extend Levi with custom tools.
        </p>
      )}

      <div className="space-y-3">
        {servers.map((server) => (
          <div
            key={server.id}
            className="p-4"
            style={{
              border: '1px solid var(--border)',
              borderRadius: '2px',
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium truncate">{server.name}</h3>
                  <span
                    className="text-xs px-2 py-0.5"
                    style={{
                      background: server.enabled ? 'var(--success-muted)' : 'var(--background-tertiary)',
                      color: server.enabled ? 'var(--success)' : 'var(--foreground-subtle)',
                      borderRadius: '2px',
                    }}
                  >
                    {server.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <p
                  className="text-sm truncate mt-1"
                  style={{ color: 'var(--foreground-subtle)' }}
                >
                  {server.url}
                </p>
                {server.description && (
                  <p
                    className="text-sm mt-1 font-sans"
                    style={{ color: 'var(--foreground-muted)' }}
                  >
                    {server.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleServer(server.id)}
                  disabled={isPending}
                  className="btn btn-secondary text-sm disabled:opacity-50"
                >
                  {server.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => handleDeleteServer(server.id)}
                  disabled={isPending}
                  className="btn btn-danger text-sm disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
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
          <div>
            <label
              className="block text-xs uppercase tracking-wide mb-2"
              style={{ color: 'var(--foreground-subtle)' }}
            >
              Name
            </label>
            <input
              type="text"
              placeholder="My MCP Server"
              value={newServer.name}
              onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
              className="w-full"
            />
          </div>
          <div>
            <label
              className="block text-xs uppercase tracking-wide mb-2"
              style={{ color: 'var(--foreground-subtle)' }}
            >
              URL
            </label>
            <input
              type="url"
              placeholder="http://localhost:3001/sse"
              value={newServer.url}
              onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
              className="w-full"
            />
            <p className="text-xs mt-1" style={{ color: 'var(--foreground-subtle)' }}>
              SSE endpoint URL for the MCP server
            </p>
          </div>
          <div>
            <label
              className="block text-xs uppercase tracking-wide mb-2"
              style={{ color: 'var(--foreground-subtle)' }}
            >
              Description (optional)
            </label>
            <input
              type="text"
              placeholder="What this server does"
              value={newServer.description}
              onChange={(e) => setNewServer({ ...newServer, description: e.target.value })}
              className="w-full"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleAddServer}
              disabled={isPending}
              className="btn btn-primary disabled:opacity-50"
            >
              {isPending ? "Adding..." : "Add Server"}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewServer({ name: "", url: "", description: "" });
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
          + Add MCP Server
        </button>
      )}
    </div>
  );
}
