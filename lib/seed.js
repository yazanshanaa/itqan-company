const fs = require('fs');
const path = require('path');
const { getDb } = require('./db');

async function seedDatabase() {
  try {
    const db = await getDb();

    // Seed siteData collection if empty
    const siteDataCollection = db.collection('siteData');
    const existingData = await siteDataCollection.findOne({ _id: 'site' });

    if (!existingData) {
      console.log('Seeding siteData collection...');
      const dataFilePath = path.join(__dirname, '../data/site.json');
      const siteData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      await siteDataCollection.insertOne({
        _id: 'site',
        data: siteData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('siteData collection seeded successfully');
    }

    // Seed settings collection with admin password hash if empty
    const settingsCollection = db.collection('settings');
    const existingSettings = await settingsCollection.findOne({ _id: 'adminPassword' });

    if (!existingSettings && process.env.ADMIN_PASS_HASH) {
      console.log('Seeding settings collection with admin password hash...');
      await settingsCollection.insertOne({
        _id: 'adminPassword',
        hash: process.env.ADMIN_PASS_HASH,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('settings collection seeded successfully');
    }

    console.log('Database seeding complete');
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
}

module.exports = { seedDatabase };
