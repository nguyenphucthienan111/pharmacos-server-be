const { MongoClient, ServerApiVersion } = require("mongodb");
const mongoose = require("mongoose");
const Account = require("../models/Account");

const setupIndexes = async () => {
  try {
    console.log("Setting up case-insensitive index for username...");

    // Create or update index with explicit name
    await Account.collection.createIndex(
      { username: 1 },
      {
        unique: true,
        name: "username_case_insensitive",
        collation: { locale: "en", strength: 2 },
        background: true,
      }
    );

    console.log("Index setup completed successfully");
  } catch (error) {
    console.error("Error setting up indexes:", error);
    // Continue even if index setup fails
  }
};

const connectToDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
    console.log("Connected to MongoDB");

    // Recreate indexes after connection
    await setupIndexes();
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
};

module.exports = { connectToDatabase };
