module.exports = (sequelize, DataTypes) => {
  const Ticket = sequelize.define('Ticket', {
    status: { type: DataTypes.ENUM('open', 'closed'), defaultValue: 'open' },
  });

  Ticket.associate = (models) => {
    Ticket.belongsTo(models.User, { foreignKey: 'userId' });
    Ticket.hasMany(models.Message, { foreignKey: 'ticketId' });
  };

  return Ticket;
};