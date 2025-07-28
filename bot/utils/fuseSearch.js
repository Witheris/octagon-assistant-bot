const Fuse = require('fuse.js');
const { FAQ } = require('../../database/models');

async function searchFAQ(query) {
  const faqs = await FAQ.findAll();
  const fuse = new Fuse(faqs.map(f => f.toJSON()), {
    keys: ['question', 'answer'],
    threshold: 0.3,
    ignoreLocation: true,
  });

  return fuse.search(query).map(result => result.item);
}

module.exports = searchFAQ;