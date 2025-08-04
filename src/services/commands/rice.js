// src/commands/rice.js
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
            .setRequired(false))),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === '確認') {
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

        if (riceData.currentAmount <= riceData.notificationThreshold) {
          embed.setColor(0xFF6B6B);
          embed.setDescription('⚠️ **米の残量が少なくなっています！買い物リストに追加することをお勧めします。**');
        }

        await interaction.editReply({ embeds: [embed] });

      } else if (subcommand === '炊飯') {
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
      }

    } catch (error) {
      console.error('米管理エラー:', error);
      await interaction.editReply(`エラーが発生しました: ${error.message}`);
    }
  }
};
