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
  const response = await call(url.pathname + url.search, {
    method: "PUT",
    headers: { "Content-Type": photo.type },
    body: new Blob([photo.bytes], { type: photo.type }),
  });
  if (!response.ok) {
    // Never log the signed URL: its query grants access to this upload.
    // The connector authenticates API calls but currently routes www uploads
    // to api.linkedin.com. Do not bypass it or drop the approved photo.
    const body = await response.text();
    if (url.hostname === "www.linkedin.com" && [404, 405].includes(response.status)) {
      console.error(`LinkedIn photo transfer failed [${response.status}]: upload-host routing unavailable`);
      throw new Error(`Post not published — LinkedIn photo upload failed [${response.status}]. The LinkedIn connection cannot currently reach its authenticated photo-upload address. Your approved draft and photo are retained; reconnecting will not fix this upload-routing failure.`);
    }
    // Provider bodies may contain signed upload URLs; keep those out of logs/UI.
    console.error(`LinkedIn photo transfer failed [${response.status}]; provider returned ${body ? 'an error body' : 'no error body'}`);
    throw new Error(`Post not published — LinkedIn photo upload failed [${response.status}]. Your approved draft and photo are retained.`);
  }
  return response;
}