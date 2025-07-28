module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    telegramId: { type: DataTypes.STRING, unique: true },
    name: DataTypes.STRING,
    role: { type: DataTypes.ENUM('user', 'admin'), defaultValue: 'user' },
  });

  User.associate = (models) => {
    User.hasMany(models.Message, { foreignKey: 'userId' });
    User.hasMany(models.Ticket, { foreignKey: 'userId' });
  };

  return User;
};