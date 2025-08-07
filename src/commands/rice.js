// src/commands/rice.js - 完全修正版
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('米')
    .setDescription('米の管理コマンド')
    .addSubcommand(subcommand =>
      subcommand
        .setName('確認')
        .setDescription('現在の米の残量を確認'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('炊飯')
        .setDescription('米を炊いた記録をつける')
        .addIntegerOption(option =>
          option.setName('合数')
            .setDescription('何合炊いたか')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(10))
        .addStringOption(option =>
          option.setName('メモ')
            .setDescription('備考があれば入力')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('購入')
        .setDescription('米を購入した記録をつける')
        .addNumberOption(option =>
          option.setName('重量')
            .setDescription('購入した米の重量（kg）')
            .setRequired(true)
            .addChoices(
              { name: '2kg', value: 2 },
              { name: '5kg', value: 5 },
              { name: '10kg', value: 10 },
              { name: '30kg', value: 30 }
            ))
        .addStringOption(option =>
          option.setName('銘柄')
            .setDescription('米の銘柄（省略可）')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('メモ')
            .setDescription('備考があれば入力')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('カスタム購入')
        .setDescription('任意の重量で米を購入した記録をつける')
        .addNumberOption(option =>
          option.setName('グラム数')
            .setDescription('購入した米の重量（g）')
            .setRequired(true)
            .setMinValue(100)
            .setMaxValue(50000))
        .addStringOption(option =>
          option.setName('銘柄')
            .setDescription('米の銘柄（省略可）')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('メモ')
            .setDescription('備考があれば入力')
            .setRequired(false))),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === '確認') {
        await this.handleRiceCheck(interaction, sheetsService);
      } else if (subcommand === '炊飯') {
        await this.handleRiceCooking(interaction, sheetsService);
      } else if (subcommand === '購入') {
        await this.handleRicePurchase(interaction, sheetsService);
      } else if (subcommand === 'カスタム購入') {
        await this.handleCustomRicePurchase(interaction, sheetsService);
      }

    } catch (error) {
      console.error('米管理エラー:', error);
      await interaction.editReply(`❌ エラーが発生しました: ${error.message}`);
    }
  },

  // 米の残量確認
  async handleRiceCheck(interaction, sheetsService) {
    const riceData = await sheetsService.getRiceData();
    
    const embed = new EmbedBuilder()
      .setTitle('🍚 米の残量')
      .setColor(0xFFD700)
      .addFields(
        { name: '現在の残量', value: `${riceData.currentAmount}g`, inline: true },
        { name: 'あと何回炊けるか', value: `約${riceData.remainingCooking}回（3合炊き）`, inline: true },
        { name: '通知設定', value: `${riceData.notificationThreshold}g以下で通知`, inline: true }
      )
      .setTimestamp();

    // 残量に応じてメッセージと色を変更
    if (riceData.currentAmount <= riceData.notificationThreshold) {
      embed.setColor(0xFF6B6B);
      embed.setDescription('⚠️ **米の残量が少なくなっています！買い物リストに追加することをお勧めします。**');
    } else if (riceData.currentAmount <= riceData.notificationThreshold * 2) {
      embed.setColor(0xFFA500);
      embed.setDescription('🟡 **米の残量がやや少なくなってきました。**');
    } else {
      embed.setDescription('✅ **米の在庫は十分です。**');
    }

    await interaction.editReply({ embeds: [embed] });
  },

  // 炊飯記録
  async handleRiceCooking(interaction, sheetsService) {
    const cups = interaction.options.getInteger('合数');
    const memo = interaction.options.getString('メモ') || '';

    const result = await sheetsService.useRice(cups, memo);

    const embed = new EmbedBuilder()
      .setTitle('🍚 炊飯記録完了')
      .setColor(0x00AE86)
      .addFields(
        { name: '炊いた量', value: `${cups}合 (${result.usedAmount}g)`, inline: true },
        { name: '残量', value: `${result.remainingAmount}g`, inline: true },
        { name: 'あと何回', value: `約${result.remainingCooking}回`, inline: true }
      )
      .setTimestamp();

    if (memo) {
      embed.addFields({ name: 'メモ', value: memo, inline: false });
    }

    if (result.remainingAmount <= 1500) {
      embed.setColor(0xFF6B6B);
      embed.setDescription('⚠️ **米の残量が少なくなりました！**');
    }

    await interaction.editReply({ embeds: [embed] });
  },

  // 米購入（プリセット）
  async handleRicePurchase(interaction, sheetsService) {
    const weightKg = interaction.options.getNumber('重量');
    const brand = interaction.options.getString('銘柄') || '';
    const memo = interaction.options.getString('メモ') || '';

    const weightGrams = weightKg * 1000;
    const result = await sheetsService.purchaseRice(weightGrams, brand, memo);

    const embed = new EmbedBuilder()
      .setTitle('🛒 米購入記録完了')
      .setColor(0x00AE86)
      .setDescription(`**${weightKg}kg** の米を購入しました`)
      .addFields(
        { name: '購入量', value: `${weightKg}kg (${weightGrams}g)`, inline: true },
        { name: '現在の残量', value: `${result.newAmount}g`, inline: true },
        { name: 'あと何回炊けるか', value: `約${result.remainingCooking}回`, inline: true }
      )
      .setTimestamp();

    if (brand) {
      embed.addFields({ name: '銘柄', value: brand, inline: true });
    }

    if (memo) {
      embed.addFields({ name: 'メモ', value: memo, inline: false });
    }

    // 購入後の状態メッセージ
    if (result.newAmount > 5000) {
      embed.addFields({ 
        name: '💡 アドバイス', 
        value: '十分な在庫があります！しばらく安心ですね。', 
        inline: false 
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },

  // 米購入（カスタム）
  async handleCustomRicePurchase(interaction, sheetsService) {
    const weightGrams = interaction.options.getNumber('グラム数');
    const brand = interaction.options.getString('銘柄') || '';
    const memo = interaction.options.getString('メモ') || '';

    const result = await sheetsService.purchaseRice(weightGrams, brand, memo);

    const weightKg = (weightGrams / 1000).toFixed(1);

    const embed = new EmbedBuilder()
      .setTitle('🛒 米購入記録完了')
      .setColor(0x00AE86)
      .setDescription(`**${weightKg}kg** の米を購入しました`)
      .addFields(
        { name: '購入量', value: `${weightKg}kg (${weightGrams}g)`, inline: true },
        { name: '現在の残量', value: `${result.newAmount}g`, inline: true },
        { name: 'あと何回炊けるか', value: `約${result.remainingCooking}回`, inline: true }
      )
      .setTimestamp();

    if (brand) {
      embed.addFields({ name: '銘柄', value: brand, inline: true });
    }

    if (memo) {
      embed.addFields({ name: 'メモ', value: memo, inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  }
};
