// src/commands/cooking.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('料理')
    .setDescription('料理の記録をつける')
    .addStringOption(option =>
      option.setName('料理名')
        .setDescription('作った料理名（テンプレートに登録済みの場合は自動計算）')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('メモ')
        .setDescription('備考があれば入力')
        .setRequired(false)),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const dishName = interaction.options.getString('料理名');
      const memo = interaction.options.getString('メモ') || '';

      // テンプレートがあるかチェック
      const result = await sheetsService.useCookingTemplate(dishName, memo);

      const embed = new EmbedBuilder()
        .setTitle('🍳 料理記録完了')
        .setColor(0x00AE86)
        .setDescription(`**${result.templateName}** の使用食材を記録しました`)
        .setTimestamp();

      // 使用した食材一覧
      const ingredientList = result.usedIngredients.map(ing => 
        `• **${ing.ingredient}**: ${ing.usedAmount}${ing.unit} → 残り${ing.remainingAmount}${ing.unit}`
      ).join('\n');

      embed.addFields({
        name: '📝 使用した食材',
        value: ingredientList,
        inline: false
      });

      if (memo) {
        embed.addFields({ name: 'メモ', value: memo, inline: false });
      }

      // 警告チェック
      const warnings = result.usedIngredients.filter(ing => ing.remainingAmount <= 0);
      if (warnings.length > 0) {
        embed.setColor(0xFF6B6B);
        embed.addFields({
          name: '⚠️ 在庫不足',
          value: warnings.map(w => `• ${w.ingredient}: ${w.remainingAmount}${w.unit}`).join('\n'),
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('料理記録エラー:', error);
      await interaction.editReply(`エラーが発生しました: ${error.message}`);
    }
  }
};
