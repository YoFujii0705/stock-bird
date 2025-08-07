// src/commands/discardIngredient.js - 廃棄記録機能
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('食材廃棄')
    .setDescription('期限切れや傷んだ食材を廃棄記録します')
    .addStringOption(option =>
      option.setName('食材名')
        .setDescription('廃棄する食材名')
        .setRequired(true)
        .setAutocomplete(true))
    .addNumberOption(option =>
      option.setName('廃棄量')
        .setDescription('廃棄する量（省略時は全量廃棄）')
        .setRequired(false)
        .setMinValue(0.1))
    .addStringOption(option =>
      option.setName('廃棄理由')
        .setDescription('廃棄の理由')
        .setRequired(false)
        .addChoices(
          { name: '期限切れ', value: '期限切れ' },
          { name: '傷み・腐敗', value: '傷み・腐敗' },
          { name: 'カビ発生', value: 'カビ発生' },
          { name: '冷凍焼け', value: '冷凍焼け' },
          { name: '味・臭いの変化', value: '味・臭いの変化' },
          { name: '誤って傷つけた', value: '誤って傷つけた' },
          { name: 'その他', value: 'その他' }
        ))
    .addStringOption(option =>
      option.setName('メモ')
        .setDescription('詳細なメモや今後の対策')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('在庫から削除')
        .setDescription('在庫リストからも完全に削除するか（デフォルト: false）')
        .setRequired(false)),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const ingredientName = interaction.options.getString('食材名');
      const discardAmount = interaction.options.getNumber('廃棄量');
      const discardReason = interaction.options.getString('廃棄理由') || '期限切れ';
      const memo = interaction.options.getString('メモ') || '';
      const removeFromInventory = interaction.options.getBoolean('在庫から削除') || false;

      // 食材を検索
      const inventory = await sheetsService.getInventoryData();
      const item = inventory.find(i => 
        i.name.toLowerCase() === ingredientName.toLowerCase()
      );

      if (!item) {
        await interaction.editReply(`❌ 食材「${ingredientName}」が見つかりません。`);
        return;
      }

      // 廃棄量の決定
      const actualDiscardAmount = discardAmount || item.currentAmount;
      
      if (actualDiscardAmount > item.currentAmount) {
        await interaction.editReply(`❌ 廃棄量（${actualDiscardAmount}${item.unit}）が現在量（${item.currentAmount}${item.unit}）を超えています。`);
        return;
      }

      // 廃棄処理
      const discardResult = await this.processDiscard(
        sheetsService,
        item,
        actualDiscardAmount,
        discardReason,
        memo,
        removeFromInventory
      );

      // 分析データを生成
      const analysis = this.generateDiscardAnalysis(item, discardReason, actualDiscardAmount);

      // 結果表示
      await this.showDiscardResult(
        interaction, 
        item, 
        discardResult, 
        analysis, 
        discardReason, 
        memo
      );

    } catch (error) {
      console.error('廃棄記録エラー:', error);
      await interaction.editReply(`❌ エラーが発生しました: ${error.message}`);
    }
  },

  // 廃棄処理を実行
  async processDiscard(sheetsService, item, discardAmount, reason, memo, removeFromInventory) {
    const rowIndex = parseInt(item.id) + 1;
    const remainingAmount = item.currentAmount - discardAmount;
    const isFullDiscard = remainingAmount === 0 || removeFromInventory;

    if (isFullDiscard) {
      // 完全廃棄または削除の場合
      if (removeFromInventory) {
        // 在庫リストから完全削除
        await this.removeFromInventory(sheetsService, rowIndex);
      } else {
        // 数量を0にして履歴は残す
        await sheetsService.writeRange('在庫管理', `D${rowIndex}:L${rowIndex}`, [[
          0, // 現在量
          item.unit,
          item.storageLocation,
          item.purchaseDate,
          item.expiryDate,
          item.openStatus,
          item.notificationThreshold,
          item.isStaple ? 'TRUE' : 'FALSE',
          new Date().toLocaleString('ja-JP')
        ]]);
      }
    } else {
      // 部分廃棄の場合
      await sheetsService.writeRange('在庫管理', `D${rowIndex}:L${rowIndex}`, [[
        remainingAmount, // 新しい現在量
        item.unit,
        item.storageLocation,
        item.purchaseDate,
        item.expiryDate,
        item.openStatus,
        item.notificationThreshold,
        item.isStaple ? 'TRUE' : 'FALSE',
        new Date().toLocaleString('ja-JP')
      ]]);
    }

    // 廃棄履歴を記録
    await this.recordDiscardHistory(
      sheetsService, 
      item, 
      discardAmount, 
      remainingAmount, 
      reason, 
      memo,
      isFullDiscard
    );

    return {
      discardedAmount: discardAmount,
      remainingAmount: remainingAmount,
      isFullDiscard: isFullDiscard,
      removedFromInventory: removeFromInventory
    };
  },

  // 在庫リストから完全削除
  async removeFromInventory(sheetsService, rowIndex) {
    // Google Sheetsでは行の削除が複雑なため、全セルを空にする方法を採用
    await sheetsService.writeRange('在庫管理', `A${rowIndex}:L${rowIndex}`, [['', '', '', '', '', '', '', '', '', '', '', '']]);
  },

  // 廃棄履歴を記録
  async recordDiscardHistory(sheetsService, item, discardAmount, remainingAmount, reason, memo, isFullDiscard) {
    const operation = isFullDiscard ? '完全廃棄' : '部分廃棄';
    const fullMemo = memo ? `${reason} - ${memo}` : reason;

    await sheetsService.safeAppendData('使用履歴', [[
      '',
      new Date().toLocaleDateString('ja-JP'),
      new Date().toLocaleTimeString('ja-JP'),
      operation,
      item.name,
      discardAmount,
      remainingAmount,
      '廃棄',
      fullMemo
    ]]);
  },

  // 廃棄分析データを生成
  generateDiscardAnalysis(item, reason, discardAmount) {
    const analysis = {
      wastePercentage: ((discardAmount / item.currentAmount) * 100).toFixed(1),
      daysFromPurchase: this.calculateDaysFromPurchase(item.purchaseDate),
      daysToExpiry: this.calculateDaysLeft(item.expiryDate),
      suggestions: []
    };

    // 提案を生成
    if (reason === '期限切れ') {
      analysis.suggestions.push('💡 次回は少量ずつ購入を検討してみてください');
      if (analysis.daysFromPurchase > 7) {
        analysis.suggestions.push('💡 購入から時間が経っています。早めの消費を心がけましょう');
      }
    }

    if (reason === '傷み・腐敗' || reason === 'カビ発生') {
      analysis.suggestions.push('💡 保存環境を見直してみてください');
      if (item.storageLocation === '常温') {
        analysis.suggestions.push('💡 冷蔵保存を検討してみてください');
      }
    }

    if (reason === '冷凍焼け') {
      analysis.suggestions.push('💡 冷凍保存時は密閉容器やラップを使用しましょう');
    }

    if (analysis.wastePercentage > 50) {
      analysis.suggestions.push('💡 大部分が無駄になってしまいました。購入量を見直しませんか？');
    }

    // カテゴリ別のアドバイス
    if (item.category === '野菜') {
      analysis.suggestions.push('🥬 野菜は冷蔵庫の野菜室で保存すると長持ちします');
    } else if (item.category === '乳製品') {
      analysis.suggestions.push('🥛 乳製品は開封後早めに消費しましょう');
    }

    return analysis;
  },

  // 購入からの日数を計算
  calculateDaysFromPurchase(purchaseDate) {
    const today = new Date();
    const purchase = new Date(purchaseDate);
    const diffTime = today.getTime() - purchase.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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

  // 廃棄結果を表示
  async showDiscardResult(interaction, item, result, analysis, reason, memo) {
    const embed = new EmbedBuilder()
      .setTitle('🗑️ 廃棄記録完了')
      .setColor(0xFF6B6B)
      .setDescription(`**${item.name}** の廃棄を記録しました`)
      .setTimestamp();

    // 基本情報
    embed.addFields(
      { name: '廃棄量', value: `${result.discardedAmount}${item.unit}`, inline: true },
      { name: '残量', value: `${result.remainingAmount}${item.unit}`, inline: true },
      { name: '廃棄理由', value: reason, inline: true }
    );

    // 詳細分析
    const analysisText = [
      `📊 廃棄率: ${analysis.wastePercentage}%`,
      `📅 購入から: ${analysis.daysFromPurchase}日経過`,
      `⏰ 期限まで: ${analysis.daysToExpiry}日${analysis.daysToExpiry <= 0 ? '（期限切れ）' : ''}`
    ].join('\n');

    embed.addFields({
      name: '📈 分析データ',
      value: analysisText,
      inline: false
    });

    // 提案
    if (analysis.suggestions.length > 0) {
      embed.addFields({
        name: '💡 今後の改善提案',
        value: analysis.suggestions.join('\n'),
        inline: false
      });
    }

    if (memo) {
      embed.addFields({ name: 'メモ', value: memo, inline: false });
    }

    // ステータス表示
    let statusText = '';
    if (result.removedFromInventory) {
      statusText = '🗂️ 在庫リストから完全削除されました';
      embed.setColor(0x999999);
    } else if (result.isFullDiscard) {
      statusText = '📦 在庫量が0になりました（リストには残っています）';
    } else {
      statusText = `📦 残り${result.remainingAmount}${item.unit}が在庫に残っています`;
      embed.setColor(0xFFA500);
    }

    embed.addFields({
      name: '📋 ステータス',
      value: statusText,
      inline: false
    });

    // 環境への配慮メッセージ
    embed.addFields({
      name: '🌱 環境への配慮',
      value: 'フードロスを減らすため、今後の買い物や保存方法を見直してみましょう。',
      inline: false
    });

    await interaction.editReply({ embeds: [embed] });
  }
};
