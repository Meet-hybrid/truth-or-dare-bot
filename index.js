const { Client, LocalAuth, Buttons } = require('whatsapp-web.js');
const { truths, dares } = require('./tasks');

const puppeteerConfig = process.platform === 'win32'
    ? { headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--no-sandbox'] }
    : { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] };

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: puppeteerConfig
});

const games = new Map();

function getGame(chatId) {
    if (!games.has(chatId)) {
        games.set(chatId, {
            players: [],
            currentIndex: 0,
            started: false
        });
    }
    return games.get(chatId);
}

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function currentPlayer(game) {
    if (!game.players.length) return null;
    return game.players[game.currentIndex % game.players.length];
}

function nextTurn(game) {
    game.currentIndex = (game.currentIndex + 1) % game.players.length;
}

function senderId(msg) {
    return msg.author || msg.from;
}

async function promptStart(client, chatId, name) {
    const msg = `${name}, it is your turn!\n\nReply with *play* (or tap Start if you see a button) to get your Truth or Dare.`;
    try {
        const button = new Buttons(msg, [{ body: 'Start', id: 'start' }]);
        await client.sendMessage(chatId, button);
    } catch (e) {
        await client.sendMessage(chatId, msg);
    }
}

client.on('qr', (qr) => {
    console.log('Scan this QR code with WhatsApp on your phone:');
    require('qrcode-terminal').generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Bot is online! Tell your friends to message it.');
});

let reconnecting = false;
client.on('disconnected', async (reason) => {
    console.log(`Disconnected: ${reason}. Reconnecting in 10s...`);
    if (reconnecting) return;
    reconnecting = true;
    setTimeout(async () => {
        try {
            await client.initialize();
        } catch (e) {
            console.log('Reconnect failed: ' + e.message);
        } finally {
            reconnecting = false;
        }
    }, 10000);
});

client.on('auth_failure', (msg) => {
    console.log('Auth failure: ' + msg + ' (may need to re-scan QR code)');
});

process.on('uncaughtException', (e) => {
    console.log('Uncaught: ' + e.message);
});
process.on('unhandledRejection', (e) => {
    console.log('Unhandled rejection: ' + (e && e.message));
});

client.on('message', async (msg) => {
    const body = msg.body.trim();
    const chatId = msg.from;
    const sender = senderId(msg);
    const contact = await msg.getContact();
    const name = contact.pushname || contact.name || 'Player';
    console.log(`[MSG] from=${sender} body="${body}"`);

    if (body === '/help') {
        await client.sendMessage(chatId,
            `*Truth or Dare Bot*\n\n` +
            `- Type /play to start a game (you join first).\n` +
            `- Friends type /join to join the game.\n` +
            `- Each player takes a turn.\n` +
            `- On your turn, just reply with the word "play" (or tap the Start button).\n` +
            `- The bot randomly gives you a TRUTH or a DARE to do.\n` +
            `- Then it's the next player's turn.\n` +
            `- Type /end to stop the game.`);
        return;
    }

    if (body === '/play') {
        const game = getGame(chatId);
        game.players = [];
        game.currentIndex = 0;
        game.started = true;
        game.players.push(sender);
        await client.sendMessage(chatId, `New game started! ${name} joined first.\n\nOthers can type /join to play.`);
        await promptStart(client, chatId, name);
        return;
    }

    if (body === '/join') {
        const game = getGame(chatId);
        if (!game.started) {
            await client.sendMessage(chatId, 'No active game. Type /play to start one.');
            return;
        }
        if (game.players.includes(sender)) {
            await client.sendMessage(chatId, `${name}, you are already in the game.`);
            return;
        }
        game.players.push(sender);
        await client.sendMessage(chatId, `${name} joined the game! Players: ${game.players.length}`);
        return;
    }

    if (body === '/restart' || body === '/end') {
        games.delete(chatId);
        await client.sendMessage(chatId, 'Game ended. Type /play to start a new one.');
        return;
    }

    const low = body.toLowerCase();
    if (low === 'start' || low === 'play') {
        const game = getGame(chatId);
        if (!game.started || !game.players.length) {
            if (low === 'play') {
                await client.sendMessage(chatId, 'Type /play to start a game.');
            }
            return;
        }
        if (sender !== currentPlayer(game)) {
            await client.sendMessage(chatId, `It is not your turn.`);
            return;
        }

        const choice = Math.random() < 0.5 ? 'T' : 'D';
        const task = choice === 'T' ? pick(truths) : pick(dares);
        const label = choice === 'T' ? 'TRUTH' : 'DARE';
        await client.sendMessage(
            chatId,
            `*${label}*\n${name}, your task:\n\n${task}`
        );

        nextTurn(game);
        const next = currentPlayer(game);
        const nextContact = await client.getContactById(next);
        const nextName = nextContact.pushname || nextContact.name || 'Player';
        await promptStart(client, chatId, nextName);
        return;
    }
});

client.initialize();
