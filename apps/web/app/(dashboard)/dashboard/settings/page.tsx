import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, workspaceMembers } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ModelSelector } from "@/components/settings/model-selector";
import { ApiKeyInput } from "@/components/settings/api-key-input";

export default async function SettingsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return null;
  }

  // Get user's workspace
  const membership = await db.query.workspaceMembers.findFirst({
    where: eq(workspaceMembers.userId, session.user.id),
    with: {
      workspace: true,
    },
  });

  if (!membership) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Create a workspace first.
        </p>
      </div>
    );
  }

  const metadata = membership.workspace.metadata as {
    model?: string;
    openrouterApiKey?: string;
  } | null;

  const currentModel = metadata?.model || "anthropic/claude-sonnet-4";
  const hasApiKey = !!metadata?.openrouterApiKey;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-8">
        <section>
          <h2 className="text-lg font-semibold mb-4">OpenRouter API Key</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Get your API key from{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              openrouter.ai/keys
            </a>
            . This is required for Levi to work.
          </p>
          <ApiKeyInput
            workspaceId={membership.workspaceId}
            hasExistingKey={hasApiKey}
          />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">AI Model</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Choose which AI model powers Levi. Different models have different
            strengths and costs.
          </p>
          <ModelSelector
            workspaceId={membership.workspaceId}
            currentModel={currentModel}
          />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Workspace</h2>
          <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm text-gray-500">Name</label>
                <p className="font-medium">{membership.workspace.name}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">URL</label>
                <p className="font-medium">levi.so/{membership.workspace.slug}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
