export async function runWithConcurrency(items, limit, worker) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (nextIndex < items.length) {
      const current = items[nextIndex++];
      await worker(current);
    }
  });
  await Promise.all(workers);
}
