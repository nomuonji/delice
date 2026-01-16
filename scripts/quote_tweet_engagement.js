/**
 * 引用ツイートエンゲージメントスクリプト（Gemini AI版）
 * 
 * 自動運用向け：1回の実行で1キーワード検索、AI判断で最適なツイートに反応
 * Gemini APIで適合性判断と引用コメント生成
 */

const { TwitterApi } = require('twitter-api-v2');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ===== 設定 =====
// コマンドライン引数で --dry-run を指定するとシミュレーションモード
const DRY_RUN = process.argv.includes('--dry-run');

const CONFIG = {
    // RapidAPI設定
    RAPIDAPI_KEY: process.env.RAPIDAPI_KEY || '60203995famsh8e0d771fc56b027p117717jsnee56450388aa',
    RAPIDAPI_HOST: process.env.RAPIDAPI_HOST || 'twitter-api45.p.rapidapi.com',

    // Gemini API設定
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: 'gemini-2.0-flash',

    // 検索キーワード（ターゲット層がフォローしているインフルエンサー/競合のコンテンツ）
    SEARCH_KEYWORDS: [
        'モテない男 共通点',
        'マッチングアプリ プロフィール',
        'モテる男 マインド',
        '女性心理 恋愛',
        'マッチングアプリ メッセージ',
        'モテテク',
        'デート 誘い方',
        '恋愛 初心者',
    ],

    // フォロワー最小数（インフルエンサーをターゲットにするため高めに）
    MIN_FOLLOWERS: 3000,

    // フォロワー数が取得できない場合でも反応するか
    ALLOW_UNKNOWN_FOLLOWERS: false,

    // ステータスファイル
    STATUS_FILE: path.join(__dirname, '../data/quote_engagement_status.json'),

    // アカウントコンセプト（AI判断用）
    ACCOUNT_CONCEPT: `
このアカウントは「delice.love」という高級デリヘルサービスのアフィリエイトアカウントです。
ターゲット層は「彼女が欲しい」「女性との出会いがない」「寂しい」と感じている20-40代の男性です。
発信スタイルは、恋愛やモテに悩む男性として共感を示しつつ、自然にフォローを促す形です。
    `,

    // 除外ワード
    EXCLUDE_WORDS: [
        '彼氏', '推し', 'イケメン', '旦那', '夫', 'ママ',
        'ゲイ', 'BL', '腐女子', 'わたし', '私の', '嫁', '妻',
        '開業', '宣伝', 'PR', 'ご来店', '予約', '営業中',
        '#ad', '応募', 'キャンペーン', 'フォロー&RT',
        'grok', 'ChatGPT', '展覧会', '美術館', 'MUSEUM',
    ],
};

// ===== Gemini AI Client =====
let genAI = null;
let geminiModel = null;

if (CONFIG.GEMINI_API_KEY && CONFIG.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    try {
        genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
        geminiModel = genAI.getGenerativeModel({ model: CONFIG.GEMINI_MODEL });
        console.log('✅ Gemini AI initialized');
    } catch (e) {
        console.warn('⚠️ Failed to initialize Gemini AI:', e.message);
    }
} else {
    console.warn('⚠️ Gemini API key not found. AI features disabled.');
}

// ===== Twitter API Client =====
let twitterClient = null;
if (process.env.TWITTER_API_KEY && process.env.TWITTER_API_KEY !== 'your_api_key') {
    try {
        twitterClient = new TwitterApi({
            appKey: process.env.TWITTER_API_KEY,
            appSecret: process.env.TWITTER_API_SECRET,
            accessToken: process.env.TWITTER_ACCESS_TOKEN,
            accessSecret: process.env.TWITTER_ACCESS_SECRET,
        });
    } catch (e) {
        console.warn('Failed to initialize Twitter client. Running in DRY RUN mode.');
    }
} else {
    console.log('Twitter credentials not found. Running in DRY RUN mode.');
}

// ===== ステータス管理 =====
function loadStatus() {
    if (fs.existsSync(CONFIG.STATUS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CONFIG.STATUS_FILE, 'utf8'));
        } catch (e) {
            console.warn('Failed to parse status file, starting fresh.');
        }
    }
    return {
        quotedTweetIds: [],
        lastKeywordIndex: -1,
        lastRun: null,
        quotedTweets: [],
    };
}

function saveStatus(status) {
    fs.writeFileSync(CONFIG.STATUS_FILE, JSON.stringify(status, null, 2), 'utf8');
}

// ===== 次のキーワードを取得（ローテーション） =====
function getNextKeyword(status) {
    const nextIndex = (status.lastKeywordIndex + 1) % CONFIG.SEARCH_KEYWORDS.length;
    return {
        keyword: CONFIG.SEARCH_KEYWORDS[nextIndex],
        index: nextIndex,
    };
}

// ===== RapidAPI でツイート検索 =====
async function searchTweets(keyword) {
    console.log(`🔍 Searching: "${keyword}"`);

    const options = {
        method: 'GET',
        url: 'https://twitter-api45.p.rapidapi.com/search.php',
        params: {
            query: keyword,
            search_type: 'Latest',
        },
        headers: {
            'x-rapidapi-key': CONFIG.RAPIDAPI_KEY,
            'x-rapidapi-host': CONFIG.RAPIDAPI_HOST,
        },
    };

    try {
        const response = await axios.request(options);
        return response.data;
    } catch (error) {
        console.error(`❌ Search failed:`, error.message);
        return null;
    }
}

// ===== Gemini AIで適合性判断 + コメント生成（1回のAPIコール） =====
async function evaluateAndGenerateComment(tweet) {
    const fallbackComments = [
        'これは刺さる...メモした📝',
        'マジで参考になる🔥',
        'めっちゃ為になる🙏',
        'ほんとこれ大事だよな...✨',
    ];

    if (!geminiModel) {
        // Gemini使用不可の場合はフォールバック
        return {
            isRelevant: true,
            score: 50,
            reason: 'AI unavailable',
            comment: fallbackComments[Math.floor(Math.random() * fallbackComments.length)],
        };
    }

    const prompt = `
あなたはSNSマーケティングの専門家です。以下のツイートを評価し、引用コメントを生成してください。

【アカウントコンセプト】
${CONFIG.ACCOUNT_CONCEPT}

【評価するツイート】
投稿者: @${tweet.authorScreenName} (フォロワー: ${tweet.followersCount.toLocaleString()})
内容: ${tweet.text}

【タスク1: 適合性判断】
以下の基準で判断:
- ターゲット層（彼女欲しい男性）がフォローしていそうなインフルエンサーの投稿か？
- 恋愛、モテ、マッチングアプリ、デートなどに関する有益な情報発信か？
- 引用ツイートしても違和感がない内容か？
- 宣伝、炎上、政治、ネガティブな内容は不適合

【タスク2: 引用コメント生成】
適合する場合のみコメントを生成:
- 20-30文字程度
- 学びや気づきを得た感じ
- 絵文字1-2個
- 自然で共感を呼ぶトーン

以下のJSON形式で回答（説明無しでJSONのみ）:
{
  "isRelevant": true/false,
  "score": 0-100,
  "reason": "判断理由",
  "comment": "引用コメント（不適合なら空文字）"
}
`;

    try {
        const result = await geminiModel.generateContent(prompt);
        const responseText = result.response.text();

        // JSONを抽出
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            // コメントが空か短すぎる場合はフォールバック
            if (!parsed.comment || parsed.comment.length < 5) {
                parsed.comment = fallbackComments[Math.floor(Math.random() * fallbackComments.length)];
            }
            // 長すぎる場合は切り詰め
            if (parsed.comment.length > 50) {
                parsed.comment = parsed.comment.substring(0, 47) + '...';
            }
            return parsed;
        }
        return {
            isRelevant: false,
            score: 0,
            reason: 'Failed to parse AI response',
            comment: '',
        };
    } catch (error) {
        console.error('AI evaluation failed:', error.message);
        return {
            isRelevant: true,
            score: 50,
            reason: 'AI error, defaulting to true',
            comment: fallbackComments[Math.floor(Math.random() * fallbackComments.length)],
        };
    }
}

// ===== 基本フィルター =====
function basicFilter(tweets, status) {
    if (!tweets || !Array.isArray(tweets)) return [];

    // 除外するアカウント名
    const EXCLUDE_ACCOUNTS = ['grok', 'chatgpt', 'openai', 'claude', 'gemini'];

    return tweets.filter(tweet => {
        const tweetId = tweet.tweet_id || tweet.id || tweet.id_str;
        const text = tweet.text || tweet.full_text || '';
        const userInfo = tweet.user_info || tweet.user || tweet.author || {};
        const screenName = (tweet.screen_name || userInfo.screen_name || '').toLowerCase();

        // 既に引用済みは除外
        if (status.quotedTweetIds.includes(tweetId)) return false;

        // リツイートは除外
        if (text.startsWith('RT @')) return false;

        // 返信は除外（@で始まる）
        if (text.startsWith('@')) return false;

        // 除外アカウントは除外
        if (EXCLUDE_ACCOUNTS.some(name => screenName.includes(name))) return false;

        // 除外ワードを含む投稿は除外
        const hasExcludeWord = CONFIG.EXCLUDE_WORDS.some(word =>
            text.toLowerCase().includes(word.toLowerCase())
        );
        if (hasExcludeWord) return false;

        return true;
    }).map(tweet => {
        const userInfo = tweet.user_info || tweet.user || tweet.author || {};
        return {
            tweetId: tweet.tweet_id || tweet.id || tweet.id_str,
            text: tweet.text || tweet.full_text,
            authorScreenName: tweet.screen_name || userInfo.screen_name,
            authorName: userInfo.name || tweet.name,
            followersCount: userInfo.followers_count || tweet.followers_count || 0,
            createdAt: tweet.created_at,
        };
    }).filter(t => {
        if (t.followersCount === 0) return CONFIG.ALLOW_UNKNOWN_FOLLOWERS;
        return t.followersCount >= CONFIG.MIN_FOLLOWERS;
    }).sort((a, b) => b.followersCount - a.followersCount);
}

// ===== 最適なツイートを選択（AI判断付き） =====
async function selectBestTweetWithAI(tweets, status) {
    const filtered = basicFilter(tweets, status);

    if (filtered.length === 0) return null;

    console.log(`  → ${filtered.length} tweets passed basic filter`);

    // 上位3件をAI判断（API節約のため3件に制限）
    const candidates = filtered.slice(0, 3);

    for (const tweet of candidates) {
        console.log(`\n🤖 AI evaluating: @${tweet.authorScreenName}`);
        console.log(`   "${tweet.text.substring(0, 60)}..."`);

        // 1回のAPIコールで適合性判断 + コメント生成
        const result = await evaluateAndGenerateComment(tweet);
        console.log(`   → Score: ${result.score}, Relevant: ${result.isRelevant}`);
        console.log(`   → Reason: ${result.reason}`);
        if (result.comment) {
            console.log(`   → Comment: "${result.comment}"`);
        }

        if (result.isRelevant && result.score >= 60) {
            tweet.aiScore = result.score;
            tweet.aiReason = result.reason;
            tweet.aiComment = result.comment;
            return tweet;
        }
    }

    // AIで適合するものがなければ、フォロワー最多でフォールバック
    console.log('⚠️ No AI-approved tweet, using top follower count with fallback comment');
    const fallback = filtered[0];
    if (fallback) {
        fallback.aiComment = 'これは刺さる...メモした📝';
    }
    return fallback;
}

// ===== 引用ツイートを投稿 =====
async function postQuoteTweet(tweet, keywordUsed) {
    const status = loadStatus();

    // 既にAIで生成されたコメントを使用
    const comment = tweet.aiComment || 'これは刺さる...メモした📝';

    // 引用ツイートのURL
    const quotedUrl = `https://twitter.com/${tweet.authorScreenName}/status/${tweet.tweetId}`;

    // 引用ツイート内容
    const tweetContent = `${comment}\n\n${quotedUrl}`;

    console.log('\n📝 Quote Tweet:');
    console.log('----------------------------------------');
    console.log(`Target: @${tweet.authorScreenName} (${tweet.followersCount.toLocaleString()} followers)`);
    console.log(`AI Score: ${tweet.aiScore || 'N/A'}`);
    console.log(`Comment: ${comment}`);
    console.log('----------------------------------------');

    try {
        if (DRY_RUN) {
            console.log('[DRY RUN] シミュレーションモード - 実際には投稿しません');
            console.log('[DRY RUN] 投稿内容:\n' + tweetContent);
            return true;
        }

        if (twitterClient) {
            const result = await twitterClient.v2.tweet(tweetContent);
            console.log('✅ Posted successfully!');

            // ステータス更新
            status.quotedTweetIds.push(tweet.tweetId);
            status.lastRun = new Date().toISOString();
            status.quotedTweets.push({
                quotedTweetId: tweet.tweetId,
                authorScreenName: tweet.authorScreenName,
                followersCount: tweet.followersCount,
                comment: comment,
                keyword: keywordUsed,
                aiScore: tweet.aiScore,
                postedAt: new Date().toISOString(),
                ourTweetId: result.data.id,
            });

            // 最新10件だけ保持
            if (status.quotedTweets.length > 10) {
                status.quotedTweets = status.quotedTweets.slice(-10);
            }
            if (status.quotedTweetIds.length > 100) {
                status.quotedTweetIds = status.quotedTweetIds.slice(-100);
            }

            saveStatus(status);
            return true;
        } else {
            console.log('[DRY RUN] Would post:', tweetContent);
            return true;
        }
    } catch (error) {
        console.error('❌ Failed to post:', error.message);
        return false;
    }
}

// ===== メイン処理 =====
async function main() {
    console.log('🚀 Quote Tweet Engagement (Gemini AI版)');
    if (DRY_RUN) {
        console.log('⚡ [DRY RUN MODE] シミュレーション実行中（投稿しません）');
    }
    console.log('');

    const status = loadStatus();

    // 次のキーワードを取得
    const { keyword, index } = getNextKeyword(status);
    console.log(`Keyword rotation: [${index + 1}/${CONFIG.SEARCH_KEYWORDS.length}]`);

    // 検索（1回のAPIコール）
    const result = await searchTweets(keyword);

    if (!result) {
        console.log('No results. Exiting.');
        return;
    }

    // ツイート取得
    let tweets = result.timeline || result.tweets || result.results || [];
    if (!Array.isArray(tweets) && result.data) {
        tweets = result.data;
    }

    console.log(`  → Found ${tweets.length} tweets`);

    // AI判断付きで最適な1件を選択
    const bestTweet = await selectBestTweetWithAI(tweets, status);

    if (!bestTweet) {
        console.log('\n⚠️ No suitable tweet found');
        status.lastKeywordIndex = index;
        status.lastRun = new Date().toISOString();
        saveStatus(status);
        return;
    }

    console.log(`\n🎯 Selected: @${bestTweet.authorScreenName} (${bestTweet.followersCount.toLocaleString()} followers)`);

    // 引用ツイート投稿
    await postQuoteTweet(bestTweet, keyword);

    // キーワードインデックスを更新
    status.lastKeywordIndex = index;
    saveStatus(status);

    console.log(`\n✨ Done! Next keyword: "${CONFIG.SEARCH_KEYWORDS[(index + 1) % CONFIG.SEARCH_KEYWORDS.length]}"`);
}

// 実行
main().catch(console.error);
