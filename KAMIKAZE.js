const mineflayer = require('mineflayer');

// Конфигурация ботов
const BOTS = [
    {
        username: 'Oilkanpvpb',
        password: 'swagwest',
        home: 'lolpvpez' // или название дома
    },
   {
        username: 'imennoMasha_',
        password: 'swagwest',
        home: 'lolpvpez'
    },
{
    username: 'Karasava_loh12',
    password: 'swagwest',
    home: 'lolpvpez'
},
{
    username: 'LINUXLINUXLINU',
    password: 'swagwest',
    home: 'lolpvpez'
},
{
    username: 'SHalomCheliki',
    password: 'swagwest',
    home: 'lolpvpez'
},
];

// Создание бота
function createBot(config) {
    console.log(`[${config.username}] Подключение...`);

    const bot = mineflayer.createBot({
        host: 'ru.masedworld.net',
        port: 25565,
        username: config.username,
        version: '1.16.5',
        auth: 'offline'
    });

    // Флаг что бот вступил в клан
    let joinedClan = false;

    // Обработчики
    bot.on('login', () => {
        console.log(`[${config.username}] Вошел на сервер`);
        // Ждем немного перед авторизацией
        setTimeout(() =>
        bot.chat(`/reg ${config.password}`),
                   10000);
        setTimeout(() =>
            bot.chat('/s3'),
        5000);

    });

    bot.on('spawn', async () => {
        console.log(`[${config.username}] Заспавнился`);
    });

    bot.on('message', (jsonMsg) => {
        const msg = jsonMsg.toString();

        // Логируем только нужные чаты
        console.log(`${msg}`);
        if (msg.includes(`Wortex`)) {
            console.log(`[${config.username}] УБИТ! Выполняю /warp ${config.home}`);
            setTimeout(() =>
            bot.chat('/c join ChertHouse'),
                       2000);

        }
    });

    // Переподключение при отключении
    bot.on('end', (reason) => {
        console.log(`[${config.username}] Отключен: ${reason}. Переподключение через 10 сек...`);
        setTimeout(() => createBot(config), 10000);
    });

    bot.on('error', (err) => {
        console.log(`[${config.username}] Ошибка: ${err.message}`);
    });

}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
BOTS.forEach(createBot);
