// src/commands/inventory.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('在庫確認')
    .setDescription('現在の在庫状況を確認します')
    .addStringOption(option =>
      option.setName('食材名')
        .setDescription('特定の食材を検索（省略すると全体表示）')
        .setRequired(false)),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const searchItem = interaction.options.getString('食材名');
      const inventory = await sheetsService.getInventoryData();
      
      let filteredInventory = inventory;
      if (searchItem) {
        filteredInventory = inventory.filter(item => 
          item.name.includes(searchItem)
        );
      }

      if (filteredInventory.length === 0) {
        await interaction.editReply('該当する食材が見つかりませんでした。');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('🥬 在庫状況')
        .setColor(0x00AE86)
        .setTimestamp();

      // カテゴリ別に整理
      const categories = {};
      filteredInventory.forEach(item => {
        if (!categories[item.category]) {
          categories[item.category] = [];
        }
        categories[item.category].push(item);
      });

      // カテゴリごとにフィールド追加
      for (const [category, items] of Object.entries(categories)) {
        const itemList = items.map(item => {
          const status = item.currentAmount <= item.notificationThreshold ? '⚠️' : '✅';
          const expiry = new Date(item.expiryDate) < new Date() ? '🚨期限切れ' : 
                        new Date(item.expiryDate) - new Date() < 2 * 24 * 60 * 60 * 1000 ? '🟡期限間近' : '';
          return `${status} **${item.name}**: ${item.currentAmount}${item.unit} ${expiry}`;
        }).join('\n');

        embed.addFields({
          name: `📂 ${category}`,
          value: itemList || 'なし',
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('在庫確認エラー:', error);
      await interaction.editReply('在庫確認中にエラーが発生しました。');
    }
  }
};
