import mongoose from 'mongoose';
import { validateEnv } from './env-validation';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
   
  var mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongoose || { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

// Validate environment variables on first import (only in production)
if (process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
  // Throw so the server fails fast rather than serving requests with a broken config.
  validateEnv();
}

async function connectDB(): Promise<typeof mongoose> {
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      // Limit pool size for serverless environments where each invocation may open a new connection.
      // Without a cap, a traffic spike can exhaust MongoDB Atlas's free-tier connection limit (500).
      maxPoolSize: 10,
      // Fail in seconds rather than holding requests until the function is killed. When the cluster
      // throttles, the driver's defaults (30 s to find a server, no limit on the rest) let them pile up.
      // socketTimeoutMS is long enough for one slow report or cron query: it limits a single
      // operation's wait, not a whole job.
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      waitQueueTimeoutMS: 10_000,
      socketTimeoutMS: 60_000,
      maxIdleTimeMS: 60_000,
      // In production every cold start would otherwise send createIndex for every model's
      // indexes (and createCollection per model), each one a billed operation. Indexes are
      // built by `pnpm db:indexes` instead; run it after deploying a schema index change.
      autoIndex: process.env.NODE_ENV !== 'production',
      autoCreate: process.env.NODE_ENV !== 'production',
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectDB;

