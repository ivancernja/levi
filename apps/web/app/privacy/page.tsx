export default function PrivacyPage() {
  return (
    <div className="min-h-screen p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        Last updated: February 1, 2026
      </p>

      <div className="space-y-6">
        <section>
          <h2 className="text-xl font-semibold mb-2">Information We Collect</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Levi collects information you provide when connecting integrations (Slack, Linear, GitHub, Notion)
            including OAuth tokens, workspace identifiers, and conversation content necessary to provide our service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">How We Use Your Information</h2>
          <p className="text-gray-700 dark:text-gray-300">
            We use your information solely to provide the Levi service - processing messages,
            executing approved actions, and maintaining conversation context across your connected tools.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Data Storage</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Your data is stored securely on Vercel infrastructure and Neon PostgreSQL databases.
            OAuth tokens are stored encrypted. We do not sell or share your data with third parties.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Data Deletion</h2>
          <p className="text-gray-700 dark:text-gray-300">
            You can disconnect integrations at any time from your dashboard.
            To delete your account and all associated data, contact support.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Contact</h2>
          <p className="text-gray-700 dark:text-gray-300">
            For privacy concerns, contact us at privacy@levi.so
          </p>
        </section>
      </div>
    </div>
  );
}
