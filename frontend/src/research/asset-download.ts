/** Download the whole original file or one server-selected molecular record. */
export function assetDownloadUrl(id: string, record?: number) {
  const path = `/api/assets/${encodeURIComponent(id)}`;
  return record === undefined ? path : `${path}?record=${record}`;
}
