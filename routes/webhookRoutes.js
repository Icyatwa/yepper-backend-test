const express = require('express');
const { Webhook } = require('svix');
const User = require('../models/User');

const router = express.Router();

// Clerk webhook endpoint
router.post('/clerk', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
    
    if (!WEBHOOK_SECRET) {
      throw new Error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env');
    }

    // Get the headers
    const svix_id = req.headers['svix-id'];
    const svix_timestamp = req.headers['svix-timestamp'];
    const svix_signature = req.headers['svix-signature'];

    // If there are no headers, error out
    if (!svix_id || !svix_timestamp || !svix_signature) {
      return res.status(400).json({ 
        success: false, 
        message: 'Error occurred -- no svix headers' 
      });
    }

    // Create a new Svix instance with your webhook secret
    const wh = new Webhook(WEBHOOK_SECRET);

    let evt;

    // Verify the webhook
    try {
      evt = wh.verify(req.body, {
        'svix-id': svix_id,
        'svix-timestamp': svix_timestamp,
        'svix-signature': svix_signature,
      });
    } catch (err) {
      console.error('Error verifying webhook:', err);
      return res.status(400).json({ 
        success: false, 
        message: 'Error occurred -- webhook verification failed' 
      });
    }

    // Get the ID and type
    const { id } = evt.data;
    const eventType = evt.type;

    console.log(`Webhook with an ID of ${id} and type of ${eventType}`);
    console.log('Webhook body:', evt.data);

    // Handle different event types
    switch (eventType) {
      case 'user.created':
        await handleUserCreated(evt.data);
        break;
      case 'user.updated':
        await handleUserUpdated(evt.data);
        break;
      case 'user.deleted':
        await handleUserDeleted(evt.data);
        break;
      case 'emailAddress.created':
        await handleEmailCreated(evt.data);
        break;
      case 'emailAddress.updated':
        await handleEmailUpdated(evt.data);
        break;
      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Webhook processed successfully' 
    });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: err.message 
    });
  }
});

// Handle user created event
async function handleUserCreated(userData) {
  try {
    const user = new User({
      clerkId: userData.id,
      email: userData.email_addresses[0]?.email_address || '',
      firstName: userData.first_name || '',
      lastName: userData.last_name || '',
      imageUrl: userData.image_url || '',
      emailVerified: userData.email_addresses[0]?.verification?.status === 'verified',
      phoneNumber: userData.phone_numbers[0]?.phone_number || '',
      lastSignInAt: new Date(userData.last_sign_in_at),
      createdAt: new Date(userData.created_at),
      updatedAt: new Date(userData.updated_at)
    });

    await user.save();
    console.log('User created in database:', user.clerkId);
  } catch (error) {
    console.error('Error creating user:', error);
  }
}

// Handle user updated event
async function handleUserUpdated(userData) {
  try {
    const user = await User.findOneAndUpdate(
      { clerkId: userData.id },
      {
        email: userData.email_addresses[0]?.email_address || '',
        firstName: userData.first_name || '',
        lastName: userData.last_name || '',
        imageUrl: userData.image_url || '',
        emailVerified: userData.email_addresses[0]?.verification?.status === 'verified',
        phoneNumber: userData.phone_numbers[0]?.phone_number || '',
        lastSignInAt: new Date(userData.last_sign_in_at),
        updatedAt: new Date(userData.updated_at)
      },
      { new: true }
    );

    if (user) {
      console.log('User updated in database:', user.clerkId);
    }
  } catch (error) {
    console.error('Error updating user:', error);
  }
}

// Handle user deleted event
async function handleUserDeleted(userData) {
  try {
    const user = await User.findOneAndDelete({ clerkId: userData.id });
    if (user) {
      console.log('User deleted from database:', user.clerkId);
    }
  } catch (error) {
    console.error('Error deleting user:', error);
  }
}

// Handle email created event
async function handleEmailCreated(emailData) {
  try {
    // Update user's email verification status
    const user = await User.findOneAndUpdate(
      { clerkId: emailData.object },
      {
        emailVerified: emailData.verification?.status === 'verified',
        updatedAt: new Date()
      },
      { new: true }
    );

    if (user) {
      console.log('User email updated:', user.clerkId);
    }
  } catch (error) {
    console.error('Error updating user email:', error);
  }
}

// Handle email updated event
async function handleEmailUpdated(emailData) {
  try {
    // Update user's email verification status
    const user = await User.findOneAndUpdate(
      { clerkId: emailData.object },
      {
        emailVerified: emailData.verification?.status === 'verified',
        updatedAt: new Date()
      },
      { new: true }
    );

    if (user) {
      console.log('User email verification updated:', user.clerkId);
    }
  } catch (error) {
    console.error('Error updating user email verification:', error);
  }
}

module.exports = router;