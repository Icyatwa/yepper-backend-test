// Youtubeservice.js
const axios = require('axios');

async function refreshYouTubeToken(refreshToken) {
  const res = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: process.env.YOUTUBE_CLIENT_ID,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });
  return res.data;
}

async function getChannelStats(accessToken) {
  const res = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
    params: { part: 'snippet,statistics,brandingSettings', mine: true },
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return res.data.items?.[0];
}

async function getAnalytics(accessToken, channelId, startDate, endDate) {
  const metrics = [
    'views', 'estimatedMinutesWatched', 'averageViewDuration',
    'averageViewPercentage', 'subscribersGained', 'subscribersLost',
    'likes', 'dislikes', 'comments', 'shares', 'estimatedRevenue'
  ].join(',');

  try {
    const res = await axios.get('https://youtubeanalytics.googleapis.com/v2/reports', {
      params: { ids: `channel==${channelId}`, startDate, endDate, metrics, dimensions: 'month' },
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return res.data;
  } catch (e) {
    console.warn('YT Analytics error:', e.response?.data?.error?.message);
    return null;
  }
}

async function getTopVideos(accessToken, channelId, publishedAfter, publishedBefore, limit = 5) {
  const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
    params: { part: 'snippet', channelId, type: 'video', order: 'viewCount', publishedAfter, publishedBefore, maxResults: limit },
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const videoIds = searchRes.data.items?.map(i => i.id.videoId).join(',');
  if (!videoIds) return [];

  const statsRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
    params: { part: 'snippet,statistics', id: videoIds },
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  return statsRes.data.items?.map(v => ({
    id: v.id,
    title: v.snippet.title,
    thumbnail: v.snippet.thumbnails?.medium?.url,
    url: `https://youtube.com/watch?v=${v.id}`,
    metric: parseInt(v.statistics.viewCount || 0),
    engagements: parseInt(v.statistics.likeCount || 0) + parseInt(v.statistics.commentCount || 0)
  })) || [];
}

async function buildMonthlySnapshot(accessToken, channelId, year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  const [channel, analyticsData, topVideos] = await Promise.all([
    getChannelStats(accessToken),
    getAnalytics(accessToken, channelId, startDate, endDate),
    getTopVideos(accessToken, channelId, `${startDate}T00:00:00Z`, `${endDate}T23:59:59Z`)
  ]);

  const stats = channel?.statistics || {};
  const rows = analyticsData?.rows?.[0] || [];
  const headers = analyticsData?.columnHeaders?.map(h => h.name) || [];

  const getValue = (name) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? rows[idx] || 0 : 0;
  };

  const views = getValue('views');
  const likes = getValue('likes');
  const comments = getValue('comments');
  const shares = getValue('shares');
  const totalEngagements = views + likes + comments + shares;
  const subscriberCount = parseInt(stats.subscriberCount || 0);
  const engagementRate = subscriberCount
    ? ((totalEngagements / subscriberCount) * 100).toFixed(2)
    : 0;

  return {
    followers: subscriberCount,
    subscribers: subscriberCount,
    totalPosts: parseInt(stats.videoCount || 0),
    views: getValue('views'),
    watchTimeMinutes: getValue('estimatedMinutesWatched'),
    avgViewDuration: getValue('averageViewDuration'),
    avgViewPercentage: getValue('averageViewPercentage'),
    subscribersGrowth: getValue('subscribersGained') - getValue('subscribersLost'),
    likes,
    comments,
    shares,
    estimatedRevenue: getValue('estimatedRevenue'),
    totalEngagements,
    engagementRate: parseFloat(engagementRate),
    topContent: topVideos
  };
}

module.exports = { buildMonthlySnapshot, refreshYouTubeToken };
