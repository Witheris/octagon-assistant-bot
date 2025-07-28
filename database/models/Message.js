module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define('Message', {
    ticketId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true 
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    fileId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    mediaType: {
      type: DataTypes.STRING,
      allowNull: true
    },
    type: {
      type: DataTypes.ENUM('user', 'admin'),
      allowNull: false
    }
  }, {});
  
  Message.associate = function(models) {
    Message.belongsTo(models.User, { foreignKey: 'userId' });
    Message.belongsTo(models.Ticket, { foreignKey: 'ticketId' });
  };

  return Message;
};
