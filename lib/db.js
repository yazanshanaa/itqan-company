const { MongoClient } = require('mongodb');
let cachedDb = null;
let cachedClient = null;
async function connectToDatabase() {
    if (cachedDb && cachedClient) return { db: cachedDb, client: cachedClient };
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
    const client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10, minPoolSize: 5 });
    try {
          await client.connect();
          const db = client.db('itqan');
          await db.admin().ping();
          cachedDb = db;
          cachedClient = client;
          console.log('Connected to MongoDB');
          return { db, client };
    } catch (error) {
          console.error('Failed to connect to MongoDB:', error);
          throw error;
    }
}
async function getDb() {
    const { db } = await connectToDatabase();
    return db;
}
module.exports = { connectToDatabase, getDb };
