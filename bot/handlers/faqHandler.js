  const searchFAQ = require('../utils/fuseSearch');
  const { FAQ } = require('../../database/models');

  const userStates = new Map();

  function setState(userId, data) {
    userStates.set(userId, { ...(userStates.get(userId) || {}), ...data });
  }

  function getState(userId) {
    return userStates.get(userId) || {};
  }

  function clearState(userId) {
    userStates.delete(userId);
  }

  const PAGE_SIZE = 5;

  function paginate(array, page = 1, pageSize = PAGE_SIZE) {
    const totalPages = Math.ceil(array.length / pageSize);
    const start = (page - 1) * pageSize;
    const pagedItems = array.slice(start, start + pageSize);
    return { pagedItems, totalPages };
  }

  module.exports = {
    handleFAQMenu: async (bot, msg) => {
      clearState(msg.from.id);

      const opts = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Поиск по ключевому слову', callback_data: 'faq_search_start' }],
            [{ text: 'Поиск по разделам', callback_data: 'faq_sections' }],
            [{ text: 'Главное меню', callback_data: 'start' }],
          ],
        },
      };
      await bot.sendMessage(msg.chat.id, 'Выберите способ поиска FAQ:', opts);
    },

    handleCallback: async (bot, query) => {
      const chatId = query.message.chat.id;
      const userId = query.from.id;
      const data = query.data;

      const state = getState(userId);

      if (data === 'faq_cancel') {
        clearState(userId);
        await bot.sendMessage(chatId, 'Запрос отменён.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Главное меню', callback_data: 'start' }],
            ],
          },
        });
        return bot.answerCallbackQuery(query.id);
      }

      if (data === 'faq_search_start') {
        setState(userId, { step: 'awaiting_keyword' });
        await bot.sendMessage(chatId, 'Введите ключевое слово для поиска FAQ:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Отмена', callback_data: 'faq_cancel' }],
            ],
          },
        });
        return bot.answerCallbackQuery(query.id);
      }

      if (state.step === 'awaiting_keyword' && query.message) {
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (data === 'faq_sections') {
        const faqs = await FAQ.findAll();
        const sections = [...new Set(faqs.map(f => f.section))];

        if (!sections.length) {
          await bot.sendMessage(chatId, 'Разделы FAQ отсутствуют.');
          return bot.answerCallbackQuery(query.id);
        }

        const buttons = sections.map((s) => [{ text: s, callback_data: `faq_section_0_${s}` }]);
        buttons.push([{ text: 'Вернуться назад', callback_data: 'faq_menu' }]);

        await bot.sendMessage(chatId, 'Выберите раздел:', {
          reply_markup: { inline_keyboard: buttons },
        });

        clearState(userId);
        setState(userId, { step: 'browsing_sections' });

        return bot.answerCallbackQuery(query.id);
      }

      if (data.startsWith('faq_section_')) {
        const rest = data.slice('faq_section_'.length); 
        const underscoreIndex = rest.indexOf('_');
        const pageStr = rest.slice(0, underscoreIndex); 
        const section = rest.slice(underscoreIndex + 1); 

        const page = parseInt(pageStr, 10) || 0;

        console.log('Раздел:', section);
        const faqs = await FAQ.findAll({ where: { section } });
        console.log('Найдено вопросов:', faqs.length);

      if (!faqs.length) {
        await bot.sendMessage(chatId, 'В этом разделе пока нет вопросов.');
        return bot.answerCallbackQuery(query.id);
      }
      function truncateText(text) {
        return text;
      }
       const { pagedItems, totalPages } = paginate(faqs, page + 1);
       const buttons = pagedItems.map(f => ([{
        text: truncateText(f.question, 40),
        callback_data: `faq_question_${f.id}`,
      }]));

      const navButtons = [];
      if (page > 0) navButtons.push({ text: '⬅️', callback_data: `faq_section_${page - 1}_${section}` });
      if (page + 1 < totalPages) navButtons.push({ text: '➡️', callback_data: `faq_section_${page + 1}_${section}` });
      if (navButtons.length) buttons.push(navButtons);
      
      buttons.push([{ text: 'Назад к разделам', callback_data: 'faq_sections' }]);

        await bot.sendMessage(chatId, `Вопросы раздела *${section}* (страница ${page + 1}/${totalPages}):`, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons },
        });

        setState(userId, { step: 'browsing_questions', section, page });

        return bot.answerCallbackQuery(query.id);
      }

      if (data.startsWith('faq_question_')) {
        const id = data.replace('faq_question_', '');
        const faq = await FAQ.findByPk(id);

        if (!faq) {
          await bot.sendMessage(chatId, '❌ Вопрос не найден.');
          return bot.answerCallbackQuery(query.id);
        }

        await bot.sendMessage(chatId, `❓ *${faq.question}*\n\n💡 ${faq.answer}`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Назад к вопросам', callback_data: `faq_section_0_${faq.section}` }],
              [{ text: 'Главное меню', callback_data: 'start' }],
            ],
          },
        });

        return bot.answerCallbackQuery(query.id);
      }

      if (data === 'faq_menu') {
        await module.exports.handleFAQMenu(bot, query.message);
        clearState(userId);
        return bot.answerCallbackQuery(query.id);
      }

      if (data === 'start') {
      clearState(userId);

      const mainMenuButtons = [
        [{ text: 'FAQ', callback_data: 'faq_menu' }],
        [{ text: 'Обратная связь', callback_data: 'feedback_menu' }],
        [{ text: 'Рассылки', callback_data: 'newsletter_menu' }],
      ];

      await bot.editMessageText('📋 Главное меню:\n\nВыберите, что вы хотите сделать:', {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: mainMenuButtons,
        },
      });

      return bot.answerCallbackQuery(query.id);
    }
    },

  handleMessage: async (bot, msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const state = getState(userId);

  if (state.step === 'awaiting_keyword') {
    const results = await searchFAQ(msg.text);

    if (!results.length) {
      await bot.sendMessage(chatId, 'Ничего не найдено. Повторите попытку или вернитесь назад.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Ввести заново', callback_data: 'faq_search_start' }],
            [{ text: 'Вернуться назад', callback_data: 'faq_menu' }],
          ],
        },
      });
      return;
    }

    setState(userId, { step: 'showing_search_results', results, page: 0 });
    await sendSearchResultsPage(bot, chatId, userId);
  }
}
  };

  async function sendSearchResultsPage(bot, chatId, userId) {
    const state = userStates.get(userId);
    if (!state || !state.results) return;

    const page = state.page || 0;
    const { pagedItems, totalPages } = paginate(state.results, page + 1);

    const buttons = pagedItems.map((r, i) => ([{
      text: r.question.length > 32 ? r.question.slice(0, 29) + '...' : r.question,
      callback_data: `faq_search_answer_${page * PAGE_SIZE + i}`,
    }]));

    const navButtons = [];
    if (page > 0) navButtons.push({ text: '⬅️', callback_data: `faq_search_page_${page - 1}` });
    if (page + 1 < totalPages) navButtons.push({ text: '➡️', callback_data: `faq_search_page_${page + 1}` });
    if (navButtons.length) buttons.push(navButtons);

    buttons.push([{ text: 'Вернуться назад', callback_data: 'faq_menu' }]);

    const text = `Результаты поиска FAQ (страница ${page + 1}/${totalPages}):`;

    await bot.sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: buttons },
    });
  }

  module.exports.handleCallbackSearchAnswer = async function (bot, query) {
    const userId = query.from.id;
    const chatId = query.message.chat.id;
    const state = getState(userId);
    const data = query.data;

    if (!state || !state.results) return bot.answerCallbackQuery(query.id);

    if (data.startsWith('faq_search_answer_')) {
      const index = parseInt(data.replace('faq_search_answer_', ''), 10);
      const faq = state.results[index];
      if (!faq) {
        await bot.sendMessage(chatId, 'Вопрос не найден.');
        return bot.answerCallbackQuery(query.id);
      }

      await bot.sendMessage(chatId, `❓ *${faq.question}*\n\n💡 ${faq.answer}`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Назад к результатам', callback_data: `faq_search_page_${Math.floor(index / PAGE_SIZE)}` }],
            [{ text: 'Главное меню', callback_data: 'start' }],
          ],
        },
      });

      return bot.answerCallbackQuery(query.id);
    }

    if (data.startsWith('faq_search_page_')) {
      const page = parseInt(data.replace('faq_search_page_', ''), 10);
      setState(userId, { page });
      await sendSearchResultsPage(bot, chatId, userId);
      return bot.answerCallbackQuery(query.id);
    }
  };

  module.exports.userStates = userStates;