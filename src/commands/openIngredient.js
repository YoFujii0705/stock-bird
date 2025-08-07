// src/commands/openIngredient.js - 開封状態管理機能
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('食材開封')
    .setDescription('食材の開封状態を管理します')
    .addStringOption(option =>
      option.setName('食材名')
        .setDescription('開封する食材名')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option =>
      option.setName('操作')
        .setDescription('実行する操作')
        .setRequired(false)
        .addChoices(
          { name: '開封する', value: 'open' },
          { name: '未開封に戻す', value: 'close' },
          { name: '状態確認', value: 'check' }
        ))
    .addStringOption(option =>
      option.setName('カスタム期限')
        .setDescription('開封後の期限を手動設定（YYYY/MM/DD形式）')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('メモ')
        .setDescription('備考があれば入力')
        .setRequired(false)),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const ingredientName = interaction.options.getString('食材名');
      const operation = interaction.options.getString('操作') || 'open';
      const customExpiry = interaction.options.getString('カスタム期限');
      const memo = interaction.options.getString('メモ') || '';

      // 食材を検索
      const inventory = await sheetsService.getInventoryData();
      const item = inventory.find(i => 
        i.name.toLowerCase() === ingredientName.toLowerCase()
      );

      if (!item) {
        await interaction.editReply(`❌ 食材「${ingredientName}」が見つかりません。`);
        return;
      }

      if (operation === 'check') {
        await this.handleStatusCheck(interaction, item);
        return;
      }

      // 開封・未開封の処理
      const result = await this.handleOpenClose(
        sheetsService, 
        item, 
        operation, 
        customExpiry, 
        memo
      );

      // 結果表示
      const embed = new EmbedBuilder()
        .setTitle('📦 開封状態更新完了')
        .setColor(operation === 'open' ? 0xFF6B00 : 0x00AE86)
        .setDescription(`**${item.name}** の開封状態を更新しました`)
        .addFields(
          { name: '食材名', value: item.name, inline: true },
          { name: '開封状態', value: result.newStatus, inline: true },
          { name: '保存場所', value: item.storageLocation, inline: true }
        )
        .setTimestamp();

      if (result.expiryChanged) {
        embed.addFields(
          { name: '期限変更', value: `${result.oldExpiry} → ${result.newExpiry}`, inline: false }
        );

        if (result.daysLeft !== null) {
          const daysText = result.daysLeft === 0 ? '今日' : 
                          result.daysLeft === 1 ? '明日' : 
                          result.daysLeft < 0 ? `${Math.abs(result.daysLeft)}日前に期限切れ` : 
                          `あと${result.daysLeft}日`;
          embed.addFields(
            { name: '新しい期限まで', value: daysText, inline: true }
          );
        }
      }

      if (memo) {
        embed.addFields({ name: 'メモ', value: memo, inline: false });
      }

      // 警告メッセージ
      if (operation === 'open' && result.daysLeft !== null && result.daysLeft <= 3) {
        embed.setColor(0xFF0000);
        embed.addFields({
          name: '⚠️ 注意',
          value: '開封後の期限が短いです。早めに使い切りましょう！',
          inline: false
        });
      }

      // アドバイス
      if (operation === 'open') {
        const advice = this.getOpeningAdvice(item.category, item.name);
        if (advice) {
          embed.addFields({
            name: '💡 保存のコツ',
            value: advice,
            inline: false
          });
        }
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('開封状態管理エラー:', error);
      await interaction.editReply(`❌ エラーが発生しました: ${error.message}`);
    }
  },

  // 状態確認の処理
  async handleStatusCheck(interaction, item) {
    const embed = new EmbedBuilder()
      .setTitle('📦 開封状態確認')
      .setColor(item.openStatus === '開封済み' ? 0xFF6B00 : 0x00AE86)
      .addFields(
        { name: '食材名', value: item.name, inline: true },
        { name: '開封状態', value: item.openStatus, inline: true },
        { name: '現在量', value: `${item.currentAmount}${item.unit}`, inline: true },
        { name: 'カテゴリ', value: item.category, inline: true },
        { name: '保存場所', value: item.storageLocation, inline: true },
        { name: '消費期限', value: item.expiryDate, inline: true }
      )
      .setTimestamp();

    // 期限までの日数を計算
    if (item.expiryDate) {
      const daysLeft = this.calculateDaysLeft(item.expiryDate);
      const daysText = daysLeft === 0 ? '今日' : 
                      daysLeft === 1 ? '明日' : 
                      daysLeft < 0 ? `${Math.abs(daysLeft)}日前に期限切れ` : 
                      `あと${daysLeft}日`;
      
      embed.addFields({ name: '期限まで', value: daysText, inline: true });

      if (daysLeft <= 0) {
        embed.setColor(0xFF0000);
      } else if (daysLeft <= 3) {
        embed.setColor(0xFF9900);
      }
    }

    await interaction.editReply({ embeds: [embed] });
  },

  // 開封・未開封の処理
  async handleOpenClose(sheetsService, item, operation, customExpiry, memo) {
    const rowIndex = parseInt(item.id) + 1; // ヘッダー分+1
    let newStatus, newExpiry, oldExpiry, expiryChanged = false;

    oldExpiry = item.expiryDate;

    if (operation === 'open') {
      newStatus = '開封済み';
      
      // 開封後の期限を計算
      if (customExpiry) {
        newExpiry = customExpiry;
      } else {
        newExpiry = this.calculateOpenExpiry(item.name, item.category, item.storageLocation);
      }
      
      expiryChanged = newExpiry !== oldExpiry;
    } else {
      newStatus = '未開封';
      // 未開封時は元の期限に戻す（購入日から再計算）
      newExpiry = this.calculateOriginalExpiry(item.name, item.category, item.storageLocation, item.purchaseDate);
      expiryChanged = newExpiry !== oldExpiry;
    }

    // スプレッドシートを更新
    await sheetsService.writeRange('在庫管理', `H${rowIndex}:I${rowIndex}`, [[
      newExpiry,
      newStatus
    ]]);

    // 最終更新日時も更新
    await sheetsService.writeRange('在庫管理', `L${rowIndex}:L${rowIndex}`, [[
      new Date().toLocaleString('ja-JP')
    ]]);

    // 使用履歴に記録
    await sheetsService.safeAppendData('使用履歴', [[
      '',
      new Date().toLocaleDateString('ja-JP'),
      new Date().toLocaleTimeString('ja-JP'),
      operation === 'open' ? '開封' : '未開封に変更',
      item.name,
      0,
      item.currentAmount,
      operation === 'open' ? '開封' : '変更',
      memo || `${newStatus}に変更`
    ]]);

    const daysLeft = newExpiry ? this.calculateDaysLeft(newExpiry) : null;

    return {
      newStatus,
      newExpiry,
      oldExpiry,
      expiryChanged,
      daysLeft
    };
  },

  // 開封後期限を計算
  calculateOpenExpiry(ingredientName, category, storageLocation) {
    const today = new Date();
    let daysToAdd = 3; // デフォルト

    // 開封後期限のルール
    const openExpiryRules = {
      '乳製品': {
        '牛乳': { '冷蔵': 3, '常温': 1 },
        'ヨーグルト': { '冷蔵': 5, '常温': 1 },
        'チーズ': { '冷蔵': 14, '常温': 1 },
        '生クリーム': { '冷蔵': 3, '常温': 1 }
      },
      '調味料': {
        '醤油': { '冷蔵': 30, '常温': 30 },
        '味噌': { '冷蔵': 60, '常温': 30 },
        'マヨネーズ': { '冷蔵': 30, '常温': 7 },
        'ケチャップ': { '冷蔵': 30, '常温': 14 },
        'ドレッシング': { '冷蔵': 14, '常温': 7 }
      },
      '野菜': {
        'もやし': { '冷蔵': 1, '常温': 1 },
        'サラダミックス': { '冷蔵': 2, '常温': 1 },
        'カット野菜': { '冷蔵': 2, '常温': 1 }
      },
      '肉類': {
        'ハム': { '冷蔵': 5, '常温': 1 },
        'ソーセージ': { '冷蔵': 7, '常温': 1 },
        'ベーコン': { '冷蔵': 7, '常温': 1 }
      }
    };

    // 具体的な食材名でチェック
    if (openExpiryRules[category] && openExpiryRules[category][ingredientName]) {
      const rules = openExpiryRules[category][ingredientName];
      if (rules[storageLocation]) {
        daysToAdd = rules[storageLocation];
      }
    } else {
      // カテゴリと保存場所による一般的なルール
      const generalRules = {
        '乳製品': { '冷蔵': 5, '冷凍': 14, '常温': 1 },
        '調味料': { '冷蔵': 30, '冷凍': 60, '常温': 14 },
        '肉類': { '冷蔵': 3, '冷凍': 30, '常温': 1 },
        '魚類': { '冷蔵': 2, '冷凍': 14, '常温': 1 },
        '野菜': { '冷蔵': 3, '冷凍': 30, '常温': 1 }
      };

      if (generalRules[category] && generalRules[category][storageLocation]) {
        daysToAdd = generalRules[category][storageLocation];
      }
    }

    const expiryDate = new Date(today);
    expiryDate.setDate(today.getDate() + daysToAdd);
    
    return expiryDate.toLocaleDateString('ja-JP');
  },

  // 元の期限を再計算（未開封に戻す時）
  calculateOriginalExpiry(ingredientName, category, storageLocation, purchaseDate) {
    // addIngredient.jsの計算ロジックと同じ
    const purchaseDateObj = new Date(purchaseDate);
    let daysToAdd = 7; // デフォルト

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
      }
    };

    if (expiryRules[category] && expiryRules[category][storageLocation]) {
      daysToAdd = expiryRules[category][storageLocation];
    }

    const expiryDate = new Date(purchaseDateObj);
    expiryDate.setDate(purchaseDateObj.getDate() + daysToAdd);
    
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

    return vegetableExpiry[vegetableName] || 7;
  },

  // 期限までの日数を計算
  calculateDaysLeft(expiryDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const expiryDate = new Date(expiryDateStr);
    expiryDate.setHours(0, 0, 0, 0);
    
    const diffTime = expiryDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  },

  // 開封アドバイスを取得
  getOpeningAdvice(category, name) {
    const advice = {
      '乳製品': {
        '牛乳': '開封後は冷蔵庫で保存し、注ぎ口を清潔に保ちましょう。',
        'ヨーグルト': '清潔なスプーンを使用し、冷蔵保存してください。',
        'チーズ': 'ラップで包み直し、冷蔵庫のチルド室で保存がおすすめです。'
      },
      '調味料': {
        '醤油': '開封後も常温保存可能ですが、冷蔵すると品質が長持ちします。',
        '味噌': '乾燥を防ぐため、ラップを直接表面に貼って保存しましょう。',
        'マヨネーズ': '必ず冷蔵保存し、清潔なスプーンやナイフを使用してください。'
      },
      '野菜': {
        'もやし': '開封後はできるだけ早く使い切りましょう。',
        'サラダミックス': '湿気を避け、冷蔵庫で密閉保存してください。'
      }
    };

    if (advice[category] && advice[category][name]) {
      return advice[category][name];
    }

    // 一般的なアドバイス
    const generalAdvice = {
      '乳製品': '開封後は冷蔵保存し、清潔を心がけましょう。',
      '調味料': '湿気や直射日光を避けて保存してください。',
      '肉類': '開封後は早めに使い切り、冷蔵保存してください。',
      '魚類': '開封後は当日中に使用することをおすすめします。',
      '野菜': '適切な温度で保存し、早めに使い切りましょう。'
    };

    return generalAdvice[category] || null;
  }
};
