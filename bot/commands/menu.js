const { User } = require('../../database/models');

async function showMainMenu(bot, chatId, userId) {
  const user = await User.findOne({ where: { telegramId: userId.toString() } });
  const isAdmin = user?.role === 'admin';

  const buttons = [
    [{ text: 'Часто задаваемые вопросы', callback_data: 'faq_menu' }],
    [{ text: 'Обратная связь', callback_data: 'feedback_menu' }],
  ];

  if (isAdmin) {
    buttons.push([{ text: 'Посмотреть заявки', callback_data: 'admin_requests' }]);
  }

  await bot.sendMessage(chatId, '📋 Главное меню:\n\nВыберите, что вы хотите сделать:', {
    reply_markup: { inline_keyboard: buttons },
  });
}

module.exports = {
  init: (bot) => {
    bot.onText(/\/menu/, async (msg) => {
      await showMainMenu(bot, msg.chat.id, msg.from.id);
    });
  },
  showMainMenu,
};