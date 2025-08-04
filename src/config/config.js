// src/config/config.js
module.exports = {
  discord: {
    token: process.env.DISCORD_TOKEN, // Discord Bot Token
    clientId: process.env.DISCORD_CLIENT_ID, // Bot Application ID
    guildId: process.env.DISCORD_GUILD_ID // サーバーID（テスト用）
  },
  googleSheets: {
    spreadsheetId: process.env.SPREADSHEET_ID, // スプレッドシートID
    credentialsPath: './config/credentials.json' // サービスアカウント認証情報
  },
  notifications: {
    channelId: process.env.NOTIFICATION_CHANNEL_ID, // 通知用チャンネルID
    dailyNotificationTime: '18:00', // 毎日の通知時刻
    weeklyShoppingDay: 6 // 土曜日 (0=日曜日)
  }
};
