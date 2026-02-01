import { getNotionClient } from "./client";
import type { ActionResult } from "@/lib/actions/executor";

export async function executeNotionAction(
  workspaceId: string,
  type: "notion.page.update" | "notion.page.create",
  payload: Record<string, unknown>
): Promise<ActionResult> {
  const notion = await getNotionClient(workspaceId);
  if (!notion) {
    return { success: false, error: "Notion not connected" };
  }

  try {
    if (type === "notion.page.update") {
      const pageId = payload.pageId as string;
      const content = payload.content as string;

      // For updates, we append content as a new block
      // A full implementation would parse the content and handle updates more intelligently
      await notion.blocks.children.append({
        block_id: pageId,
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: content,
                  },
                },
              ],
            },
          },
        ],
      });

      return {
        success: true,
        data: { pageId },
        url: `https://notion.so/${pageId.replace(/-/g, "")}`,
      };
    }

    if (type === "notion.page.create") {
      const parentId = payload.parentId as string | undefined;
      const title = payload.title as string;
      const content = payload.content as string;

      if (!parentId) {
        return {
          success: false,
          error: "Parent page ID is required to create a Notion page",
        };
      }

      const page = await notion.pages.create({
        parent: { page_id: parentId },
        properties: {
          title: {
            title: [
              {
                type: "text",
                text: { content: title },
              },
            ],
          },
        },
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: { content },
                },
              ],
            },
          },
        ],
      });

      return {
        success: true,
        data: { pageId: page.id },
        url: `https://notion.so/${page.id.replace(/-/g, "")}`,
      };
    }

    return { success: false, error: "Unknown Notion action type" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Notion API error",
    };
  }
}
