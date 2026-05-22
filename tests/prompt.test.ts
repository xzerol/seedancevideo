import { describe, expect, it } from "vitest";
import { parseAssetMentions } from "@/lib/prompt";

describe("parseAssetMentions", () => {
  it("extracts unique Chinese and numbered asset mentions", () => {
    expect(
      parseAssetMentions("参考@视频1中的动作，生成@图片2和@图片2中的角色")
    ).toEqual(["视频1", "图片2"]);
  });
});
