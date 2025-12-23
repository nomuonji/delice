const gas = require('./gas_db');
require('dotenv').config();

const NEW_TOKEN = process.env.THREADS_NEW_TOKEN;
const TABLE_NAME = 'threads_auth';

(async () => {
    console.log('Updating token in GAS DB...');
    try {
        // 1. Get existing records
        const result = await gas.getTableData(TABLE_NAME);
        let records = [];
        if (result && result.data && Array.isArray(result.data)) {
            records = result.data;
        } else if (Array.isArray(result)) {
            // Depending on API structure
            records = result;
        }

        if (records.length > 0) {
            // Update the first record found
            const targetId = records[0].id;
            console.log(`Found existing record with ID: ${targetId}. Updating...`);

            await gas.updateRecord(TABLE_NAME, targetId, {
                access_token: NEW_TOKEN,
                last_updated: new Date().toISOString()
            });
            console.log('Token updated successfully.');
        } else {
            // No record, create new
            console.log('No existing record found. Creating new...');
            await gas.createRecord(TABLE_NAME, {
                access_token: NEW_TOKEN,
                last_updated: new Date().toISOString()
            });
            console.log('Token created successfully.');
        }

    } catch (e) {
        console.error('Failed to update token:', e);
    }
})();
