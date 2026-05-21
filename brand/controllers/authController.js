// Authcontroller.js
const jwt = require('jsonwebtoken');
const axios = require('axios');
const Brand_User = require('../models/User');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await Brand_User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const user = await Brand_User.create({ name, email, password });
    const token = signToken(user._id);
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await Brand_User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    user.lastLogin = new Date();
    await user.save();
    const token = signToken(user._id);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        socialAccounts: user.socialAccounts.map(a => ({
          platform: a.platform,
          username: a.username,
          displayName: a.displayName,
          profilePicture: a.profilePicture,
          connectedAt: a.connectedAt
        }))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await Brand_User.findById(req.user._id).select('-password -socialAccounts.accessToken -socialAccounts.refreshToken');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.instagramAuth = (req, res) => {
  const state = Buffer.from(JSON.stringify({ userId: req.user._id.toString() })).toString('base64');
  const url = `https://api.instagram.com/oauth/authorize?client_id=${process.env.INSTAGRAM_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.INSTAGRAM_REDIRECT_URI)}&scope=user_profile,user_media,instagram_manage_insights&response_type=code&state=${state}`;
  res.json({ authUrl: url });
};

exports.instagramCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=instagram_denied`);

    const { userId } = JSON.parse(Buffer.from(state, 'base64').toString());

    const tokenRes = await axios.post('https://api.instagram.com/oauth/access_token', new URLSearchParams({
      client_id: process.env.INSTAGRAM_CLIENT_ID,
      client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: process.env.INSTAGRAM_REDIRECT_URI,
      code
    }));

    const { access_token, user_id } = tokenRes.data;

    const longLivedRes = await axios.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
        access_token
      }
    });

    const profileRes = await axios.get(`https://graph.instagram.com/${user_id}`, {
      params: { fields: 'id,username,name,profile_picture_url', access_token: longLivedRes.data.access_token }
    });

    const user = await Brand_User.findById(userId);
    const existingIdx = user.socialAccounts.findIndex(a => a.platform === 'instagram');
    const accountData = {
      platform: 'instagram',
      platformUserId: user_id.toString(),
      username: profileRes.data.username,
      displayName: profileRes.data.name || profileRes.data.username,
      profilePicture: profileRes.data.profile_picture_url,
      accessToken: longLivedRes.data.access_token,
      tokenExpiry: new Date(Date.now() + longLivedRes.data.expires_in * 1000),
      isActive: true
    };

    if (existingIdx >= 0) {
      user.socialAccounts[existingIdx] = { ...user.socialAccounts[existingIdx].toObject(), ...accountData };
    } else {
      user.socialAccounts.push(accountData);
    }
    await user.save();
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?connected=instagram`);
  } catch (err) {
    console.error('Instagram callback error:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=instagram_failed`);
  }
};

exports.youtubeAuth = (req, res) => {
  const state = Buffer.from(JSON.stringify({ userId: req.user._id.toString() })).toString('base64');
  const scopes = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly'
  ].join(' ');
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.YOUTUBE_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.YOUTUBE_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent&state=${state}`;
  res.json({ authUrl: url });
};

exports.youtubeCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=youtube_denied`);

    const { userId } = JSON.parse(Buffer.from(state, 'base64').toString());

    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
      redirect_uri: process.env.YOUTUBE_REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    const channelRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: { part: 'snippet,statistics', mine: true },
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const channel = channelRes.data.items[0];
    const user = await Brand_User.findById(userId);
    const existingIdx = user.socialAccounts.findIndex(a => a.platform === 'youtube');

    const accountData = {
      platform: 'youtube',
      platformUserId: channel.id,
      username: channel.snippet.customUrl || channel.id,
      displayName: channel.snippet.title,
      profilePicture: channel.snippet.thumbnails?.default?.url,
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiry: new Date(Date.now() + expires_in * 1000),
      isActive: true
    };

    if (existingIdx >= 0) {
      user.socialAccounts[existingIdx] = { ...user.socialAccounts[existingIdx].toObject(), ...accountData };
    } else {
      user.socialAccounts.push(accountData);
    }
    await user.save();
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?connected=youtube`);
  } catch (err) {
    console.error('YouTube callback error:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=youtube_failed`);
  }
};

exports.disconnect = async (req, res) => {
  try {
    const user = await Brand_User.findById(req.user._id);
    const idx = user.socialAccounts.findIndex(a => a.platform === req.params.platform);
    if (idx >= 0) {
      user.socialAccounts[idx].isActive = false;
      await user.save();
    }
    res.json({ message: `${req.params.platform} disconnected` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};