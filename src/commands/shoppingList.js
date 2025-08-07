// src/commands/shoppingList.js - 買い物リスト機能
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('買い物リスト')
    .setDescription('買い物が必要な食材を確認します')
    .addStringOption(option =>
      option.setName('表示方法')
        .setDescription('リストの表示方法を選択')
        .setRequired(false)
        .addChoices(
          { name: '優先度順', value: 'priority' },
          { name: 'カテゴリ別', value: 'category' },
          { name: '在庫少ない順', value: 'stock_low' },
          { name: '期限近い順', value: 'expiry' }
        ))
    .addBooleanOption(option =>
      option.setName('常備品のみ')
        .setDescription('常備品のみを表示するか')
        .setRequired(false)),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const displayMethod = interaction.options.getString('表示方法') || 'priority';
      const stapleOnly = interaction.options.getBoolean('常備品のみ') || false;

      // 在庫データと米データを取得
      const inventory = await sheetsService.getInventoryData();
      const riceData = await sheetsService.getRiceData();

      // 買い物が必要なアイテムを特定
      const shoppingItems = [];

      // 米のチェック
      if (riceData.currentAmount <= riceData.notificationThreshold) {
        shoppingItems.push({
          name: '米',
          category: '主食',
          currentAmount: riceData.currentAmount,
          unit: 'g',
          notificationThreshold: riceData.notificationThreshold,
          isStaple: true,
          priority: this.calculateRicePriority(riceData.currentAmount, riceData.notificationThreshold),
          reason: '在庫不足',
          expiryDate: null,
          icon: '🍚'
        });
      }

      // 食材のチェック
      for (const item of inventory) {
        const shouldAdd = this.shouldAddToShoppingList(item, stapleOnly);
        if (shouldAdd.add) {
          shoppingItems.push({
            ...item,
            priority: shouldAdd.priority,
            reason: shouldAdd.reason,
            icon: this.getCategoryIcon(item.category)
          });
        }
      }

      if (shoppingItems.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('🛒 買い物リスト')
          .setColor(0x00AE86)
          .setDescription('✅ **買い物が必要な食材はありません！**\n\n在庫は十分にあるようです。')
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // ソートとグループ化
      const sortedItems = this.sortShoppingItems(shoppingItems, displayMethod);
      const groupedItems = this.groupShoppingItems(sortedItems, displayMethod);

      // Embed作成
      const embed = new EmbedBuilder()
        .setTitle('🛒 買い物リスト')
        .setColor(0xFF6B00)
        .setDescription(`📝 **${shoppingItems.length}個** の食材を買い物リストに追加しました`)
        .setTimestamp();

      // グループごとにフィールドを追加
      for (const [groupName, items] of Object.entries(groupedItems)) {
        if (items.length === 0) continue;

        const itemList = items.map(item => {
          const priorityIcon = this.getPriorityIcon(item.priority);
          const reasonText = item.reason === '期限切れ近い' ? '(期限近)' : 
                           item.reason === '在庫不足' ? '(在庫少)' : 
                           item.reason === '在庫切れ' ? '(在庫切れ)' : '';
          
          if (item.name === '米') {
            return `${priorityIcon} **米** ${reasonText}\n   現在: ${item.currentAmount}g (あと約${Math.floor(item.currentAmount/450)}回分)`;
          } else {
            return `${priorityIcon} **${item.name}** ${reasonText}\n   現在: ${item.currentAmount}${item.unit} / 設定: ${item.notificationThreshold}${item.unit}`;
          }
        }).join('\n\n');

        embed.addFields({
          name: groupName,
          value: itemList.length > 1024 ? itemList.substring(0, 1020) + '...' : itemList,
          inline: false
        });
      }

      // 統計情報を追加
      const stats = this.getShoppingStats(shoppingItems);
      embed.addFields({
        name: '📊 統計',
        value: `🚨 **緊急**: ${stats.urgent}個\n⚠️ **注意**: ${stats.warning}個\n💡 **推奨**: ${stats.recommended}個`,
        inline: true
      });

      // カテゴリ別統計
      const categoryStats = this.getCategoryStats(shoppingItems);
      if (Object.keys(categoryStats).length > 0) {
        const categoryText = Object.entries(categoryStats)
          .map(([category, count]) => `${this.getCategoryIcon(category)} ${category}: ${count}個`)
          .join('\n');
        
        embed.addFields({
          name: '🏷️ カテゴリ別',
          value: categoryText,
          inline: true
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('買い物リストエラー:', error);
      await interaction.editReply(`❌ エラーが発生しました: ${error.message}`);
    }
  },

  // 買い物リストに追加すべきかチェック
  shouldAddToShoppingList(item, stapleOnly) {
    if (stapleOnly && !item.isStaple) {
      return { add: false };
    }

    let priority = 0;
    let reason = '';

    // 在庫チェック
    if (item.currentAmount <= 0) {
      priority += 100;
      reason = '在庫切れ';
    } else if (item.currentAmount <= item.notificationThreshold) {
      priority += 50;
      reason = '在庫不足';
    }

    // 期限チェック
    if (item.expiryDate) {
      const daysUntilExpiry = this.getDaysUntilExpiry(item.expiryDate);
      if (daysUntilExpiry <= 1 && item.currentAmount <= item.notificationThreshold * 1.5) {
        priority += 30;
        if (!reason) reason = '期限切れ近い';
      }
    }

    // 常備品の場合は優先度を上げる
    if (item.isStaple) {
      priority += 10;
    }

    return {
      add: priority > 0,
      priority: priority,
      reason: reason || '在庫不足'
    };
  },

  // 米の優先度を計算
  calculateRicePriority(currentAmount, threshold) {
    if (currentAmount <= 0) return 150;
    if (currentAmount <= threshold * 0.3) return 100;
    if (currentAmount <= threshold * 0.6) return 70;
    return 50;
  },

  // 買い物アイテムをソート
  sortShoppingItems(items, method) {
    const sortedItems = [...items];

    switch (method) {
      case 'priority':
        return sortedItems.sort((a, b) => b.priority - a.priority);
      case 'category':
        return sortedItems.sort((a, b) => {
          const categoryCompare = a.category.localeCompare(b.category, 'ja');
          if (categoryCompare !== 0) return categoryCompare;
          return b.priority - a.priority;
        });
      case 'stock_low':
        return sortedItems.sort((a, b) => {
          const aRatio = a.name === '米' ? a.currentAmount / a.notificationThreshold : 
                        a.currentAmount / (a.notificationThreshold || 1);
          const bRatio = b.name === '米' ? b.currentAmount / b.notificationThreshold : 
                        b.currentAmount / (b.notificationThreshold || 1);
          return aRatio - bRatio;
        });
      case 'expiry':
        return sortedItems.sort((a, b) => {
          if (!a.expiryDate && !b.expiryDate) return b.priority - a.priority;
          if (!a.expiryDate) return 1;
          if (!b.expiryDate) return -1;
          return new Date(a.expiryDate) - new Date(b.expiryDate);
        });
      default:
        return sortedItems.sort((a, b) => b.priority - a.priority);
    }
  },

  // 買い物アイテムをグループ化
  groupShoppingItems(items, method) {
    if (method === 'category') {
      const grouped = {};
      items.forEach(item => {
        const groupName = `${item.icon} ${item.category}`;
        if (!grouped[groupName]) grouped[groupName] = [];
        grouped[groupName].push(item);
      });
      return grouped;
    } else {
      const grouped = {};
      items.forEach(item => {
        let groupName;
        
        if (item.priority >= 100) {
          groupName = '🚨 緊急（在庫切れ）';
        } else if (item.priority >= 70) {
          groupName = '⚠️ 注意（在庫少）';
        } else if (item.priority >= 30) {
          groupName = '💡 推奨';
        } else {
          groupName = '📝 その他';
        }
        
        if (!grouped[groupName]) grouped[groupName] = [];
        grouped[groupName].push(item);
      });
      return grouped;
    }
  },

  // 期限までの日数を計算
  getDaysUntilExpiry(expiryDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const expiryDate = new Date(expiryDateStr);
    expiryDate.setHours(0, 0, 0, 0);
    
    const diffTime = expiryDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  },

  // 優先度アイコンを取得
  getPriorityIcon(priority) {
    if (priority >= 100) return '🚨';
    if (priority >= 70) return '⚠️';
    if (priority >= 30) return '💡';
    return '📝';
  },

  // カテゴリアイコンを取得
  getCategoryIcon(category) {
    const icons = {
      '主食': '🍚',
      '野菜': '🥬',
      '肉類': '🥩',
      '魚類': '🐟',
      '乳製品': '🥛',
      '調味料': '🧂',
      '冷凍食品': '🧊',
      'その他': '📦'
    };
    return icons[category] || '📦';
  },

  // 買い物統計を取得
  getShoppingStats(items) {
    return {
      urgent: items.filter(item => item.priority >= 100).length,
      warning: items.filter(item => item.priority >= 70 && item.priority < 100).length,
      recommended: items.filter(item => item.priority >= 30 && item.priority < 70).length
    };
  },

  // カテゴリ別統計を取得
  getCategoryStats(items) {
    const stats = {};
    items.forEach(item => {
      stats[item.category] = (stats[item.category] || 0) + 1;
    });
    return stats;
  }
};
