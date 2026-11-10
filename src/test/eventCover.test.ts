import { describe, it, expect } from "vitest";
import { bannerCrop, imageSize } from "@/lib/eventCover.server";

describe("Eventbrite cover crop", () => {
  it("crops a tall photo to a centered 2:1 banner", () => {
    expect(bannerCrop(1000, 1000)).toEqual({ top_left: { x: 0, y: 250 }, width: 1000, height: 500 });
  });
  it("crops a very wide photo to 2:1", () => {
    expect(bannerCrop(3000, 1000)).toEqual({ top_left: { x: 500, y: 0 }, width: 2000, height: 1000 });
  });
  it("reads PNG size from the header", () => {
    const b = new Uint8Array(24); b.set([0x89, 0x50, 0x4e, 0x47]); b.set([0, 0, 4, 0], 16); b.set([0, 0, 2, 0], 20);
    expect(imageSize(b)).toEqual({ width: 1024, height: 512 });
  });
});
