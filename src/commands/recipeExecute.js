// src/commands/recipeExecute.js - 統合版料理実行コマンド
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('料理実行')
    .setDescription('登録済みの料理を作って在庫を消費します')
    .addStringOption(option =>
      option.setName('料理名')
        .setDescription('作る料理の名前')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option =>
      option.setName('メモ')
        .setDescription('備考があれば入力')
        .setRequired(false)),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const recipeName = interaction.options.getString('料理名');
      const memo = interaction.options.getString('メモ') || '';

      // 統合料理実行
      const result = await sheetsService.executeIntegratedRecipe(recipeName, memo);

      // 成功レスポンス
      const embed = new EmbedBuilder()
        .setTitle('🍳 料理実行完了')
        .setDescription(`**${result.recipeName}** を作りました！`)
        .setColor(0x00AE86)
        .setTimestamp();

      // 基本情報
      embed.addFields(
        { name: '📂 カテゴリ', value: result.category, inline: true },
        { name: '⏱️ 調理時間', value: `${result.cookingTime}分`, inline: true },
        { name: '📊 難易度', value: result.difficulty, inline: true }
      );

      // 消費した材料一覧
      if (result.usedIngredients.length > 0) {
        const usedList = result.usedIngredients.map(ing => {
          const status = ing.remainingAmount <= 0 ? ' ⚠️' : '';
          return `• **${ing.ingredient}**: ${ing.usedAmount}${ing.unit} 使用 → 残り${ing.remainingAmount}${ing.unit}${status}`;
        }).join('\n');

        embed.addFields({
          name: '📝 消費した材料（在庫管理対象）',
          value: usedList,
          inline: false
        });
      }

      // レシピの全材料表示（参考用）
      const allIngredients = result.allIngredients;
      const stockIngredients = allIngredients.filter(ing => ing.type === '在庫管理対象');
      const nonStockIngredients = allIngredients.filter(ing => ing.type === '非対象');

      if (nonStockIngredients.length > 0) {
        const nonStockList = nonStockIngredients.map(ing => 
          `• **${ing.name}**: ${ing.amount}${ing.unit}`
        ).join('\n');
        
        embed.addFields({
          name: '🧂 その他の材料（参考）',
          value: nonStockList,
          inline: false
        });
      }

      if (memo) {
        embed.addFields({ name: '📝 メモ', value: memo, inline: false });
      }

      // 警告チェック
      const warnings = result.usedIngredients.filter(ing => ing.remainingAmount <= 0);
      if (warnings.length > 0) {
        embed.setColor(0xFF6B6B);
        const warningList = warnings.map(w => `• ${w.ingredient}: ${w.remainingAmount}${w.unit}`).join('\n');
        embed.addFields({
          name: '⚠️ 在庫不足の材料',
          value: warningList + '\n\n買い物リストに追加することをお勧めします。',
          inline: false
        });
      }

      // おすすめアクション
      embed.addFields({
        name: '💡 おすすめアクション',
        value: [
          '• `/買い物リスト` で不足材料を確認',
          '• `/料理提案` で他に作れる料理を確認',
          '• `/在庫確認` で全体の在庫状況を確認'
        ].join('\n'),
        inline: false
      });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('料理実行エラー:', error);
      
      let errorMessage = error.message;
      
      // エラータイプ別の対応
      if (error.message.includes('が見つかりません')) {
        errorMessage += '\n\n💡 `/料理一覧` で登録済み料理を確認するか、`/料理登録` で新しく登録してください。';
      } else if (error.message.includes('材料が不足しています')) {
        errorMessage += '\n\n💡 `/買い物リスト` で必要な材料を確認して買い物をしてください。';
      } else if (error.message.includes('在庫管理対象の材料がありません')) {
        errorMessage += '\n\n💡 この料理には在庫管理対象の材料が設定されていません。`/レシピ表示` でレシピのみ確認できます。';
      }

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ 料理実行エラー')
        .setDescription(errorMessage)
        .setColor(0xFF6B6B)
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },

  // オートコンプリート機能
  async autocomplete(interaction, sheetsService) {
    try {
      const focusedValue = interaction.options.getFocused().toLowerCase();
      
      // 登録済み料理一覧を取得
      const recipes = await sheetsService.getIntegratedRecipes();
      
      // 検索にマッチする料理をフィルタ
      const filtered = recipes
        .filter(recipe => recipe.recipeName.toLowerCase().includes(focusedValue))
        .slice(0, 25) // Discord の制限
        .map(recipe => ({
          name: `${recipe.recipeName} (${recipe.category})`,
          value: recipe.recipeName
        }));

      await interaction.respond(filtered);
    } catch (error) {
      console.error('オートコンプリートエラー:', error);
      await interaction.respond([]);
    }
  }
};
