// user.js
const Clerk = require('@clerk/clerk-sdk-node');
const users = Clerk.users;
const express = require('express');
const router = express.Router();  // Use router instead of app

// Define your route
router.get('/', async (req, res) => {
  try {
    const allUsers = await users.getAll();
    console.log('All users:', allUsers); // Log the users data
    res.json(allUsers);
  } catch (error) {
    console.error('Error fetching users from Clerk:', error); // Log the error
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
});
  
  

// Export the router
module.exports = router;
