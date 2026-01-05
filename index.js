const cron = require('node-cron');
const config = require('./config');
const db = require('./db');
const flywheel = require('./flywheel');
const snapshot = require('./snapshot');
const webhook = require('./webhook');

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    GOLD FLYWHEEL BOT                      ║
║         Automated Gold Tokenization & Redeployment        ║
╚═══════════════════════════════════════════════════════════╝
`);

function displayStatus() {
    const nextFee = flywheel.calculateNextFeeCollection();
    const nextRedeploy = flywheel.calculateNextRedeploy();

    console.log('\nSTATUS');
    console.log('─────────────────────────────────');
    console.log(`Current Time: ${new Date().toISOString()}`);
    console.log(`Next Fee Collection: ${nextFee.formatted}`);
    console.log(`Next Redeploy: ${nextRedeploy.formatted}`);
    console.log('─────────────────────────────────\n');
}

async function init() {
    console.log('Initializing Gold Flywheel Bot...\n');

    console.log('CONFIGURATION');
    console.log('─────────────────────────────────');
    console.log(`   Fee Vault: ${config.wallets.feeVault || 'Not set'}`);
    console.log(`   Gold Vault: ${config.wallets.goldVault || 'Not set'}`);
    console.log(`   Treasury: ${config.wallets.treasury || 'Not set'}`);
    console.log(`   Project Coin: ${config.tokens.projectCoinMint || 'Not set'}`);
    console.log(`   Redeploy %: ${config.flywheel.redeployPercentage * 100}%`);
    console.log(`   Webhook Enabled: ${config.webhook.enabled}`);
    console.log('─────────────────────────────────\n');

    flywheel.initRelativeTimers();

    await db.logEvent({
        eventType: 'bot_start',
        status: 'success',
        metadata: { version: 'RELATIVE_TIMERS_V3' }
    });

    setInterval(async () => {
        const feeCountdown = flywheel.calculateNextFeeCollection();
        const redeployCountdown = flywheel.calculateNextRedeploy();

        if (feeCountdown.msUntil <= 0) {
            console.log('\n════════════════════════════════════════');
            console.log('RELATIVE TRIGGER: Starting Fee Collection');
            console.log('════════════════════════════════════════');
            await flywheel.collectFeesAndBuyGold();
            displayStatus();
        }

        if (redeployCountdown.msUntil <= 0) {
            console.log('\n════════════════════════════════════════');
            console.log('RELATIVE TRIGGER: Starting Gold Redeploy');
            console.log('════════════════════════════════════════');
            await flywheel.redeployGold();
            displayStatus();
        }
    }, 10000);

    console.log(`Scheduled relative fee collection (5m) and redeploy (15m)`);

    cron.schedule('*/5 * * * *', async () => {
        await flywheel.finishRedeploy();
    });

    cron.schedule(config.intervals.snapshot, async () => {
        await snapshot.updateSnapshot();
    });
    console.log(`Scheduled snapshot: ${config.intervals.snapshot}`);

    console.log(`DEBUG: Checking if webhook should start... Enabled: ${config.webhook.enabled}`);
    if (config.webhook.enabled) {
        try {
            await webhook.startWebhookServer();
        } catch (error) {
            console.error('Failed to start webhook server:', error.message);
        }
    }

    displayStatus();

    console.log('Creating initial snapshot...');
    await snapshot.updateSnapshot();

    console.log('\nGold Flywheel Bot is running!');
    console.log('   Press Ctrl+C to stop.\n');
}

async function shutdown() {
    console.log('\nShutting down...');

    try {
        await db.closePool();
    } catch (error) {
        console.error('Error closing database:', error.message);
    }

    console.log('Goodbye!');
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

init().catch((error) => {
    console.error('Failed to initialize:', error);
    process.exit(1);
});
