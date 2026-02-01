import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, integrations, workspaceMembers } from "@/lib/db";
import { eq } from "drizzle-orm";
import Link from "next/link";

const INTEGRATION_CONFIGS = [
  {
    type: "slack",
    name: "Slack",
    description: "Receive @mentions and send messages",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
      </svg>
    ),
    connectUrl: "/api/integrations/slack/oauth",
  },
  {
    type: "linear",
    name: "Linear",
    description: "Create and update issues",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3.037 10.903l10.063 10.062a.5.5 0 0 1-.12.8 11.053 11.053 0 0 1-7.944.94A11.025 11.025 0 0 1 .299 17.97a11.054 11.054 0 0 1 .938-7.942.5.5 0 0 1 .8-.125zm1.477-1.476a.5.5 0 0 1 .8-.125l9.388 9.388a.5.5 0 0 1-.125.8 11.03 11.03 0 0 1-3.576 1.288.5.5 0 0 1-.55-.55 11.03 11.03 0 0 1 1.288-3.576.5.5 0 0 1 .125-.8.5.5 0 0 1-.8.125L1.675 6.59a.5.5 0 0 1 .125-.8A11.03 11.03 0 0 1 5.376 4.5a.5.5 0 0 1 .55.55 11.03 11.03 0 0 1-1.288 3.576.5.5 0 0 1-.125.8zm12.524 7.612a.5.5 0 0 1-.8.124L6.85 7.776a.5.5 0 0 1 .124-.8c.453-.29.93-.543 1.424-.76a.5.5 0 0 1 .575.11l8.7 8.7a.5.5 0 0 1 .11.574c-.217.496-.47.972-.76 1.425zm1.476-1.478c.29-.453.543-.93.76-1.424a.5.5 0 0 0-.11-.575l-8.7-8.7a.5.5 0 0 0-.574-.11c-.496.217-.972.47-1.425.76a.5.5 0 0 0-.124.8l9.388 9.388a.5.5 0 0 0 .8-.124zm1.486-1.485a.5.5 0 0 0 .125-.8l-9.388-9.388a.5.5 0 0 0-.8.125 11.03 11.03 0 0 0-1.288 3.576.5.5 0 0 0 .55.55 11.03 11.03 0 0 0 3.576-1.288.5.5 0 0 0 .8-.125.5.5 0 0 0-.125.8l9.388 9.388a.5.5 0 0 0 .8-.125 11.03 11.03 0 0 0 1.288-3.576.5.5 0 0 0-.55-.55 11.03 11.03 0 0 0-3.576 1.288.5.5 0 0 0-.8.125z" />
      </svg>
    ),
    connectUrl: "/api/integrations/linear/oauth",
  },
  {
    type: "github",
    name: "GitHub",
    description: "Create PRs and issues",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    ),
    connectUrl: "/api/integrations/github/oauth",
  },
  {
    type: "notion",
    name: "Notion",
    description: "Update and create pages",
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.886l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.886.747-.933zM2.877.466l13.542-.933c1.632-.14 2.055.093 2.755.606L22.88 2.76c.467.373.607.746.607 1.26v17.556c0 1.027-.373 1.633-1.682 1.726L5.545 24c-.98.047-1.448-.093-1.962-.7L.934 20.68c-.56-.7-.793-1.26-.793-1.96V2.012C.14 1.172.513.56 1.867.466z" />
      </svg>
    ),
    connectUrl: "/api/integrations/notion/oauth",
  },
];

export default async function IntegrationsPage() {
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
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold tracking-tight mb-6">Integrations</h1>
        <p style={{ color: 'var(--foreground-muted)' }}>
          Create a workspace first to connect integrations.
        </p>
      </div>
    );
  }

  // Get connected integrations
  const connectedIntegrations = await db.query.integrations.findMany({
    where: eq(integrations.workspaceId, membership.workspaceId),
  });

  const connectedTypes = new Set<string>(connectedIntegrations.map((i) => i.type));

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="text-sm mt-1 font-sans" style={{ color: 'var(--foreground-muted)' }}>
          Connect your tools to let Levi work across your stack.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {INTEGRATION_CONFIGS.map((config) => {
          const connected = connectedTypes.has(config.type);
          const integration = connectedIntegrations.find(
            (i) => i.type === config.type
          );

          return (
            <div
              key={config.type}
              className="fieldset"
            >
              <div className="fieldset-legend">{config.name}</div>
              <div className="flex items-start justify-between mb-4">
                <div style={{ color: 'var(--foreground-muted)' }}>
                  {config.icon}
                </div>
                {connected && (
                  <span
                    className="px-2 py-1 text-xs font-medium"
                    style={{
                      background: 'var(--success-muted)',
                      color: 'var(--success)',
                      borderRadius: '2px',
                    }}
                  >
                    Connected
                  </span>
                )}
              </div>
              <p className="text-sm font-sans mb-4" style={{ color: 'var(--foreground-muted)' }}>
                {config.description}
              </p>
              {connected ? (
                <div className="text-sm" style={{ color: 'var(--foreground-subtle)' }}>
                  Connected as {integration?.externalName}
                </div>
              ) : (
                <Link
                  href={config.connectUrl}
                  className="btn btn-primary"
                >
                  Connect
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
