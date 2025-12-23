const fs = require('fs');
const gas = require('./gas_db');
require('dotenv').config();

const TABLE_NAME = 'threads_auth';
const RECORD_ID = 'delice_website_session';

(async () => {
    console.log('--- Auth Data Uploader ---');
    console.log('This script uploads your website authentication JSON to the GAS Database.');
    console.log(`Target Table: ${TABLE_NAME}`);
    console.log(`Record ID: ${RECORD_ID}`);

    // 1. Check for local auth.json
    const authFile = 'auth.json';
    let jsonData = null;

    if (fs.existsSync(authFile)) {
        console.log(`Found local file: ${authFile}`);
        try {
            const content = fs.readFileSync(authFile, 'utf8');
            jsonData = JSON.parse(content);
            console.log('Successfully read and validated local auth.json');
        } catch (e) {
            console.error('Failed to read or parse auth.json:', e.message);
        }
    } else {
        console.log('No local auth.json found.');

        // 2. Check environment variable as fallback (though we know it might be corrupted, we try)
        if (process.env.AUTH_JSON_BASE64) {
            console.log('Checking AUTH_JSON_BASE64 env var...');
            try {
                const buffer = Buffer.from(process.env.AUTH_JSON_BASE64, 'base64');
                const jsonStr = buffer.toString('utf8');
                jsonData = JSON.parse(jsonStr);
                console.log('Successfully decoded AUTH_JSON_BASE64 from env.');
            } catch (e) {
                console.log('Env var seems corrupted or invalid. Skipping.');
            }
        }

        if (!jsonData) {
            console.error('ERROR: No valid auth data found.');
            console.error('Please verify "auth.json" exists in the root directory.');
            console.error('You can create it by copying the content of your cookies JSON.');
            process.exit(1);
        }
    }

    // 3. Upload to GAS DB
    try {
        const jsonStr = JSON.stringify(jsonData);
        console.log(`Uploading data (${jsonStr.length} bytes)...`);

        // Check if record exists
        const result = await gas.getTableData(TABLE_NAME);
        let exists = false;

        let records = [];
        if (result && result.data && Array.isArray(result.data)) {
            records = result.data;
        } else if (Array.isArray(result)) {
            records = result;
        }

        exists = records.some(r => r.id === RECORD_ID);

        if (exists) {
            console.log('Updating existing session record...');
            await gas.updateRecord(TABLE_NAME, RECORD_ID, {
                access_token: jsonStr,
                last_updated: new Date().toISOString()
            });
        } else {
            console.log('Creating new session record...');
            await gas.createRecord(TABLE_NAME, {
                id: RECORD_ID,
                access_token: jsonStr,
                last_updated: new Date().toISOString()
            });
        }
        console.log('Upload Complete! You can now delete auth.json and clear AUTH_JSON_BASE64 from .env.');

    } catch (e) {
        console.error('Upload failed:', e.message);
    }

})();
