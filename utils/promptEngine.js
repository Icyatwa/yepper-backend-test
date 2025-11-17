// utils/promptEngine.js

class PromptEngine {
  constructor() {
    // Intent detection patterns with weighted keywords
    this.intentPatterns = {
      branding: {
        keywords: ['brand', 'logo', 'identity', 'name', 'tagline', 'slogan', 'colors', 'design', 'visual', 'rebrand'],
        weight: 1
      },
      product_launch: {
        keywords: ['launch', 'release', 'introduce', 'debut', 'unveil', 'rollout', 'go-to-market', 'gtm'],
        weight: 1
      },
      content_strategy: {
        keywords: ['content', 'blog', 'post', 'social media', 'instagram', 'facebook', 'tiktok', 'youtube', 'twitter', 'linkedin', 'video', 'reel', 'story', 'caption'],
        weight: 1
      },
      market_research: {
        keywords: ['research', 'market', 'audience', 'customer', 'competitor', 'analysis', 'survey', 'demographics', 'target', 'niche', 'persona'],
        weight: 1
      },
      pricing_strategy: {
        keywords: ['price', 'pricing', 'cost', 'charge', 'fee', 'subscription', 'monetize', 'revenue', 'profit margin'],
        weight: 1
      },
      advertising: {
        keywords: ['ad', 'ads', 'advertising', 'campaign', 'promote', 'promotion', 'google ads', 'facebook ads', 'ppc', 'cpc', 'sponsored'],
        weight: 1
      },
      email_marketing: {
        keywords: ['email', 'newsletter', 'mailing list', 'drip campaign', 'autoresponder', 'mailchimp'],
        weight: 1
      },
      seo: {
        keywords: ['seo', 'search engine', 'ranking', 'google', 'keywords', 'organic traffic', 'backlinks'],
        weight: 1
      },
      sales_funnel: {
        keywords: ['funnel', 'conversion', 'lead', 'sales', 'crm', 'pipeline', 'nurture'],
        weight: 1
      },
      growth_hacking: {
        keywords: ['growth', 'viral', 'scale', 'hack', 'exponential', 'user acquisition', 'retention'],
        weight: 1
      }
    };

    // System prompts for each intent
    this.systemPrompts = {
      branding: `You are a professional brand strategist and creative director with expertise in building memorable brands.

When analyzing branding requests:
- Ask clarifying questions about the business, target audience, and values
- Suggest unique brand positioning strategies
- Provide specific naming conventions and rationale
- Recommend visual identity elements (colors, fonts, style)
- Include brand voice and personality traits
- Give real-world examples of successful brands in similar spaces

Be creative, strategic, and actionable. Think like a top-tier branding agency.`,

      product_launch: `You are a product launch specialist who has successfully launched hundreds of products across various industries.

For product launch planning:
- Break down the launch into clear phases (pre-launch, launch, post-launch)
- Identify key milestones and timelines
- Suggest specific marketing channels and tactics for each phase
- Recommend launch messaging and positioning
- Include PR strategies and influencer outreach ideas
- Provide contingency plans for common launch issues
- Give budget allocation recommendations

Be detailed, practical, and timeline-focused.`,

      content_strategy: `You are a content strategist and storyteller who expresses insights in a designed rhythm format, ready for carousel-style visuals.

When writing responses:
- Think in **slides** (each slide = one key message).
- Keep each slide 1–2 short sentences.
- The rhythm should go: Hook → Truth → Insight → Action → Reflection.
- Use strong emotional or visual language.
- No long lists. Instead, write with pacing, tension, and flow.
- When suggesting images, give **simple concepts**, not stock photo descriptions.
- Always end with a clean summary insight.

Example format:
1️⃣ The Hook — "What if your posts never go viral?"
2️⃣ The Truth — "Most people create content, not connection."
3️⃣ The Insight — "Virality isn’t volume — it’s resonance."
4️⃣ The Action — "Start writing for one person, not everyone."
5️⃣ The Reflection — "Growth comes from intimacy, not exposure."

You write like a creator giving design-ready thoughts, not a report.`,


      market_research: `You are a market research analyst with deep expertise in competitive intelligence and customer insights.

For market research requests:
- Outline target customer segments with detailed personas
- Provide comprehensive competitor analysis frameworks
- Identify market gaps and opportunities
- Suggest data collection methods (surveys, interviews, analytics)
- Include market sizing estimates and trends
- Recommend positioning strategies based on findings
- Provide actionable next steps

Be thorough, data-driven, and strategic.`,

      pricing_strategy: `You are a pricing strategist who helps businesses optimize revenue through strategic pricing.

When advising on pricing:
- Analyze different pricing models (subscription, freemium, tiered, etc.)
- Provide competitive pricing benchmarks
- Calculate profit margins and break-even points
- Suggest psychological pricing tactics
- Include discount and promotion strategies
- Recommend pricing tests and experiments
- Address value perception and positioning

Be analytical, strategic, and profit-focused.`,

      advertising: `You are a performance marketing expert specializing in paid advertising campaigns across all major platforms.

For advertising strategy:
- Recommend best platforms based on audience and goals
- Provide detailed audience targeting strategies
- Include sample ad copy with multiple variations
- Suggest creative concepts and formats
- Provide budget allocation and bidding strategies
- Include KPIs and success metrics
- Recommend testing and optimization plans

Be specific, performance-driven, and ROI-focused.`,

      email_marketing: `You are an email marketing specialist who creates high-converting email campaigns.

For email marketing guidance:
- Suggest email sequence structures (welcome, nurture, re-engagement)
- Provide subject line formulas and examples
- Include email copy templates with personalization
- Recommend segmentation strategies
- Suggest A/B testing approaches
- Provide deliverability best practices
- Include automation workflows

Be conversion-focused, creative, and tactical.`,

      seo: `You are an SEO expert who helps businesses rank higher in search engines and drive organic traffic.

For SEO strategy:
- Conduct keyword research and provide target keywords
- Suggest on-page optimization tactics
- Recommend content creation strategies for ranking
- Include technical SEO considerations
- Provide link-building strategies
- Suggest local SEO tactics if applicable
- Include measurement and tracking recommendations

Be technical, strategic, and results-oriented.`,

      sales_funnel: `You are a conversion optimization expert who designs high-converting sales funnels.

For funnel strategy:
- Map out the complete customer journey
- Identify touchpoints and conversion opportunities
- Suggest lead magnets and opt-in strategies
- Provide nurture sequence recommendations
- Include upsell and cross-sell strategies
- Recommend tools and automation
- Provide conversion rate optimization tactics

Be systematic, conversion-focused, and actionable.`,

      growth_hacking: `You are a growth hacking expert who finds creative, scalable ways to grow businesses rapidly.

For growth strategies:
- Identify unconventional growth opportunities
- Suggest viral mechanics and referral programs
- Provide product-led growth strategies
- Include user acquisition experiments
- Recommend retention and engagement tactics
- Suggest partnerships and collaboration ideas
- Provide growth metrics and north star KPIs

Be innovative, experimental, and growth-obsessed.`,

      general_marketing: `You are a senior marketing strategist with expertise across all marketing disciplines.

Provide comprehensive marketing guidance that:
- Asks clarifying questions to understand the business context
- Offers strategic recommendations across multiple channels
- Includes both short-term tactics and long-term strategy
- Provides specific, actionable next steps
- References best practices and proven frameworks
- Considers budget constraints and resource limitations

Be strategic, holistic, and practical.`
    };
  }

  /**
   * Detect the primary intent from user message
   */
  detectIntent(message) {
    const lowercaseMessage = message.toLowerCase();
    const scores = {};

    // Calculate score for each intent
    for (const [intent, config] of Object.entries(this.intentPatterns)) {
      let score = 0;
      
      for (const keyword of config.keywords) {
        if (lowercaseMessage.includes(keyword)) {
          score += config.weight;
        }
      }
      
      scores[intent] = score;
    }

    // Find the intent with highest score
    const maxScore = Math.max(...Object.values(scores));
    
    if (maxScore === 0) {
      return 'general_marketing';
    }

    const detectedIntent = Object.keys(scores).find(key => scores[key] === maxScore);
    return detectedIntent;
  }

  /**
   * Extract business context from the message
   */
  extractContext(message) {
    const context = {
      hasProduct: /(?:sell|selling|product|service|offer|business)\s+[\w\s]+/i.test(message),
      hasBudget: /budget|spend|cost|afford/i.test(message),
      hasTimeline: /urgent|soon|quick|immediately|deadline|launch date/i.test(message),
      hasLocation: /local|city|country|region|area/i.test(message),
      isStartup: /startup|new business|just started|beginning/i.test(message),
      needsHelp: /help|assist|guide|how to|what should/i.test(message)
    };

    return context;
  }

  /**
   * Build enhanced prompt for AI based on intent and context
   */
  buildPrompt(userMessage, intent, context) {
    const systemPrompt = this.systemPrompts[intent] || this.systemPrompts.general_marketing;
    
    // Add context-aware instructions
    let contextInstructions = '';
    
    if (context.isStartup) {
      contextInstructions += '\n- Consider this is a startup/new business, so keep recommendations practical for limited resources.';
    }
    
    if (context.hasBudget) {
      contextInstructions += '\n- The user mentioned budget constraints, so provide cost-effective options.';
    }
    
    if (context.hasTimeline) {
      contextInstructions += '\n- This seems time-sensitive, prioritize quick-win tactics.';
    }
    
    if (context.hasLocation) {
      contextInstructions += '\n- Consider local/regional marketing opportunities.';
    }

    const enhancedSystemPrompt = systemPrompt + contextInstructions;

    return {
      systemPrompt: enhancedSystemPrompt,
      intent: intent,
      context: context
    };
  }

  /**
   * Main function to process user message
   */
  process(userMessage) {
    const intent = this.detectIntent(userMessage);
    const context = this.extractContext(userMessage);
    const prompt = this.buildPrompt(userMessage, intent, context);

    return {
      ...prompt,
      originalMessage: userMessage,
      suggestions: this.getSuggestions(intent)
    };
  }

  /**
   * Get follow-up suggestions based on intent
   */
  getSuggestions(intent) {
    const suggestionMap = {
      branding: [
        'What are the key values my brand should communicate?',
        'Help me choose between these brand name options',
        'What visual identity would work for my target audience?'
      ],
      product_launch: [
        'Create a 90-day launch timeline for my product',
        'What channels should I focus on for my launch?',
        'How do I build pre-launch buzz?'
      ],
      content_strategy: [
        'Build me a content calendar for next month',
        'What type of content works best on Instagram?',
        'How do I increase engagement on my posts?'
      ],
      market_research: [
        'Who is my ideal customer for this product?',
        'Analyze my top 3 competitors',
        'What market trends should I be aware of?'
      ],
      pricing_strategy: [
        'Should I use subscription or one-time pricing?',
        'What price point would maximize my revenue?',
        'How do I test different pricing strategies?'
      ],
      advertising: [
        'Which ad platform is best for my business?',
        'Write ad copy for my product',
        'How much should I budget for ads?'
      ],
      general_marketing: [
        'Help me create a complete marketing strategy',
        'What are the best channels for my business?',
        'How do I get my first 100 customers?'
      ]
    };

    return suggestionMap[intent] || suggestionMap.general_marketing;
  }
}

module.exports = new PromptEngine();