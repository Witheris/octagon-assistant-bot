const { Ticket, Message, User } = require('../../database/models');
const adminStates = new Map();

function extractMessageData(msg) {
  const result = {
    text: null,
    media: null
  };

  if (msg.text) {
    result.text = msg.text;
  } else if (msg.caption) {
    result.text = msg.caption;
  }

  if (msg.photo) {
    result.media = { type: 'photo', fileId: msg.photo.at(-1).file_id };
  } else if (msg.document) {
    result.media = { type: 'document', fileId: msg.document.file_id };
  } else if (msg.video) {
    result.media = { type: 'video', fileId: msg.video.file_id };
  } else if (msg.audio) {
    result.media = { type: 'audio', fileId: msg.audio.file_id };
  }

  if (!result.text && !result.media) return null;
  return result;
}

function formatPreview(message) {
  if (!message) return '[без содержимого]';
  if (message.text) return message.text.slice(0, 32);
  if (message.fileId) return `[${message.mediaType || 'вложение'}]`;
  return '[без текста]';
}

async function listAllTickets(bot, query) {
  const userId = query.from.id.toString();
  const adminUser = await User.findOne({ where: { telegramId: userId } });
  if (!adminUser || adminUser.role !== 'admin') {
    return bot.sendMessage(userId, 'У вас нет доступа к этому разделу.');
  }

  const tickets = await Ticket.findAll({ order: [['createdAt', 'DESC']], include: [User] });
  if (!tickets.length) return bot.sendMessage(userId, 'Заявок нет.');

  const buttons = await Promise.all(tickets.map(async (ticket) => {
    const firstMsg = await Message.findOne({
      where: { ticketId: ticket.id },
      order: [['createdAt', 'ASC']]
    });

    const preview = formatPreview(firstMsg);
    return [{
      text: `Заявка #${ticket.id} - ${ticket.status}`,
      callback_data: `admin_ticket_${ticket.id}`
    }];
  }));

  buttons.push([{ text: 'Главное меню', callback_data: 'start' }]);

  await bot.sendMessage(userId, 'Список заявок:', {
    reply_markup: { inline_keyboard: buttons }
  });
}

async function showTicketDetails(bot, query, ticketId) {
  const chatId = query.from.id;

  const ticket = await Ticket.findByPk(ticketId, {
    include: [
      { model: Message, include: [User] },
      User
    ],
    order: [[Message, 'createdAt', 'ASC']]
  });

  if (!ticket) return bot.sendMessage(chatId, 'Заявка не найдена.');

  const messages = ticket.Messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  await bot.sendMessage(chatId, `📝 История сообщений заявки #${ticket.id}\n📌 Статус: ${ticket.status}\n-------------------------------------`);
  for (const m of messages) {
    const sender = m.type === 'admin' ? '🛠️ Сообщение поддержки' : '👤 Сообщение пользователя';
    const caption = `${sender}:\n${m.text || ''}`;

    if (m.fileId) {
      const fileType = m.mediaType;
      const sendOptions = { caption: m.text ? caption : undefined };

      switch (fileType) {
        case 'photo': await bot.sendPhoto(chatId, m.fileId, sendOptions); break;
        case 'document': await bot.sendDocument(chatId, m.fileId, sendOptions); break;
        case 'video': await bot.sendVideo(chatId, m.fileId, sendOptions); break;
        case 'audio': await bot.sendAudio(chatId, m.fileId, sendOptions); break;
        default: await bot.sendMessage(chatId, caption);
      }
    } else {
      await bot.sendMessage(chatId, caption);
    }
  }

  await bot.sendMessage(chatId, `-------------------------------------`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✍️ Ответить', callback_data: `admin_reply_ticket_${ticket.id}` }],
        [{ text: '✅ Закрыть заявку', callback_data: `admin_close_ticket_${ticket.id}` }],
        [{ text: 'Вернуться назад', callback_data: 'admin_requests' }]
      ]
    }
  });
}

async function promptReply(bot, msg, ticketId) {
  adminStates.set(msg.chat.id, { action: 'replying', ticketId });
  await bot.sendMessage(msg.chat.id, 'Введите сообщение для ответа пользователю:');
}

async function closeTicket(bot, msg, ticketId) {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) return bot.sendMessage(msg.chat.id, 'Заявка не найдена.');

  ticket.status = 'closed';
  await ticket.save();
  await bot.sendMessage(msg.chat.id, `Заявка #${ticket.id} закрыта.`);
}

async function handleMessage(bot, msg) {
  const state = adminStates.get(msg.chat.id);
  if (!state || state.action !== 'replying') return;

  const ticket = await Ticket.findByPk(state.ticketId);
  const adminUser = await User.findOne({ where: { telegramId: msg.chat.id } });
  const user = ticket ? await User.findByPk(ticket.userId) : null;

  if (!ticket || !adminUser || !user) {
    adminStates.delete(msg.chat.id);
    return bot.sendMessage(msg.chat.id, '❌ Ошибка: заявка или пользователь не найдены.');
  }

  const extracted = extractMessageData(msg);
  if (!extracted) return bot.sendMessage(msg.chat.id, '❌ Неподдерживаемый тип сообщения.');

  await Message.create({
    ticketId: ticket.id,
    userId: adminUser.id,
    type: 'admin',
    text: extracted.text || null,
    fileId: extracted.media ? extracted.media.fileId : null,
    mediaType: extracted.media ? extracted.media.type : null,
  });
const notification = `🔔 Поддержка ответила на вашу заявку #${ticket.id}. Пожалуйста, проверьте.`;

try {
  await bot.sendMessage(Number(user.telegramId), notification, {
    reply_markup: {
      inline_keyboard: [[
        { text: 'К списку заявок', callback_data: 'my_tickets' }
      ]]
    }
  });
  await bot.sendMessage(msg.chat.id, '✅ Ответ отправлен пользователю.');
} catch (error) {
  console.error('Ошибка при отправке пользователю:', error);
  await bot.sendMessage(msg.chat.id, '❌ Ошибка при отправке пользователю.');
}

  adminStates.delete(msg.chat.id);
}

async function handleAdminCallback(bot, query) {
  const data = query.data;
  if (data.startsWith('admin_ticket_')) {
    const ticketId = data.replace('admin_ticket_', '');
    return showTicketDetails(bot, query, ticketId);
  }
  if (data.startsWith('admin_reply_ticket_')) {
    const ticketId = data.replace('admin_reply_ticket_', '');
    return promptReply(bot, { chat: { id: query.from.id } }, ticketId);
  }
  if (data.startsWith('admin_close_ticket_')) {
    const ticketId = data.replace('admin_close_ticket_', '');
    return closeTicket(bot, { chat: { id: query.from.id } }, ticketId);
  }
}

module.exports = {
  listAllTickets,
  handleAdminCallback,
  handleMessage,
  extractMessageData,
  promptReply,
  closeTicket,
  showTicketDetails,
  adminStates
};
