const axios = require('axios');
require('dotenv').config();

const sendTelegramMessage = async (text) => {
    const { BOT_TOKEN, CHAT_ID } = process.env;
    if (!BOT_TOKEN || !CHAT_ID) return;

    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text,
            parse_mode: 'Markdown'
        });
    } catch (err) {
        console.error("[Telegram Error]", err.response?.data || err.message);
    }
};

module.exports = { sendTelegramMessage };