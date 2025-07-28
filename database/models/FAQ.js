module.exports = (sequelize, DataTypes) => {
  return sequelize.define('FAQ', {
    question: DataTypes.TEXT,
    answer: DataTypes.TEXT,
    section: DataTypes.STRING,
  });
};