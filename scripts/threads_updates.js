const fs = require('fs');
const path = require('path');
const axios = require('axios');
const threadsAuth = require('./threads_auth');

const DATA_FILE = path.join(__dirname, '../data/items.json');
const THREADS_API_BASE = 'https://graph.threads.net/v1.0';

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
    console.log('Starting Threads post process...');

    const items = await loadData();
    // Filter items that haven't been posted to threads yet
    const unpostedItems = items.filter(item => !item.threads_posted_at);

    console.log(`Found ${unpostedItems.length} items waiting to be posted to Threads.`);

    if (unpostedItems.length === 0) {
        console.log('Nothing to post to Threads.');
        return;
    }

    // Process one item per run (Newest first)
    const item = unpostedItems[unpostedItems.length - 1];

    if (item) {
        // Construct Text with Inviter ID
        const inviterId = '7576d561-2573-4396-89d0-974bdb625f46';
        // Check if link already has query params check
        const link = item.link.includes('?') ? `${item.link}&inviter_id=${inviterId}` : `${item.link}?inviter_id=${inviterId}`;

        const postText = `▼無修正紹介動画▼\n\n名前：${item.name}\n年齢：${item.age}\n身長：${item.height}\nバスト：${item.bust}\n\n${link}`;

        try {
            console.log('------------------------------------------------');
            console.log(`Preparing to post to Threads for ${item.name}...`);

            const token = await threadsAuth.getAccessToken();
            if (!token) {
                console.error('No valid Threads access token available.');
                return;
            }

            // Step 1: Create Container
            console.log('Creating Threads container...');
            const containerRes = await axios.post(`${THREADS_API_BASE}/me/threads`, null, {
                params: {
                    media_type: 'TEXT',
                    text: postText,
                    access_token: token
                }
            });

            const creationId = containerRes.data.id;
            console.log(`Container created (ID: ${creationId}). Publishing...`);

            // Step 2: Publish Container
            await axios.post(`${THREADS_API_BASE}/me/threads_publish`, null, {
                params: {
                    creation_id: creationId,
                    access_token: token
                }
            });

            console.log('Threads post published successfully.');

            // Mark as posted
            item.threads_posted_at = new Date().toISOString();

            // Save immediately
            await saveData(items);

        } catch (e) {
            console.error('Failed to post to Threads:', e.message);
            if (e.response) {
                console.error('API Response:', e.response.data);
            }
        }
    }

    console.log('Threads process finished.');
})();
