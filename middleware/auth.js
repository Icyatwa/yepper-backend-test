// middleware/auth.js
const { clerkClient } = require('@clerk/express');

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Authorization header missing or invalid format',
        tokenExpired: false 
      });
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        message: 'Token not provided',
        tokenExpired: false 
      });
    }

    // Verify the JWT token with Clerk
    const decoded = await clerkClient.verifyToken(token);
    
    if (!decoded || !decoded.sub) {
      return res.status(401).json({ 
        message: 'Invalid token',
        tokenExpired: true 
      });
    }

    // Set auth info on request
    req.auth = { userId: decoded.sub };
    req.sessionId = decoded.sid;
    
    // Get user email if needed
    try {
      const user = await clerkClient.users.getUser(decoded.sub);
      req.userEmail = user.emailAddresses.find(email => 
        email.id === user.primaryEmailAddressId
      )?.emailAddress;
    } catch (userError) {
      console.warn('Could not fetch user details:', userError.message);
      req.userEmail = null;
    }
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    // Check if it's a token expiration error
    const isTokenExpired = error.message?.includes('expired') || 
                          error.message?.includes('invalid') ||
                          error.name === 'TokenExpiredError' ||
                          error.status === 401;
    
    return res.status(401).json({ 
      message: isTokenExpired ? 'Session expired' : 'Authentication failed',
      tokenExpired: isTokenExpired,
      error: error.message
    });
  }
};

const extractUserInfo = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      
      if (token) {
        try {
          const decoded = await clerkClient.verifyToken(token);
          
          if (decoded && decoded.sub) {
            req.auth = { userId: decoded.sub };
            req.sessionId = decoded.sid;
            
            try {
              const user = await clerkClient.users.getUser(decoded.sub);
              req.userEmail = user.emailAddresses.find(email => 
                email.id === user.primaryEmailAddressId
              )?.emailAddress;
            } catch (userError) {
              console.warn('Could not fetch user details:', userError.message);
              req.userEmail = null;
            }
          }
        } catch (tokenError) {
          console.warn('Token verification failed:', tokenError.message);
        }
      }
    }
    next();
  } catch (error) {
    console.error('Error extracting user info:', error);
    req.userEmail = null;
    next();
  }
};

module.exports = { requireAuth, extractUserInfo };