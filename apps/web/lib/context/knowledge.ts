import { db, workspaces } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { WorkspaceMetadata, WorkspaceKnowledge } from "@/lib/db/schema";

export async function getWorkspaceKnowledge(
  workspaceId: string
): Promise<WorkspaceKnowledge | null> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!workspace?.metadata) {
    return null;
  }

  const metadata = workspace.metadata as WorkspaceMetadata;
  return metadata.knowledge || null;
}

async function updateWorkspaceKnowledge(
  workspaceId: string,
  updater: (current: WorkspaceKnowledge) => WorkspaceKnowledge
): Promise<void> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  const existingMetadata = (workspace?.metadata || {}) as WorkspaceMetadata;
  const existingKnowledge = existingMetadata.knowledge || {};

  const updatedKnowledge = updater(existingKnowledge);

  await db
    .update(workspaces)
    .set({
      metadata: {
        ...existingMetadata,
        knowledge: updatedKnowledge,
      },
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspaceId));
}

export async function rememberPerson(
  workspaceId: string,
  person: {
    shortName: string;
    fullName?: string;
    github?: string;
    linear?: string;
    role?: string;
    notes?: string;
  }
): Promise<{ success: boolean; message: string }> {
  try {
    const key = person.shortName.toLowerCase().replace(/\s+/g, "-");

    await updateWorkspaceKnowledge(workspaceId, (current) => ({
      ...current,
      people: {
        ...current.people,
        [key]: {
          name: person.fullName || person.shortName,
          github: person.github,
          linear: person.linear,
          role: person.role,
          notes: person.notes,
        },
      },
    }));

    const details: string[] = [];
    if (person.github) details.push(`github: @${person.github}`);
    if (person.linear) details.push(`linear: ${person.linear}`);
    if (person.role) details.push(`works on: ${person.role}`);

    return {
      success: true,
      message: `got it! i'll remember ${person.shortName}${details.length > 0 ? ` (${details.join(", ")})` : ""}`,
    };
  } catch (error) {
    console.error("Error remembering person:", error);
    return {
      success: false,
      message: "couldn't save that, try again?",
    };
  }
}

export async function rememberRepo(
  workspaceId: string,
  shortcut: string,
  fullName: string
): Promise<{ success: boolean; message: string }> {
  try {
    const key = shortcut.toLowerCase().replace(/\s+/g, "-").replace(/^the-/, "");

    await updateWorkspaceKnowledge(workspaceId, (current) => ({
      ...current,
      repos: {
        ...current.repos,
        [key]: fullName,
      },
    }));

    return {
      success: true,
      message: `got it! "${shortcut}" → ${fullName}`,
    };
  } catch (error) {
    console.error("Error remembering repo:", error);
    return {
      success: false,
      message: "couldn't save that, try again?",
    };
  }
}

export async function rememberProject(
  workspaceId: string,
  name: string,
  project: {
    description?: string;
    linearTeam?: string;
    githubRepo?: string;
  }
): Promise<{ success: boolean; message: string }> {
  try {
    const key = name.toLowerCase().replace(/\s+/g, "-");

    await updateWorkspaceKnowledge(workspaceId, (current) => ({
      ...current,
      projects: {
        ...current.projects,
        [key]: project,
      },
    }));

    return {
      success: true,
      message: `got it! i'll remember the ${name} project`,
    };
  } catch (error) {
    console.error("Error remembering project:", error);
    return {
      success: false,
      message: "couldn't save that, try again?",
    };
  }
}

export async function updateWorkspaceNotes(
  workspaceId: string,
  notes: string
): Promise<void> {
  await updateWorkspaceKnowledge(workspaceId, (current) => ({
    ...current,
    notes,
  }));
}

export function resolvePersonReference(
  knowledge: WorkspaceKnowledge | null,
  reference: string
): { github?: string; linear?: string; name?: string } | null {
  if (!knowledge?.people) return null;

  const key = reference.toLowerCase().replace(/\s+/g, "-");

  // Direct match
  if (knowledge.people[key]) {
    return knowledge.people[key];
  }

  // Partial match
  for (const [personKey, person] of Object.entries(knowledge.people)) {
    if (
      personKey.includes(key) ||
      person.name.toLowerCase().includes(key) ||
      person.github?.toLowerCase() === key
    ) {
      return person;
    }
  }

  return null;
}

export function resolveRepoReference(
  knowledge: WorkspaceKnowledge | null,
  reference: string
): string | null {
  if (!knowledge?.repos) return null;

  const key = reference.toLowerCase().replace(/\s+/g, "-").replace(/^the-/, "");

  // Direct match
  if (knowledge.repos[key]) {
    return knowledge.repos[key];
  }

  // Partial match
  for (const [repoKey, fullName] of Object.entries(knowledge.repos)) {
    if (repoKey.includes(key) || key.includes(repoKey)) {
      return fullName;
    }
  }

  return null;
}
