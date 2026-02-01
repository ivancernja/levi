import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="p-6 border border-gray-200 dark:border-gray-800 rounded-lg">
          <h2 className="font-semibold mb-2">Welcome, {session?.user.name}</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Connect your integrations to get started with Levi.
          </p>
        </div>
        <div className="p-6 border border-gray-200 dark:border-gray-800 rounded-lg">
          <h2 className="font-semibold mb-2">Integrations</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            0 connected
          </p>
        </div>
        <div className="p-6 border border-gray-200 dark:border-gray-800 rounded-lg">
          <h2 className="font-semibold mb-2">Actions</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            0 pending
          </p>
        </div>
      </div>
    </div>
  );
}
