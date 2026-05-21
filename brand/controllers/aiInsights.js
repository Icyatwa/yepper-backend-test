// Aiinsights.js
const axios = require('axios');

async function generateAIInsights(platform, currentSnapshot, previousSnapshot) {
  const delta = {};
  if (previousSnapshot) {
    delta.followersChange = currentSnapshot.followers - (previousSnapshot.followers || 0);
    delta.engagementRateChange = (currentSnapshot.engagementRate - (previousSnapshot.engagementRate || 0)).toFixed(2);
    delta.postsChange = currentSnapshot.totalPosts - (previousSnapshot.totalPosts || 0);
  }

  const prompt = `You are a personal branding strategist analyzing ${platform} analytics for a creator.

Current Month Data:
${JSON.stringify(currentSnapshot, null, 2)}

${previousSnapshot ? `Previous Month Comparison:
${JSON.stringify(delta, null, 2)}` : ''}

Provide a JSON analysis with these exact fields:
{
  "summary": "2-3 sentence overview of this month's performance",
  "strengths": ["3 specific things going well"],
  "weaknesses": ["3 specific areas of concern"],
  "recommendations": ["5 actionable, specific recommendations"],
  "focusAreas": ["top 3 priority focus areas for next month"]
}

Be specific, data-driven, and actionable. Return ONLY valid JSON.`;

  try {
    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      }
    });

    const text = res.data.content[0].text;
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error('AI insights error:', err.message);
    return {
      summary: `Your ${platform} performance this month shows ${currentSnapshot.engagementRate > 3 ? 'strong' : 'moderate'} engagement with ${currentSnapshot.followers?.toLocaleString()} followers.`,
      strengths: ['Consistent posting schedule', 'Growing audience base', 'High quality content'],
      weaknesses: ['Engagement rate could be higher', 'Need more variety in content', 'Limited cross-platform promotion'],
      recommendations: [
        'Post 3-5x per week for optimal reach',
        'Engage with comments within first hour',
        'Use trending hashtags in your niche',
        'Collaborate with similar creators',
        'Analyze your top-performing content and replicate its format'
      ],
      focusAreas: ['Increase posting frequency', 'Improve engagement quality', 'Audience growth strategy']
    };
  }
}

module.exports = { generateAIInsights };