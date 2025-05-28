require('dotenv').config();
const WebSocket = require('ws');
const Binance = require('binance-api-node').default;
const { sendTelegramMessage } = require('./utils/telegram');

const symbol = 'BTCUSDT';
const leverage = 5;
const profitTarget = 0.0035; // 0.35%
const fee = 0.0008;
const COOLDOWN_MS = 5000; // 5 segundos
const MAX_HOLD_TIME_MS = 60 * 60 * 1000; // 1 hora
const SAFE_EXIT_THRESHOLD = 0.001; // 0.10% bruto

let position = 'LONG';
let entryPrice = null;
let capital = 25;
let lastOperationTime = 0;
let entryTime = null;

const log = async (msg) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${msg}`);
    await sendTelegramMessage(`**\\[swing-bot]:** ${msg}`);
};

const client = Binance({
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET,
    futures: true,
    httpFutures: process.env.USE_TESTNET === "true"
        ? 'https://testnet.binancefuture.com'
        : 'https://fapi.binance.com'
});

async function main() {
    await client.futuresLeverage({ symbol, leverage });
    await log(`🚀 Bot ativo e monitorando ${symbol} com alavancagem ${leverage}x`);

    const stream = process.env.USE_TESTNET === "true"
        ? `wss://stream.binancefuture.com/ws/${symbol.toLowerCase()}@ticker`
        : `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@ticker`;

    const ws = new WebSocket(stream);

    ws.on('open', () => {
        log(`🔌 Conectado ao WebSocket de ticker da Binance (${process.env.USE_TESTNET === "true" ? 'Testnet' : 'Real'})`);
    });

    ws.on('message', async (data) => {
        const json = JSON.parse(data);
        const price = parseFloat(json.c);

        if (isNaN(price)) {
            console.log(`[swing-bot] ⚠️ Preço inválido recebido:`, json);
            return;
        }

        const now = Date.now();

        if (!entryPrice) {
            entryPrice = price;
            entryTime = now;
            await log(`📌 Abrindo nova posição (${position}) a ${price}.`);
            return;
        }

        const change = (price - entryPrice) / entryPrice;
        const profit = (position === 'LONG' ? change : -change) * leverage;
        const timeHeld = now - entryTime;
        const shouldExitForTimeout = timeHeld > MAX_HOLD_TIME_MS && profit > SAFE_EXIT_THRESHOLD;

        if ((profit > profitTarget || shouldExitForTimeout) && now - lastOperationTime > COOLDOWN_MS) {
            lastOperationTime = now;
            const netProfit = profit - (fee * 2);
            capital *= (1 + netProfit);

            const logPrefix = shouldExitForTimeout ? '⏱️ Saída forçada por tempo em posição' : `💰 Fechando ${position}`;

            const isGain = netProfit >= 0;
            const resultEmoji = isGain ? '💰' : '🔻';
            const resultWord = isGain ? 'lucro' : 'prejuízo';

            await log(`${resultEmoji} ${logPrefix} com ${resultWord} bruto de ${(profit * 100).toFixed(2)}% | líquido: ${(netProfit * 100).toFixed(2)}%. Capital: ${capital.toFixed(2)} USDT`);


            position = position === 'LONG' ? 'SHORT' : 'LONG';
            entryPrice = price;
            entryTime = now;

            await log(`📌 Abrindo nova posição (${position}) a ${price}.`);
        }
    });

    ws.on('error', async (err) => {
        console.error("❌ Erro no WebSocket:", err);
        await sendTelegramMessage(`❌ Erro no WebSocket: ${err.message}`);
    });

    ws.on('close', async () => {
        await log('🔌 WebSocket encerrado');
    });
}

main().catch(async (err) => {
    console.error("Erro fatal:", err);
    await sendTelegramMessage(`**\[swing-bot\]:** ❌ Erro fatal: ${err.message}`);
});
