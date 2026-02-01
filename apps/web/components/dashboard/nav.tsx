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
  { href: "/dashboard", label: "Dashboard", icon: "◈" },
  { href: "/dashboard/integrations", label: "Integrations", icon: "⬡" },
  { href: "/dashboard/actions", label: "Actions", icon: "▷" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙" },
];

export function DashboardNav({ user }: DashboardNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className="w-56 p-4 flex flex-col"
      style={{
        borderRight: '1px solid var(--border)',
        background: 'var(--background)'
      }}
    >
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="text-xl font-bold tracking-tight flex items-center gap-2"
          style={{ color: 'var(--accent)' }}
        >
          <span className="text-2xl">⬢</span>
          <span>levi</span>
        </Link>
        <p className="text-xs mt-1" style={{ color: 'var(--foreground-subtle)' }}>
          AI team agent
        </p>
      </div>

      <div className="space-y-0.5 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 px-3 py-2 text-sm transition-colors"
              style={{
                color: isActive ? 'var(--accent)' : 'var(--foreground-muted)',
                background: isActive ? 'var(--background-secondary)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              <span className="w-4 text-center opacity-60">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>

      <div
        className="pt-4 mt-4"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3 px-2 py-2">
          {user.image ? (
            <img
              src={user.image}
              alt={user.name || ""}
              className="w-7 h-7 rounded"
            />
          ) : (
            <div
              className="w-7 h-7 rounded flex items-center justify-center text-xs font-medium"
              style={{
                background: 'var(--background-tertiary)',
                color: 'var(--foreground-muted)'
              }}
            >
              {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate" style={{ color: 'var(--foreground)' }}>
              {user.name || user.email.split('@')[0]}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--foreground-subtle)' }}>
              {user.email}
            </p>
          </div>
        </div>
        <button
          onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/"; } } })}
          className="w-full mt-2 px-3 py-1.5 text-left text-xs transition-colors"
          style={{
            color: 'var(--foreground-subtle)',
            borderRadius: '2px'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = 'var(--background-secondary)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          Sign out →
        </button>
      </div>
    </nav>
  );
}
