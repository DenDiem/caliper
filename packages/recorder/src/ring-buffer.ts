export interface RingBuffer<T> {
  push(item: T): void;
  setCapacity(next: number): void;
  drain(): T[];
  readonly size: number;
}

// Capacity 0 is the resting state. The collectors are installed on every page from document_start —
// the devtools hook has to exist before the app bootstraps — so until a trace actually starts, every
// intercepted call must cost no more than one push into nothing.
export const createRingBuffer = <T>(capacity: number): RingBuffer<T> => {
  let items: T[] = [];
  let limit = Math.max(0, capacity);

  const trim = (): void => {
    if (items.length > limit) items = items.slice(items.length - limit);
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
    drain(): T[] {
      const drained = items;
      items = [];
      return drained;
    },
    get size(): number {
      return items.length;
    },
  };
};
