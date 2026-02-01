export default function TermsPage() {
  return (
    <div className="min-h-screen p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Terms of Use</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        Last updated: February 1, 2026
      </p>

      <div className="space-y-6">
        <section>
          <h2 className="text-xl font-semibold mb-2">Acceptance of Terms</h2>
          <p className="text-gray-700 dark:text-gray-300">
            By using Levi, you agree to these terms. If you do not agree, do not use the service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Description of Service</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Levi is an AI-powered team agent that integrates with Slack, Linear, GitHub, and Notion
            to help automate workflows. Levi proposes actions that require your explicit approval before execution.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">User Responsibilities</h2>
          <p className="text-gray-700 dark:text-gray-300">
            You are responsible for reviewing and approving actions proposed by Levi.
            You must have appropriate permissions to connect integrations and authorize actions
            within your connected workspaces.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">API Keys and Credentials</h2>
          <p className="text-gray-700 dark:text-gray-300">
            You provide your own OpenRouter API key for AI functionality.
            You are responsible for any charges incurred through your API key usage.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Limitation of Liability</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Levi is provided &quot;as is&quot; without warranties. We are not liable for any damages
            arising from your use of the service or actions executed on your behalf.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Contact</h2>
          <p className="text-gray-700 dark:text-gray-300">
            For questions about these terms, contact us at legal@levi.so
          </p>
        </section>
      </div>
    </div>
  );
}
