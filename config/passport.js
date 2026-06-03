// config/passport.js (PostgreSQL version)
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

const SCOPES = [
  'profile',
  'email',
  'https://www.googleapis.com/auth/webmasters.readonly',
];

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  `${process.env.BACKEND_URL || 'https://yepper-backend.onrender.com'}/api/auth/google/callback`,
  accessType:   'offline',
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findByGoogleId(profile.id);

    if (user) {
      // Refresh stored tokens
      user = await User.update(user.id, {
        gscAccessToken: accessToken,
        ...(refreshToken && { gscRefreshToken: refreshToken }),
      });
      return done(null, user);
    }

    // Check if password-based account exists with this email
    user = await User.findByEmail(profile.emails[0].value);

    if (user) {
      user = await User.update(user.id, {
        googleId:       profile.id,
        avatar:         profile.photos[0]?.value || user.avatar,
        isVerified:     true,
        gscAccessToken: accessToken,
        ...(refreshToken && { gscRefreshToken: refreshToken }),
      });
      return done(null, user);
    }

    // New user
    user = await User.create({
      googleId:        profile.id,
      name:            profile.displayName,
      email:           profile.emails[0].value,
      avatar:          profile.photos[0]?.value || '',
      isVerified:      true,
      gscAccessToken:  accessToken,
      gscRefreshToken: refreshToken || null,
    });

    done(null, user);
  } catch (error) {
    done(error, null);
  }
}));

// Use UUID (id) instead of MongoDB _id
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});
