The system operates in a precise, two-stage cycle:

Phase 1: Fee Capture & Tokenization (Every 15 Minutes)
Creator Fee Claim: The bot checks PumpPortal for any accrued creator fees from the project's Pump.fun bonding curve.
SOL Sweep: If fees are detected, they are claimed and swept from the creator wallet into the central Fee Vault.
Cross-Chain Swap: When the Fee Vault exceeds a threshold (e.g., 0.01 SOL), the system initiates a SimpleSwap exchange.
Gold Acquisition: SOL is sent to a deposit address; SimpleSwap converts the SOL to XAUT (Tether Gold) and sends it to the Ethereum Gold Vault.
Phase 2: Redeployment & Buyback (Every 15 Minutes)
Gold Liquidation: The bot calculates 25% of the current gold holdings.
Cross-Chain Return: A SimpleSwap exchange is initiated to sell XAUT (ETH) for SOL (Solana).
The Buyback: Once the SOL arrives in the bot's wallet, it uses the Jupiter Aggregator to swap the SOL for $gold
Treasury Growth: The purchased tokens are sent to the institutional Treasury Wallet, effectively reducing circulating supply or building project reserves.
