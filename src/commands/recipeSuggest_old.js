// src/commands/recipeSuggest.js - ユーザーレシピ対応版
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const RecipeService = require('../services/RecipeService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('料理提案')
    .setDescription('在庫食材から料理を提案します（登録レシピ + 楽天レシピ）')
    .addStringOption(option =>
      option.setName('提案タイプ')
        .setDescription('提案の種類を選択')
        .setRequired(false)
        .addChoices(
          { name: '期限切れ近い食材優先', value: 'urgent' },
          { name: '在庫食材から提案', value: 'inventory' },
          { name: '人気レシピ', value: 'popular' },
          { name: '季節のレシピ', value: 'seasonal' },
          { name: 'バランス重視', value: 'balanced' }
        ))
    .addStringOption(option =>
      option.setName('除外食材')
        .setDescription('使いたくない食材（カンマ区切り）')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('料理の難易度')
        .setDescription('料理の難易度')
        .setRequired(false)
        .addChoices(
          { name: '簡単', value: '1' },
          { name: '普通', value: '2' },
          { name: '難しい', value: '3' }
        ))
    .addIntegerOption(option =>
      option.setName('提案数')
        .setDescription('提案するレシピ数（1-10）')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10)),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const recipeService = new RecipeService();
      const suggestType = interaction.options.getString('提案タイプ') || 'inventory';
      const excludeIngredients = interaction.options.getString('除外食材')?.split(',').map(s => s.trim()) || [];
      const difficulty = interaction.options.getString('料理の難易度');
      const maxSuggestions = interaction.options.getInteger('提案数') || 5;

      const inventory = await sheetsService.getInventoryData();
      const availableIngredients = inventory
        .filter(item => item.currentAmount > 0)
        .map(item => item.name);

      let recipes = [];
      let suggestionTitle = '';
      let suggestionDescription = '';

      switch (suggestType) {
        case 'urgent':
          const expiringItems = this.getExpiringItems(inventory);
          if (expiringItems.length === 0) {
            await interaction.editReply('🎉 期限切れ近い食材はありません！');
            return;
          }
          recipes = await recipeService.suggestUrgentRecipes(expiringItems, sheetsService);
          suggestionTitle = '🚨 期限切れ近い食材を使った料理';
          suggestionDescription = `期限が近い食材: ${expiringItems.map(item => `**${item.name}**(${this.calculateDaysLeft(item.expiryDate)}日)`).join(', ')}`;
          break;

        case 'inventory':
          recipes = await recipeService.suggestRecipesByIngredients(
            availableIngredients, 
            { 
              excludeIngredients, 
              difficulty, 
              maxResults: maxSuggestions 
            },
            sheetsService // ユーザーレシピDB検索のためにsheetsServiceを渡す
          );
          suggestionTitle = '🍳 在庫食材を使った料理提案';
          suggestionDescription = `利用可能な食材から${recipes.length}件のレシピを見つけました（登録レシピ + 楽天レシピ）`;
          break;

        case 'popular':
          recipes = await recipeService.getPopularRecipes(maxSuggestions, sheetsService);
          suggestionTitle = '⭐ 人気レシピ';
          suggestionDescription = '人気の料理と登録レシピをご紹介します';
          break;

        case 'seasonal':
          recipes = await recipeService.getSeasonalRecipes(sheetsService);
          suggestionTitle = '🌸 季節のおすすめレシピ';
          suggestionDescription = '旬の食材を使った季節の料理です';
          break;

        case 'balanced':
          recipes = await recipeService.suggestBalancedMeals(inventory, sheetsService);
          suggestionTitle = '⚖️ 栄養バランス重視レシピ';
          suggestionDescription = 'たんぱく質・野菜・炭水化物のバランスを考えた料理です';
          break;
      }

      if (recipes.length === 0) {
        await interaction.editReply('😅 条件に合うレシピが見つかりませんでした。条件を変えて再度お試しください。');
        return;
      }

      // レシピ提案を表示
      await this.showRecipeSuggestions(
        interaction, 
        recipes.slice(0, maxSuggestions), 
        suggestionTitle, 
        suggestionDescription,
        availableIngredients
      );

    } catch (error) {
      console.error('料理提案エラー:', error);
      await interaction.editReply(`❌ エラーが発生しました: ${error.message}`);
    }
  },

  // 期限切れ近い食材を取得
  getExpiringItems(inventory) {
    const today = new Date();
    const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    return inventory.filter(item => {
      const expiryDate = new Date(item.expiryDate);
      return expiryDate <= threeDaysLater && 
             expiryDate >= today && 
             item.currentAmount > 0;
    });
  },

  // レシピ提案を表示（ユーザーレシピ対応）
  async showRecipeSuggestions(interaction, recipes, title, description, availableIngredients) {
    const embeds = [];
    const components = [];

    // メインの提案概要
    const mainEmbed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(0x00AE86)
      .setTimestamp();

    if (availableIngredients.length > 0) {
      mainEmbed.addFields({
        name: '🥬 利用可能な食材',
        value: availableIngredients.slice(0, 10).join(', ') + 
               (availableIngredients.length > 10 ? ` ほか${availableIngredients.length - 10}品` : ''),
        inline: false
      });
    }

    // レシピ統計
    const userRecipeCount = recipes.filter(r => r.userRecipe).length;
    const apiRecipeCount = recipes.length - userRecipeCount;
    
    if (userRecipeCount > 0 || apiRecipeCount > 0) {
      mainEmbed.addFields({
        name: '📊 レシピ内訳',
        value: `🏠 登録レシピ: ${userRecipeCount}件\n🌐 楽天レシピ: ${apiRecipeCount}件`,
        inline: false
      });
    }

    embeds.push(mainEmbed);

    // 各レシピの詳細
    recipes.forEach((recipe, index) => {
      const recipeEmbed = new EmbedBuilder()
        .setTitle(`${index + 1}. ${recipe.recipeTitle}`)
        .setColor(recipe.userRecipe ? 0x2ECC71 : 0x4169E1) // ユーザーレシピは緑、APIレシピは青
        .setThumbnail(recipe.foodImageUrl || null);

      // レシピソース表示
      const sourceIcon = recipe.userRecipe ? '🏠' : '🌐';
      const sourceText = recipe.userRecipe ? '登録レシピ' : '楽天レシピ';
      recipeEmbed.addFields({
        name: '📍 レシピソース',
        value: `${sourceIcon} ${sourceText}`,
        inline: true
      });

      // 利用可能な食材をハイライト
      if (recipe.availableIngredients && recipe.availableIngredients.length > 0) {
        recipeEmbed.addFields({
          name: '✅ 手持ちの食材',
          value: recipe.availableIngredients.join(', '),
          inline: true
        });
      }

      // 一致スコア表示
      if (recipe.matchScore) {
        const stars = '⭐'.repeat(Math.min(Math.ceil(recipe.matchScore), 5));
        recipeEmbed.addFields({
          name: '適合度',
          value: stars,
          inline: true
        });
      }

      // 緊急度表示（期限切れ近い食材の場合）
      if (recipe.urgentIngredient) {
        const urgencyEmoji = recipe.urgencyLevel === 'critical' ? '🔴' : '🟡';
        recipeEmbed.addFields({
          name: '緊急度',
          value: `${urgencyEmoji} ${recipe.urgentIngredient} (あと${recipe.daysLeft}日)`,
          inline: true
        });
      }

      // 料理時間・難易度
      if (recipe.recipeIndication) {
        recipeEmbed.addFields({
          name: '⏱️ 調理時間',
          value: recipe.recipeIndication,
          inline: true
        });
      }

      if (recipe.recipeCost && recipe.recipeCost !== '指定なし') {
        let costDisplay = recipe.recipeCost;
        if (recipe.userRecipe) {
          costDisplay = recipe.recipeCost === '手作り' ? '手作り' : recipe.recipeCost;
        } else {
          const costEmoji = recipe.recipeCost === '1' ? '💰' : 
                           recipe.recipeCost === '2' ? '💰💰' : '💰💰💰';
          costDisplay = costEmoji;
        }
        recipeEmbed.addFields({
          name: '💸 コスト',
          value: costDisplay,
          inline: true
        });
      }

      // 材料（配列対応）
      if (recipe.recipeMaterial) {
        let materials;
        if (Array.isArray(recipe.recipeMaterial)) {
          materials = recipe.recipeMaterial.join('、');
        } else {
          materials = String(recipe.recipeMaterial);
        }
        
        if (materials.length > 100) {
          materials = materials.substring(0, 100) + '...';
        }
        
        recipeEmbed.addFields({
          name: '🥄 主な材料',
          value: materials,
          inline: false
        });
      }

      // ユーザーレシピの場合の追加情報
      if (recipe.userRecipe) {
        if (recipe.difficulty) {
          recipeEmbed.addFields({
            name: '📊 難易度',
            value: recipe.difficulty,
            inline: true
          });
        }
        
        if (recipe.category) {
          recipeEmbed.addFields({
            name: '📂 カテゴリ',
            value: recipe.category,
            inline: true
          });
        }

        if (recipe.memo) {
          recipeEmbed.addFields({
            name: '📝 メモ',
            value: recipe.memo,
            inline: false
          });
        }

        if (recipe.registeredBy) {
          recipeEmbed.addFields({
            name: '👤 登録者',
            value: recipe.registeredBy,
            inline: true
          });
        }
      }

      embeds.push(recipeEmbed);
    });

    // ボタン作成（有効なURLのみ）
    const validRecipes = recipes.filter(recipe => 
      recipe.recipeUrl && 
      recipe.recipeUrl !== '#' && 
      recipe.recipeUrl.startsWith('http') &&
      !recipe.userRecipe // ユーザーレシピはボタンを作らない
    );

    if (validRecipes.length > 0) {
      const row = new ActionRowBuilder();
      
      // 最初の3つのレシピにボタンを追加
      validRecipes.slice(0, 3).forEach((recipe, index) => {
        row.addComponents(
          new ButtonBuilder()
            .setLabel(`楽天レシピ${index + 1}を見る`)
            .setStyle(ButtonStyle.Link)
            .setURL(recipe.recipeUrl)
            .setEmoji('🔗')
        );
      });

      if (row.components.length > 0) {
        components.push(row);
      }

      // 追加のボタン行
      if (validRecipes.length > 3) {
        const row2 = new ActionRowBuilder();
        validRecipes.slice(3, 5).forEach((recipe, index) => {
          row2.addComponents(
            new ButtonBuilder()
              .setLabel(`楽天レシピ${index + 4}を見る`)
              .setStyle(ButtonStyle.Link)
              .setURL(recipe.recipeUrl)
              .setEmoji('🔗')
          );
        });
        
        if (row2.components.length > 0) {
          components.push(row2);
        }
      }
    }

    // フッター情報
    const footerEmbed = new EmbedBuilder()
      .setColor(0x95A5A6)
      .setDescription('💡 **使い方のヒント**\n' +
                     '• 🏠 登録レシピ：あなたが登録したオリジナルレシピ\n' +
                     '• 🌐 楽天レシピ：「レシピを見る」ボタンで詳細確認\n' +
                     '• 料理後は `/料理` コマンドで使用食材を記録\n' +
                     '• `/レシピ登録` で新しいレシピを追加できます\n' +
                     '• `/レシピ一覧` で登録済みレシピを確認できます');

    embeds.push(footerEmbed);

    // 送信
    await interaction.editReply({
      embeds: embeds,
      components: components
    });
  },

  // 期限までの日数計算
  calculateDaysLeft(expiryDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const expiryDate = new Date(expiryDateStr);
    expiryDate.setHours(0, 0, 0, 0);
    
    const diffTime = expiryDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
};
