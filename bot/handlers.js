const { sleep, saveData, getLevelProgress, getRank, getMessageXP } = require('../utils');
const { sendServerInfo } = require('../utils');
const { KICK_THRESHOLD, ADMINS } = require('../config');
const { getTimeUntilNextRefill } = require('../utils');
const CommandHandler = require('./commands');
const ClanParser = require('../clanParser'); // ДОБАВЬ ЭТУ СТРОКУ
const STATS_TIMEOUT = 5000;
const STATS_DELAY = 1500;         // 1.5 сек между запросами /c stats
const KICK_DELAY = 500;           // 0.5 сек между киками
const START_DELAY = 2000;


function setupMessageHandler(bot, state) {
    const commandHandler = new CommandHandler();
    const clanParser = new ClanParser(); // ДОБАВЬ ЭТУ СТРОКУ - СОЗДАЕМ ЭКЗЕМПЛЯР

    bot.on('message', async (jsonMsg) => {
        const msg = jsonMsg.toString();

        // Логируем только нужные чаты
        /*if (msg.startsWith('[ʟ]') || msg.startsWith('[ɢ]') || msg.startsWith('КЛАН:')) {
            console.log(`>>> [${state.config.username} MSG] ${msg}`);
        }*/

        console.log(`${msg}`);

        // Анти-тролль команда
        if (msg.includes('Freeze has been toggled!')) {
            console.log(`>>> [${state.config.username}] ТРОЛЛЬ КОМАНДА!`);
            setTimeout(() => {
                bot.quit();
            }, 1000);
            state.telegramBot?.sendLog(`🔄 СРАБОТАЛА ТРОЛЛЬ КОМАНДА FREEZETROLL! Перезапускаю на сервер <b>${config.username}</b>...`);
            return;
        }

        // Обработка ответов для команды #сервер
        if (state.pendingServerInfo) {
            const cleanMsg = msg.replace(/§[0-9a-fklmnor]/g, '').trim();

            // Парсим TPS
            if (!state.pendingServerInfo.tps) {
                const tpsMatch = cleanMsg.match(/TPS from last 1m, 5m, 15m:\s*([\d.]+)/i);
                if (tpsMatch) {
                    state.pendingServerInfo.tps = tpsMatch[1];
                    state.pendingServerInfo.responses++;
                }
            }

            // Парсим онлайн
            if (!state.pendingServerInfo.online) {
                const onlineMatch = cleanMsg.match(/› Сейчас (\d+)\/\d+ из (\d+) игроков на сервере\./i);
                if (onlineMatch) {
                    state.pendingServerInfo.online = onlineMatch[1];      // общее количество игроков
                    state.pendingServerInfo.maxOnline = onlineMatch[3];   // максимум
                    state.pendingServerInfo.responses++;
                }
            }

            // Если получили оба ответа, отправляем результат досрочно
            if (state.pendingServerInfo.responses >= state.pendingServerInfo.expected) {
                sendServerInfo(bot, state);
            }
        }

        if (msg.includes('ChertHouse') && !msg.startsWith('КЛАН: ')) {
            console.log(`>>> [${state.config.username} CLAN] Найдена строка клана: ${msg.substring(0, 100)}...`);

            // Проверяем что это статистика клана (содержит числа и ключевые слова)
            const isClanStats = (msg.includes('Убийств:') || msg.includes('Kills:')) ||
            (msg.includes('КДР:') || msg.includes('KDR:')) ||
            (msg.includes('Участников:') || msg.includes('Members:')) ||
            (msg.match(/\d+\.\s*Клан:\s*ChertHouse/i));

            if (isClanStats) {
                console.log(`>>> [${state.config.username} CLAN] Определено как статистика клана`);

                const clanData = clanParser.parseClanLine(msg);

                if (clanData && clanData.place > 0) {
                    console.log(`>>> [${state.config.username} CLAN] Данные получены: место ${clanData.place}, kills: ${clanData.kills}`);

                    // Отправляем в телеграм бот если он есть
                    if (state.telegramBot && typeof state.telegramBot.updateClanData === 'function') {
                        console.log(`>>> [${state.config.username} TELEGRAM] Отправляю данные в Telegram бот для сервера ${state.config.targetServer}...`);
                        state.telegramBot.updateClanData(state.config.targetServer, clanData);
                    } else {
                        console.log(`>>> [${state.config.username} TELEGRAM] Telegram бот не инициализирован!`);
                    }
                }
            }
        }

        // Обработка подключения игрока (свои сообщения о других ботах)
        // Если мы в режиме проверки сервера
        if (state.serverCheck?.checking) {
            const cleanMsg = msg.toString().replace(/§[0-9a-fklmnor]/g, '').trim();

            // 1. Если пришло "Вы уже на сервере!" – значит мы на месте
            if (cleanMsg.includes('Вы уже на сервере!')) {
                console.log(`>>> [${state.config.username}] Проверка сервера: уже на месте.`);
                state.serverCheck.checking = false;
                clearTimeout(state.serverCheck.timer);
                state.serverCheck.timer = null;
                return;
            }

            // 2. Если пришло сообщение, содержащее ник бота и одно из ключевых слов – значит он переключился
            const lowerMsg = cleanMsg.toLowerCase();
            const botNameLower = state.config.username.toLowerCase();
            if (lowerMsg.includes(botNameLower) &&
                (lowerMsg.includes('подключился') || lowerMsg.includes('заехал'))) {
                console.log(`>>> [${state.config.username}] Проверка сервера: переключился на целевой сервер.`);
            if (state.telegramBot) {
                state.telegramBot.sendLog(`🔄 Бот <b>${state.config.username}</b> был переключён на сервер <b>${state.config.targetServer}</b> (возможно, админом).`);
            }
            state.serverCheck.checking = false;
            clearTimeout(state.serverCheck.timer);
            state.serverCheck.timer = null;
            return;
                }
        }

        // Обработка сообщения о балансе бота
        if (msg.includes('› Баланс: $')) {
            const balanceMatch = msg.match(/› Баланс: \$([\d,]+)/);
            if (balanceMatch) {
                const balanceStr = balanceMatch[1].replace(/,/g, '');
                const balance = parseInt(balanceStr);
                if (!isNaN(balance)) {
                    state.balance = balance;
                    state.lastBalanceCheck = Date.now();
                    console.log(`>>> [${state.config.username} BALANCE] Текущий баланс: ${balance}`);

                    // Проверяем, нужно ли пополнить баланс
                    checkAndRefillBalance(bot, state);
                }
            }
        }

        // Обработка ошибки недостатка средств
        if (msg.includes('› Ошибка: › У вас не достаточно монет.')) {
            const timeUntilRefill = getTimeUntilNextRefill(state);
            bot.chat(`/cc &fу боᴛᴀ нᴇдоᴄᴛᴀᴛочно ʍонᴇᴛ дᴧя ᴨᴇᴩᴇʙодᴀ. ᴄᴧᴇдующᴇᴇ ᴨоᴨоᴧнᴇниᴇ чᴇᴩᴇз ${timeUntilRefill}.`);
        }

        // Анализ смертей для анти-KDR
        const deathMatch = msg.match(/([а-яA-Яa-zA-Z0-9_]+) убил игрока ([а-яA-Яa-zA-Z0-9_]+)/i) ||
        msg.match(/([а-яА-Яa-zA-Z0-9_]+) убил игрока ([а-яА-Яa-zA-Z0-9_]+)/i);

        if (deathMatch) {
            const [, killer, victim] = deathMatch;
            console.log(`>>> [${state.config.username} KDR] Обнаружена смерть: ${killer} -> ${victim}`);

            state.clanData.deaths[victim] = (state.clanData.deaths[victim] || 0) + 1;
            saveData(state.clanData, state.config.dataFile);

            console.log(`>>> [${state.config.username} KDR] ${victim} умер(ла) ${state.clanData.deaths[victim]} раз`);
            await checkAndKickPlayer(bot, state, victim, `(убит ${killer})`);
        }

        // Выход из клана
        const leaveMatch = msg.match(/› ([а-яA-Яa-zA-Z0-9_]+) покинул клан./);
        if (leaveMatch) {
            const playerName = leaveMatch[1];
            bot.chat(`/cc &b${playerName} &#ff0000ʙ&#ff0f0fы&#ff1e1eɯ&#ff2d2dᴇ&#ff3c3cл&f из ᴋлᴀнᴀ. обоᴄᴄᴀᴛь и нᴀ ʍоᴩоз!`);
            state.telegramBot?.sendLog(`Игрок <b>${playerName}</b> вышел из клана на ${state.config.targetServer}.`);
        }

        // Вступление в клан
        const joinMatch = msg.match(/› ([^ ]+) присоединился к клану./);
        if (joinMatch) {
            const playerName = joinMatch[1];
            if (state.clanData.blacklist.includes(playerName)) {
                console.log(`>>> [${state.config.username} ANTI-KDR] Игрок ${playerName} из ЧС вступил в клан. Кикаю...`);
                bot.chat(`/c kick ${playerName} Автоматический кик: вы в черном списке за частые смерти`);
                await sleep(2000);
                state.telegramBot?.sendLog(`Игрок <b>${playerName}</b> кикнут из клана, потому что он в ЧС на подсервере ${state.config.targetServer}.`);
            } else {
                bot.chat(`/cc &fдобро пожᴀлоʙᴀᴛь ʙ ᴋлᴀн, &b${playerName}&f! Команды - #help`);
                state.telegramBot?.sendLog(`Игрок <b>${playerName}</b> присоединился к клану на подсервере ${state.config.targetServer}.`);
            }
        }

        // ----- СБОР СПИСКА УЧАСТНИКОВ (ТОЛЬКО ИЗ ОТВЕТА НА /c info) -----
        if (state.antiKDRScan?.awaitingInfo) {
            const cleanMsg = msg.replace(/§[0-9a-fklmnor]/g, '').trim();

            // --- УСЛОВИЕ ЗАВЕРШЕНИЯ СБОРА (когда видим следующую секцию) ---
            if (cleanMsg.includes('Модераторы клана:') ||
                cleanMsg.includes('Союзные кланы:') ||
                cleanMsg.includes('Вражеские кланы:') ||
                cleanMsg.includes('Описание клана:')) {

                console.log(`>>> [${state.config.username} ANTI-KDR] Сбор списка завершён. Всего игроков: ${state.antiKDRScan.tempPlayers.length}`);

            state.antiKDRScan.players = [...new Set(state.antiKDRScan.tempPlayers)]; // удаляем дубли
            state.antiKDRScan.processedCount = 0;
            state.antiKDRScan.results = {};
            state.antiKDRScan.awaitingInfo = false; // больше не ждём инфу
            state.antiKDRScan.collecting = false;
            state.antiKDRScan.currentTimeout = null;

            if (state.antiKDRScan.type === 'all' || state.antiKDRScan.type === 'kick') {
                setTimeout(() => processNextPlayerStats(bot, state), 1000);
            }
            return;
                }

                // --- НАЧАЛО ОТВЕТА НА /c info: строка с "Название: ChertHouse" ---
                if (cleanMsg.startsWith('Название:') && cleanMsg.includes('ChertHouse')) {
                    console.log(`>>> [${state.config.username} ANTI-KDR] Начало ответа /c info, начинаем сбор...`);
                    state.antiKDRScan.collecting = true;
                    return; // в этой строке имён нет
                }

                // --- ЕСЛИ МЫ В РЕЖИМЕ СБОРА, ТО ЭТО СТРОКА СПИСКА УЧАСТНИКОВ ---
                if (state.antiKDRScan.collecting) {
                    // Жёсткие фильтры: строка должна содержать запятые и НЕ быть мусором
                    const isPlayerLine =
                    cleanMsg.includes(',') &&
                    !cleanMsg.includes('⇨') &&          // не чат
                    !cleanMsg.startsWith('›') &&        // не системное сообщение
                    !/^\d+\. Клан:/.test(cleanMsg) &&  // не топ кланов
                    !cleanMsg.includes('зашел на сервер') &&
                    !cleanMsg.includes('вышел с сервера') &&
                    !cleanMsg.includes('победил');

                    if (isPlayerLine) {
                        let line = cleanMsg;
                        // Убираем префиксы "Участники:" или "Фактички:", если они есть
                        if (line.includes('Участники:')) {
                            line = line.split('Участники:')[1].trim();
                        } else if (line.includes('Фактички:')) {
                            line = line.split('Фактички:')[1].trim();
                        }

                        const names = line.split(',').map(n => n.trim()).filter(n => n.length > 0);
                        if (names.length > 0) {
                            console.log(`>>> [${state.config.username} ANTI-KDR] Добавлено имён: ${names.length} (строка: ${line.substring(0, 50)}...)`);
                            state.antiKDRScan.tempPlayers.push(...names);
                        }
                    }
                }
        }

        // ----- ОТВЕТ НА /c stats -----
        if (msg.startsWith('Статистика игрока')) {
            if (state.antiKDRScan?.active && state.antiKDRScan.players && !state.antiKDRScan.awaitingInfo) {
                const cleanMsg = msg.replace(/§[0-9a-fklmnor]/g, '').trim();
                const regex = /Статистика игрока ([^:]+): Убийств:\s*(\d+),\s*Смертей:(\d+)/i;
                const match = cleanMsg.match(regex);

                if (state.antiKDRScan.currentTimeout) {
                    clearTimeout(state.antiKDRScan.currentTimeout);
                    state.antiKDRScan.currentTimeout = null;
                }

                if (match) {
                    const player = match[1].trim();
                    const deaths = parseInt(match[3], 10);
                    console.log(`>>> [${state.config.username} ANTI-KDR] Статистика ${player}: смертей ${deaths}`);
                    state.antiKDRScan.results[player] = deaths;
                } else {
                    console.log(`>>> [${state.config.username} ANTI-KDR] Не удалось распарсить: ${cleanMsg.substring(0, 100)}`);
                }

                state.antiKDRScan.processedCount++;

                if (state.antiKDRScan.processedCount >= state.antiKDRScan.players.length) {
                    finishAntiKDRScan(bot, state);
                } else {
                    setTimeout(() => processNextPlayerStats(bot, state), 500);
                }
            }
        }


        // Обработка клан-чата и команд
        const clanChatMatch = msg.match(/КЛАН: ([^:]+): (.+)/);
        if (clanChatMatch) {
            let [, sender, message] = clanChatMatch;
            sender = sender.replace(/§[0-9a-fklmnor]/g, '').trim();
            message = message.trim();

            // ===== СИСТЕМА УРОВНЕЙ =====
            // ✅ ВАЖНО: проверяем что отправитель НЕ сам бот!
            if (sender !== state.config.username) {
                if (!state.clanData.levels) {
                    state.clanData.levels = {};
                }

                if (!state.clanData.levels[sender]) {
                    state.clanData.levels[sender] = {
                        xp: 0,
                        messages: 0,
                        lastMsgTime: 0,
                        firstSeen: Date.now()
                    };
                    console.log(`>>> [${state.config.username} LEVELS] Новая запись: ${sender}`);
                    saveData(state.clanData, state.config.dataFile);
                }

                const player = state.clanData.levels[sender];
                const now = Date.now();

                // Кулдаун 10 секунд на XP
                if (now - player.lastMsgTime > 10000) {
                    const oldXP = player.xp;
                    const oldLvl = getLevelProgress(oldXP).level;
                    const oldRank = getRank(oldLvl).name;

                    // 1-3 XP за сообщение
                    const xpGain = 1 + Math.floor(Math.random() * 3);
                    player.xp += xpGain;
                    player.messages = (player.messages || 0) + 1;
                    player.lastMsgTime = now;

                    const newLvl = getLevelProgress(player.xp).level;
                    const newRank = getRank(newLvl).name;

                    // Проверяем повышение
                    if (newLvl > oldLvl || newRank !== oldRank) {
                        let msg = `/cc &b${sender}&f: `;
                        if (newLvl > oldLvl) msg += `лʙл ${oldLvl}->${newLvl}`;
                        if (newRank !== oldRank) msg += ` рᴀнг: ${newRank}`;

                        if (msg.length > 240) msg = msg.substring(0, 240) + '...';
                        bot.chat(msg);

                        // При повышении сразу сохраняем
                        saveData(state.clanData, state.config.dataFile);
                    }

                    // Логируем
                    console.log(`>>> [${state.config.username} XP] ${sender}: +${xpGain} XP (лвл: ${newLvl})`);

                    // Сохраняем каждые 10 сообщений
                    if (player.messages % 10 === 0) {
                        saveData(state.clanData, state.config.dataFile);
                    }
                }
            } else {
                // ❌ Это сообщение от самого бота - не начисляем XP
                console.log(`>>> [${state.config.username} LEVELS] Игнорируем сообщение от бота`);
            }
            // ============================

            // Передаем управление CommandHandler
            await commandHandler.handleCommand(bot, state, sender, message);
        }
    });
}

// Проверка и кик игрока
async function checkAndKickPlayer(bot, state, playerName, deathReason = '') {
    const deaths = state.clanData.deaths[playerName] || 0;

    if (deaths >= KICK_THRESHOLD) {
        console.log(`>>> [${state.config.username} ANTI-KDR] Игрок ${playerName} превысил лимит (${deaths}). Кикаю...`);

        bot.chat(`/c kick ${playerName}`);
        delete state.clanData.deaths[playerName];
        saveData(state.clanData, state.config.dataFile);

        return true;
    }
    return false;
}

function checkAndRefillBalance(bot, state) {
    const MAX_BALANCE = 10000000000000; // 10 триллионов
    const now = Date.now();

    // Проверяем, прошло ли 30 минут с последнего пополнения
    const lastRefill = state.lastRefillTime || 0;
    const shouldRefill = (now - lastRefill) >= (30 * 60 * 1000);

    if (shouldRefill && state.balance < MAX_BALANCE) {
        const amountToAdd = MAX_BALANCE - state.balance;
        bot.chat(`/eco give ${bot.username} ${amountToAdd}`);
        state.lastRefillTime = now;
        console.log(`>>> [${state.config.username} REFILL] Запрашиваю пополнение: ${amountToAdd}`);

        // Через 2 секунды проверяем баланс снова
        setTimeout(() => {
            bot.chat('/balance');
        }, 2000);
    }
}

// Вспомогательная функция для последовательного опроса /c stats с таймаутом
function processNextPlayerStats(bot, state) {
    if (!state.antiKDRScan?.active) return;
    if (state.antiKDRScan.processedCount >= state.antiKDRScan.players.length) {
        finishAntiKDRScan(bot, state);
        return;
    }

    const player = state.antiKDRScan.players[state.antiKDRScan.processedCount];
    console.log(`>>> [${state.config.username} ANTI-KDR] Запрос статистики для ${player} (${state.antiKDRScan.processedCount+1}/${state.antiKDRScan.players.length})`);

    bot.chat(`/c stats ${player}`);

    // Сохраняем прогресс на случай кика
    saveAntiKDRScan(state);

    if (state.antiKDRScan.currentTimeout) clearTimeout(state.antiKDRScan.currentTimeout);
    state.antiKDRScan.currentTimeout = setTimeout(() => {
        console.log(`>>> [${state.config.username} ANTI-KDR] Таймаут ожидания статистики для ${player}, пропускаем.`);
        state.antiKDRScan.processedCount++;
        saveAntiKDRScan(state);
        if (state.antiKDRScan.processedCount >= state.antiKDRScan.players.length) {
            finishAntiKDRScan(bot, state);
        } else {
            setTimeout(() => processNextPlayerStats(bot, state), STATS_DELAY);
        }
    }, STATS_TIMEOUT);
}

function saveAntiKDRScan(state) {
    if (!state.antiKDRScan?.active) return;
    if (!state.clanData) state.clanData = {};
    state.clanData.pendingAntiKDRScan = {
        type: state.antiKDRScan.type,
        threshold: state.antiKDRScan.threshold,
        players: state.antiKDRScan.players,
        processedCount: state.antiKDRScan.processedCount,
        results: state.antiKDRScan.results,
        initiatedBy: state.antiKDRScan.initiatedBy,
        timestamp: Date.now()
    };
    saveData(state.clanData, state.config.dataFile);
}

function clearSavedAntiKDRScan(state) {
    if (state.clanData?.pendingAntiKDRScan) {
        delete state.clanData.pendingAntiKDRScan;
        saveData(state.clanData, state.config.dataFile);
    }
}

function clearSavedAntiKDRScan(state) {
    delete state.clanData.pendingAntiKDRScan;
    saveData(state.clanData, state.config.dataFile);
}

async function finishAntiKDRScan(bot, state) {
    if (!state.antiKDRScan?.active) {
        console.log(`>>> [${state.config.username} ANTI-KDR] finishAntiKDRScan: нет активного сканирования`);
        return;
    }

    console.log(`>>> [${state.config.username} ANTI-KDR] 🔥 ЗАВЕРШЕНИЕ СКАНИРОВАНИЯ 🔥`);

    // Очищаем таймаут
    if (state.antiKDRScan.currentTimeout) {
        clearTimeout(state.antiKDRScan.currentTimeout);
        state.antiKDRScan.currentTimeout = null;
    }

    const scan = state.antiKDRScan;
    const threshold = scan.threshold || 5;
    const results = scan.results;

    const violators = Object.entries(results)
    .filter(([_, deaths]) => deaths >= threshold)
    .sort((a, b) => b[1] - a[1]);

    console.log(`>>> [${state.config.username} ANTI-KDR] 👤 Нарушителей: ${violators.length}`);

    try {
        if (scan.type === 'all') {
            if (violators.length === 0) {
                console.log(`>>> [${state.config.username} ANTI-KDR] ➤ Отправка: нет нарушителей`);
                bot.chat(`/cc &fИгроков с ${threshold}+ смертями нет. Все молодцы!`);
            } else {
                console.log(`>>> [${state.config.username} ANTI-KDR] ➤ Отправка заголовка...`);
                bot.chat(`/cc &fАнти-КДР (смертей ≥ ${threshold}):`);
                await sleep(1500);

                console.log(`>>> [${state.config.username} ANTI-KDR] ➤ Отправка списка нарушителей...`);
                await sendViolatorsList(bot, violators); // ← ЖДЁМ отправку
                console.log(`>>> [${state.config.username} ANTI-KDR] ✅ Список отправлен`);
            }
        } else if (scan.type === 'kick') {
            if (violators.length === 0) {
                bot.chat(`/cc &fНет игроков для кика (смертей ≥ ${threshold}).`);
            } else {
                bot.chat(`/cc &fКикаю ${violators.length} игроков с смертями ≥ ${threshold}...`);
                await kickViolators(bot, state, violators);
            }
        }
    } catch (err) {
        console.error(`>>> [${state.config.username} ANTI-KDR] ❌ Ошибка при отправке:`, err.message);
    }

    // Очищаем сохранённое сканирование
    if (typeof clearSavedAntiKDRScan === 'function') {
        clearSavedAntiKDRScan(state);
    }

    // Удаляем состояние ПОСЛЕ всех отправок
    delete state.antiKDRScan;
    console.log(`>>> [${state.config.username} ANTI-KDR] ✅ Сканирование полностью завершено, состояние очищено.`);
}

async function sendViolatorsList(bot, violators) {
    // Формируем одну строку со всеми нарушителями
    let message = '';
    for (const [player, deaths] of violators) {
        message += ` ${player}(${deaths}),`;
    }
    // Убираем последнюю запятую
    if (message.endsWith(',')) message = message.slice(0, -1);

    if (message.length > 0) {
        console.log(`>>> [${bot.username} ANTI-KDR] ➤ Отправка одной строкой: "${message}"`);
        bot.chat(`/cc ${message}`); // БЕЗ ПРОБЕЛА – для теста (потом вернём пробел)
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

async function kickViolators(bot, state, violators) {
    for (let i = 0; i < violators.length; i++) {
        const [player, deaths] = violators[i];
        bot.chat(`/c kick ${player}`);
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    bot.chat(`/cc &fКик завершён. Всего: ${violators.length}`);
}

// ========== ANTI-KDR: ЗАПРОС СТАТИСТИКИ ОДНОГО ИГРОКА ==========
function requestPlayerStats(bot, state, target, callback) {
    // Флаг, чтобы обработчик сработал только один раз
    let handled = false;

    const handler = (jsonMsg) => {
        if (handled) return;

        const msg = jsonMsg.toString();
        // Игнорируем свои сообщения
        if (msg.includes(`КЛАН:  ${bot.username}:`)) return;

        // Проверяем, что это ответ сервера о статистике целевого игрока
        if (msg.includes('Статистика игрока') && msg.includes(target)) {
            handled = true;

            // Убираем цветовые коды
            const cleanMsg = msg.replace(/§[0-9a-fklmnor]/g, '').trim();

            // Парсим убийства и смерти
            const killsMatch = cleanMsg.match(/Убийств:\s*(\d+)/i);
            const deathsMatch = cleanMsg.match(/Смертей:\s*(\d+)/i);

            let result = null;
            if (killsMatch && deathsMatch) {
                result = {
                    player: target,
                    kills: parseInt(killsMatch[1], 10),
                    deaths: parseInt(deathsMatch[1], 10),
                    raw: cleanMsg
                };
            }

            // Вызываем колбэк с результатом
            if (callback) callback(result);

            // Удаляем обработчик
            bot.removeListener('message', handler);
        }
    };

    // Навешиваем обработчик
    bot.on('message', handler);

    // Отправляем запрос
    bot.chat(`/c stats ${target}`);

    // Таймаут на случай отсутствия ответа
    setTimeout(() => {
        if (!handled) {
            bot.removeListener('message', handler);
            if (callback) callback(null); // null означает таймаут/ошибку
        }
    }, 8000);
}

module.exports = {
    setupMessageHandler,
    checkAndKickPlayer,
    processNextPlayerStats,
    finishAntiKDRScan,
    kickViolators,
    requestPlayerStats
};
