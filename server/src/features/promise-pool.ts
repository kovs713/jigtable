export async function mapConcurrent<TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  if (concurrency < 1) {
    throw new Error("Concurrency must be greater than 0")
  }

  const results = new Array<TOutput>(items.length)

  let nextIndex = 0

  async function worker() {
    while (true) {
      const index = nextIndex
      nextIndex += 1

      if (index >= items.length) {
        return
      }

      const item = items[index]

      if (item === undefined) {
        throw new Error(`Missing item at index ${index}`)
      }

      results[index] = await mapper(item, index)
    }
  }

  const workerCount = Math.min(concurrency, items.length)

  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return results
}
