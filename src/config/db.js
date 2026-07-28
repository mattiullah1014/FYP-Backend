import mongoose from 'mongoose';
import env from './env.js';

const connectDB = async () => {
  if (!env.mongoUri) {
    throw new Error(
      'MONGODB_URI is missing. Add it to your .env file (see .env.example).'
    );
  }

  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(env.mongoUri, {
    dbName: 'brillianceDB',
  });

  // Empty DBs don't show in Atlas until a collection exists
  const collections = await conn.connection.db.listCollections().toArray();
  if (collections.length === 0) {
    await conn.connection.db.createCollection('_init');
  }

  console.log(
    `MongoDB connected: ${conn.connection.host} / DB: ${conn.connection.name}`
  );
};

export default connectDB;
