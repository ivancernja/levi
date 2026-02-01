import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <main className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold mb-4">Levi</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
          The multiplayer AI for teams
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="px-6 py-3 bg-black text-white dark:bg-white dark:text-black rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="px-6 py-3 border border-gray-300 dark:border-gray-700 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
          >
            Start free trial
          </Link>
        </div>
      </main>
    </div>
  );
}
