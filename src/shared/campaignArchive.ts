const UPLOAD_URL_PATTERN = /\/uploads\/[A-Za-z0-9._-]+/g;

/** Collect every distinct uploaded-file URL in a serializable archive slice. */
export function collectUploadUrls(value: unknown): string[] {
  const serialized = JSON.stringify(value) ?? "";
  return [...new Set(serialized.match(UPLOAD_URL_PATTERN) ?? [])];
}

/**
 * Chat roll responses carry the id of the GM request message. Imported
 * messages get new ids, so rewrite the reference before storing the message.
 */
export function remapMessageRequestId(
  data: unknown,
  messageIds: ReadonlyMap<string, string>
): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const record = data as Record<string, unknown>;
  const requestId = record.requestId;
  if (typeof requestId !== "string" || !messageIds.has(requestId)) return data;
  return { ...record, requestId: messageIds.get(requestId) };
}
