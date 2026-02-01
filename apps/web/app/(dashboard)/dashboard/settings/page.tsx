import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, workspaceMembers } from "@/lib/db";
import type { WorkspaceMetadata } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ModelSelector } from "@/components/settings/model-selector";
import { ApiKeyInput } from "@/components/settings/api-key-input";
import { MCPServers } from "@/components/settings/mcp-servers";
import { TeamDirectory } from "@/components/settings/team-directory";
import { RepoShortcuts } from "@/components/settings/repo-shortcuts";
import { WorkspaceNotes } from "@/components/settings/workspace-notes";

function Fieldset({ legend, children, description }: { legend: string; children: React.ReactNode; description?: string }) {
  return (
    <div className="fieldset">
      <div className="fieldset-legend">{legend}</div>
      {description && (
        <p className="text-sm mb-4 font-sans" style={{ color: 'var(--foreground-muted)' }}>
          {description}
        </p>
      )}
      {children}
    </div>
  );
}

export default async function SettingsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return null;
  }

  const membership = await db.query.workspaceMembers.findFirst({
    where: eq(workspaceMembers.userId, session.user.id),
    with: {
      workspace: true,
    },
  });

  if (!membership) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>
        <p style={{ color: 'var(--foreground-muted)' }}>
          Create a workspace first.
        </p>
      </div>
    );
  }

  const metadata = membership.workspace.metadata as WorkspaceMetadata | null;

  const currentModel = metadata?.model || "anthropic/claude-sonnet-4";
  const hasApiKey = !!metadata?.openrouterApiKey;
  const mcpServers = metadata?.mcpServers || [];
  const knowledge = metadata?.knowledge || {};

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--foreground-subtle)' }}>
          Configure {membership.workspace.name}
        </p>
      </div>

      <div className="space-y-6">
        <Fieldset
          legend="API Configuration"
          description={
            <>
              Get your API key from{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent)' }}
              >
                openrouter.ai/keys
              </a>
            </>
          }
        >
          <ApiKeyInput
            workspaceId={membership.workspaceId}
            hasExistingKey={hasApiKey}
          />
        </Fieldset>

        <Fieldset
          legend="AI Model"
          description="Choose which model powers Levi. Different models have different capabilities and costs."
        >
          <ModelSelector
            workspaceId={membership.workspaceId}
            currentModel={currentModel}
          />
        </Fieldset>

        <Fieldset
          legend="Team Directory"
          description="Add team members so Levi understands references like &quot;ian's PR&quot;. You can also teach via chat."
        >
          <TeamDirectory
            workspaceId={membership.workspaceId}
            people={knowledge.people}
          />
        </Fieldset>

        <Fieldset
          legend="Repo Shortcuts"
          description="Map nicknames to full repo names so Levi understands &quot;the api&quot; or &quot;frontend repo&quot;."
        >
          <RepoShortcuts
            workspaceId={membership.workspaceId}
            repos={knowledge.repos}
          />
        </Fieldset>

        <Fieldset
          legend="Workspace Notes"
          description="Custom context, guidelines, or personality notes that shape how Levi behaves."
        >
          <WorkspaceNotes
            workspaceId={membership.workspaceId}
            notes={knowledge.notes}
          />
        </Fieldset>

        <Fieldset
          legend="MCP Servers"
          description="Connect external MCP servers to extend Levi with custom tools and integrations."
        >
          <MCPServers
            workspaceId={membership.workspaceId}
            servers={mcpServers}
          />
        </Fieldset>

        <Fieldset legend="Workspace Info">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-wide" style={{ color: 'var(--foreground-subtle)' }}>
                Name
              </label>
              <p className="mt-1">{membership.workspace.name}</p>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide" style={{ color: 'var(--foreground-subtle)' }}>
                Slug
              </label>
              <p className="mt-1" style={{ color: 'var(--foreground-muted)' }}>
                /{membership.workspace.slug}
              </p>
            </div>
          </div>
        </Fieldset>
      </div>
    </div>
  );
}
