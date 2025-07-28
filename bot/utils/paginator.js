function paginateItems(items, page = 1, pageSize = 5) {
  const totalPages = Math.ceil(items.length / pageSize);
  const pagedItems = items.slice((page - 1) * pageSize, page * pageSize);
  return { pagedItems, totalPages };
}

function generatePaginationButtons(totalPages, currentPage, prefix) {
  const buttons = [];

  if (currentPage > 1) {
    buttons.push({ text: '⬅️', callback_data: `${prefix}_page_${currentPage - 1}` });
  }

  buttons.push({ text: `${currentPage}/${totalPages}`, callback_data: 'noop' });

  if (currentPage < totalPages) {
    buttons.push({ text: '➡️', callback_data: `${prefix}_page_${currentPage + 1}` });
  }

  return buttons;
}

module.exports = { paginateItems, generatePaginationButtons };
