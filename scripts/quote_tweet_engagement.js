/**
 * 引用ツイートエンゲージメントスクリプト（Gemini AI版）
 * 
 * モード:
 * 1. [--collect] 収集モード: キーワード検索から良質なアカウントを収集してリストに保存
 * 2. [通常] エンゲージメントモード: 保存されたアカウントのタイムラインを見に行き、反応する
 */

const { TwitterApi } = require('twitter-api-v2');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ===== 設定 =====
const DRY_RUN = process.argv.includes('--dry-run');

const CONFIG = {
    RAPIDAPI_KEY: process.env.RAPIDAPI_KEY || '60203995famsh8e0d771fc56b027p117717jsnee56450388aa',
    RAPIDAPI_HOST: process.env.RAPIDAPI_HOST || 'twitter-api45.p.rapidapi.com',

    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: 'gemini-2.5-flash',

    // アカウント収集用キーワード
    SEARCH_KEYWORDS: [
        'モテない男 共通点', 'マッチングアプリ プロフィール', 'モテる男 マインド',
        '女性心理 恋愛', 'マッチングアプリ メッセージ', 'モテテク', 'デート 誘い方', '恋愛 初心者',
        '彼女欲しい', '非モテ 脱出', '男磨き', '婚活 アプリ', '片思い 男', '彼女 作り方', '童貞 卒業',
        'ストナン', 'ネトナン', '恋愛コンサル', '復縁 男', '既読スルー 対策'
    ],

    MIN_FOLLOWERS: 1000,

    // データファイル
    STATUS_FILE: path.join(__dirname, '../data/quote_engagement_status.json'),
    ACCOUNTS_FILE: path.join(__dirname, '../data/target_accounts.json'),

    ACCOUNT_CONCEPT: `
このアカウントは「delice.love」という高級デリヘルサービスのアフィリエイトアカウントです。
ターゲット層は「彼女が欲しい」「女性との出会いがない」「寂しい」と感じている20-40代の男性です。
発信スタイルは、恋愛やモテに悩む男性として共感を示しつつ、自然にフォローを促す形です。
    `,

    // 除外ワード
    EXCLUDE_WORDS: ['彼氏', '推し', 'イケメン', '旦那', '夫', 'ママ', 'ゲイ', 'BL', '腐女子', '宣伝', 'PR', 'ご来店', '予約', '営業中', '#ad', 'grok', 'ChatGPT'],
    EXCLUDE_ACCOUNTS: ['grok', 'chatgpt', 'openai', 'claude', 'gemini'],
};

// ===== 初期化 =====
let genAI, geminiModel, twitterClient;

if (CONFIG.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: CONFIG.GEMINI_MODEL });
}

if (process.env.TWITTER_API_KEY) {
    twitterClient = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY,
        appSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
}

// ===== データ管理 =====
function loadData(filePath, defaultData) {
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            console.warn(`Failed to parse ${filePath}, using default.`);
        }
    }
    return defaultData;
}

function saveData(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ===== RapidAPI ラッパー =====
async function callRapidAPI(endpoint, params) {
    const options = {
        method: 'GET',
        url: `https://${CONFIG.RAPIDAPI_HOST}/${endpoint}`,
        params: params,
        headers: {
            'x-rapidapi-key': CONFIG.RAPIDAPI_KEY,
            'x-rapidapi-host': CONFIG.RAPIDAPI_HOST,
        },
    };
    try {
        const response = await axios.request(options);
        return response.data;
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error.message);
        return null;
    }
}

// ===== アカウント収集モード =====
async function runCollectionMode() {
    console.log('🕵️ Collection Mode: Searching for target accounts...');

    // アカウントリスト読み込み
    let accounts = loadData(CONFIG.ACCOUNTS_FILE, []);
    const existingIds = new Set(accounts.map(a => a.id));

    // ステータス（キーワードローテーション用）読み込み
    const status = loadData(CONFIG.STATUS_FILE, { lastKeywordIndex: -1, quotedTweetIds: [] });

    // キーワード選択
    const nextIndex = (status.lastKeywordIndex + 1) % CONFIG.SEARCH_KEYWORDS.length;
    const keyword = CONFIG.SEARCH_KEYWORDS[nextIndex];
    console.log(`🔍 Keyword: "${keyword}"`);

    // 検索実行
    const data = await callRapidAPI('search.php', { query: keyword, search_type: 'Top' }); // Top検索で良質なアカウントを探す

    let tweets = [];
    if (data && (data.timeline || data.tweets)) tweets = data.timeline || data.tweets;

    let addedCount = 0;
    for (const tweet of tweets) {
        // ユーザー情報抽出
        const user = tweet.user || tweet.user_info || {};
        const screenName = tweet.screen_name || user.screen_name;
        const followers = user.followers_count || tweet.followers_count || 0;
        const userId = user.id_str || tweet.user_id_str || screenName; // IDが無ければscreenNameをID代わりに

        if (!screenName || followers < CONFIG.MIN_FOLLOWERS) continue;

        // 除外アカウントチェック
        if (CONFIG.EXCLUDE_ACCOUNTS.some(exc => screenName.toLowerCase().includes(exc))) continue;
        if (existingIds.has(userId)) continue;

        // リストに追加
        accounts.push({
            id: userId,
            screenName: screenName,
            name: user.name || tweet.name,
            followers: followers,
            addedAt: new Date().toISOString(),
            lastCheck: null
        });
        existingIds.add(userId);
        addedCount++;
        console.log(`  + Added: @${screenName} (${followers} followers)`);
    }

    console.log(`✅ Collection complete. Added ${addedCount} accounts. Total: ${accounts.length}`);

    // 保存
    saveData(CONFIG.ACCOUNTS_FILE, accounts);

    // ステータス更新
    status.lastKeywordIndex = nextIndex;
    saveData(CONFIG.STATUS_FILE, status);
}

// ===== エンゲージメントモード =====
async function runEngagementMode() {
    console.log('🚀 Engagement Mode: Checking target accounts...');

    let accounts = loadData(CONFIG.ACCOUNTS_FILE, []);
    if (accounts.length === 0) {
        console.warn('⚠️ No target accounts found. Please run with --collect first.');
        return;
    }

    // ランダムに3アカウント選出（API制限考慮）
    // NOTE: lastCheckが古い順にするなどのロジックもアリだが、今回はランダム
    const targets = accounts.sort(() => 0.5 - Math.random()).slice(0, 3);

    const status = loadData(CONFIG.STATUS_FILE, { quotedTweetIds: [] });

    for (const target of targets) {
        console.log(`\n👀 Checking timeline: @${target.screenName}`);

        // タイムライン取得
        const data = await callRapidAPI('timeline.php', { screenname: target.screenName });
        let tweets = data ? (data.timeline || data.tweets || []) : [];

        // フィルタリング（24時間以内 & 引用済み除外）
        const candidates = tweets.filter(t => {
            const tweetId = t.tweet_id || t.id_str;
            if (status.quotedTweetIds.includes(tweetId)) return false;

            // 24時間以内
            const createdAt = new Date(t.created_at);
            const diffHours = (new Date() - createdAt) / (1000 * 60 * 60);
            return diffHours <= 24;
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // 最新順

        if (candidates.length === 0) {
            console.log('  → No recent tweets found.');
            continue;
        }

        console.log(`  → Found ${candidates.length} recent tweets. Analyzing top candidate with AI...`);

        // 最新1件だけAI評価（API節約）
        const bestTweet = candidates[0];
        const formattedTweet = {
            authorScreenName: target.screenName,
            followersCount: target.followers, // 最新データではないが保存データを使用
            text: bestTweet.text || bestTweet.full_text,
            tweetId: bestTweet.tweet_id || bestTweet.id_str
        };

        const aiResult = await evaluateAndGenerateComment(formattedTweet);
        console.log(`  AI Score: ${aiResult.score}, Relevant: ${aiResult.isRelevant}`);

        if (aiResult.isRelevant && aiResult.score >= 60) {
            console.log(`  🎯 Target locked! Comment: ${aiResult.comment}`);
            await postQuoteTweet(formattedTweet, aiResult.comment, status);
            return; // 1回につき1ツイートしたら終了（スパム防止）
        }
    }

    console.log('\n⚠️ No suitable tweets found in this run.');
}

// ===== AI評価 & コメント生成 =====
async function evaluateAndGenerateComment(tweet) {
    if (!geminiModel) return { isRelevant: true, score: 50, comment: 'これは刺さる...メモした📝' };

    const prompt = `
あなたはSNSマーケティングの専門家です。以下のツイートを評価し、引用コメントを生成してください。

【アカウントコンセプト】
${CONFIG.ACCOUNT_CONCEPT}

【評価ツイート】
@${tweet.authorScreenName}: ${tweet.text}

【タスク】
1. 適合性判断: ターゲット層（男性）にとって興味深く、引用して違和感がないか？（宣伝・スパム・ネガティブは不可）
2. コメント生成: 適合する場合、80〜110文字程度で、具体的な共感の理由や自身の知見・感想を交えた「読み応えのある」コメントを生成してください。
   友達に教えるような親しみやすい口調（〜だよね、〜だと思う、等）を使いつつ、1投稿の制限内でしっかりと中身のある文章にしてください。

出力JSON: { "isRelevant": bool, "score": 0-100, "reason": "...", "comment": "..." }
`;

    try {
        const result = await geminiModel.generateContent(prompt);
        const jsonMatch = result.response.text().match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : { isRelevant: false, score: 0 };
    } catch (e) {
        console.error('AI Error:', e.message);
        return { isRelevant: false, score: 0 };
    }
}

// ===== 投稿実行 =====
async function postQuoteTweet(tweet, comment, status) {
    const content = `${comment}\n\nhttps://twitter.com/${tweet.authorScreenName}/status/${tweet.tweetId}`;

    if (DRY_RUN) {
        console.log(`\n[DRY RUN] Would post:\n${content}`);
    } else if (twitterClient) {
        try {
            const result = await twitterClient.v2.tweet(content);
            console.log('✅ Posted successfully!');
            // 履歴更新
            status.quotedTweetIds.push(tweet.tweetId);
            if (status.quotedTweetIds.length > 100) status.quotedTweetIds.shift();
            saveData(CONFIG.STATUS_FILE, status);
        } catch (e) {
            console.error('❌ Post failed:', e.message);
        }
    }
}

// ===== メイン =====
async function main() {
    if (process.argv.includes('--collect')) {
        await runCollectionMode();
    } else {
        await runEngagementMode();
    }
}

main().catch(console.error);
