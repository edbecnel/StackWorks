export type OnlineResumeIdentityRecord = {
  userId?: string;
  displayName?: string;
};

export function resumeRecordMatchesSignedInAccount(args: {
  record: OnlineResumeIdentityRecord;
  signedInUserId?: string | null;
  signedInDisplayName?: string | null;
}): boolean {
  const userId = typeof args.signedInUserId === "string" ? args.signedInUserId.trim() : "";
  const displayName = typeof args.signedInDisplayName === "string" ? args.signedInDisplayName.trim() : "";
  if (!userId && !displayName) return false;

  const recordUserId = typeof args.record.userId === "string" ? args.record.userId.trim() : "";
  if (userId) {
    return Boolean(recordUserId) && recordUserId === userId;
  }

  const recordDisplayName = typeof args.record.displayName === "string" ? args.record.displayName.trim() : "";
  if (!displayName || !recordDisplayName) return false;
  return recordDisplayName.toLowerCase() === displayName.toLowerCase();
}