const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const CONFIG = {
    RAPIDAPI_KEY: process.env.RAPIDAPI_KEY || '60203995famsh8e0d771fc56b027p117717jsnee56450388aa',
    RAPIDAPI_HOST: process.env.RAPIDAPI_HOST || 'twitter-api45.p.rapidapi.com',
};

async function checkTrends() {
    console.log('🔍 Checking Trends endpoint...');

    // よくあるエンドポイント名のパターンを試す
    const endpoints = [
        'trends.php',
        'get_trends.php',
        'trends',
    ];

    for (const endpoint of endpoints) {
        console.log(`\nTesting: ${endpoint}`);
        const options = {
            method: 'GET',
            url: `https://${CONFIG.RAPIDAPI_HOST}/${endpoint}`,
            params: {
                woeid: '23424856', // Japan
            },
            headers: {
                'x-rapidapi-key': CONFIG.RAPIDAPI_KEY,
                'x-rapidapi-host': CONFIG.RAPIDAPI_HOST,
            },
            validateStatus: () => true, // エラーでも止まらない
        };

        try {
            const response = await axios.request(options);
            console.log(`Status: ${response.status}`);
            if (response.status === 200) {
                console.log('✅ Success!');
                console.log(JSON.stringify(response.data, null, 2).substring(0, 500) + '...');
                return endpoint;
            } else {
                console.log('❌ Failed');
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    }
    return null;
}

checkTrends();
