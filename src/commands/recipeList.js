// src/commands/recipeList.js - 統合版料理一覧コマンド
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('料理一覧')
    .setDescription('登録済みの料理一覧を表示します')
    .addStringOption(option =>
      option.setName('カテゴリ')
        .setDescription('特定のカテゴリでフィルタ')
        .setRequired(false)
        .addChoices(
          { name: 'ご飯もの', value: 'ご飯もの' },
          { name: 'おかず', value: 'おかず' },
          { name: 'サラダ', value: 'サラダ' },
          { name: 'スープ', value: 'スープ' },
          { name: '鍋料理', value: '鍋料理' },
          { name: 'パン・麺類', value: 'パン・麺類' },
          { name: 'お菓子', value: 'お菓子' },
          { name: 'その他', value: 'その他' }
        ))
    .addStringOption(option =>
      option.setName('材料')
        .setDescription('特定の材料を含む料理を検索')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('料理名')
        .setDescription('料理名で検索')
        .setRequired(false)),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const category = interaction.options.getString('カテゴリ');
      const ingredient = interaction.options.getString('材料');
      const recipeName = interaction.options.getString('料理名');

      // 検索オプション作成
      const searchOptions = {};
      if (category) searchOptions.category = category;
      if (ingredient) searchOptions.ingredient = ingredient;
      if (recipeName) searchOptions.name = recipeName;

      // 料理一覧取得
      const recipes = await sheetsService.getIntegratedRecipes(searchOptions);

      if (recipes.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('📝 料理一覧')
          .setDescription('条件に合う料理が見つかりませんでした。')
          .setColor(0x95A5A6)
          .addFields({
            name: '💡 ヒント',
            value: '• `/料理登録` で新しい料理を登録\n• 検索条件を変更して再試行',
            inline: false
          });

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // カテゴリ別にグループ化
      const groupedRecipes = recipes.reduce((acc, recipe) => {
        if (!acc[recipe.category]) {
          acc[recipe.category] = [];
        }
        acc[recipe.category].push(recipe);
        return acc;
      }, {});

      // 複数のEmbedに分割（Discordの制限対応）
      const embeds = [];
      let currentEmbed = new EmbedBuilder()
        .setTitle('📝 料理一覧')
        .setColor(0x00AE86)
        .setTimestamp();

      // 検索条件の表示
      const conditions = [];
      if (category) conditions.push(`カテゴリ: ${category}`);
      if (ingredient) conditions.push(`材料: ${ingredient}`);
      if (recipeName) conditions.push(`料理名: ${recipeName}`);
      
      if (conditions.length > 0) {
        currentEmbed.setDescription(`🔍 検索条件: ${conditions.join(', ')}\n📊 該当件数: ${recipes.length}件`);
      } else {
        currentEmbed.setDescription(`📊 登録済み料理: ${recipes.length}件`);
      }

      let fieldCount = 0;

      // カテゴリ別に表示
      for (const [categoryName, categoryRecipes] of Object.entries(groupedRecipes)) {
        const recipeList = categoryRecipes.map(recipe => {
          const stockIngredients = recipe.stockIngredients.length;
          const allIngredients = recipe.allIngredients.length;
          const ingredientInfo = stockIngredients > 0 ? ` (在庫消費: ${stockIngredients}/${allIngredients}材料)` : ' (レシピのみ)';
          
          return `• **${recipe.recipeName}**${ingredientInfo}\n  ⏱️${recipe.cookingTime}分 📊${recipe.difficulty}`;
        }).join('\n\n');

        // フィールド数制限チェック（Discord の制限: 25フィールド）
        if (fieldCount >= 20) {
          embeds.push(currentEmbed);
          currentEmbed = new EmbedBuilder()
            .setTitle(`📝 料理一覧 (続き)`)
            .setColor(0x00AE86);
          fieldCount = 0;
        }

        currentEmbed.addFields({
          name: `${this.getCategoryEmoji(categoryName)} ${categoryName} (${categoryRecipes.length}件)`,
          value: recipeList,
          inline: false
        });
        fieldCount++;
      }

      // 最後のEmbedを追加
      if (fieldCount > 0) {
        embeds.push(currentEmbed);
      }

      // 使用方法のヒントを最初のEmbedに追加
      if (embeds.length > 0) {
        embeds[0].addFields({
          name: '💡 使用方法',
          value: '• `/料理実行 料理名:[料理名]` で料理を作る\n• `/料理提案` で作れる料理を確認\n• `/レシピ表示 料理名:[料理名]` でレシピ表示',
          inline: false
        });
      }

      // 複数のEmbedがある場合は最初のものだけ送信（Discordの制限）
      await interaction.editReply({ embeds: [embeds[0]] });

      // 追加のEmbedがある場合は followUp で送信
      for (let i = 1; i < embeds.length && i < 3; i++) { // 最大3つまで
        await interaction.followUp({ embeds: [embeds[i]] });
      }

      if (embeds.length > 3) {
        await interaction.followUp({ 
          content: `📊 表示制限により ${embeds.length - 3} 個のカテゴリが省略されました。検索条件を絞って再実行してください。` 
        });
      }

    } catch (error) {
      console.error('料理一覧取得エラー:', error);
      await interaction.editReply(`❌ 料理一覧の取得中にエラーが発生しました: ${error.message}`);
    }
  },

  // カテゴリ絵文字取得
  getCategoryEmoji(category) {
    const emojiMap = {
      'ご飯もの': '🍚',
      'おかず': '🍖',
      'サラダ': '🥗',
      'スープ': '🍲',
      '鍋料理': '🍲',
      'パン・麺類': '🍝',
      'お菓子': '🍰',
      'その他': '🍽️'
    };
    return emojiMap[category] || '🍽️';
  }
};

// =====================================================

// src/commands/recipeSuggest.js - 統合版料理提案コマンド
const recipeSuggestModule = {
  data: new SlashCommandBuilder()
    .setName('料理提案')
    .setDescription('現在の在庫で作れる料理を提案します')
    .addBooleanOption(option =>
      option.setName('作れない料理も表示')
        .setDescription('材料が不足している料理も表示する')
        .setRequired(false)),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const showUnavailable = interaction.options.getBoolean('作れない料理も表示') || false;

      // 作れる料理の提案を取得
      const suggestions = await sheetsService.getSuggestableRecipes();

      const embed = new EmbedBuilder()
        .setTitle('🍳 料理提案')
        .setColor(0x00AE86)
        .setTimestamp();

      // 作れる料理
      if (suggestions.canMake.length > 0) {
        const canMakeList = suggestions.canMake.slice(0, 10).map(suggestion => { // 最大10件
          const recipe = suggestion.recipe;
          const stockCount = recipe.stockIngredients.length;
          return `• **${recipe.recipeName}** (${recipe.category})\n  ⏱️${recipe.cookingTime}分 📊${recipe.difficulty} 🥬${stockCount}材料`;
        }).join('\n\n');

        embed.addFields({
          name: `✅ 今すぐ作れる料理 (${suggestions.canMake.length}件)`,
          value: canMakeList,
          inline: false
        });

        if (suggestions.canMake.length > 10) {
          embed.addFields({
            name: '📊 表示制限',
            value: `他に ${suggestions.canMake.length - 10} 件の料理が作れます。`,
            inline: false
          });
        }
      } else {
        embed.addFields({
          name: '😔 作れる料理',
          value: '現在の在庫では作れる料理がありません。',
          inline: false
        });
      }

      // 作れない料理（オプション）
      if (showUnavailable && suggestions.needIngredients.length > 0) {
        const needIngredientsList = suggestions.needIngredients.slice(0, 5).map(suggestion => { // 最大5件
          const recipe = suggestion.recipe;
          const missingCount = suggestion.missingIngredients.length;
          const missingList = suggestion.missingIngredients.slice(0, 2).join('\n  ');
          const moreText = suggestion.missingIngredients.length > 2 ? `\n  他${missingCount - 2}件...` : '';
          
          return `• **${recipe.recipeName}** (${recipe.category})\n  不足: ${missingCount}材料\n  ${missingList}${moreText}`;
        }).join('\n\n');

        embed.addFields({
          name: `⚠️ 材料不足の料理 (${suggestions.needIngredients.length}件)`,
          value: needIngredientsList,
          inline: false
        });

        if (suggestions.needIngredients.length > 5) {
          embed.addFields({
            name: '📊 表示制限',
            value: `他に ${suggestions.needIngredients.length - 5} 件の料理で材料が不足しています。`,
            inline: false
          });
        }
      }

      // アクションのヒント
      const actions = [
        '• `/料理実行 料理名:[料理名]` で料理を作る',
        '• `/買い物リスト` で不足材料を確認',
        '• `/在庫確認` で現在の在庫状況を確認'
      ];

      if (suggestions.canMake.length === 0) {
        actions.unshift('• `/料理登録` で新しい料理を登録');
      }

      embed.addFields({
        name: '💡 おすすめアクション',
        value: actions.join('\n'),
        inline: false
      });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('料理提案エラー:', error);
      await interaction.editReply(`❌ 料理提案の取得中にエラーが発生しました: ${error.message}`);
    }
  }
};

module.exports.recipeSuggest = recipeSuggestModule;
