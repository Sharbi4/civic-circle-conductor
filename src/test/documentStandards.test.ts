import { describe, expect, it } from "vitest";
import { documentPhotoQuery, reusablePhotoLicense, safeWikimediaPhoto } from "@/lib/documentStandards";

describe("real document photography", () => {
  it("uses the actual document location instead of an unrelated generic image", () => {
    expect(documentPhotoQuery("Community spotlight", "Engaging Tucson residents")).toBe("Tucson city");
  });
  it("accepts real Wikimedia raster photos but rejects untrusted URLs and illustrations", () => {
    expect(safeWikimediaPhoto("https://upload.wikimedia.org/wikipedia/commons/a/ab/Tucson.jpg")).toBe(true);
    expect(safeWikimediaPhoto("https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Tucson.jpg/1200px-Tucson.jpg?utm_source=commons")).toBe(true);
    expect(safeWikimediaPhoto("https://example.com/generated.jpg")).toBe(false);
    expect(safeWikimediaPhoto("https://upload.wikimedia.org/map.svg")).toBe(false);
    expect(safeWikimediaPhoto("http://upload.wikimedia.org/photo.jpg")).toBe(false);
  });
  it("requires reusable licensing, not all-rights-reserved imagery", () => {
    expect(reusablePhotoLicense("CC BY-SA 4.0")).toBe(true);
    expect(reusablePhotoLicense("Public domain")).toBe(true);
    expect(reusablePhotoLicense("All rights reserved")).toBe(false);
    expect(reusablePhotoLicense("")).toBe(false);
  });
});