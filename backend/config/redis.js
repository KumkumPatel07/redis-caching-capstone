const { createClient } = require("redis");

class InMemoryRedis {
    constructor() {
        this.store = new Map(); // key -> { value, expiresAt }
        this.isOpen = true;
    }

    on(event, handler) {
        // Event listener stub
    }

    async connect() {
        this.isOpen = true;
        return true;
    }

    async disconnect() {
        this.isOpen = false;
        return true;
    }

    async quit() {
        this.isOpen = false;
        return true;
    }

    _isExpired(item) {
        if (!item) return true;
        if (item.expiresAt && Date.now() > item.expiresAt) {
            return true;
        }
        return false;
    }

    async get(key) {
        const item = this.store.get(key);
        if (!item) return null;
        if (this._isExpired(item)) {
            this.store.delete(key);
            return null;
        }
        return item.value;
    }

    async setEx(key, ttlSeconds, value) {
        const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
        this.store.set(key, { value, expiresAt, ttlSeconds });
        return "OK";
    }

    async set(key, value) {
        this.store.set(key, { value, expiresAt: null, ttlSeconds: -1 });
        return "OK";
    }

    async del(key) {
        return this.store.delete(key) ? 1 : 0;
    }

    async keys(pattern = "*") {
        const now = Date.now();
        const result = [];
        for (const [key, item] of this.store.entries()) {
            if (item.expiresAt && now > item.expiresAt) {
                this.store.delete(key);
            } else {
                result.push(key);
            }
        }
        return result;
    }

    async ttl(key) {
        const item = this.store.get(key);
        if (!item) return -2;
        if (this._isExpired(item)) {
            this.store.delete(key);
            return -2;
        }
        if (!item.expiresAt) return -1;
        return Math.max(0, Math.ceil((item.expiresAt - Date.now()) / 1000));
    }

    async flushDb() {
        this.store.clear();
        return "OK";
    }
}

let activeRedisClient = new InMemoryRedis();
let isUsingRealRedis = false;

// Only attempt real Redis if REDIS_URL is explicitly set and not localhost/empty
const redisUrl = process.env.REDIS_URL && process.env.REDIS_URL.trim();
if (redisUrl && !redisUrl.includes("localhost") && !redisUrl.includes("127.0.0.1")) {
    try {
        const client = createClient({
            url: redisUrl,
            socket: {
                connectTimeout: 2000,
                reconnectStrategy: false // Do not loop reconnect if unavailable
            }
        });

        client.on("error", (error) => {
            console.warn("[Redis] Connection error, using in-memory store:", error.message);
            activeRedisClient = new InMemoryRedis();
            isUsingRealRedis = false;
        });

        activeRedisClient = client;
        isUsingRealRedis = true;
    } catch (err) {
        console.warn("[Redis] Client creation failed, using in-memory store:", err.message);
        activeRedisClient = new InMemoryRedis();
        isUsingRealRedis = false;
    }
} else {
    console.log("[Redis] Using fast in-memory Redis cache store");
}

const redisClient = new Proxy({}, {
    get(target, prop) {
        if (typeof activeRedisClient[prop] === "function") {
            return async function (...args) {
                try {
                    return await activeRedisClient[prop](...args);
                } catch (err) {
                    console.warn(`[Redis] Method ${prop} failed, falling back to in-memory:`, err.message);
                    activeRedisClient = new InMemoryRedis();
                    isUsingRealRedis = false;
                    if (typeof activeRedisClient[prop] === "function") {
                        return await activeRedisClient[prop](...args);
                    }
                    return null;
                }
            };
        }
        return activeRedisClient[prop];
    }
});

async function connectRedis() {
    if (!isUsingRealRedis) {
        return;
    }
    try {
        if (!activeRedisClient.isOpen) {
            await activeRedisClient.connect();
            console.log("[Redis] Connected to external Redis instance");
        }
    } catch (error) {
        console.warn("[Redis] Failed to connect to external Redis, falling back to in-memory store:", error.message);
        activeRedisClient = new InMemoryRedis();
        isUsingRealRedis = false;
    }
}

module.exports = {
    redisClient,
    connectRedis
};
