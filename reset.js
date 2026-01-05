const { pool } = require('./db');

async function resetDatabase() {
    console.log('\nWARNING: This will DELETE ALL DATA from the database!');
    console.log('   Tables: events, snapshots');
    console.log('   Waiting 5 seconds... Press Ctrl+C to cancel.\n');

    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('Resetting database...');

    try {
        await pool.query('TRUNCATE TABLE events, snapshots RESTART IDENTITY CASCADE');
        console.log('Database reset successfully!');
    } catch (error) {
        console.error('Reset failed:', error.message);
    } finally {
        await pool.end();
    }
}

resetDatabase();
