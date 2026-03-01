const adminCommands = require('./admin');
const gameCommands = require('./games');
const funCommands = require('./fun');
const clanCommands = require('./clan');
const { checkSpam } = require('../../utils');
const { ADMINS } = require('../../config');
const levelsCommands = require('./levels');
const cardCommands = require('./cards');
const seaBattleCommands = require('./seaBattle');
const aiCommands = require('./aiCommands'); // <-- Импорт нового файла команд
const antiKDRCommands = require('./antiKDRCommands');
const effectCommands = require('./effectCommands');
class CommandHandler {
    constructor() {
        this.commands = new Map();
        this.registerAllCommands();
    }

    registerAllCommands() {
        // Регистрируем все команды из модулей
        const allCommands = {
            ...adminCommands,
            ...gameCommands,
            ...funCommands,
            ...clanCommands,
            ...cardCommands,
            ...levelsCommands,
            ...aiCommands,
            ...antiKDRCommands,
            ...seaBattleCommands,
            ...effectCommands
        };

        for (const [pattern, command] of Object.entries(allCommands)) {
            // Используем RegExp без ^ и $, чтобы обрабатывать команды в середине сообщения
            this.commands.set(new RegExp(pattern, 'i'), command);
        }
    }

    async handleCommand(bot, state, sender, message) {
        console.log(`>>> [${state.config.username} COMMAND] ${sender}: ${message}`);

        // Проверка на самоотправку (боты не должны обрабатывать свои сообщения)
        const senderLower = sender.toLowerCase();
        if (senderLower === state.config.username.toLowerCase()) {
            return;
        }

        // Проверка прав
        // Проверка прав
        const isAdmin = ADMINS.some(admin => admin.toLowerCase() === senderLower) ||
        (state.tempAdmins && state.tempAdmins.some(admin => admin.toLowerCase() === senderLower));

        // Проверка, разрешена ли команда для всех или конкретному игроку
        let commandAllowed = false;
        if (!isAdmin) {
            // Проверяем, есть ли команда в publicCommands
            const commandText = message.split(' ')[0]; // берём первое слово (например, "#invite")
            if (state.publicCommands && state.publicCommands.has(commandText)) {
                commandAllowed = true;
            }
            // Проверяем персональные разрешения
            if (!commandAllowed && state.playerPermissions && state.playerPermissions.has(sender)) {
                const perms = state.playerPermissions.get(sender);
                if (perms.has(commandText)) {
                    commandAllowed = true;
                }
            }
        }

        // Проверка спама (только для не-админов)
        if (!isAdmin) {
            const spamCheck = checkSpam(state, sender, isAdmin);
            if (!spamCheck.allowed) {
                bot.chat(`/cc ${sender}, ${spamCheck.message}`);
                return;
            }
        }

        // Поиск и выполнение команды
        for (const [regex, command] of this.commands) {
            const match = message.match(regex);
            if (match) {
                // Проверка прав для админских команд
                if (command.admin && !isAdmin) {
                    bot.chat(`/cc &b${sender}&f, у ʙᴀᴄ &#ff0000н&#ff0a0aᴇ&#ff1414ᴛ &#ff1e1eᴨ&#ff2828р&#ff3232ᴀ&#ff3c3cʙ&f дᴧя иᴄᴨоᴧьзоʙᴀния ϶ᴛой ᴋоʍᴀнды.`);
                    return;
                }

                try {
                    await command.execute(bot, state, sender, match, isAdmin);
                } catch (error) {
                    console.error(`>>> [${state.config.username} COMMAND ERROR] ${error.message}`);
                    bot.chat(`/cc &#ff0000о&#ff0c0cɯ&#ff1818и&#ff2424б&#ff3030ᴋ&#ff3c3cᴀ`);
                }
                return; // Команда найдена и выполнена
            }
        }

        // Если команда не найдена, но начинается с # и пользователь не админ
        // проверяем админские паттерны для сообщения об ошибке
        if (message.startsWith('#') && !isAdmin) {
            const adminPatterns = ['#чс', '#анчс', '#реконнект', '#invite', '#кик', '#мут', '#анмут', '#автоинвайт', '#админ', '#чат'];
            for (const pattern of adminPatterns) {
                if (message.startsWith(pattern)) {
                    bot.chat(`/cc &b${sender}&f, у ʙᴀᴄ &#ff0000н&#ff0a0aᴇ&#ff1414ᴛ &#ff1e1eᴨ&#ff2828р&#ff3232ᴀ&#ff3c3cʙ&f дᴧя иᴄᴨоᴧьзоʙᴀния ϶ᴛой ᴋоʍᴀнды.`);
                    return;
                }
            }
        }
    }
}

module.exports = CommandHandler;
