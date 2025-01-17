/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Queue } from './queue';
import { RateLimitData, RequestData, Route } from './types';
import { getRouteInformation } from './util/routes';
import { OFFSET, ONE_DAY, ONE_SECOND, sleep } from './util/time';

export type Bucket = {
  key: string;
  lastRequest: number;
};

export interface BucketManager {
  list(): Promise<[string, Bucket][]>;
  has(key: string): Promise<boolean>;
  get(key: string): Promise<Bucket | undefined>;
  delete(key: string): Promise<void>;
  set(key: string, bucket: Bucket, ttl: number): Promise<void>;
}

export class DefaultBucketManager implements BucketManager {
  buckets = new Map<string, Bucket>();

  async list(): Promise<[string, Bucket][]> {
    return Array.from(this.buckets.entries());
  }
  async has(key: string): Promise<boolean> {
    return this.buckets.has(key);
  }
  async get(key: string): Promise<Bucket | undefined> {
    return this.buckets.get(key);
  }
  async delete(key: string): Promise<void> {
    this.buckets.delete(key);
  }
  async set(key: string, bucket: Bucket, ttl: number): Promise<void> {
    this.buckets.set(key, bucket);
  }
}

export type BucketManagerConfig = {
  bucketManager?: BucketManager;
};

export type Config = {
  api: string;
  cdn: string;
  headers: Record<string, string>;
  retries: number;
  timeout: number;
  userAgent: string;
  version: number;
  globalRequestsPerSecond: number;
};

export type Callbacks = {
  onBucketSweep?: (swept: Map<string, Bucket>) => void;
  onQueueSweep?: (swept: Map<string, Queue>) => void;
  onRateLimit?: (data: RateLimitData) => void;
  onRequest?: (parameters: Route, resource: string, init: RequestInit, retries: number) => void;
};

type Cache = {
  shutdownSignal?: AbortSignal;
  queueSweepInterval?: number;
  bucketSweepInterval?: number;
};

export type ManagerArgs = Partial<Config> & Cache & Callbacks & BucketManagerConfig;

export class Manager {
  #token: string | null = null;
  shutdownSignal?: AbortSignal | null;
  config: Config;

  globalDelay: Promise<void> | null = null;
  globalReset = -1;
  globalRequestCounter: number;

  buckets: BucketManager;
  queues: Map<string, Queue>;

  #bucketSweeper!: NodeJS.Timer;
  #queueSweeper!: NodeJS.Timer;

  bucketSweepInterval: number;
  queueSweepInterval: number;

  onBucketSweep?: Callbacks['onBucketSweep'];
  onQueueSweep?: Callbacks['onQueueSweep'];
  onRateLimit?: Callbacks['onRateLimit'];
  onRequest?: Callbacks['onRequest'];

  constructor({
    // Request Config
    api,
    version,
    cdn,
    headers,
    userAgent,
    retries,
    timeout,
    globalRequestsPerSecond,
    // Manager Options
    shutdownSignal,
    onBucketSweep,
    onQueueSweep,
    bucketSweepInterval,
    queueSweepInterval,
    onRateLimit,
    onRequest,
    bucketManager
  }: ManagerArgs) {
    this.config = {
      api: api ?? 'https://discord.com/api',
      version: version ?? 10,
      cdn: cdn ?? 'https://cdn.discordapp.com',
      headers: headers ?? {},
      userAgent: userAgent ?? `Basura/1.0`,
      retries: retries ?? 3,
      timeout: timeout ?? 15 * ONE_SECOND,
      globalRequestsPerSecond: globalRequestsPerSecond ?? 50
    };

    this.buckets = bucketManager ?? new DefaultBucketManager();
    this.queues = new Map();

    this.globalRequestCounter = this.config.globalRequestsPerSecond;

    this.bucketSweepInterval = bucketSweepInterval ?? 0;
    this.queueSweepInterval = queueSweepInterval ?? 0;
    this.onBucketSweep = onBucketSweep;
    this.onQueueSweep = onQueueSweep;
    this.onRateLimit = onRateLimit;
    this.onRequest = onRequest;

    this.shutdownSignal = shutdownSignal;
    // @ts-ignore https://nodejs.org/api/globals.html#abortsignalonabort
    this.shutdownSignal?.addEventListener('abort', this.shutdown.bind(this));

    this.startSweepers();
  }

  get globalTimeout() {
    return this.globalReset + OFFSET - Date.now();
  }

  startSweepers() {
    this.#startBucketSweep();
    this.#startQueueSweep();
  }

  async queue(data: RequestData) {
    const route = getRouteInformation(data.method, data.path);

    const key = `${data.method}:${route.path}`;
    const bucket = await this.#getBucket(key);
    const queue = this.#getBucketQueue(bucket, route.identifier);

    const { resource, init } = this.#resolve(data);

    return queue.add(route, resource, init);
  }

  setToken(token: string | null) {
    this.#token = token;
    return this;
  }

  async setGlobalDelay(retryAfter: number) {
    this.globalDelay = sleep(retryAfter, this.shutdownSignal).then(() => {
      this.globalDelay = null;
    });

    return this.globalDelay;
  }

  setShutdownSignal(signal: AbortSignal) {
    // @ts-ignore https://nodejs.org/api/globals.html#abortsignalonabort
    this.shutdownSignal?.removeEventListener('abort', this.shutdown.bind(this));
    this.shutdownSignal = signal;
    // @ts-ignore https://nodejs.org/api/globals.html#abortsignalonabort
    this.shutdownSignal.addEventListener('abort', this.shutdown.bind(this));
  }

  shutdown() {
    this.clearBucketSweeper();
    this.clearQueueSweeper();
  }

  clearBucketSweeper() {
    clearInterval(this.#bucketSweeper);
  }

  clearQueueSweeper() {
    clearInterval(this.#queueSweeper);
  }

  isGlobalLimited() {
    return this.globalRequestCounter <= 0 && Date.now() < this.globalReset;
  }

  #startBucketSweep() {
    if (this.bucketSweepInterval === 0) {
      return;
    }

    this.#bucketSweeper = setInterval(async () => {
      const swept = new Map<string, Bucket>();

      const buckets = await this.buckets.list();

      for (const [key, bucket] of buckets) {
        if (bucket.lastRequest === -1) {
          continue;
        }

        if (Math.floor(Date.now() - bucket.lastRequest) > ONE_DAY) {
          swept.set(key, bucket);
          console.debug({ message: `Swept bucket`, key });
          await this.buckets.delete(key);
        }
      }

      this.onBucketSweep?.(swept);
    }, this.bucketSweepInterval);
  }

  #startQueueSweep() {
    if (this.queueSweepInterval === 0) {
      return;
    }

    this.#queueSweeper = setInterval(() => {
      const swept = new Map<string, Queue>();

      for (const [key, queue] of this.queues.entries()) {
        if (queue.inactive) {
          console.debug({ message: `Swept queue`, key });
          swept.set(key, queue);
          this.queues.delete(key);
        }
      }

      this.onQueueSweep?.(swept);
    }, this.queueSweepInterval);
  }

  async #getBucket(key: string) {
    const bucket = await this.buckets.get(key);
    const newBucket: Bucket = {
      key: `Global(${key})`,
      lastRequest: -1
    };

    return bucket ?? newBucket;
  }

  #getBucketQueue(bucket: Bucket, primaryId: string) {
    const key = `${bucket.key}:${primaryId}`;

    if (this.queues.has(key)) {
      return this.queues.get(key)!;
    }

    return this.#createQueue(key);
  }

  #createQueue(key: string) {
    const queue = new Queue(this, key, this.shutdownSignal);
    this.queues.set(key, queue);

    return queue;
  }

  #resolve(data: RequestData) {
    const url = this.#getRequestURL(data);
    const headers = this.#getRequestHeaders(data);
    let body: RequestInit['body'];

    if (data.files != null) {
      headers.set('Content-Type', 'multipart/form-data');
      const formData = new FormData();

      for (const [index, file] of data.files.entries()) {
        formData.append(`files[${file.id ?? index}]`, file.data, file.name);
      }

      if (data.formData != null) {
        for (const [key, value] of data.formData.entries()) {
          formData.append(key, value);
        }
      }

      if (data.body != null) {
        formData.append('payload_json', JSON.stringify(data.body));
      }

      body = formData;
    } else if (data.body != null) {
      if (data.rawBody) {
        body = data.body as BodyInit;
      } else {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(data.body);
      }
    }

    const fetchOptions: RequestInit = {
      method: data.method,
      headers,
      body
    };

    return {
      resource: url,
      init: fetchOptions
    };
  }

  #getRequestURL(data: RequestData) {
    let url = this.config.api;

    if (data.versioned !== false) {
      url += `/v${this.config.version}`;
    }

    url += data.path;

    const query = data.query?.toString();
    if (query && query !== '') {
      url += `?${query}`;
    }

    return url;
  }

  #getRequestHeaders(data: RequestData) {
    const headers = new Headers();

    for (const [key, value] of [...Object.entries(this.config.headers), ...Object.entries(data.headers ?? [])]) {
      headers.set(key, value);
    }

    headers.set('User-Agent', this.config.userAgent.trim());

    if (data.auth !== false) {
      if (!this.#token) {
        throw new Error('Expected token to be set for this request, but none was present');
      }

      headers.set('Authorization', `${data.authPrefix ?? 'Bot'} ${this.#token}`);
    }

    if (data.reason != null) {
      headers.set('X-Audit-Log-Reason', encodeURIComponent(data.reason));
    }

    return headers;
  }
}
