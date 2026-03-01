const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
const { loadData, saveData } = require('../utils');
const { setupMessageHandler, processNextPlayerStats } = require('./handlers');
const { startLoops } = require('./loops');
const { sleep } = require('../utils');
const consoleInput = require('../consoleInput');

// создание бота
function createBot(config, telegramBot, activeBots, botsMap) {
    console.log(`>>> [${config.username}] Подключение к ${config.host}...`);
    console.log(`>>> [${config.username}] TelegramBot получен:`, telegramBot ? 'ДА' : 'НЕТ');

    const bot = mineflayer.createBot({
        host: config.host,
        port: config.port,
        username: config.username,
        version: config.version,
        auth: config.auth,
        hideErrors: false,
        checkTimeoutInterval: 60000,
        viewDistance: 'tiny',
    });

    bot.loadPlugin(pathfinder);

    // состояние бота
    const state = {
        config,
        telegramBot,
        botsMap: botsMap,
        startPos: null,
        isReady: false,
        loginDone: false,
        nearbyPlayers: {},
        spawnTimeout: null,
        worldReceived: false,
        isLogicSequenceRunning: false,
        autoInviteEnabled: true,
        adEnabled: true,
        botStatus: 'Активен',
        clanData: loadData(config.dataFile),
        KICK_THRESHOLD: 5,
        commandCooldowns: {},
        commandHistory: {},
        balance: null,
        lastBalanceCheck: null,
        lastRefillTime: 0
    };
    state.publicCommands = new Set();          // команды, доступные всем
    state.playerPermissions = new Map();       // Map<ник, Set<команда>>
    state.mb = {};
    state.tempAdmins = [];
    state.cityGames = {};
    state.checkingServer = false; // флаг, что мы отправили проверочный варп
    state.checkTimer = null;      // таймаут для сброса флага
    state.serverCheck = {
        checking: false,   // ожидаем ответ после отправки команды
        timer: null        // таймаут
    };
    // после загрузки clanData
    if (state.clanData.pendingAntiKDRScan) {
        const pending = state.clanData.pendingAntiKDRScan;
        // Проверяем, что сохранено не более 5 минут назад
        if (Date.now() - pending.timestamp < 5 * 60 * 1000) {
            console.log(`>>> [${config.username}] Обнаружено незавершённое сканирование, восстанавливаю...`);
            state.antiKDRScan = {
                active: true,
                type: pending.type,
                threshold: pending.threshold,
                players: pending.players,
                results: pending.results,
                processedCount: pending.processedCount,
                currentTimeout: null,
                initiatedBy: pending.initiatedBy,
                awaitingInfo: false,
                collecting: false
            };
            setTimeout(() => processNextPlayerStats(bot, state), 2000);
        } else {
            delete state.clanData.pendingAntiKDRScan;
            saveData(state.clanData, state.config.dataFile);
        }
    }

    bot.once('login', () => {
        consoleInput.addBot(bot, config.username);
    });

    // удален бота из консоли при отключении
    bot.on('end', () => {
        consoleInput.removeBot(config.username);
        // Безопасное удаление из массива
        if (activeBots && Array.isArray(activeBots)) {
            const index = activeBots.findIndex(b => b.username === config.username);
            if (index !== -1) activeBots.splice(index, 1);
        }
    });

    // Таймаут на зависание
    const setSpawnTimeout = () => {
        if (state.spawnTimeout) clearTimeout(state.spawnTimeout);
        state.spawnTimeout = setTimeout(() => {
            if (!state.isReady) {
                console.log(`>>> [${config.username} TIMEOUT] Бот завис. Перезапуск...`);
                bot.quit();
            }
        }, 25000);
    };

    setSpawnTimeout();

    // Настройка обработчиков событий
    setupMessageHandler(bot, state);

    // Обработка других событий
    bot.on('login', () => {
        console.log(`>>> [${config.username} NET] Соединение установлено.`);
        state.worldReceived = false;
    });

    bot.on('world', () => {
        console.log(`>>> [${config.username} WORLD] Данные мира получены. Можно действовать.`);
        state.worldReceived = true;
        startLogicSequence(bot, state);
    });

    bot.on('spawn', async () => {
        console.log(`>>> [${config.username} SPAWN] Событие spawn получено.`);
        state.telegramBot?.sendLog(`✅ Бот <b>${config.username}</b> зашёл на сервер.`);
        if (state.spawnTimeout) clearTimeout(state.spawnTimeout);
        if (!state.isReady) {
            startLogicSequence(bot, state);
        }
    });

    bot.on('error', (err) => console.log(`>>> [${config.username} ERR] ${err.message}`));

    bot.on('end', (reason) => {
        if (state.spawnTimeout) clearTimeout(state.spawnTimeout);
        console.log(`>>> [${config.username} DISCONNECT] Причина: ${reason}. Рестарт через 10с...`);
        setTimeout(() => createBot(config), 10000);
    });

    // Функция последовательности входа
    async function startLogicSequence(botInstance, state) {
        if (state.isReady || state.isLogicSequenceRunning) return;
        state.isLogicSequenceRunning = true;
        console.log(`>>> [${config.username} LOGIC] Начинаю последовательность входа...`);

        if (!state.loginDone) {
            console.log(`>>> [${config.username} 1/3] Отправляю пароль...`);
            botInstance.chat(`/l ${config.password}`);
            state.loginDone = true;
            await sleep(5000);
        }
        botInstance.chat('/unlock 2308');
        console.log(`>>> [${config.username} 2/3] Переход на ${config.targetServer}...`);
        botInstance.chat(`/${config.targetServer}`);
        await sleep(5000);

        console.log(`>>> [${config.username} 3/3] Варп и вступление в клан...`);
        botInstance.chat('/warp oilkanpvp');
        await sleep(2000);
        botInstance.chat('/c join ChertHouse');
        await sleep(3000);
        botInstance.chat('/gm 1');
        await sleep(1000);
        botInstance.chat('/chatcolor reset')
        await sleep(1000);
        bot.chat('/nick ChertHouse');

        if (botInstance.entity && botInstance.entity.position) {
            state.startPos = botInstance.entity.position.clone();
            state.isReady = true;
            console.log(`>>> [${config.username} SUCCESS] Бот готов! Точка: ${state.startPos.x.toFixed(1)}, ${state.startPos.y.toFixed(1)}`);
            state.telegramBot?.sendLog(`✅ Бот <b>${config.username}</b> готов к работе.`);
            if (state.spawnTimeout) clearTimeout(state.spawnTimeout);
            startLoops(botInstance, state);
        } else {
            state.isReady = true;
            console.log(`>>> [${config.username} SUCCESS] Бот готов (позиция не зафиксирована).`);
            if (state.spawnTimeout) clearTimeout(state.spawnTimeout);
            startLoops(botInstance, state);
        }
    }

    return bot;
}

module.exports = {
    createBot
};
