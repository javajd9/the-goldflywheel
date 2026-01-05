const config = require('./config');

async function collectCreatorFees(pool = null, mint = null) {
    console.log('\n--- PUMPPORTAL FEE CLAIM START ---');

    const apiKey = config.pumpPortal.apiKey;
    console.log(`   API Key configured: ${apiKey ? 'YES (hidden)' : 'NO'}`);

    if (!apiKey) {
        console.error('   ERROR: PUMPPORTAL_API_KEY not configured in .env');
        return { success: false, error: 'API key not configured' };
    }

    const selectedPool = pool || config.pumpPortal.pool;
    const tokenMint = mint || config.pumpPortal.tokenMint;

    console.log(`   Pool: ${selectedPool}`);
    console.log(`   Token Mint: ${tokenMint || 'Not specified (claiming all)'}`);

    try {
        const requestBody = {
            action: 'collectCreatorFee',
            priorityFee: 0.000001,
            pool: selectedPool,
        };

        if (selectedPool === 'meteora-dbc' && tokenMint) {
            requestBody.mint = tokenMint;
        }

        console.log('   Request Body:', JSON.stringify(requestBody, null, 2));
        console.log('   Sending request to PumpPortal API...');

        const response = await fetch(
            `https://pumpportal.fun/api/trade?api-key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            }
        );

        console.log(`   Response Status: ${response.status} ${response.statusText}`);
        const data = await response.json();
        console.log('   Response Body:', JSON.stringify(data, null, 2));

        if (data.error || data.errors) {
            const errorMsg = data.error || data.errors?.join(', ') || 'Unknown error';
            console.error(`   FAILED: ${errorMsg}`);
            console.log('--- PUMPPORTAL FEE CLAIM END (FAILED) ---\n');
            return { success: false, error: errorMsg };
        }

        if (data.signature) {
            console.log(`   SUCCESS: Fees collected!`);
            console.log(`   TX Signature: ${data.signature}`);
            console.log('--- PUMPPORTAL FEE CLAIM END (SUCCESS) ---\n');
            return {
                success: true,
                txHash: data.signature,
                pool: selectedPool,
                mint: tokenMint,
            };
        }

        console.log('   No fees to collect or already claimed');
        console.log('--- PUMPPORTAL FEE CLAIM END (NO FEES) ---\n');
        return { success: true, noFees: true, data };

    } catch (error) {
        console.error(`   EXCEPTION: ${error.message}`);
        console.log('--- PUMPPORTAL FEE CLAIM END (ERROR) ---\n');
        return { success: false, error: error.message };
    }
}

function isPumpPortalConfigured() {
    return Boolean(config.pumpPortal.apiKey);
}

module.exports = {
    collectCreatorFees,
    isPumpPortalConfigured,
};
