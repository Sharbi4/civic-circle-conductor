const PREFIX = "civi-letterhead-reminder:";

export function hasSeenLetterheadReminder(storage: Storage, userId: string): boolean {
  return storage.getItem(`${PREFIX}${userId}`) !== null;
}

export function claimLetterheadReminder(storage: Storage, userId: string): boolean {
  const key = `${PREFIX}${userId}`;
  if (storage.getItem(key)) return false;
  storage.setItem(key, "shown");
  return true;
}

export function resetLetterheadReminders(storage: Storage) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX)) storage.removeItem(key);
  }
}