// src/index.js
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const cron = require('node-cron');
const config = require('./config/config');
const GoogleSheetsService = require('./services/GoogleSheetsService');

// コマンドのインポート
const inventoryCommand = require('./commands/inventory');
const riceCommand = require('./commands/rice');
const cookingCommand = require('./commands/cooking');

class FridgeBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.sheetsService = new GoogleSheetsService();
    this.commands = new Collection();
    this.setupCommands();
    this.setupEventHandlers();
  }

  setupCommands() {
    // コマンドを登録
    this.commands.set(inventoryCommand.data.name, inventoryCommand);
    this.commands.set(riceCommand.data.name, riceCommand);
    this.commands.set(cookingCommand.data.name, cookingCommand);
  }

  setupEventHandlers() {
    this.client.once('ready', async () => {
      console.log(`✅ Bot logged in as ${this.client.user.tag}`);
      
      // Google Sheets API初期化
      await this.sheetsService.initialize();
      
      // スラッシュコマンド登録
      await this.registerSlashCommands();
      
      // 定期通知設定
      this.setupScheduledNotifications();
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = this.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction, this.sheetsService);
      } catch (error) {
        console.error('Command execution error:', error);
        const errorMessage = 'コマンド実行中にエラーが発生しました。';
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      }
    });
  }

  async registerSlashCommands() {
    const commands = Array.from(this.commands.values()).map(command => command.data.toJSON());
    
    const rest = new REST().setToken(config.discord.token);
    
    try {
      console.log('🔄 Registering slash commands...');
      
      await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
        { body: commands }
      );
      
      console.log('✅ Slash commands registered successfully');
    } catch (error) {
      console.error('❌ Failed to register slash commands:', error);
    }
  }

  setupScheduledNotifications() {
    // 毎日18:00に期限通知
    cron.schedule('0 18 * * *', async () => {
      await this.sendExpiryNotification();
    });

    // 土曜日9:00に買い物提案
    cron.schedule('0 9 * * 6', async () => {
      await this.sendShoppingNotification();
    });

    console.log('📅 Scheduled notifications set up');
  }

  async sendExpiryNotification() {
    try {
      const inventory = await this.sheetsService.getInventoryData();
      const today = new Date();
      const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      const expiringItems = inventory.filter(item => {
        const expiryDate = new Date(item.expiryDate);
        return expiryDate <= threeDaysLater && expiryDate >= today;
      });

      if (expiringItems.length === 0) return;

      const channel = await this.client.channels.fetch(config.notifications.channelId);
      const itemList = expiringItems.map(item => 
        `• **${item.name}**: ${item.expiryDate}まで`
      ).join('\n');

      await channel.send(`🔔 **期限が近い食材があります！**\n\n${itemList}\n\n今日の料理で使ってみてはいかがですか？`);
    } catch (error) {
      console.error('期限通知エラー:', error);
    }
  }

  async sendShoppingNotification() {
    try {
      const inventory = await this.sheetsService.getInventoryData();
      const riceData = await this.sheetsService.getRiceData();

      const lowStockItems = inventory.filter(item => 
        item.currentAmount <= item.notificationThreshold
      );

      const shoppingList = [];
      
      // 米のチェック
      if (riceData.currentAmount <= riceData.notificationThreshold) {
        shoppingList.push('🍚 米');
      }

      // 食材のチェック
      lowStockItems.forEach(item => {
        shoppingList.push(`${item.category === '野菜' ? '🥬' : item.category === '肉類' ? '🥩' : '🥛'} ${item.name}`);
      });

      if (shoppingList.length === 0) {
        const channel = await this.client.channels.fetch(config.notifications.channelId);
        await channel.send('✅ **今週の買い物**\n\n在庫は十分にあります！特に買い足すものはなさそうです。');
        return;
      }

      const channel = await this.client.channels.fetch(config.notifications.channelId);
      await channel.send(`🛒 **今週の買い物リスト**\n\n${shoppingList.join('\n')}\n\n買い物の際にご確認ください！`);
    } catch (error) {
      console.error('買い物通知エラー:', error);
    }
  }

  async start() {
    await this.client.login(config.discord.token);
  }
}

// Bot起動
const bot = new FridgeBot();
bot.start().catch(console.error);
