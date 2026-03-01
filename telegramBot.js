const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ID чата для проверки подписки (замените на актуальный)
const CLAN_CHAT_ID = '-1003124530178';
// ID администратора, которому разрешены команды управления ботами
const ADMIN_USER_ID = 7552133053;

function escapeMarkdown(text) {
    if (!text) return '';
    return text.toString()
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
        .replace(/\./g, '\\.')
        .replace(/!/g, '\\!');
}

class TelegramClanBot {
    constructor(token, sendToBotsCallback = null, activeBots = [], logChatId = null) {
        console.log('[TELEGRAM] Инициализация...');
        console.log('[TELEGRAM] Токен:', token ? token.substring(0, 10) + '...' : 'НЕТ');
        this.logChatId = logChatId; // ID группы для логов
        this.activeBots = activeBots; // ссылка на массив активных ботов
        this.userStates = {}; // храним состояние пользователя (подтвердил ли подписку)

        if (!token || token === 'ТВОЙ_ТОКЕН_ТУТ') {
            console.error('[TELEGRAM] Токен не указан!');
            return;
        }

        try {
            this.bot = new TelegramBot(token, { polling: true });
            this.clanData = {
                s2: null, s3: null, s4: null, s7: null, s8: null
            };
            this.subscribers = new Set();
            this.lastUpdate = {};
            this.sendToBotsCallback = sendToBotsCallback;

            console.log('[TELEGRAM] Бот создан, настраиваю команды...');
            this.setupCommands();
            this.setupCallbacks();
            this.loadData();

            console.log('[TELEGRAM] Бот успешно запущен!');
        } catch (error) {
            console.error('[TELEGRAM] Ошибка создания бота:', error.message);
            throw error;
        }
    }

    sendLog(message) {
        if (this.logChatId) {
            this.bot.sendMessage(this.logChatId, message, { parse_mode: 'HTML' })
            .catch(e => console.error('[TELEGRAM] Ошибка отправки лога:', e.message));
        }
    }

    // Рассылка всем подписчикам (для других сообщений, если нужна)
    sendToAll(message) {
        this.subscribers.forEach(chatId => {
            this.bot.sendMessage(chatId, message).catch(e => console.error('[TELEGRAM] Send error:', e.message));
        });
    }

    // Проверка, состоит ли пользователь в клановом чате
    async isUserInClanChat(userId) {
        try {
            const chatMember = await this.bot.getChatMember(CLAN_CHAT_ID, userId);
            const status = chatMember.status;
            return ['member', 'administrator', 'creator'].includes(status);
        } catch (error) {
            console.error('[TELEGRAM] Ошибка проверки подписки:', error.message);
            return false; // если ошибка (бот не админ или юзер не в чате) – считаем что не подписан
        }
    }

    // Главное меню
    getMainMenuKeyboard() {
        return {
            inline_keyboard: [
                [{ text: '💡 Идеи для клана', callback_data: 'menu_ideas' }],
                [{ text: '🆘 Обращение в поддержку', callback_data: 'menu_support' }],
                [{ text: '⚠️ Подать жалобу на участника', callback_data: 'menu_complaint' }],
                [{ text: '📊 Информация клана на порталах', callback_data: 'menu_portals' }],
                [{ text: '📋 Черный список клана', callback_data: 'menu_blacklist' }],
                [{ text: '⚖️ Апелляция на выход из ЧС', callback_data: 'menu_appeal' }]
            ]
        };
    }

    // Меню порталов
    getPortalsMenuKeyboard() {
        return {
            inline_keyboard: [
                [{ text: 'Эпсилон-2 (s2)', callback_data: 'portal_s2' }],
                [{ text: 'Неон-3 (s3)', callback_data: 'portal_s3' }],
                [{ text: 'Эмеральд-4 (s4)', callback_data: 'portal_s4' }],
                [{ text: 'Альфа-5 (s5)', callback_data: 'portal_s5' }],
                [{ text: 'Омега-6 (s6)', callback_data: 'portal_s6' }],
                [{ text: 'Сигма-7 (s7)', callback_data: 'portal_s7' }],
                [{ text: 'Зета-8 (s8)', callback_data: 'portal_s8' }],
                [{ text: '📊 Вся информация с порталов', callback_data: 'portal_all' }],
                [{ text: '🔙 Назад в главное меню', callback_data: 'menu_main' }]
            ]
        };
    }

    setupCommands() {
        console.log('[TELEGRAM] Настройка команд...');

        // Команда /start
        this.bot.onText(/\/start/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;

            // Проверяем подписку на клановый чат
            const isMember = await this.isUserInClanChat(userId);
            if (!isMember) {
                // Отправляем приветственное сообщение с кнопкой вступления
                await this.bot.sendMessage(chatId,
                                           '👋 Привет! Чтобы пользоваться ботом, необходимо вступить в наш клановый чат.\n\n' +
                                           'Нажми кнопку ниже, чтобы присоединиться, затем вернись и нажми "Подтвердить".',
                                           {
                                               reply_markup: {
                                                   inline_keyboard: [
                                                       [{ text: '📢 Вступить в чат клана', url: 'https://t.me/cherthouse_clan' }],
                                                       [{ text: '✅ Я вступил(а)', callback_data: 'confirm_join' }]
                                                   ]
                                               }
                                           }
                );
                return;
            }

            // Если уже в чате, показываем главное меню
            this.userStates[userId] = { verified: true };
            await this.bot.sendMessage(chatId,
                                       '🏠 <b>Главное меню</b>\n\nВыберите действие:',
                                       { parse_mode: 'HTML', reply_markup: this.getMainMenuKeyboard() }
            );
        });

        // Команда /bots (доступна всем)
        this.bot.onText(/\/bots/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            if (!this.userStates[userId]?.verified) {
                await this.bot.sendMessage(chatId, '❌ Сначала выполните /start и подтвердите вступление в чат.');
                return;
            }
            if (this.activeBots.length === 0) {
                await this.bot.sendMessage(chatId, 'Нет активных ботов.');
                return;
            }
            let response = '📋 <b>Список ботов:</b>\n';
            this.activeBots.forEach((bot, index) => {
                const status = bot.entity ? '✅ в игре' : '❌ оффлайн';
                response += `${index+1}. <b>${bot.username}</b> — ${status}\n`;
            });
            await this.bot.sendMessage(chatId, response, { parse_mode: 'HTML' });
        });

        // Админские команды (доступны только ADMIN_USER_ID)
        const adminCommands = ['restart', 'say', 'cmd'];
        adminCommands.forEach(cmd => {
            this.bot.onText(new RegExp(`\\/${cmd}(?: (.+))?`), async (msg, match) => {
                const chatId = msg.chat.id;
                const userId = msg.from.id;
                if (userId !== ADMIN_USER_ID) {
                    await this.bot.sendMessage(chatId, '⛔ У вас нет прав на использование этой команды.');
                    return;
                }
                if (!this.userStates[userId]?.verified) {
                    await this.bot.sendMessage(chatId, '❌ Сначала выполните /start и подтвердите вступление в чат.');
                    return;
                }
                // Обработка каждой команды
                if (cmd === 'restart' && match[1]) {
                    const botName = match[1];
                    const bot = this.activeBots.find(b => b.username === botName);
                    if (!bot) {
                        await this.bot.sendMessage(chatId, `❌ Бот <b>${botName}</b> не найден.`, { parse_mode: 'HTML' });
                        return;
                    }
                    await this.bot.sendMessage(chatId, `🔄 Перезапускаю <b>${botName}</b>...`, { parse_mode: 'HTML' });
                    bot.quit();
                } else if (cmd === 'say' && match[1]) {
                    const parts = match[1].split(' ');
                    const botName = parts[0];
                    const message = parts.slice(1).join(' ');
                    const bot = this.activeBots.find(b => b.username === botName);
                    if (!bot) {
                        await this.bot.sendMessage(chatId, `❌ Бот <b>${botName}</b> не найден.`, { parse_mode: 'HTML' });
                        return;
                    }
                    bot.chat(message);
                    await this.bot.sendMessage(chatId, `✅ Сообщение отправлено от <b>${botName}</b>.`, { parse_mode: 'HTML' });
                } else if (cmd === 'cmd' && match[1]) {
                    const parts = match[1].split(' ');
                    const botName = parts[0];
                    let command = parts.slice(1).join(' ');
                    if (!command.startsWith('/')) command = '/' + command;
                    const bot = this.activeBots.find(b => b.username === botName);
                    if (!bot) {
                        await this.bot.sendMessage(chatId, `❌ Бот <b>${botName}</b> не найден.`, { parse_mode: 'HTML' });
                        return;
                    }
                    bot.chat(command);
                    await this.bot.sendMessage(chatId, `✅ Команда \`${command}\` выполнена от <b>${botName}</b>.`, { parse_mode: 'HTML' });
                }
            });
        });

        // Команда /stats
        this.bot.onText(/\/stats/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            if (!this.userStates[userId]?.verified) {
                await this.bot.sendMessage(chatId, '❌ Сначала выполните /start и подтвердите вступление в чат.');
                return;
            }
            await this.bot.sendChatAction(chatId, 'typing');

            const servers = ['s2', 's3', 's4', 's7', 's8'];
            const validData = servers.filter(server => this.clanData[server] !== null);

            if (validData.length === 0) {
                await this.bot.sendMessage(chatId,
                                           '📊 <b>Общая статистика</b>\n\n❌ Нет данных о клане!\nИспользуйте /update для запроса данных',
                                           { parse_mode: 'HTML' }
                );
                return;
            }

            let totalPlace = 0, totalKills = 0, totalKDR = 0, totalMembers = 0;
            let bestPlace = Infinity, bestPlaceServer = '', worstPlace = 0, worstPlaceServer = '';
            let maxKills = 0, maxKillsServer = '', maxMembers = 0, maxMembersServer = '';

            validData.forEach(server => {
                const data = this.clanData[server];
                totalPlace += data.place;
                totalKills += data.kills;
                totalKDR += data.kdr;
                totalMembers += data.members;

                if (data.place < bestPlace) {
                    bestPlace = data.place;
                    bestPlaceServer = server.toUpperCase();
                }
                if (data.place > worstPlace) {
                    worstPlace = data.place;
                    worstPlaceServer = server.toUpperCase();
                }
                if (data.kills > maxKills) {
                    maxKills = data.kills;
                    maxKillsServer = server.toUpperCase();
                }
                if (data.members > maxMembers) {
                    maxMembers = data.members;
                    maxMembersServer = server.toUpperCase();
                }
            });

            const avgPlace = (totalPlace / validData.length).toFixed(1);
            const avgKDR = (totalKDR / validData.length).toFixed(2);

            let message = '📊 <b>ОБЩАЯ СТАТИСТИКА КЛАНА</b>\n\n';
            message += `🔢 <b>Всего серверов:</b> ${validData.length}/4\n`;
            message += `⭐ <b>Среднее место:</b> #${avgPlace}\n`;
            message += `⚔️ <b>Всего убийств:</b> ${totalKills.toLocaleString()}\n`;
            message += `👥 <b>Всего участников:</b> ${totalMembers}\n`;
            message += `📈 <b>Средний КДР:</b> ${avgKDR}\n\n`;
            message += '<b>🏆 ЛУЧШИЕ ПОКАЗАТЕЛИ:</b>\n';
            message += `🥇 <b>Лучшее место:</b> #${bestPlace} (${bestPlaceServer})\n`;
            message += `⚔️ <b>Макс. убийств:</b> ${maxKills.toLocaleString()} (${maxKillsServer})\n`;
            message += `👥 <b>Макс. участников:</b> ${maxMembers} (${maxMembersServer})\n`;
            if (worstPlace > 0) {
                message += `📉 <b>Худшее место:</b> #${worstPlace} (${worstPlaceServer})\n`;
            }
            message += `\n<i>Данные обновлены: ${new Date(this.lastUpdate[validData[0]] || Date.now()).toLocaleTimeString('ru-RU')}</i>`;

            await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
        });

        // Команда /clan
        this.bot.onText(/\/clan/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            if (!this.userStates[userId]?.verified) {
                await this.bot.sendMessage(chatId, '❌ Сначала выполните /start и подтвердите вступление в чат.');
                return;
            }
            await this.bot.sendChatAction(chatId, 'typing');

            let message = '🏆 <b>Статистика клана ChertHouse</b>\n\n';
            const servers = ['s2', 's3', 's4', 's7', 's8'];
            let hasData = false;

            servers.forEach(server => {
                const data = this.clanData[server];
                message += `📍 <b>${server.toUpperCase()}:</b> `;
                if (data) {
                    hasData = true;
                    message += `#${data.place}\n`;
                    message += `👑 Глава: ${data.leader}\n`;
                    message += `⚔️ Убийств: ${data.kills}\n`;
                    message += `📊 КДР: ${data.kdr}\n`;
                    message += `👥 Участников: ${data.members}\n`;
                } else {
                    message += '❌ Нет данных\n';
                }
                message += '\n';
            });

            if (!hasData) {
                message += 'Используйте /update для запроса данных';
            }
            await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
        });

        // Команда /clans (краткая статистика)
        this.bot.onText(/\/clans/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            if (!this.userStates[userId]?.verified) {
                await this.bot.sendMessage(chatId, '❌ Сначала выполните /start и подтвердите вступление в чат.');
                return;
            }
            await this.bot.sendChatAction(chatId, 'typing');

            let message = '📊 <b>Краткая статистика клана:</b>\n\n';
            const servers = ['s2', 's3', 's4', 's7', 's8'];
            let hasData = false;

            servers.forEach(server => {
                const data = this.clanData[server];
                message += `<b>${server.toUpperCase()}:</b> `;
                if (data) {
                    hasData = true;
                    message += `#${data.place} | K:${data.kills} | M:${data.members}\n`;
                } else {
                    message += 'Нет данных\n';
                }
            });

            if (!hasData) {
                message += '\nИспользуйте /update для запроса данных';
            }
            await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
        });

        // Команда /update
        this.bot.onText(/\/update/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            if (!this.userStates[userId]?.verified) {
                await this.bot.sendMessage(chatId, '❌ Сначала выполните /start и подтвердите вступление в чат.');
                return;
            }
            await this.bot.sendMessage(chatId,
                                       '🔄 Запрашиваю данные...\n\nОтправляю команду /c top всем ботам...'
            );
            if (this.sendToBotsCallback) {
                this.sendToBotsCallback('/c top');
            } else {
                await this.bot.sendMessage(chatId, '❌ Ошибка: не могу отправить команду ботам');
            }
        });

        // Команда /servers
        this.bot.onText(/\/servers/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            if (!this.userStates[userId]?.verified) {
                await this.bot.sendMessage(chatId, '❌ Сначала выполните /start и подтвердите вступление в чат.');
                return;
            }
            const message = '🌐 <b>Серверы с ботами:</b>\n\n' +
            'S2 - anna201312\n' +
            'S3 - Malgrim\n' +
            'S4 - DopkaBobka\n' +
            'S7 - Ezzka2134q111e\n\n' +
            'Все боты находятся на сервере ru.masedworld.net';
            await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
        });

        // Обработка ошибок
        this.bot.on('polling_error', (error) => {
            console.error('[TELEGRAM] Polling error:', error.message);
        });
        this.bot.on('error', (error) => {
            console.error('[TELEGRAM] Bot error:', error.message);
        });

        console.log('[TELEGRAM] Команды настроены');
    }

    // Настройка обработчиков колбэков от инлайн-кнопок
    setupCallbacks() {
        this.bot.on('callback_query', async (query) => {
            const chatId = query.message.chat.id;
            const userId = query.from.id;
            const data = query.data;

            // Подтверждение вступления
            if (data === 'confirm_join') {
                const isMember = await this.isUserInClanChat(userId);
                if (!isMember) {
                    await this.bot.answerCallbackQuery(query.id, { text: '❌ Вы ещё не вступили в чат! Сначала нажмите кнопку "Вступить".', show_alert: true });
                    return;
                }
                this.userStates[userId] = { verified: true };
                await this.bot.editMessageText(
                    '🏠 <b>Главное меню</b>\n\nВыберите действие:',
                    {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: this.getMainMenuKeyboard()
                    }
                );
                await this.bot.answerCallbackQuery(query.id);
                return;
            }

            // Если пользователь не верифицирован – просим /start
            if (!this.userStates[userId]?.verified) {
                await this.bot.answerCallbackQuery(query.id, { text: '❌ Сначала выполните /start и подтвердите вступление в чат.', show_alert: true });
                return;
            }

            // Обработка главного меню
            if (data === 'menu_main') {
                await this.bot.editMessageText(
                    '🏠 <b>Главное меню</b>\n\nВыберите действие:',
                    {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: this.getMainMenuKeyboard()
                    }
                );
                await this.bot.answerCallbackQuery(query.id);
                return;
            }

            // Меню порталов
            if (data === 'menu_portals') {
                await this.bot.editMessageText(
                    '📊 <b>Информация клана на порталах</b>\n\nВыберите сервер:',
                    {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: this.getPortalsMenuKeyboard()
                    }
                );
                await this.bot.answerCallbackQuery(query.id);
                return;
            }

            // Обработка выбора портала
            const portalMatch = data.match(/^portal_(.+)$/);
            if (portalMatch) {
                const server = portalMatch[1]; // s2, s3, ... all
                let response = '';

                if (server === 'all') {
                    // Собираем информацию со всех серверов, где есть данные
                    const servers = ['s2', 's3', 's4', 's5', 's6', 's7', 's8'];
                    response = '📊 <b>Вся информация по серверам:</b>\n\n';
                    servers.forEach(s => {
                        const data = this.clanData[s];
                        if (data) {
                            response += `<b>${s.toUpperCase()}:</b> #${data.place} | Убийств: ${data.kills} | КДР: ${data.kdr} | Участников: ${data.members}\n`;
                        } else {
                            response += `<b>${s.toUpperCase()}:</b> Нет данных\n`;
                        }
                    });
                } else {
                    const data = this.clanData[server];
                    if (data) {
                        response = `📊 <b>Сервер ${server.toUpperCase()}</b>\n\n` +
                        `🏆 Место: #${data.place}\n` +
                        `👑 Глава: ${data.leader}\n` +
                        `⚔️ Убийств: ${data.kills}\n` +
                        `📊 КДР: ${data.kdr}\n` +
                        `👥 Участников: ${data.members}`;
                    } else {
                        response = `❌ Данные по серверу ${server.toUpperCase()} отсутствуют. Используйте /update для запроса.`;
                    }
                }

                await this.bot.editMessageText(
                    response,
                    {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Назад к порталам', callback_data: 'menu_portals' }],
                                [{ text: '🏠 Главное меню', callback_data: 'menu_main' }]
                            ]
                        }
                    }
                );
                await this.bot.answerCallbackQuery(query.id);
                return;
            }

            // Обработка остальных пунктов меню (идеи, поддержка, жалоба, чс, апелляция)
            const menuActions = {
                menu_ideas: '💡 <b>Идеи для клана</b>\n\nЕсли у вас есть идеи по развитию клана, напишите их нашему администратору: @neurothica',
                menu_support: '🆘 <b>Обращение в поддержку</b>\n\nПо всем техническим вопросам обращайтесь к @neurothica',
                menu_complaint: '⚠️ <b>Подать жалобу на участника</b>\n\nОпишите ситуацию и укажите ник нарушителя. Администратор рассмотрит вашу жалобу в ближайшее время.',
                menu_blacklist: '📋 <b>Черный список клана</b>\n\nСписок забаненных/занесённых в ЧС игроков можно посмотреть по команде #чс (в игре) или запросить у администратора.',
                    menu_appeal: '⚖️ <b>Апелляция на выход из ЧС</b>\n\nЕсли вы считаете, что попали в ЧС ошибочно, напишите администратору @neurothica с объяснением ситуации.'
            };

            if (menuActions[data]) {
                await this.bot.editMessageText(
                    menuActions[data],
                    {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 Назад', callback_data: 'menu_main' }]
                            ]
                        }
                    }
                );
                await this.bot.answerCallbackQuery(query.id);
                return;
            }

            // Если ничего не подошло
            await this.bot.answerCallbackQuery(query.id, { text: 'Неизвестная команда' });
        });
    }

    updateClanData(server, data) {
        console.log(`[TELEGRAM] Обновление данных для ${server}:`, data);
        this.clanData[server] = data;
        this.lastUpdate[server] = Date.now();
        this.saveData();
        this.sendLog(`📊 Данные клана на сервере <b>${server.toUpperCase()}</b> обновлены. Место: #${data.place}, убийств: ${data.kills}`);
    }

    saveData() {
        try {
            const dataDir = path.join(__dirname, 'data');
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            const data = {
                clanData: this.clanData,
                subscribers: Array.from(this.subscribers),
                lastUpdate: this.lastUpdate
            };
            fs.writeFileSync(path.join(dataDir, 'telegram_data.json'), JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('[TELEGRAM] Ошибка сохранения:', error.message);
        }
    }

    loadData() {
        try {
            const filePath = path.join(__dirname, 'data', 'telegram_data.json');
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                this.clanData = data.clanData || this.clanData;
                this.subscribers = new Set(data.subscribers || []);
                this.lastUpdate = data.lastUpdate || {};
            }
        } catch (error) {
            console.error('[TELEGRAM] Ошибка загрузки:', error.message);
        }
    }
}

module.exports = TelegramClanBot;
