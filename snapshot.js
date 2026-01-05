const config = require('./config');
const db = require('./db');
const rpc = require('./rpc');
const dex = require('./dex');
const flywheel = require('./flywheel');
const eth = require('./eth');

async function calculatePnL(goldBalance, currentGoldPrice) {
    try {
        const stats = await db.getAggregatedStats();
        const latestSnapshot = await db.getLatestSnapshot();

        const costBasis = parseFloat(latestSnapshot?.gold_cost_basis || 0);

        const currentValue = goldBalance * currentGoldPrice;

        const unrealizedPnl = currentValue - costBasis;

        const realizedPnl = parseFloat(latestSnapshot?.realized_pnl || 0);

        const totalPnl = unrealizedPnl + realizedPnl;

        return {
            goldBalance,
            currentGoldPrice,
            costBasis,
            currentValue,
            unrealizedPnl,
            realizedPnl,
            totalPnl,
            pnlPercentage: costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0,
        };
    } catch (error) {
        console.error('PNL calculation failed:', error.message);
        return {
            goldBalance,
            currentGoldPrice,
            costBasis: 0,
            currentValue: goldBalance * currentGoldPrice,
            unrealizedPnl: 0,
            realizedPnl: 0,
            totalPnl: 0,
            pnlPercentage: 0,
        };
    }
}

async function updateSnapshot() {
    console.log('\n════════════════════════════════════════');
    console.log('UPDATING SNAPSHOT');
    console.log('════════════════════════════════════════');
    console.log(`${new Date().toISOString()}`);

    try {
        const feeVaultBalance = await rpc.getSolBalance(config.wallets.feeVault);

        const goldVaultBalance = await eth.getXautBalance();

        let treasuryBalance = 0;
        if (config.tokens.projectCoinMint && !config.tokens.projectCoinMint.includes('AddressHere')) {
            try {
                treasuryBalance = await rpc.getTokenBalance(
                    config.wallets.treasury,
                    config.tokens.projectCoinMint
                );
            } catch (err) {
                console.warn(`Could not fetch treasury balance: ${err.message}`);
            }
        }

        const goldPrice = await dex.getGoldPrice();

        const pnl = await calculatePnL(goldVaultBalance, goldPrice);

        const stats = await db.getAggregatedStats();

        const nextFeeCollection = flywheel.calculateNextFeeCollection();
        const nextRedeploy = flywheel.calculateNextRedeploy();

        const estimatedRedeployUsd = pnl.currentValue * config.flywheel.redeployPercentage;
        const goldOunces = goldVaultBalance;
        const estimatedRedeployOunces = goldVaultBalance * config.flywheel.redeployPercentage;

        const snapshot = await db.saveSnapshot({
            feeVaultBalance,
            goldVaultBalance,
            treasuryBalance,
            goldPriceUsd: goldPrice,
            goldCostBasis: pnl.costBasis,
            goldCurrentValue: pnl.currentValue,
            estimatedRedeployUsd,
            goldOunces,
            estimatedRedeployOunces,
            unrealizedPnl: pnl.unrealizedPnl,
            realizedPnl: pnl.realizedPnl,
            totalPnl: pnl.totalPnl,
            totalFeesCollected: stats.total_fees || 0,
            totalGoldPurchased: stats.total_gold_bought || 0,
            totalGoldSold: stats.total_gold_sold || 0,
            totalCoinsPurchased: stats.total_coins_bought || 0,
            nextFeeCollection: nextFeeCollection.nextCollection,
            nextRedeploy: nextRedeploy.nextRedeploy,
            metadata: {
                goldPrice,
                pnlPercentage: pnl.pnlPercentage,
            },
        });

        console.log('Snapshot saved!');
        console.log(`   Fee Vault: ${feeVaultBalance} SOL`);
        console.log(`   Gold Vault: ${goldVaultBalance} XAUT (${goldOunces.toFixed(4)} OZ)`);
        console.log(`   Treasury: ${treasuryBalance} COIN`);
        console.log(`   Gold Price: $${goldPrice}`);
        console.log(`   Estimated Redeploy: $${estimatedRedeployUsd.toFixed(2)}`);
        const displayPnl = Number.isFinite(pnl.totalPnl) ? pnl.totalPnl : 0;
        console.log(`   Total PNL: ${displayPnl >= 0 ? '+' : ''}${displayPnl.toFixed(2)}`);
        console.log(`   Next Fee Collection: ${nextFeeCollection.formatted}`);
        console.log(`   Next Redeploy: ${nextRedeploy.formatted}`);

        return snapshot;

    } catch (error) {
        console.error('Snapshot update failed:', error.message);
        await db.logEvent({
            eventType: 'system_error',
            status: 'failed',
            error_message: error.message,
            metadata: { context: 'snapshot_update' }
        });
        return null;
    }
}

module.exports = {
    calculatePnL,
    updateSnapshot,
};
