import { Client } from "@notionhq/client";
import type {
  PageObjectResponse,
  DatabaseObjectResponse,
  BlockObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { db, integrations } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export async function getNotionClient(
  workspaceId: string
): Promise<Client | null> {
  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.type, "notion")
    ),
  });

  if (!integration) {
    return null;
  }

  return new Client({
    auth: integration.accessToken,
  });
}

export async function getNotionIntegration(workspaceId: string) {
  return db.query.integrations.findFirst({
    where: and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.type, "notion")
    ),
  });
}

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  createdTime: string;
  lastEditedTime: string;
  createdBy: string | null;
  lastEditedBy: string | null;
  parent: {
    type: "database" | "page" | "workspace";
    id?: string;
  };
  properties: Record<string, unknown>;
}

export interface NotionPageWithContent extends NotionPage {
  content: string;
}

export interface NotionDatabase {
  id: string;
  title: string;
  url: string;
  createdTime: string;
  lastEditedTime: string;
  properties: Record<string, { type: string; name: string }>;
}

export interface NotionDatabaseItem {
  id: string;
  url: string;
  createdTime: string;
  lastEditedTime: string;
  properties: Record<string, unknown>;
}

function extractTitle(page: PageObjectResponse): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === "title" && prop.title.length > 0) {
      return prop.title.map((t: RichTextItemResponse) => t.plain_text).join("");
    }
  }
  return "Untitled";
}

function extractRichText(richText: RichTextItemResponse[]): string {
  return richText.map(t => t.plain_text).join("");
}

function extractBlockContent(block: BlockObjectResponse): string {
  const type = block.type;

  switch (type) {
    case "paragraph":
      return extractRichText(block.paragraph.rich_text);
    case "heading_1":
      return `# ${extractRichText(block.heading_1.rich_text)}`;
    case "heading_2":
      return `## ${extractRichText(block.heading_2.rich_text)}`;
    case "heading_3":
      return `### ${extractRichText(block.heading_3.rich_text)}`;
    case "bulleted_list_item":
      return `• ${extractRichText(block.bulleted_list_item.rich_text)}`;
    case "numbered_list_item":
      return `1. ${extractRichText(block.numbered_list_item.rich_text)}`;
    case "to_do":
      const checked = block.to_do.checked ? "☑" : "☐";
      return `${checked} ${extractRichText(block.to_do.rich_text)}`;
    case "toggle":
      return extractRichText(block.toggle.rich_text);
    case "code":
      return `\`\`\`${block.code.language}\n${extractRichText(block.code.rich_text)}\n\`\`\``;
    case "quote":
      return `> ${extractRichText(block.quote.rich_text)}`;
    case "callout":
      return `💡 ${extractRichText(block.callout.rich_text)}`;
    case "divider":
      return "---";
    default:
      return "";
  }
}

export async function searchNotionPages(
  workspaceId: string,
  query: string,
  options: {
    limit?: number;
    filter?: "page" | "database";
  } = {}
): Promise<NotionPage[]> {
  const notion = await getNotionClient(workspaceId);
  if (!notion) return [];

  const { limit = 10, filter } = options;

  try {
    const response = await notion.search({
      query,
      page_size: limit,
      filter: filter ? { property: "object", value: filter } : undefined,
      sort: {
        direction: "descending",
        timestamp: "last_edited_time",
      },
    });

    return response.results
      .filter((result): result is PageObjectResponse => result.object === "page" && "properties" in result)
      .map(page => ({
        id: page.id,
        title: extractTitle(page),
        url: page.url,
        createdTime: page.created_time,
        lastEditedTime: page.last_edited_time,
        createdBy: page.created_by.id,
        lastEditedBy: page.last_edited_by.id,
        parent: page.parent.type === "database_id"
          ? { type: "database" as const, id: page.parent.database_id }
          : page.parent.type === "page_id"
            ? { type: "page" as const, id: page.parent.page_id }
            : { type: "workspace" as const },
        properties: page.properties as Record<string, unknown>,
      }));
  } catch (error) {
    console.error("Notion search pages error:", error);
    return [];
  }
}

export async function getNotionPage(
  workspaceId: string,
  pageId: string,
  options: {
    includeContent?: boolean;
  } = {}
): Promise<NotionPageWithContent | null> {
  const notion = await getNotionClient(workspaceId);
  if (!notion) return null;

  const { includeContent = true } = options;

  try {
    const page = await notion.pages.retrieve({ page_id: pageId });

    if (!("properties" in page)) {
      return null;
    }

    let content = "";
    if (includeContent) {
      const blocks = await notion.blocks.children.list({
        block_id: pageId,
        page_size: 100,
      });

      content = blocks.results
        .filter((block): block is BlockObjectResponse => "type" in block)
        .map(extractBlockContent)
        .filter(Boolean)
        .join("\n\n");
    }

    return {
      id: page.id,
      title: extractTitle(page),
      url: page.url,
      createdTime: page.created_time,
      lastEditedTime: page.last_edited_time,
      createdBy: page.created_by.id,
      lastEditedBy: page.last_edited_by.id,
      parent: page.parent.type === "database_id"
        ? { type: "database" as const, id: page.parent.database_id }
        : page.parent.type === "page_id"
          ? { type: "page" as const, id: page.parent.page_id }
          : { type: "workspace" as const },
      properties: page.properties as Record<string, unknown>,
      content,
    };
  } catch (error) {
    console.error("Notion get page error:", error);
    return null;
  }
}

export async function getNotionDatabase(
  workspaceId: string,
  databaseId: string
): Promise<NotionDatabase | null> {
  const notion = await getNotionClient(workspaceId);
  if (!notion) return null;

  try {
    const database = await notion.databases.retrieve({ database_id: databaseId });

    if (!("properties" in database) || !("title" in database)) {
      return null;
    }

    let titleFromProperty = "Untitled";
    for (const prop of Object.values(database.properties)) {
      if (prop.type === "title") {
        titleFromProperty = prop.name;
        break;
      }
    }

    return {
      id: database.id,
      title: database.title.map((t: { plain_text: string }) => t.plain_text).join("") || titleFromProperty,
      url: database.url,
      createdTime: database.created_time,
      lastEditedTime: database.last_edited_time,
      properties: Object.fromEntries(
        Object.entries(database.properties).map(([key, prop]) => [
          key,
          { type: prop.type, name: prop.name },
        ])
      ),
    };
  } catch (error) {
    console.error("Notion get database error:", error);
    return null;
  }
}

export async function getNotionDatabaseItems(
  workspaceId: string,
  databaseId: string,
  options: {
    limit?: number;
    filter?: Record<string, unknown>;
    sorts?: Array<{ property: string; direction: "ascending" | "descending" }>;
  } = {}
): Promise<NotionDatabaseItem[]> {
  const notion = await getNotionClient(workspaceId);
  if (!notion) return [];

  const { limit = 50, filter, sorts } = options;

  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: limit,
      filter: filter as Parameters<typeof notion.databases.query>[0]["filter"],
      sorts: sorts?.map(s => ({
        property: s.property,
        direction: s.direction,
      })),
    });

    return response.results
      .filter((result): result is PageObjectResponse => "properties" in result)
      .map(item => ({
        id: item.id,
        url: item.url,
        createdTime: item.created_time,
        lastEditedTime: item.last_edited_time,
        properties: item.properties as Record<string, unknown>,
      }));
  } catch (error) {
    console.error("Notion get database items error:", error);
    return [];
  }
}

export async function listNotionDatabases(
  workspaceId: string,
  limit: number = 10
): Promise<NotionDatabase[]> {
  const notion = await getNotionClient(workspaceId);
  if (!notion) return [];

  try {
    const response = await notion.search({
      filter: { property: "object", value: "database" },
      page_size: limit,
      sort: {
        direction: "descending",
        timestamp: "last_edited_time",
      },
    });

    return response.results
      .filter((result): result is DatabaseObjectResponse =>
        result.object === "database" && "properties" in result
      )
      .map(database => {
        let titleFromProperty = "Untitled";
        for (const prop of Object.values(database.properties)) {
          if (prop.type === "title") {
            titleFromProperty = prop.name;
            break;
          }
        }

        return {
          id: database.id,
          title: database.title.map((t: { plain_text: string }) => t.plain_text).join("") || titleFromProperty,
          url: database.url,
          createdTime: database.created_time,
          lastEditedTime: database.last_edited_time,
          properties: Object.fromEntries(
            Object.entries(database.properties).map(([key, prop]) => [
              key,
              { type: prop.type, name: prop.name },
            ])
          ),
        };
      });
  } catch (error) {
    console.error("Notion list databases error:", error);
    return [];
  }
}
