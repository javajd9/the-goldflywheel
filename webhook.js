const express = require('express');
const config = require('./config');
const flywheel = require('./flywheel');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
});

app.get('/api/activity', async (req, res) => {
    try {
        const db = require('./db');
        const events = await db.getRecentEvents(20);

        const mappedEvents = (events || []).map(e => {
            let parsedMetadata = e.metadata;
            if (typeof e.metadata === 'string') {
                try {
                    parsedMetadata = JSON.parse(e.metadata);
                } catch (err) {
                    console.log(`  Warning: Failed to parse metadata for event ${e.id}`);
                    parsedMetadata = {};
                }
            }

            const eventWithParsedMeta = { ...e, metadata: parsedMetadata };

            return {
                id: e.id,
                type: e.event_type,
                amountIn: e.amount_in,
                amountOut: e.amount_out,
                tokenIn: e.token_in,
                tokenOut: e.token_out,
                status: e.status,
                txHash: e.tx_hash,
                timestamp: e.created_at,
                message: formatEventMessage(eventWithParsedMeta)
            };
        });

        res.json({
            success: true,
            events: mappedEvents
        });
    } catch (error) {
        console.error('API Error /api/activity:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

function formatEventMessage(e) {
    if (!e) return 'Unknown event';

    switch (e.event_type) {
        case 'fee_collection':
            return `Collected ${e.amount_in} SOL from Fees -> Converting to Gold`;
        case 'gold_purchase':
            return `Purchased ${e.amount_out} XAUT (Gold) on Ethereum`;
        case 'gold_sale':
            return `Sold ${e.amount_in} XAUT Gold -> Recieving SOL on Solana`;
        case 'redeploy_finish':
            return `Buyback Complete: ${e.amount_in} SOL -> ${config.tokens.projectCoinMint}`;
        case 'pumpfun_fee_claim':
            return `Claimed creator rewards from Pump.fun`;
        case 'bot_start':
            return `Gold Flywheel Bot System Started - Online`;
        case 'system_notice':
            if (e.metadata?.reason === 'insufficient_fees') {
                return `Fee Check: Balance (${e.metadata.balance || 0} SOL) is too low to swap.`;
            }
            if (e.metadata?.reason === 'no_gold_to_sell') {
                return `Redeploy Check: No Gold (XAUT) found to sell.`;
            }
            return `System: ${e.metadata?.reason || 'Notice'}`;
        case 'system_error':
            return `ERROR [${e.metadata?.context || 'System'}]: ${e.error_message}`;
        default:
            return `${e.event_type} - ${e.status}`;
    }
}

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        feeVault: config.wallets.feeVault,
    });
});

app.get('/api/test-fee-collection', async (req, res) => {
    console.log('[TEST] Manual fee collection triggered via API');
    try {
        const result = await flywheel.collectFeesAndBuyGold();
        res.json({ success: true, result });
    } catch (error) {
        console.error('[TEST] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/webhook/helius', async (req, res) => {
    try {
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Processing failed' });
    }
});

function startWebhookServer() {
    return new Promise((resolve) => {
        const port = config.webhook.port || 3000;
        const server = app.listen(port, () => {
            console.log(`Webhook server running on port ${port}`);
            resolve(server);
        });
    });
}

module.exports = {
    startWebhookServer,
};
