const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const TWEETS_FILE = path.join(__dirname, '../data/tweets.txt');
const STATUS_FILE = path.join(__dirname, '../data/tweets_status.json');

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

function loadTweets() {
    if (fs.existsSync(TWEETS_FILE)) {
        const content = fs.readFileSync(TWEETS_FILE, 'utf8');
        return content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    }
    return [];
}

function loadStatus() {
    if (fs.existsSync(STATUS_FILE)) {
        const content = fs.readFileSync(STATUS_FILE, 'utf8').trim();
        if (content) {
            const data = JSON.parse(content);
            return data.lastIndex ?? -1;
        }
    }
    return -1; // まだ投稿なし
}

function saveStatus(lastIndex) {
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ lastIndex }, null, 2), 'utf8');
}

(async () => {
    console.log('Starting tweet from queue process...');

    const tweets = loadTweets();
    console.log(`Loaded ${tweets.length} tweets from queue.`);

    if (tweets.length === 0) {
        console.log('No tweets in queue.');
        return;
    }

    const lastIndex = loadStatus();
    console.log(`Last posted index: ${lastIndex}`);

    // 次に投稿するインデックスを決定
    let nextIndex = lastIndex + 1;

    // ループ処理: 最後まで行ったら最初に戻る
    if (nextIndex >= tweets.length) {
        nextIndex = 0;
        console.log('Reached end of queue, starting from beginning.');
    }

    const tweetText = tweets[nextIndex];
    console.log(`Next tweet (index ${nextIndex}): ${tweetText.substring(0, 50)}...`);

    try {
        if (twitterClient) {
            await twitterClient.v2.tweet(tweetText);
            console.log('Tweet sent successfully!');

            saveStatus(nextIndex);
            console.log(`Status updated. Next index will be: ${nextIndex + 1 >= tweets.length ? 0 : nextIndex + 1}`);
        } else {
            console.log('[DRY RUN] Would tweet:\n' + tweetText);
            console.log('[DRY RUN] Would update lastIndex to: ' + nextIndex);
        }
    } catch (e) {
        console.error('Failed to tweet:', e);
    }

    console.log('Tweet from queue process finished.');
})();
