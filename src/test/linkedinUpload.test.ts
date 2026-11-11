import { describe, expect, it, vi } from "vitest";
import { uploadLinkedInImage } from "@/lib/linkedinUpload.server";

describe("LinkedIn photo transfer", () => {
  it("reports the confirmed wrong-host 405 and does not claim publication", async () => {
    const call = vi.fn(async () => new Response('Method Not Allowed', { status: 405 }));
    await expect(uploadLinkedInImage("https://www.linkedin.com/dms-uploads/photo?signature=test", { bytes: new Uint8Array([1]), type: "image/jpeg" }, call)).rejects.toThrow("Post not published");
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("uses PUT, preserves the signed query, and sends the original bytes through the connection", async () => {
    const call = vi.fn(async (_path: string, _init: RequestInit) => new Response(null, { status: 201 }));
    const photo = { bytes: new Uint8Array([1, 2, 3]), type: "image/jpeg" };
    const response = await uploadLinkedInImage("https://www.linkedin.com/dms-uploads/photo?sync=1&signature=test", photo, call);
    expect(response.status).toBe(201);
    const attempt = call.mock.calls[0];
    expect(attempt).toBeDefined();
    if (!attempt) throw new Error("Upload was not called");
    const [path, init] = attempt;
    expect(path).toBe("/dms-uploads/photo?sync=1&signature=test");
    expect(init.method).toBe("PUT");
    const transferred = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) resolve(reader.result);
        else reject(new Error("Expected image bytes"));
      };
      reader.readAsArrayBuffer(init.body as Blob);
    });
    expect(new Uint8Array(transferred)).toEqual(photo.bytes);
  });
  it("rejects upload addresses outside LinkedIn before sending anything", async () => {
    const call = vi.fn();
    await expect(uploadLinkedInImage("https://example.com/upload", { bytes: new Uint8Array([1]), type: "image/jpeg" }, call)).rejects.toThrow("unexpected");
    expect(call).not.toHaveBeenCalled();
  });
});