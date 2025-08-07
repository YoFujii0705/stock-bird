// src/commands/editIngredient.js - 食材編集機能
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('食材編集')
    .setDescription('登録済み食材の情報を編集します')
    .addStringOption(option =>
      option.setName('食材名')
        .setDescription('編集する食材名')
        .setRequired(true)
        .setAutocomplete(true))
    .addNumberOption(option =>
      option.setName('数量')
        .setDescription('新しい数量（現在量を上書き）')
        .setRequired(false)
        .setMinValue(0))
    .addStringOption(option =>
      option.setName('単位')
        .setDescription('新しい単位')
        .setRequired(false)
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
      option.setName('消費期限')
        .setDescription('新しい消費期限（YYYY/MM/DD形式）')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('保存場所')
        .setDescription('新しい保存場所')
        .setRequired(false)
        .addChoices(
          { name: '冷蔵', value: '冷蔵' },
          { name: '冷凍', value: '冷凍' },
          { name: '常温', value: '常温' }
        ))
    .addStringOption(option =>
      option.setName('開封状態')
        .setDescription('開封状態を変更')
        .setRequired(false)
        .addChoices(
          { name: '未開封', value: '未開封' },
          { name: '開封済み', value: '開封済み' }
        ))
    .addNumberOption(option =>
      option.setName('通知閾値')
        .setDescription('新しい通知閾値')
        .setRequired(false)
        .setMinValue(0))
    .addBooleanOption(option =>
      option.setName('常備品')
        .setDescription('常備品フラグを変更')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('メモ')
        .setDescription('編集内容のメモ')
        .setRequired(false)),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const ingredientName = interaction.options.getString('食材名');
      const newAmount = interaction.options.getNumber('数量');
      const newUnit = interaction.options.getString('単位');
      const newExpiryDate = interaction.options.getString('消費期限');
      const newStorageLocation = interaction.options.getString('保存場所');
      const newOpenStatus = interaction.options.getString('開封状態');
      const newThreshold = interaction.options.getNumber('通知閾値');
      const newIsStaple = interaction.options.getBoolean('常備品');
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

      // 変更されたフィールドを特定
      const changes = this.detectChanges(item, {
        amount: newAmount,
        unit: newUnit,
        expiryDate: newExpiryDate,
        storageLocation: newStorageLocation,
        openStatus: newOpenStatus,
        threshold: newThreshold,
        isStaple: newIsStaple
      });

      if (changes.length === 0) {
        await interaction.editReply('❌ 変更する項目が指定されていません。');
        return;
      }

      // データ検証
      const validation = this.validateChanges(changes, item);
      if (!validation.valid) {
        await interaction.editReply(`❌ 入力エラー: ${validation.error}`);
        return;
      }

      // スプレッドシートを更新
      const updateResult = await this.updateSpreadsheet(
        sheetsService, 
        item, 
        changes
      );

      // 使用履歴に記録
      await this.recordEdit(sheetsService, item, changes, memo);

      // 結果表示
      await this.showEditResult(interaction, item, changes, updateResult, memo);

    } catch (error) {
      console.error('食材編集エラー:', error);
      await interaction.editReply(`❌ エラーが発生しました: ${error.message}`);
    }
  },

  // 変更されたフィールドを検出
  detectChanges(item, newValues) {
    const changes = [];

    if (newValues.amount !== null && newValues.amount !== item.currentAmount) {
      changes.push({
        field: 'amount',
        oldValue: item.currentAmount,
        newValue: newValues.amount,
        displayName: '数量'
      });
    }

    if (newValues.unit && newValues.unit !== item.unit) {
      changes.push({
        field: 'unit',
        oldValue: item.unit,
        newValue: newValues.unit,
        displayName: '単位'
      });
    }

    if (newValues.expiryDate && newValues.expiryDate !== item.expiryDate) {
      changes.push({
        field: 'expiryDate',
        oldValue: item.expiryDate,
        newValue: newValues.expiryDate,
        displayName: '消費期限'
      });
    }

    if (newValues.storageLocation && newValues.storageLocation !== item.storageLocation) {
      changes.push({
        field: 'storageLocation',
        oldValue: item.storageLocation,
        newValue: newValues.storageLocation,
        displayName: '保存場所'
      });
    }

    if (newValues.openStatus && newValues.openStatus !== item.openStatus) {
      changes.push({
        field: 'openStatus',
        oldValue: item.openStatus,
        newValue: newValues.openStatus,
        displayName: '開封状態'
      });
    }

    if (newValues.threshold !== null && newValues.threshold !== item.notificationThreshold) {
      changes.push({
        field: 'threshold',
        oldValue: item.notificationThreshold,
        newValue: newValues.threshold,
        displayName: '通知閾値'
      });
    }

    if (newValues.isStaple !== null && newValues.isStaple !== item.isStaple) {
      changes.push({
        field: 'isStaple',
        oldValue: item.isStaple,
        newValue: newValues.isStaple,
        displayName: '常備品'
      });
    }

    return changes;
  },

  // 変更内容を検証
  validateChanges(changes, item) {
    for (const change of changes) {
      switch (change.field) {
        case 'amount':
          if (change.newValue < 0) {
            return { valid: false, error: '数量は0以上である必要があります。' };
          }
          break;

        case 'expiryDate':
          if (!this.isValidDate(change.newValue)) {
            return { valid: false, error: '消費期限の形式が正しくありません（YYYY/MM/DD）。' };
          }
          break;

        case 'threshold':
          if (change.newValue < 0) {
            return { valid: false, error: '通知閾値は0以上である必要があります。' };
          }
          break;
      }
    }

    return { valid: true };
  },

  // 日付形式の検証
  isValidDate(dateStr) {
    const regex = /^\d{4}\/\d{2}\/\d{2}$/;
    if (!regex.test(dateStr)) return false;
    
    const date = new Date(dateStr);
    return date instanceof Date && !isNaN(date);
  },

  // スプレッドシートを更新
  async updateSpreadsheet(sheetsService, item, changes) {
    const rowIndex = parseInt(item.id) + 1; // ヘッダー分+1
    const updates = {};

    // 各変更をマッピング
    changes.forEach(change => {
      switch (change.field) {
        case 'amount':
          updates['D'] = change.newValue; // 現在量
          break;
        case 'unit':
          updates['E'] = change.newValue; // 単位
          break;
        case 'storageLocation':
          updates['F'] = change.newValue; // 保存場所
          break;
        case 'expiryDate':
          updates['H'] = change.newValue; // 消費期限
          break;
        case 'openStatus':
          updates['I'] = change.newValue; // 開封状態
          break;
        case 'threshold':
          updates['J'] = change.newValue; // 通知閾値
          break;
        case 'isStaple':
          updates['K'] = change.newValue ? 'TRUE' : 'FALSE'; // 常備品フラグ
          break;
      }
    });

    // 最終更新日時を追加
    updates['L'] = new Date().toLocaleString('ja-JP');

    // 各セルを個別に更新
    for (const [column, value] of Object.entries(updates)) {
      await sheetsService.writeRange('在庫管理', `${column}${rowIndex}:${column}${rowIndex}`, [[value]]);
    }

    return { success: true, updatedCells: Object.keys(updates).length };
  },

  // 編集履歴を記録
  async recordEdit(sheetsService, item, changes, memo) {
    const changeDescription = changes.map(change => {
      const oldVal = change.field === 'isStaple' ? (change.oldValue ? 'はい' : 'いいえ') : change.oldValue;
      const newVal = change.field === 'isStaple' ? (change.newValue ? 'はい' : 'いいえ') : change.newValue;
      return `${change.displayName}: ${oldVal} → ${newVal}`;
    }).join(', ');

    await sheetsService.safeAppendData('使用履歴', [[
      '',
      new Date().toLocaleDateString('ja-JP'),
      new Date().toLocaleTimeString('ja-JP'),
      '食材編集',
      item.name,
      0,
      item.currentAmount,
      '編集',
      memo ? `${changeDescription} (${memo})` : changeDescription
    ]]);
  },

  // 編集結果を表示
  async showEditResult(interaction, item, changes, updateResult, memo) {
    const embed = new EmbedBuilder()
      .setTitle('✏️ 食材編集完了')
      .setColor(0x00AE86)
      .setDescription(`**${item.name}** の情報を更新しました`)
      .setTimestamp();

    // 変更内容を表示
    const changeList = changes.map(change => {
      const oldVal = change.field === 'isStaple' ? (change.oldValue ? 'はい' : 'いいえ') : change.oldValue;
      const newVal = change.field === 'isStaple' ? (change.newValue ? 'はい' : 'いいえ') : change.newValue;
      return `**${change.displayName}**: ${oldVal} → ${newVal}`;
    }).join('\n');

    embed.addFields({
      name: '📝 変更内容',
      value: changeList,
      inline: false
    });

    // 現在の状態を表示
    const currentAmountChange = changes.find(c => c.field === 'amount');
    const currentUnitChange = changes.find(c => c.field === 'unit');
    const currentAmount = currentAmountChange ? currentAmountChange.newValue : item.currentAmount;
    const currentUnit = currentUnitChange ? currentUnitChange.newValue : item.unit;

    embed.addFields(
      { name: '現在の状態', value: `${currentAmount}${currentUnit}`, inline: true },
      { name: '更新セル数', value: `${updateResult.updatedCells}個`, inline: true }
    );

    if (memo) {
      embed.addFields({ name: 'メモ', value: memo, inline: false });
    }

    // 警告やアドバイス
    const warnings = this.generateWarnings(changes);
    if (warnings.length > 0) {
      embed.addFields({
        name: '⚠️ 注意',
        value: warnings.join('\n'),
        inline: false
      });
      embed.setColor(0xFF6B00);
    }

    await interaction.editReply({ embeds: [embed] });
  },

  // 警告メッセージを生成
  generateWarnings(changes) {
    const warnings = [];

    // 期限に関する警告
    const expiryChange = changes.find(c => c.field === 'expiryDate');
    if (expiryChange) {
      const daysLeft = this.calculateDaysLeft(expiryChange.newValue);
      if (daysLeft <= 0) {
        warnings.push('⚠️ 設定した期限は既に過ぎています');
      } else if (daysLeft <= 3) {
        warnings.push('🟡 設定した期限まであと3日以内です');
      }
    }

    // 数量に関する警告
    const amountChange = changes.find(c => c.field === 'amount');
    const thresholdChange = changes.find(c => c.field === 'threshold');
    if (amountChange || thresholdChange) {
      // 通知閾値との比較は複雑になるので、シンプルな警告のみ
      if (amountChange && amountChange.newValue === 0) {
        warnings.push('📦 在庫が0になりました');
      }
    }

    // 保存場所変更の警告
    const storageChange = changes.find(c => c.field === 'storageLocation');
    if (storageChange) {
      if (storageChange.oldValue === '冷凍' && storageChange.newValue !== '冷凍') {
        warnings.push('🧊 冷凍品を他の場所に移動しました。期限にご注意ください');
      }
    }

    return warnings;
  },

  // 期限までの日数を計算
  calculateDaysLeft(expiryDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const expiryDate = new Date(expiryDateStr);
    expiryDate.setHours(0, 0, 0, 0);
    
    const diffTime = expiryDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
};
