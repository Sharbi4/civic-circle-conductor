/** Transfer image bytes through the user's authenticated LinkedIn connection. */
export async function uploadLinkedInImage(
  uploadUrl: string,
  photo: { bytes: Uint8Array<ArrayBuffer>; type: string },
  call: (path: string, init: RequestInit) => Promise<Response>,
): Promise<Response> {
  const url = new URL(uploadUrl);
  if (url.protocol !== "https:" || !["www.linkedin.com", "api.linkedin.com"].includes(url.hostname)) {
    throw new Error("LinkedIn returned an unexpected photo upload address.");
  }
  return call(url.pathname + url.search, {
    method: "PUT",
    headers: { "Content-Type": photo.type },
    body: new Blob([photo.bytes], { type: photo.type }),
  });
}