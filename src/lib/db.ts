import mongoose from "mongoose";
import { ensureDatabaseSeeded } from "@/lib/db-seed";

const MONGODB_URI = process.env.MONGODB_URI;

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

let cached: MongooseCache = global.mongooseCache || { conn: null, promise: null };

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

export async function connectToDatabase(): Promise<typeof mongoose | null> {
  if (!MONGODB_URI || MONGODB_URI.includes("placeholder") || MONGODB_URI.includes("<username>")) {
    // Database credentials not configured yet (Demo mode)
    return null;
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      return mongooseInstance;
    }).catch((err) => {
      console.warn("MongoDB connection failed, operating in mock fallback mode:", err.message);
      return null as any;
    });
  }

  try {
    cached.conn = await cached.promise;
    if (cached.conn) {
      await ensureDatabaseSeeded();
    }
  } catch (e) {
    cached.promise = null;
    return null;
  }

  return cached.conn;
}

