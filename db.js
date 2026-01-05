const { Pool } = require('pg');
const config = require('./config');

const poolConfig = {
    connectionString: config.database.url,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
};

if (config.database.ssl) {
    poolConfig.ssl = {
        rejectUnauthorized: false,
    };
}

const pool = new Pool(poolConfig);

pool.on('connect', () => {
    console.log('Database connected');
});

pool.on('error', (err) => {
    console.error('Database error:', err.message);
});

async function logEvent({
    eventType,
    amountIn = null,
    amountOut = null,
    tokenIn = null,
    tokenOut = null,
    txHash = null,
    status = 'pending',
    errorMessage = null,
    metadata = null,
}) {
    const query = `
    INSERT INTO events (
      event_type, amount_in, amount_out, token_in, token_out,
      tx_hash, status, error_message, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

    const values = [
        eventType,
        amountIn,
        amountOut,
        tokenIn,
        tokenOut,
        txHash,
        status,
        errorMessage,
        metadata ? JSON.stringify(metadata) : null,
    ];

    try {
        const result = await pool.query(query, values);
        return result.rows[0];
    } catch (error) {
        console.error(`[DB] FAILED to log event: ${error.message}`);
        return null;
    }
}

async function updateEventStatus(eventId, status, txHash = null, errorMessage = null) {
    const query = `
    UPDATE events 
    SET status = $2, tx_hash = COALESCE($3, tx_hash), error_message = $4
    WHERE id = $1
    RETURNING *
  `;

    const result = await pool.query(query, [eventId, status, txHash, errorMessage]);
    return result.rows[0];
}

async function getRecentEvents(limit = 50, eventType = null) {
    let query = `
    SELECT * FROM events 
    WHERE ($1::varchar IS NULL OR event_type = $1)
    ORDER BY created_at DESC 
    LIMIT $2
  `;

    const result = await pool.query(query, [eventType, limit]);
    return result.rows;
}

async function saveSnapshot(snapshot) {
    const query = `
    INSERT INTO snapshots (
      fee_vault_balance, gold_vault_balance, treasury_balance,
      gold_price_usd, gold_cost_basis, gold_current_value,
      unrealized_pnl, realized_pnl, total_pnl,
      total_fees_collected, total_gold_purchased, total_gold_sold, total_coins_purchased,
      next_fee_collection, next_redeploy, estimated_redeploy_usd,
      gold_ounces, estimated_redeploy_ounces, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING *
  `;

    const values = [
        snapshot.feeVaultBalance || 0,
        snapshot.goldVaultBalance || 0,
        snapshot.treasuryBalance || 0,
        snapshot.goldPriceUsd || null,
        snapshot.goldCostBasis || 0,
        snapshot.goldCurrentValue || 0,
        snapshot.unrealizedPnl || 0,
        snapshot.realizedPnl || 0,
        snapshot.totalPnl || 0,
        snapshot.totalFeesCollected || 0,
        snapshot.totalGoldPurchased || 0,
        snapshot.totalGoldSold || 0,
        snapshot.totalCoinsPurchased || 0,
        snapshot.nextFeeCollection || null,
        snapshot.nextRedeploy || null,
        snapshot.estimatedRedeployUsd || 0,
        snapshot.goldOunces || 0,
        snapshot.estimatedRedeployOunces || 0,
        snapshot.metadata ? JSON.stringify(snapshot.metadata) : null,
    ];

    try {
        const result = await pool.query(query, values);
        return result.rows[0];
    } catch (error) {
        console.error('Failed to save snapshot:', error.message);
        throw error;
    }
}

async function getLatestSnapshot() {
    const query = 'SELECT * FROM snapshots ORDER BY created_at DESC LIMIT 1';
    const result = await pool.query(query);
    return result.rows[0] || null;
}

async function getAggregatedStats() {
    const query = `
    SELECT 
      COALESCE(SUM(CASE WHEN event_type = 'fee_collection' THEN amount_in ELSE 0 END), 0) as total_fees,
      COALESCE(SUM(CASE WHEN event_type = 'gold_purchase' THEN amount_out ELSE 0 END), 0) as total_gold_bought,
      COALESCE(SUM(CASE WHEN event_type = 'gold_sale' THEN amount_in ELSE 0 END), 0) as total_gold_sold,
      COALESCE(SUM(CASE WHEN event_type = 'redeploy_finish' THEN amount_out ELSE 0 END), 0) as total_coins_bought
    FROM events
    WHERE status = 'success'
  `;

    const result = await pool.query(query);
    return result.rows[0];
}

async function closePool() {
    await pool.end();
    console.log('Database connection closed');
}

module.exports = {
    pool,
    logEvent,
    updateEventStatus,
    getRecentEvents,
    saveSnapshot,
    getLatestSnapshot,
    getAggregatedStats,
    closePool,
};
