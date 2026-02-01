import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--foreground-subtle)' }}>
          Welcome back, {session?.user.name}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="fieldset">
          <div className="fieldset-legend">Welcome</div>
          <h2 className="font-medium mb-2">Get Started</h2>
          <p className="text-sm font-sans" style={{ color: 'var(--foreground-muted)' }}>
            Connect your integrations to get started with Levi.
          </p>
        </div>

        <div className="fieldset">
          <div className="fieldset-legend">Integrations</div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>0</span>
            <span className="text-sm" style={{ color: 'var(--foreground-subtle)' }}>connected</span>
          </div>
        </div>

        <div className="fieldset">
          <div className="fieldset-legend">Actions</div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>0</span>
            <span className="text-sm" style={{ color: 'var(--foreground-subtle)' }}>pending</span>
          </div>
        </div>
      </div>
    </div>
  );
}
