/** Transfer image bytes through the user's authenticated LinkedIn connection. */
export async function uploadLinkedInImage(
  uploadUrl: string,
  photo: { bytes: Uint8Array<ArrayBuffer>; type: string },
  call: (address: string, init: RequestInit) => Promise<Response>,
): Promise<Response> {
  const url = new URL(uploadUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !["www.linkedin.com", "api.linkedin.com"].includes(url.hostname) || !/^\/(?:dms-uploads|mediaUpload)\//.test(url.pathname)) {
    throw new Error("LinkedIn returned an unexpected photo upload address.");
  }
  const response = await call(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": photo.type },
    body: new Blob([photo.bytes], { type: photo.type }),
  });
  if (!response.ok) {
    // Never log the signed URL: its query grants access to this upload.
    const body = await response.text();
    // Provider bodies may contain signed upload URLs; keep those out of logs/UI.
    console.error(`LinkedIn photo transfer failed [${response.status}]; provider returned ${body ? 'an error body' : 'no error body'}`);
    throw new Error(`Post not published, LinkedIn photo upload failed [${response.status}]. Your approved draft and photo are retained.`);
  }
  return response;
}