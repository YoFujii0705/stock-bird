// src/commands/addIngredient.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('食材追加')
    .setDescription('新しい食材を在庫に追加します')
    .addStringOption(option =>
      option.setName('食材名')
        .setDescription('追加する食材の名前')
        .setRequired(true))
    .addNumberOption(option =>
      option.setName('数量')
        .setDescription('数量')
        .setRequired(true)
        .setMinValue(0.1))
    .addStringOption(option =>
      option.setName('単位')
        .setDescription('単位を選択')
        .setRequired(true)
        .addChoices(
          { name: '個', value: '個' },
          { name: 'g', value: 'g' },
          { name: 'ml', value: 'ml' },
          { name: 'パック', value: 'パック' },
          { name: '袋', value: '袋' },
          { name: '本', value: '本' },
          { name: '枚', value: '枚' }
        ))
    .addStringOption(option =>
      option.setName('カテゴリ')
        .setDescription('食材のカテゴリを選択')
        .setRequired(true)
        .addChoices(
          { name: '野菜', value: '野菜' },
          { name: '肉類', value: '肉類' },
          { name: '魚類', value: '魚類' },
          { name: '乳製品', value: '乳製品' },
          { name: '調味料', value: '調味料' },
          { name: '冷凍食品', value: '冷凍食品' },
          { name: 'その他', value: 'その他' }
        ))
    .addStringOption(option =>
      option.setName('保存場所')
        .setDescription('保存場所を選択')
        .setRequired(true)
        .addChoices(
          { name: '冷蔵', value: '冷蔵' },
          { name: '冷凍', value: '冷凍' },
          { name: '常温', value: '常温' }
        ))
    .addStringOption(option =>
      option.setName('賞味期限')
        .setDescription('賞味期限（YYYY/MM/DD形式、省略時は自動設定）')
        .setRequired(false))
    .addNumberOption(option =>
      option.setName('通知閾値')
        .setDescription('この数量以下になったら通知（省略時は自動設定）')
        .setRequired(false)
        .setMinValue(0))
    .addBooleanOption(option =>
      option.setName('常備品')
        .setDescription('常備品として管理するか（省略時はfalse）')
        .setRequired(false)),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const ingredientName = interaction.options.getString('食材名');
      const amount = interaction.options.getNumber('数量');
      const unit = interaction.options.getString('単位');
      const category = interaction.options.getString('カテゴリ');
      const storageLocation = interaction.options.getString('保存場所');
      const customExpiryDate = interaction.options.getString('賞味期限');
      const customThreshold = interaction.options.getNumber('通知閾値');
      const isStaple = interaction.options.getBoolean('常備品') || false;

      // 既存の食材をチェック
      const existingInventory = await sheetsService.getInventoryData();
      const existingItem = existingInventory.find(item => 
        item.name.toLowerCase() === ingredientName.toLowerCase()
      );

      if (existingItem) {
        await interaction.editReply(`❌ **${ingredientName}** は既に登録されています。数量を更新したい場合は \`/食材編集\` コマンドを使用してください。`);
        return;
      }

      // 期限の自動設定
      const expiryDate = customExpiryDate || this.calculateExpiryDate(ingredientName, category, storageLocation);
      
      // 通知閾値の自動設定
      const notificationThreshold = customThreshold !== null ? customThreshold : this.calculateDefaultThreshold(amount, unit, category);

      // 新しいIDを生成
      const newId = existingInventory.length > 0 ? 
        Math.max(...existingInventory.map(item => parseInt(item.id) || 0)) + 1 : 1;

      // スプレッドシートに追加（安全な方法で）
      const newRow = [
        newId,
        ingredientName,
        category,
        amount,
        unit,
        storageLocation,
        new Date().toLocaleDateString('ja-JP'),
        expiryDate,
        '未開封',
        notificationThreshold,
        isStaple ? 'TRUE' : 'FALSE',
        new Date().toLocaleString('ja-JP')
      ];

      await sheetsService.safeAppendData('在庫管理', [newRow]);

      // 使用履歴に記録（安全な方法で）
      await sheetsService.safeAppendData('使用履歴', [[
        '',
        new Date().toLocaleDateString('ja-JP'),
        new Date().toLocaleTimeString('ja-JP'),
        '食材追加',
        ingredientName,
        amount,
        amount,
        '補充',
        `新規登録: ${category}`
      ]]);

      // 成功メッセージ
      const embed = new EmbedBuilder()
        .setTitle('🥬 食材追加完了')
        .setColor(0x00AE86)
        .setDescription(`**${ingredientName}** を在庫に追加しました`)
        .addFields(
          { name: '数量', value: `${amount}${unit}`, inline: true },
          { name: 'カテゴリ', value: category, inline: true },
          { name: '保存場所', value: storageLocation, inline: true },
          { name: '賞味期限', value: expiryDate, inline: true },
          { name: '通知閾値', value: `${notificationThreshold}${unit}`, inline: true },
          { name: '常備品', value: isStaple ? 'はい' : 'いいえ', inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('食材追加エラー:', error);
      await interaction.editReply(`❌ エラーが発生しました: ${error.message}`);
    }
  },

  // 期限を自動計算する関数
  calculateExpiryDate(ingredientName, category, storageLocation) {
    const today = new Date();
    let daysToAdd = 7; // デフォルト

    // カテゴリと保存場所による期限設定
    const expiryRules = {
      '野菜': {
        '冷蔵': this.getVegetableExpiryDays(ingredientName),
        '冷凍': 365,
        '常温': 3
      },
      '肉類': {
        '冷蔵': 3,
        '冷凍': 60,
        '常温': 1
      },
      '魚類': {
        '冷蔵': 2,
        '冷凍': 30,
        '常温': 1
      },
      '乳製品': {
        '冷蔵': 7,
        '冷凍': 30,
        '常温': 1
      },
      '調味料': {
        '冷蔵': 180,
        '冷凍': 365,
        '常温': 365
      },
      '冷凍食品': {
        '冷蔵': 3,
        '冷凍': 180,
        '常温': 1
      }
    };

    if (expiryRules[category] && expiryRules[category][storageLocation]) {
      daysToAdd = expiryRules[category][storageLocation];
    }

    const expiryDate = new Date(today);
    expiryDate.setDate(today.getDate() + daysToAdd);
    
    return expiryDate.toLocaleDateString('ja-JP');
  },

  // 野菜の個別期限設定
  getVegetableExpiryDays(vegetableName) {
    const vegetableExpiry = {
      'キャベツ': 14,
      'レタス': 7,
      '人参': 21,
      '玉ねぎ': 30,
      'じゃがいも': 21,
      'トマト': 7,
      'きゅうり': 7,
      'ピーマン': 10,
      'なす': 7,
      'ほうれん草': 3,
      '小松菜': 3,
      'もやし': 2,
      'ねぎ': 14
    };

    return vegetableExpiry[vegetableName] || 7; // デフォルト7日
  },

  // 通知閾値の自動計算
  calculateDefaultThreshold(amount, unit, category) {
    // カテゴリと単位による推奨閾値
    const thresholdRules = {
      '野菜': {
        '個': Math.max(1, Math.floor(amount * 0.3)),
        'g': Math.max(50, Math.floor(amount * 0.2)),
        '本': Math.max(1, Math.floor(amount * 0.3)),
        '袋': Math.max(1, Math.floor(amount * 0.5))
      },
      '肉類': {
        'g': Math.max(100, Math.floor(amount * 0.3)),
        'パック': Math.max(1, Math.floor(amount * 0.5))
      },
      '魚類': {
        'g': Math.max(100, Math.floor(amount * 0.3)),
        '個': Math.max(1, Math.floor(amount * 0.5))
      },
      '乳製品': {
        'ml': Math.max(200, Math.floor(amount * 0.3)),
        '個': Math.max(1, Math.floor(amount * 0.5))
      }
    };

    if (thresholdRules[category] && thresholdRules[category][unit]) {
      return thresholdRules[category][unit];
    }

    // デフォルト値（30%程度）
    return Math.max(1, Math.floor(amount * 0.3));
  }
};
