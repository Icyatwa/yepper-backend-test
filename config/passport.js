// passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

// Request profile + email (for auth) AND Search Console read access (for GSC data).
// By combining both scopes here the user only ever sees ONE Google consent screen
// and we never need to run a separate OAuth flow for Search Console.
const SCOPES = [
  'profile',
  'email',
  'https://www.googleapis.com/auth/webmasters.readonly',
];

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  `${process.env.BACKEND_URL || 'https://yepper-backend-test.onrender.com'}/api/auth/google/callback`,
  // Ask for offline access so we get a refresh_token
  accessType:   'offline',
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ googleId: profile.id });

    if (user) {
      // Always refresh the stored tokens so they stay valid
      user.gscAccessToken  = accessToken;
      if (refreshToken) user.gscRefreshToken = refreshToken;
      await user.save();
      return done(null, user);
    }

    // Check if a password-based account already exists with this email
    user = await User.findOne({ email: profile.emails[0].value });

    if (user) {
      // Link Google to the existing account and store GSC tokens
      user.googleId       = profile.id;
      user.avatar         = profile.photos[0]?.value || user.avatar;
      user.isVerified     = true;
      user.gscAccessToken = accessToken;
      if (refreshToken) user.gscRefreshToken = refreshToken;
      await user.save();
      return done(null, user);
    }

    // Brand-new user — create and store GSC tokens
    user = new User({
      googleId:       profile.id,
      name:           profile.displayName,
      email:          profile.emails[0].value,
      avatar:         profile.photos[0]?.value || '',
      isVerified:     true,
      gscAccessToken: accessToken,
      gscRefreshToken: refreshToken || null,
    });

    await user.save();
    done(null, user);
  } catch (error) {
    done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});