import { describe, expect, it } from "vitest";
import { mergeResolvedAssets } from "@/lib/asset-resolution";

function asset(id: string, name: string) {
  return { id, name } as any;
}

describe("generation asset resolution", () => {
  it("keeps explicit asset ids ahead of matching @ mentions", () => {
    const explicit = asset("local_asset", "参考图");
    const stale = asset("old_bucket_asset", "参考图");

    expect(mergeResolvedAssets([explicit], [stale], ["参考图"])).toEqual([
      explicit
    ]);
  });

  it("appends unresolved @ mentions after explicit assets", () => {
    const explicit = asset("video_1", "视频");
    const image = asset("image_1", "参考图");

    expect(mergeResolvedAssets([explicit], [image], ["参考图"])).toEqual([
      explicit,
      image
    ]);
  });
});
