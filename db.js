// external packages
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

mongoose.set('strictQuery', false);
// establish a connection to MongoDB
mongoose.connect(process.env.DB_URL, {})
  .then(() => console.log('Connected to MongoDB...'))
  .catch((err) => console.error('Could not connect to MongoDB...', err));

const dbName = process.env.JAMBOJAR_APP_DATABASE_NAME;

let client;
let db;

// Function to connect to the database
async function connectDB() {
  if (!client) {
    client = new MongoClient(process.env.JAMBOJAR_APP_DATABASE_URL);
    await client.connect();
    console.log("Connected successfully to MongoDB!");
    db = client.db(dbName);
  }
  return db;
}

// Function to close the connection
async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("MongoDB connection closed.");
  }
}

module.exports = { connectDB, closeDB };