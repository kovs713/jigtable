export interface RedisKeyValueClient {
  get(key: string): Promise<string | null>
  send(command: string, args: string[]): Promise<unknown>
  del(key: string): Promise<unknown>
}

export class RedisCache {
  constructor(
    private readonly redis: RedisKeyValueClient,
    private readonly namespace: string,
    private readonly ttlSeconds: number
  ) {}

  get(key: string): Promise<string | null> {
    return this.redis.get(this.key(key))
  }

  async set(key: string, value: string): Promise<void> {
    const redisKey = this.key(key)

    await this.redis.send("SET", [
      redisKey,
      value,
      "EX",
      String(this.ttlSeconds),
    ])
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.key(key))
  }

  private key(key: string): string {
    return `jigtable:${this.namespace}:${key}`
  }
}
