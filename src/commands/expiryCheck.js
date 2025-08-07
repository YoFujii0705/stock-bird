// src/commands/expiryCheck.js - 期限確認機能
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('期限確認')
    .setDescription('食材の賞味期限・消費期限を確認します')
    .addStringOption(option =>
      option.setName('期間')
        .setDescription('確認する期間を選択')
        .setRequired(false)
        .addChoices(
          { name: '期限切れ', value: 'expired' },
          { name: '今日期限', value: 'today' },
          { name: '明日期限', value: 'tomorrow' },
          { name: '3日以内', value: '3days' },
          { name: '1週間以内', value: '1week' },
          { name: '全て', value: 'all' }
        ))
    .addStringOption(option =>
      option.setName('ソート')
        .setDescription('並び順を選択')
        .setRequired(false)
        .addChoices(
          { name: '期限が近い順', value: 'expiry_asc' },
          { name: '期限が遠い順', value: 'expiry_desc' },
          { name: 'カテゴリ順', value: 'category' },
          { name: '食材名順', value: 'name' }
        )),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const period = interaction.options.getString('期間') || '3days';
      const sortBy = interaction.options.getString('ソート') || 'expiry_asc';

      // 在庫データを取得
      const inventory = await sheetsService.getInventoryData();
      
      if (inventory.length === 0) {
        await interaction.editReply('📭 在庫に登録されている食材がありません。');
        return;
      }

      // 期間に応じてフィルタリング
      const filteredItems = this.filterByPeriod(inventory, period);
      
      if (filteredItems.length === 0) {
        const periodText = this.getPeriodText(period);
        await interaction.editReply(`✅ ${periodText}の食材はありません。`);
        return;
      }

      // ソートしてグループ化
      const sortedItems = this.sortItems(filteredItems, sortBy);
      const groupedItems = this.groupItems(sortedItems, sortBy);

      // Embed作成
      const embed = new EmbedBuilder()
        .setTitle('📅 期限確認')
        .setColor(this.getEmbedColor(period))
        .setDescription(this.getDescription(period, filteredItems.length))
        .setTimestamp();

      // グループごとにフィールドを追加
      for (const [groupName, items] of Object.entries(groupedItems)) {
        if (items.length === 0) continue;

        const itemList = items.map(item => {
          const status = this.getStatusIcon(item.expiryDate);
          const daysLeft = this.getDaysUntilExpiry(item.expiryDate);
          const daysText = daysLeft === 0 ? '今日' : 
                          daysLeft === 1 ? '明日' : 
                          daysLeft < 0 ? `${Math.abs(daysLeft)}日前に期限切れ` : 
                          `あと${daysLeft}日`;
          
          return `${status} **${item.name}**: ${item.currentAmount}${item.unit} (${item.expiryDate}, ${daysText})`;
        }).join('\n');

        embed.addFields({
          name: groupName,
          value: itemList.length > 1024 ? itemList.substring(0, 1020) + '...' : itemList,
          inline: false
        });
      }

      // 注意事項を追加
      if (period === 'expired' || filteredItems.some(item => this.getDaysUntilExpiry(item.expiryDate) < 0)) {
        embed.addFields({
          name: '⚠️ 注意',
          value: '期限切れの食材は早急に処理してください。廃棄する場合は適切に記録しましょう。',
          inline: false
        });
      } else if (period === 'today' || period === 'tomorrow') {
        embed.addFields({
          name: '💡 アドバイス',
          value: '期限が近い食材を使った料理を作ってみてはいかがですか？',
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('期限確認エラー:', error);
      await interaction.editReply(`❌ エラーが発生しました: ${error.message}`);
    }
  },

  // 期間によるフィルタリング
  filterByPeriod(inventory, period) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return inventory.filter(item => {
      if (!item.expiryDate) return false;
      
      const expiryDate = new Date(item.expiryDate);
      expiryDate.setHours(0, 0, 0, 0);
      
      const diffTime = expiryDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      switch (period) {
        case 'expired':
          return diffDays < 0;
        case 'today':
          return diffDays === 0;
        case 'tomorrow':
          return diffDays === 1;
        case '3days':
          return diffDays >= 0 && diffDays <= 3;
        case '1week':
          return diffDays >= 0 && diffDays <= 7;
        case 'all':
          return true;
        default:
          return diffDays >= 0 && diffDays <= 3;
      }
    });
  },

  // アイテムのソート
  sortItems(items, sortBy) {
    const sortedItems = [...items];
    
    switch (sortBy) {
      case 'expiry_asc':
        return sortedItems.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
      case 'expiry_desc':
        return sortedItems.sort((a, b) => new Date(b.expiryDate) - new Date(a.expiryDate));
      case 'category':
        return sortedItems.sort((a, b) => {
          const categoryCompare = a.category.localeCompare(b.category, 'ja');
          if (categoryCompare !== 0) return categoryCompare;
          return new Date(a.expiryDate) - new Date(b.expiryDate);
        });
      case 'name':
        return sortedItems.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      default:
        return sortedItems.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    }
  },

  // アイテムのグループ化
  groupItems(items, sortBy) {
    if (sortBy === 'category') {
      const grouped = {};
      items.forEach(item => {
        const categoryIcon = this.getCategoryIcon(item.category);
        const groupName = `${categoryIcon} ${item.category}`;
        if (!grouped[groupName]) grouped[groupName] = [];
        grouped[groupName].push(item);
      });
      return grouped;
    } else {
      const grouped = {};
      items.forEach(item => {
        const daysLeft = this.getDaysUntilExpiry(item.expiryDate);
        let groupName;
        
        if (daysLeft < 0) {
          groupName = '🚨 期限切れ';
        } else if (daysLeft === 0) {
          groupName = '⏰ 今日期限';
        } else if (daysLeft === 1) {
          groupName = '🟡 明日期限';
        } else if (daysLeft <= 3) {
          groupName = '🟠 3日以内';
        } else if (daysLeft <= 7) {
          groupName = '🟢 1週間以内';
        } else {
          groupName = '✅ 1週間以上';
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

  // ステータスアイコンを取得
  getStatusIcon(expiryDateStr) {
    const daysLeft = this.getDaysUntilExpiry(expiryDateStr);
    
    if (daysLeft < 0) return '🚨';
    if (daysLeft === 0) return '⏰';
    if (daysLeft === 1) return '🟡';
    if (daysLeft <= 3) return '🟠';
    if (daysLeft <= 7) return '🟢';
    return '✅';
  },

  // カテゴリアイコンを取得
  getCategoryIcon(category) {
    const icons = {
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

  // Embedの色を取得
  getEmbedColor(period) {
    switch (period) {
      case 'expired':
        return 0xFF0000; // 赤
      case 'today':
      case 'tomorrow':
        return 0xFF6B00; // オレンジ
      case '3days':
        return 0xFFD700; // 黄色
      case '1week':
        return 0x00AE86; // 緑
      default:
        return 0x0099FF; // 青
    }
  },

  // 期間のテキストを取得
  getPeriodText(period) {
    const texts = {
      'expired': '期限切れ',
      'today': '今日期限',
      'tomorrow': '明日期限',
      '3days': '3日以内に期限',
      '1week': '1週間以内に期限',
      'all': 'すべて'
    };
    return texts[period] || '該当期間';
  },

  // 説明テキストを取得
  getDescription(period, count) {
    const periodText = this.getPeriodText(period);
    return `${periodText}の食材が **${count}個** 見つかりました。`;
  }
};
