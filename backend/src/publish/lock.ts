const locks = new Map<string, Promise<void>>();

export async function withTripLock<T>(tripId: string, fn: () => Promise<T>): Promise<T> {
  while (locks.has(tripId)) {
    await locks.get(tripId);
  }
  let release!: () => void;
  const p = new Promise<void>((r) => { release = r; });
  locks.set(tripId, p);
  try {
    return await fn();
  } finally {
    locks.delete(tripId);
    release();
  }
}
