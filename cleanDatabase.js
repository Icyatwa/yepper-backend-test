// cleanDatabase.js - Complete cleanup script
const mongoose = require('mongoose');
require('dotenv').config();

async function cleanDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mern-auth', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('users');

    // Get collection info
    const stats = await collection.stats();
    console.log(`Current collection has ${stats.count} documents`);

    // List all indexes
    const indexes = await collection.listIndexes().toArray();
    console.log('Current indexes:', indexes.map(idx => `${idx.name}: ${JSON.stringify(idx.key)}`));

    // Drop all indexes except _id (which can't be dropped)
    for (const index of indexes) {
      if (index.name !== '_id_') {
        try {
          await collection.dropIndex(index.name);
          console.log(`✓ Dropped index: ${index.name}`);
        } catch (error) {
          console.log(`✗ Failed to drop index ${index.name}:`, error.message);
        }
      }
    }

    // Drop the entire collection to start fresh
    try {
      await collection.drop();
      console.log('✓ Dropped users collection completely');
    } catch (error) {
      console.log('Collection might not exist or already dropped:', error.message);
    }

    // Verify cleanup
    try {
      const newStats = await collection.stats();
      console.log('Collection still exists with', newStats.count, 'documents');
    } catch (error) {
      console.log('✓ Collection successfully removed');
    }

    console.log('\n🎉 Database cleanup completed!');
    console.log('Your app will create a fresh users collection on next registration.');
    
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

cleanDatabase();