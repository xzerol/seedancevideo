import { describe, expect, it } from "vitest";
import {
  edgeAssetIdsForNode,
  ensurePromptMentions,
  insertMentionAtCursor,
  mentionQueryAtCursor,
  nextNodePosition
} from "@/lib/canvas";

describe("canvas input source helpers", () => {
  it("derives upstream asset ids from incoming edges", () => {
    expect(
      edgeAssetIdsForNode(
        "target",
        [
          { id: "source", data: { assetId: "asset_1" } },
          { id: "target", data: {} }
        ],
        [{ id: "edge_1", source: "source", target: "target" }]
      )
    ).toEqual(["asset_1"]);
  });

  it("adds explicit @ mentions for connected assets", () => {
    expect(
      ensurePromptMentions("让角色跳舞", [
        { name: "人物1" } as any,
        { name: "图片2" } as any
      ])
    ).toBe("让角色跳舞 @人物1 @图片2");
  });

  it("detects and replaces @ mention queries at the cursor", () => {
    expect(mentionQueryAtCursor("参考 @图", 5)).toEqual({
      query: "图",
      start: 3,
      end: 5
    });
    expect(insertMentionAtCursor("参考 @图 做视频", 5, "图片1").prompt).toBe(
      "参考 @图片1  做视频"
    );
  });

  it("detects @ mention queries in the middle or end of Chinese text", () => {
    expect(mentionQueryAtCursor("参考@图", 4)).toEqual({
      query: "图",
      start: 2,
      end: 4
    });
    expect(mentionQueryAtCursor("参考动作@", 5)).toEqual({
      query: "",
      start: 4,
      end: 5
    });
    expect(insertMentionAtCursor("参考@图做视频", 4, "图片1").prompt).toBe(
      "参考@图片1 做视频"
    );
  });

  it("places new nodes near selected nodes or viewport center", () => {
    expect(nextNodePosition({ x: 100, y: 200 }, { x: 10, y: 10 }, 1)).toEqual({
      x: 544,
      y: 218
    });
    expect(nextNodePosition(null, { x: 300, y: 240 }, 0)).toEqual({
      x: 300,
      y: 240
    });
  });
});
