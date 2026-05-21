// Instagramservice.js
const axios = require('axios');

const BASE = 'https://graph.instagram.com';

async function refreshInstagramToken(accessToken) {
  const res = await axios.get(`${BASE}/refresh_access_token`, {
    params: { grant_type: 'ig_refresh_token', access_token: accessToken }
  });
  return res.data;
}

async function getAccountStats(accessToken, igUserId) {
  const fields = 'followers_count,media_count,profile_picture_url,username,biography,website';
  const res = await axios.get(`${BASE}/${igUserId}`, {
    params: { fields, access_token: accessToken }
  });
  return res.data;
}

async function getRecentMedia(accessToken, igUserId, limit = 20) {
  const fields = 'id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,shares_count,saved,impressions,reach';
  const res = await axios.get(`${BASE}/${igUserId}/media`, {
    params: { fields, limit, access_token: accessToken }
  });
  return res.data.data || [];
}

async function getAccountInsights(accessToken, igUserId, metric, period, since, until) {
  try {
    const res = await axios.get(`${BASE}/${igUserId}/insights`, {
      params: { metric, period, since, until, access_token: accessToken }
    });
    return res.data.data || [];
  } catch (e) {
    console.warn(`Insight fetch failed for ${metric}:`, e.response?.data?.error?.message);
    return [];
  }
}

async function buildMonthlySnapshot(accessToken, igUserId, year, month) {
  const since = Math.floor(new Date(year, month - 1, 1).getTime() / 1000);
  const until = Math.floor(new Date(year, month, 1).getTime() / 1000);

  const [accountData, mediaData] = await Promise.all([
    getAccountStats(accessToken, igUserId),
    getRecentMedia(accessToken, igUserId, 50)
  ]);

  const monthMedia = mediaData.filter(m => {
    const d = new Date(m.timestamp);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });

  const totalLikes = monthMedia.reduce((s, m) => s + (m.like_count || 0), 0);
  const totalComments = monthMedia.reduce((s, m) => s + (m.comments_count || 0), 0);
  const totalImpressions = monthMedia.reduce((s, m) => s + (m.impressions || 0), 0);
  const totalReach = monthMedia.reduce((s, m) => s + (m.reach || 0), 0);
  const totalEngagements = totalLikes + totalComments;
  const engagementRate = accountData.followers_count
    ? ((totalEngagements / (accountData.followers_count * monthMedia.length || 1)) * 100).toFixed(2)
    : 0;

  const topContent = [...monthMedia]
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
    .slice(0, 5)
    .map(m => ({
      id: m.id,
      title: m.caption?.substring(0, 60) || 'Post',
      thumbnail: m.thumbnail_url || m.media_url,
      url: `https://www.instagram.com/p/${m.id}`,
      metric: m.impressions || 0,
      engagements: (m.like_count || 0) + (m.comments_count || 0)
    }));

  return {
    followers: accountData.followers_count,
    totalPosts: monthMedia.length,
    totalEngagements,
    engagementRate: parseFloat(engagementRate),
    likes: totalLikes,
    comments: totalComments,
    impressions: totalImpressions,
    reach: totalReach,
    topContent
  };
}

module.exports = { buildMonthlySnapshot, refreshInstagramToken, getAccountInsights };