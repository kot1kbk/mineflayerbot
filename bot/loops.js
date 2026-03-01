const { AD_TEXT, AD_CLAN } = require('../config');
const { saveData, sleep } = require('../utils');
const { getWeather } = require('../weather');
const { processExpiredPunishments } = require('../utils');

// запуск всех циклов
function startLoops(bot, state) {
    console.log(`>>> [${state.config.username} SYSTEM] Основные циклы запущены.`);

    const scannerState = {
        lastInviteSent: 0,
        nearbyPlayers: {}
    };

    const adminBotNames = ['__Zack__', 'KoTiK_B_KeDaH_'];

    // Предварительно отфильтрованные массивы рекламы (один раз при старте)
    const adsAll = AD_TEXT; // все пиары
    const adsSafe = AD_TEXT.filter(text => {
        const lower = text.toLowerCase();
        // Исключаем, если есть слова: гм1, гм 1, gm1, gm 1, эффект, effect
        return !/(гм\s?1|gm\s?1|эффект|effect)/i.test(lower);
    });

    // контроль позиции
    if (state.startPos) {
        setInterval(async () => {
            if (!bot.entity || !bot.entity.position) return;
            const distance = bot.entity.position.distanceTo(state.startPos); // добавить эту строку
            if (distance > 2.5) {
                console.log(`>>> [${state.config.username} POS] Смещение! Возврат на варп...`);
                bot.chat('/warp oilkanpvp');
                if (state.telegramBot) {
                    state.telegramBot.sendLog(`🔄 Бот <b>${state.config.username}</b> телепортировался на варп (смещение ${distance.toFixed(1)} блоков).`);
                }
                await sleep(1500);
                bot.chat(`/${state.config.targetServer}`);
            }
        }, 100);
    }

    // Проверка нахождения на нужном сервере (каждые 60 секунд)
    setInterval(() => {
        if (!bot.entity) return;
        // Отправляем команду переключения на целевой сервер
        bot.chat(`/${state.config.targetServer}`);
        state.serverCheck.checking = true;

        // Таймаут на случай, если ничего не придёт
        if (state.serverCheck.timer) clearTimeout(state.serverCheck.timer);
        state.serverCheck.timer = setTimeout(() => {
            if (state.serverCheck.checking) {
                state.serverCheck.checking = false;
                console.log(`>>> [${state.config.username}] Таймаут проверки сервера.`);
            }
        }, 10000); // 10 секунд
    }, 60000);

    setInterval(() => {
        // Выбираем подходящий массив в зависимости от ника бота
        const ads = adminBotNames.includes(state.config.username) ? adsAll : adsSafe;
        const msg = ads[Math.floor(Math.random() * ads.length)];
        bot.chat(msg);
        console.log(`>>> [${state.config.username} SEND] Глобал реклама`);
        state.telegramBot?.sendLog(`Рассылка глобал рекламы <b>${state.config.username}</b>.`);
    }, 120000);

    // клан реклама
    setInterval(() => {
        const msg = AD_CLAN[Math.floor(Math.random() * AD_CLAN.length)];
        bot.chat(`/cc ${msg}`);
        console.log(`>>> [${state.config.username} SEND] Клан реклама`);
        state.telegramBot?.sendLog(`Рассылка клан рекламы <b>${state.config.username}</b>.`);
    }, 210000);

    // Проверка просроченных наказаний каждые 30 секунд
    setInterval(() => {
        processExpiredPunishments(bot, state);
    }, 30000);

    setInterval(() => {
        bot.chat('/ci');
        console.log('>>> [INVENTAR] Очищение инвентаря..')
    }, 300000);

    // авто запрос топа кланов
    setInterval(() => {
        if (state.isReady) {
            console.log(`>>> [${state.config.username} CLAN] Автоматический запрос /c top...`);
            bot.chat('/c top');

            setTimeout(() => {
                bot.chat('/c top');
            }, 3000);
        }
    }, 5 * 60 * 1000); // 5 минут

    setTimeout(() => {
        if (state.isReady) {
            console.log(`>>> [${state.config.username} CLAN] Первый запрос топа...`);
            bot.chat('/c top');
        }
    }, 30000);

    // погода каждые 20 минут
    setInterval(async () => {
        try {
            console.log(`>>> [${state.config.username} WEATHER] Получаю погоду...`);
            const weather = await getWeather('москва');
            bot.chat(`!&fПогода в Москве: ${weather.message}`);
            console.log(`>>> [${state.config.username} WEATHER] Отправлено: ${weather.temp}°C`);
        } catch (error) {
            console.error(`>>> [${state.config.username} WEATHER] Ошибка:`, error.message);
        }
    }, 20 * 60 * 1000);

    // сканер игроков
    setInterval(() => {
        if (!state.autoInviteEnabled) {
            return;
        }
        if (!bot.entity) return;

        const now = Date.now() / 1000;
        const activeNow = new Set();
        const currentTime = Date.now();

        for (const id in bot.entities) {
            const entity = bot.entities[id];
            if (entity && entity.type === 'player' && entity.username !== bot.username) {
                const dist = bot.entity.position.distanceTo(entity.position);
                if (dist < 15) {
                    const name = entity.username;
                    activeNow.add(name);

                    // пропускаем игроков из черного списка
                    if (state.clanData.blacklist.includes(name)) {
                        console.log(`>>> [${state.config.username} ANTI-KDR] Игрок ${name} в ЧС. Пропускаю инвайт.`);
                        continue;
                    }

                    if (state.clanData.deaths[name] >= state.KICK_THRESHOLD) {
                        console.log(`>>> [${state.config.username} ANTI-KDR] ${name} имеет ${state.clanData.deaths[name]} смертей. Добавляю в ЧС.`);
                        if (!state.clanData.blacklist.includes(name)) {
                            state.clanData.blacklist.push(name);
                            saveData(state.clanData, state.config.dataFile);
                        }
                        continue;
                    }

                    const lastSeen = scannerState.nearbyPlayers[name] || 0;
                    if (now - lastSeen > 20) {
                        if (currentTime - scannerState.lastInviteSent < 3000) {
                            console.log(`>>> [${state.config.username} COOLDOWN] Пропускаю ${name}, жду...`);
                            continue;
                        }

                        console.log(`>>> [${state.config.username} INVITE] ${name} (${dist.toFixed(1)}m)`);
                        bot.chat(`/clan invite ${name}`);
                        scannerState.nearbyPlayers[name] = now;
                        scannerState.lastInviteSent = Date.now();
                    }
                }
            }
        }

        for (const name in scannerState.nearbyPlayers) {
            if (!activeNow.has(name) && now - scannerState.nearbyPlayers[name] > 15) {
                delete scannerState.nearbyPlayers[name];
            }
        }
    }, 1000);

    // анти афк
    setInterval(() => {
        if (bot.entity) {
            bot.look(bot.entity.yaw + (Math.random() - 0.5), bot.entity.pitch, true);
        }
    }, 30000);

    setTimeout(() => {
        bot.chat('/balance');
    }, 10000);

    // автосохр. данных
    setInterval(() => {
        saveData(state.clanData, state.config.dataFile);
    }, 300000);

    setInterval(() => {
        if (!bot.entity) return;
        for (const id in bot.entities) {
            const entity = bot.entities[id];
            if (entity && entity.type === 'player' && entity.username !== bot.username) {
                const name = entity.username;
                if (!state.clanData.playtime[name]) {
                    state.clanData.playtime[name] = {
                        firstSeen: Date.now(),
                totalSeconds: 0,
                lastUpdate: Date.now()
                    };
                } else {
                    const now = Date.now();
                    const lastUpdate = state.clanData.playtime[name].lastUpdate || now;
                    state.clanData.playtime[name].totalSeconds += Math.floor((now - lastUpdate) / 1000);
                    state.clanData.playtime[name].lastUpdate = now;
                }
            }
        }
    }, 5000);
}

module.exports = {
    startLoops
};
