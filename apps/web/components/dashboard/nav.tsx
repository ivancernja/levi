"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth/client";

interface DashboardNavProps {
  user: {
    id: string;
    name: string | null;
    email: string;
    image?: string | null;
  };
}

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/integrations", label: "Integrations" },
  { href: "/dashboard/actions", label: "Actions" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardNav({ user }: DashboardNavProps) {
  const pathname = usePathname();

  return (
    <nav className="w-64 border-r border-gray-200 dark:border-gray-800 p-4 flex flex-col">
      <div className="mb-8">
        <Link href="/dashboard" className="text-xl font-bold">
          Levi
        </Link>
      </div>

      <div className="space-y-1 flex-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2 rounded-lg transition-colors ${
              pathname === item.href
                ? "bg-gray-100 dark:bg-gray-800"
                : "hover:bg-gray-50 dark:hover:bg-gray-900"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3 px-3 py-2">
          {user.image ? (
            <img
              src={user.image}
              alt={user.name || ""}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm font-medium">
              {user.name?.[0] || user.email[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/"; } } })}
          className="w-full mt-2 px-3 py-2 text-left text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-lg transition-colors"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
