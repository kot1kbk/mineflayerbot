// bot/commands/antiKDRCommands.js
const { ADMINS } = require('../../config');
const { sleep } = require('../../utils');

const antiKDRCommands = {
    // ========== #антикдр все ==========
    '^#антикдр все$': {
        admin: true,
        execute: async (bot, state, sender) => {
            if (state.antiKDRScan?.active) {
                bot.chat(`/cc &b${sender}&f, ужᴇ ʙыᴨолняᴇᴛᴄя ᴄᴋᴀнироʙᴀниᴇ! подожди.`);
                return;
            }

            state.antiKDRScan = {
                active: true,
                type: 'all',
                threshold: 5,
                players: [],
                tempPlayers: [],
                awaitingInfo: true,
                collecting: false,
                results: {},
                processedCount: 0,
                currentTimeout: null,
                initiatedBy: sender
            };

            bot.chat(`/cc &fзᴀпрᴀɯиʙᴀю ᴄпиᴄоᴋ учᴀᴄᴛниᴋоʙ ᴋлᴀнᴀ..`);
            await sleep(500);
            bot.chat('/c info');
        }
    },

    // ========== #антикдр <ник> ==========
    // ========== #антикдр <ник> ==========
    '^#антикдр ([a-zA-Z0-9_.-]+)$': {
        admin: true,
        execute: async (bot, state, sender, match) => {
            const target = match[1];
            bot.chat(`/cc &fзᴀпрᴀɯиʙᴀю ᴄᴛᴀᴛиᴄᴛиᴋу для &b${target}...`);

            const currentBot = bot;
            let handled = false;

            const statsHandler = (jsonMsg) => {
                if (handled) return;
                const msg = jsonMsg.toString();
                if (msg.includes(`КЛАН:  ${currentBot.username}:`)) return;

                if (msg.includes('Статистика игрока') && msg.includes(target)) {
                    handled = true;
                    const cleanMsg = msg.replace(/§[0-9a-fklmnor]/g, '').trim();
                    const killsMatch = cleanMsg.match(/Убийств:\s*(\d+)/i);
                    const deathsMatch = cleanMsg.match(/Смертей:\s*(\d+)/i);

                    if (killsMatch && deathsMatch) {
                        const kills = killsMatch[1];
                        const deaths = deathsMatch[1];

                        // ТЕСТ 1: отправляем простейшее сообщение, чтобы проверить работу чата
                        setTimeout(() => {
                            console.log(`>>> [${currentBot.username}] ТЕСТ: отправлено test`);
                        }, 300);

                        // ТЕСТ 2: через 600 мс отправляем статистику
                        setTimeout(() => {
                            currentBot.chat(`/cc &b${target}&f: убийᴄᴛʙ &a${kills}&f, ᴄʍᴇᴩᴛᴇй &c${deaths}`);
                            console.log(`>>> [${currentBot.username}] ✅ Статистика отправлена: ${kills}/${deaths}`);
                        }, 600);

                    } else {
                        currentBot.chat(`/cc &fнᴇ удᴀᴧоᴄь ᴩᴀᴄᴨᴀᴩᴄиᴛь ᴄᴛᴀᴛиᴄᴛиᴋу дᴧя &b${target}`);
                    }
                    currentBot.removeListener('message', statsHandler);
                }
            };

            currentBot.on('message', statsHandler);

            // Ждём 1 секунду перед отправкой /c stats (анти-флуд)
            await sleep(1000);
            currentBot.chat(`/c stats ${target}`);

            setTimeout(() => {
                if (!handled) {
                    currentBot.chat(`/cc &fᴄᴇрʙᴇр нᴇ оᴛʙᴇᴛил нᴀ зᴀпроᴄ ᴄᴛᴀᴛиᴄᴛиᴋи для &b${target}`);
                    currentBot.removeListener('message', statsHandler);
                }
            }, 8000);
        }
    },

    // ========== #антикдр кик [порог] ==========
    '^#антикдр кик(?: (\\d+))?$': {
        admin: true,
        execute: async (bot, state, sender, match) => {
            if (state.antiKDRScan?.active) {
                bot.chat(`/cc &b${sender}&f, ужᴇ ʙыполняᴇᴛᴄя ᴄᴋᴀнироʙᴀниᴇ! подожди.`);
                return;
            }

            const threshold = match[1] ? parseInt(match[1], 10) : 5;
            if (threshold < 1) {
                bot.chat(`/cc &b${sender}&f, ᴨорог должᴇн быᴛь ≥ 1.`);
                return;
            }

            state.antiKDRScan = {
                active: true,
                type: 'kick',
                threshold: threshold,
                players: [],
                tempPlayers: [],
                awaitingInfo: true,
                collecting: false,
                results: {},
                processedCount: 0,
                currentTimeout: null,
                initiatedBy: sender
            };

            bot.chat(`/cc &fзᴀпуᴄᴋᴀю &cᴀнᴛи-ᴋдр&f ᴋиᴋ (ᴄʍᴇᴩᴛᴇй ≥ ${threshold})...`);
            await sleep(500);
            bot.chat('/c info');
        }
    },

    // ========== #антикдр стоп ==========
    '^#антикдр стоп$': {
        admin: true,
        execute: async (bot, state, sender) => {
            if (state.antiKDRScan?.active) {
                if (state.antiKDRScan.currentTimeout) {
                    clearTimeout(state.antiKDRScan.currentTimeout);
                }
                delete state.antiKDRScan;
                bot.chat(`/cc &fᴄᴋᴀнироʙᴀниᴇ оᴄᴛᴀноʙлᴇно &#ff0000ᴀ&#ff0404д&#ff0808ʍ&#ff0c0cи&#ff1010н&#ff1414о&#ff1818ʍ&f ${sender}.`);
            } else {
                bot.chat(`/cc &fнᴇᴛ ᴀᴋᴛиʙного ᴄᴋᴀнироʙᴀния.`);
            }
        }
    }
};

module.exports = antiKDRCommands;
