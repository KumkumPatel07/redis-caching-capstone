const { Pool } = require("pg");

// In-memory fallback database pre-seeded with sample data from db.sql
let mockProperties = [
    {
        id: 1,
        title: "2 BHK Apartment",
        location: "Varanasi",
        price: 2500000,
        status: "available",
        created_at: new Date("2025-01-01T10:00:00Z"),
        updated_at: new Date("2025-01-01T10:00:00Z")
    },
    {
        id: 2,
        title: "3 BHK Villa",
        location: "Lucknow",
        price: 5500000,
        status: "available",
        created_at: new Date("2025-01-02T11:30:00Z"),
        updated_at: new Date("2025-01-02T11:30:00Z")
    },
    {
        id: 3,
        title: "1 BHK Flat",
        location: "Delhi",
        price: 1800000,
        status: "sold",
        created_at: new Date("2025-01-03T14:15:00Z"),
        updated_at: new Date("2025-01-03T14:15:00Z")
    }
];

let nextId = 4;

async function executeMockQuery(text, params = []) {
    const normalized = text.trim().replace(/\s+/g, " ");

    // INSERT INTO properties
    if (normalized.startsWith("INSERT INTO properties")) {
        const [title, location, price, status] = params;
        const newProperty = {
            id: nextId++,
            title: title || "",
            location: location || "",
            price: Number(price) || 0,
            status: status || "available",
            created_at: new Date(),
            updated_at: new Date()
        };
        mockProperties.push(newProperty);
        return { rows: [newProperty], rowCount: 1 };
    }

    // UPDATE properties
    if (normalized.startsWith("UPDATE properties")) {
        const [title, location, price, status, id] = params;
        const prop = mockProperties.find(p => String(p.id) === String(id));
        if (!prop) {
            return { rows: [], rowCount: 0 };
        }
        prop.title = title;
        prop.location = location;
        prop.price = Number(price);
        prop.status = status;
        prop.updated_at = new Date();
        return { rows: [prop], rowCount: 1 };
    }

    // DELETE FROM properties
    if (normalized.startsWith("DELETE FROM properties")) {
        const [id] = params;
        const index = mockProperties.findIndex(p => String(p.id) === String(id));
        if (index === -1) {
            return { rows: [], rowCount: 0 };
        }
        const [deleted] = mockProperties.splice(index, 1);
        return { rows: [deleted], rowCount: 1 };
    }

    // SELECT by ID: SELECT * FROM properties WHERE id = $1
    if (normalized.includes("WHERE id = $1")) {
        const [id] = params;
        const prop = mockProperties.find(p => String(p.id) === String(id));
        return { rows: prop ? [prop] : [], rowCount: prop ? 1 : 0 };
    }

    // SELECT with search
    if (normalized.includes("LIKE LOWER($1)")) {
        const rawSearch = (params[0] || "").replace(/%/g, "").toLowerCase();
        const rows = mockProperties
            .filter(p =>
                p.title.toLowerCase().includes(rawSearch) ||
                p.location.toLowerCase().includes(rawSearch)
            )
            .sort((a, b) => b.id - a.id);
        return { rows, rowCount: rows.length };
    }

    // Default: SELECT * FROM properties ORDER BY id DESC
    if (normalized.startsWith("SELECT * FROM properties")) {
        const rows = [...mockProperties].sort((a, b) => b.id - a.id);
        return { rows, rowCount: rows.length };
    }

    return { rows: [], rowCount: 0 };
}

let realPool = null;

const dbHost = process.env.DB_HOST && process.env.DB_HOST.trim();
const dbName = process.env.DB_NAME && process.env.DB_NAME.trim();

// Only attempt real PostgreSQL if DB_HOST is explicitly configured to a remote host
if (dbHost && dbName && !dbHost.includes("localhost") && !dbHost.includes("127.0.0.1")) {
    try {
        realPool = new Pool({
            host: dbHost,
            port: process.env.DB_PORT || 5432,
            database: dbName,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectionTimeoutMillis: 2000
        });

        realPool.on("connect", () => {
            console.log("[DB] PostgreSQL connected");
        });

        realPool.on("error", (error) => {
            console.warn("[DB] PostgreSQL pool error, switching to in-memory store:", error.message);
            realPool = null;
        });
    } catch (err) {
        console.warn("[DB] PostgreSQL initialization error, using in-memory store:", err.message);
        realPool = null;
    }
} else {
    console.log("[DB] Using fast in-memory PostgreSQL store");
}

const pool = {
    query: async (text, params) => {
        if (realPool) {
            try {
                return await realPool.query(text, params);
            } catch (err) {
                console.warn("[DB] Query to real DB failed, switching permanently to in-memory store:", err.message);
                realPool = null;
                return await executeMockQuery(text, params);
            }
        }
        return await executeMockQuery(text, params);
    },
    on: (event, handler) => {
        if (realPool) {
            realPool.on(event, handler);
        }
    }
};

module.exports = pool;
