const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DATA_FILE = path.join(__dirname, '../data/items.json');

// Initialize Twitter Client (Conditional)
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

async function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
    return [];
}

async function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

(async () => {
    console.log('Starting tweet process...');

    const items = await loadData();
    const untweetedItems = items.filter(item => !item.tweeted_at);

    console.log(`Found ${untweetedItems.length} items waiting to be tweeted.`);

    if (untweetedItems.length === 0) {
        console.log('Nothing to tweet.');
        return;
    }

    // Tweet one item per run? Or all? 
    // User said "periodically tweet", possibly suggesting a queue.
    // Let's tweet all pending, but with a slight delay between them to be safe, 
    // or maybe just the oldest one?
    // "regularly tweet one by one" is safer for spam detection.
    // Let's tweet the oldest 1 item per execution to avoid flood.

    // Sorting by collected_at (assuming push order is chronological, but explicit sort is improved)
    // Actually, push order is fine. Let's take the first one.

    // NOTE: If the user wants to clear the backlog quickly, they might want more. 
    // But usually "flow" implies a drip feed. Let's do 1 at a time for safety, or loop all if small.
    // Given the "notifications" nature, usually you want them out fast. 
    // Let's try to empty the queue but with error handling.

    for (const item of untweetedItems) {
        const tweetText = `▼無修正紹介動画▼\n\n名前：${item.name}\n年齢：${item.age}\n身長：${item.height}\nバスト：${item.bust}\n\n${item.link}`;

        try {
            console.log('------------------------------------------------');
            console.log(`Preparing to tweet for ${item.name}...`);

            if (twitterClient) {
                await twitterClient.v2.tweet(tweetText);
                console.log('Tweet sent successfully.');

                // Mark as tweeted
                item.tweeted_at = new Date().toISOString();

                // Save immediately to avoid double tweeting if crash happens later
                await saveData(items);

                // Wait a bit to avoid rate limits if we loop
                await new Promise(r => setTimeout(r, 2000));
            } else {
                console.log('[DRY RUN] Tweet content:\n' + tweetText);
                // In dry run, we DO NOT mark as tweeted so we can test again, 
                // UNLESS we want to simulate the flow. 
                // Let's NOT mark it so the user can test repeatedly.
            }

        } catch (e) {
            console.error('Failed to tweet:', e);
            // If error is duplicate content, maybe mark as tweeted? 
            // For now, leave it retryable.
        }
    }

    console.log('Tweet process finished.');
})();
