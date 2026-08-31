export interface RingBuffer<T> {
  push(item: T): void;
  setCapacity(next: number): void;
  // Cleared when a new recording opens the buffer, so a second trace on the same page is not stamped
  // truncated because the first one overflowed.
  resetDropped(): void;
  drain(): T[];
  readonly size: number;
  // True once anything has been discarded. A trace that silently lost its earliest events would be read
  // by an agent as a complete account of the reproduction, which is worse than a short one.
  readonly dropped: boolean;
}

// Capacity 0 is the resting state. The collectors are installed on every page from document_start —
// the devtools hook has to exist before the app bootstraps — so until a trace actually starts, every
// intercepted call must cost no more than one push into nothing.
export const createRingBuffer = <T>(capacity: number): RingBuffer<T> => {
  let items: T[] = [];
  let limit = Math.max(0, capacity);
  let dropped = false;

  const trim = (): void => {
    if (items.length <= limit) return;
    // A trim while the buffer is closed (capacity 0, nothing recording) is not a loss.
    if (limit > 0) dropped = true;
    items = items.slice(items.length - limit);
  };

  return {
    push(item: T): void {
      if (limit === 0) return;
      items.push(item);
      trim();
    },
    setCapacity(next: number): void {
      limit = Math.max(0, next);
      trim();
    },
    resetDropped(): void {
      dropped = false;
    },
    drain(): T[] {
      const drained = items;
      items = [];
      return drained;
    },
    get size(): number {
      return items.length;
    },
    get dropped(): boolean {
      return dropped;
    },
  };
};
