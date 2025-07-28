const { Ticket, Message, User } = require('../../database/models');

const userStates = new Map();

function extractMessageData(msg) {
  const parts = [];

  if (msg.caption) {
    parts.push({ type: 'text', content: msg.caption });
  } else if (msg.text) {
    parts.push({ type: 'text', content: msg.text });
  }

  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    const largestPhoto = msg.photo[msg.photo.length - 1];
    if (largestPhoto && largestPhoto.file_id) {
      parts.push({ type: 'photo', content: largestPhoto.file_id });
    }
  }

  if (msg.document && msg.document.file_id) {
    parts.push({ type: 'document', content: msg.document.file_id });
  }

  if (msg.video && msg.video.file_id) {
    parts.push({ type: 'video', content: msg.video.file_id });
  }

  if (msg.audio && msg.audio.file_id) {
    parts.push({ type: 'audio', content: msg.audio.file_id });
  }

  return parts.length > 0 ? parts : null;
}


async function showFeedbackMenu(bot, msgOrQuery) {
  const chatId = msgOrQuery.chat?.id || msgOrQuery.message?.chat?.id;
  await bot.sendMessage(chatId, 'Выберите действие:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Отправить заявку', callback_data: 'send_new_ticket' }],
        [{ text: 'Мои заявки', callback_data: 'my_tickets' }],
        [{ text: 'Главное меню', callback_data: 'start' }],
      ],
    },
  });
  userStates.delete(chatId);
}

async function promptForNewTicket(bot, msg) {
  const chatId = msg.chat.id;
  userStates.set(chatId, { action: 'waiting_for_ticket_text' });
  await bot.sendMessage(chatId, 'Опишите проблему. Для отмены нажмите "Отмена".', {
    reply_markup: {
      inline_keyboard: [[{ text: 'Отмена', callback_data: 'feedback_menu' }]],
    },
  });
}

async function handleMessage(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  const state = userStates.get(chatId);
  if (!state) return;

  let user = await User.findOne({ where: { telegramId } });
  if (!user) {
    user = await User.create({
      telegramId,
      name: `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim(),
      role: 'user',
    });
  }

  const extracted = extractMessageData(msg);
  if (!extracted) {
    return bot.sendMessage(chatId, '❗ Поддерживаются только текст, фото, документы, аудио и видео.');
  }

  let textPart = '';
  let mediaPart = null;

  for (const part of extracted) {
    if (part.type === 'text') {
      textPart += (textPart ? '\n' : '') + part.content;
    } else if (!mediaPart) {
      mediaPart = { type: part.type, fileId: part.content };
    }
  }

  if (state.action === 'waiting_for_ticket_text') {
    const ticket = await Ticket.create({
      userId: user.id,
      status: 'open',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await Message.create({
      ticketId: ticket.id,
      userId: user.id,
      type: 'user',
      text: textPart || null,
      fileId: mediaPart ? mediaPart.fileId : null,
      mediaType: mediaPart ? mediaPart.type : null,
    });

    await bot.sendMessage(chatId, '✅ Ваша заявка принята!');

    userStates.delete(chatId);

    if (process.env.ADMIN_CHAT_ID) {
      await bot.sendMessage(process.env.ADMIN_CHAT_ID, `📬 Новая заявка #${ticket.id} от пользователя @${user.name || user.telegramId}`);
    }

    return;
  }
  
  if (state.action === 'user_replying' && state.ticketId) {
    if (state.promptMessageId) {
      try {
        await bot.deleteMessage(chatId, state.promptMessageId);
      } catch (err) {
        console.warn('⚠️ Не удалось удалить сообщение:', err?.message || err);
      }
    }

    const ticket = await Ticket.findByPk(state.ticketId);
    if (!ticket) {
      await bot.sendMessage(chatId, 'Заявка не найдена.');
      userStates.delete(chatId);
      return;
    }

    await Message.create({
      ticketId: ticket.id,
      userId: user.id,
      type: 'user',
      text: textPart || null,
      fileId: mediaPart ? mediaPart.fileId : null,
      mediaType: mediaPart ? mediaPart.type : null,
    });

    await bot.sendMessage(chatId, '✅ Сообщение добавлено к заявке.');

    userStates.delete(chatId);

    if (process.env.ADMIN_CHAT_ID) {
      await bot.sendMessage(process.env.ADMIN_CHAT_ID, `📨 Ответ пользователя по заявке #${ticket.id}`);
    }

    return;
  }
}

async function listUserTickets(bot, msg) {
  const chatId = msg.chat.id;
  const user = await User.findOne({ where: { telegramId: msg.from.id.toString() } })

  const tickets = await Ticket.findAll({ where: { userId: user.id }, order: [['createdAt', 'DESC']] });

  if (tickets.length === 0) {
    return bot.sendMessage(chatId, 'У вас пока нет заявок.', {
      reply_markup: {
        inline_keyboard: [[{ text: 'Вернуться назад', callback_data: 'back_to_menu' }]],
      },
    });
  }

  const buttons = tickets.map(t => [{
    text: `Заявка #${t.id} (${t.status})`,
    callback_data: `user_ticket_menu_${t.id}`,
  }]);

  buttons.push([{ text: 'Вернуться назад', callback_data: 'back_to_menu' }]);

  await bot.sendMessage(chatId, 'Ваши заявки:', {
    reply_markup: { inline_keyboard: buttons },
  });
}

async function ticketMenu(bot, msg, ticketId) {
  const chatId = msg.chat.id;
  const ticket = await Ticket.findByPk(ticketId);

  if (!ticket) {
    await bot.sendMessage(chatId, 'Заявка не найдена.');
    return;
  }

  const buttons = [];

  buttons.push([{ text: 'Просмотр истории', callback_data: `user_ticket_${ticketId}` }]);

  if (ticket.status === 'open') {
    buttons.unshift([{ text: 'Дополнить заявку', callback_data: `user_reply_ticket_${ticketId}` }]);
  }

  buttons.push([{ text: 'Вернуться назад', callback_data: 'my_tickets' }]);

  await bot.sendMessage(chatId, 'Выберите действие с заявкой: ', {
    reply_markup: {
      inline_keyboard: buttons
    }
  });
}

async function showUserTicketDetails(bot, msg, ticketId) {
  const ticket = await Ticket.findByPk(ticketId, {
    include: [Message, User],
  });

  if (!ticket) return bot.sendMessage(msg.chat.id, 'Заявка не найдена.');

  const messages = ticket.Messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  await bot.sendMessage(msg.chat.id, `📝 История сообщений заявки #${ticket.id}\n-------------------------------------`);

  for (let i = 0; i < messages.length; i++) {
  const m = messages[i];
  const next = messages[i + 1];

  const senderPrefix = m.type === 'admin' ? '🛠️ Сообщение поддержки:' : '👤 Сообщение пользователя:';
  let caption = '';

  if (
    m.fileId &&
    next &&
    !next.fileId &&
    next.type === m.type &&
    Math.abs(new Date(m.createdAt) - new Date(next.createdAt)) < 5000
  ) {
    caption = `${senderPrefix}\n${next.text}`;

    switch (m.mediaType) {
      case 'photo': await bot.sendPhoto(msg.chat.id, m.fileId, { caption }); break;
      case 'document': await bot.sendDocument(msg.chat.id, m.fileId, { caption }); break;
      case 'video': await bot.sendVideo(msg.chat.id, m.fileId, { caption }); break;
      case 'audio': await bot.sendAudio(msg.chat.id, m.fileId, { caption }); break;
      default: await bot.sendMessage(msg.chat.id, caption);
    }

    i++; 
    continue;
  }

  if (m.fileId) {
    caption = senderPrefix;
    if (m.text) {
      caption += `\n${m.text}`;
    }

    switch (m.mediaType) {
      case 'photo': await bot.sendPhoto(msg.chat.id, m.fileId, { caption }); break;
      case 'document': await bot.sendDocument(msg.chat.id, m.fileId, { caption }); break;
      case 'video': await bot.sendVideo(msg.chat.id, m.fileId, { caption }); break;
      case 'audio': await bot.sendAudio(msg.chat.id, m.fileId, { caption }); break;
      default: await bot.sendMessage(msg.chat.id, caption);
    }
  } else {
    caption = `${senderPrefix}\n${m.text || ''}`;
    await bot.sendMessage(msg.chat.id, caption);
  }
}

  await bot.sendMessage(msg.chat.id, `-------------------------------------`, {
    reply_markup: {
      inline_keyboard: [[{ text: 'К списку заявок', callback_data: 'my_tickets' }]],
    },
  });
}

async function promptUserReply(bot, msg, ticketId) {
  const chatId = msg.chat.id;

  const sent = await bot.sendMessage(chatId, 'Напишите сообщение для дополнения заявки. Для отмены нажмите "Отмена".', {
    reply_markup: {
      inline_keyboard: [[{ text: 'Отмена', callback_data: `user_ticket_menu_${ticketId}` }]],
    },
  });

  userStates.set(chatId, {
    action: 'user_replying',
    ticketId,
    promptMessageId: sent.message_id,
  });
}


module.exports = {
  showFeedbackMenu,
  promptForNewTicket,
  handleMessage,
  listUserTickets,
  showUserTicketDetails,
  promptUserReply,
  ticketMenu,
};
