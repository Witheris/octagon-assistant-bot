const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  dialect: 'mysql',
});

const models = {
  User: require('./User')(sequelize, Sequelize.DataTypes),
  FAQ: require('./FAQ')(sequelize, Sequelize.DataTypes),
  Ticket: require('./Ticket')(sequelize, Sequelize.DataTypes),
  Message: require('./Message')(sequelize, Sequelize.DataTypes),
};

Object.values(models).forEach((model) => {
  if (model.associate) model.associate(models);
});

models.sequelize = sequelize;
models.Sequelize = Sequelize;

module.exports = models;