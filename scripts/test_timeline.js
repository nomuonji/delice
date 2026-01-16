const axios = require('axios');
require('dotenv').config();

const CONFIG = {
    RAPIDAPI_KEY: process.env.RAPIDAPI_KEY || '60203995famsh8e0d771fc56b027p117717jsnee56450388aa',
    RAPIDAPI_HOST: process.env.RAPIDAPI_HOST || 'twitter-api45.p.rapidapi.com',
};

async function checkTimeline(screenName) {
    console.log(`🔍 Checking timeline for @${screenName}...`);

    const options = {
        method: 'GET',
        url: `https://${CONFIG.RAPIDAPI_HOST}/timeline.php`,
        params: {
            screenname: screenName,
        },
        headers: {
            'x-rapidapi-key': CONFIG.RAPIDAPI_KEY,
            'x-rapidapi-host': CONFIG.RAPIDAPI_HOST,
        },
        validateStatus: () => true,
    };

    try {
        const response = await axios.request(options);
        console.log(`Status: ${response.status}`);
        if (response.status === 200) {
            console.log('✅ Success!');
            const tweets = response.data.timeline || response.data.tweets || [];
            console.log(`Found ${tweets.length} tweets.`);
            if (tweets.length > 0) {
                console.log('Sample:', tweets[0].text ? tweets[0].text.substring(0, 50) : 'No text');
            }
        } else {
            console.log('❌ Failed');
            console.log(response.data);
        }
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

// テスト対象: イーロンマスク (確実に存在する)
checkTimeline('elonmusk');
