// commands/recipeSuggestIntegrated.js - ジャンル対応修正版
const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('料理提案統合版')
    .setDescription('在庫食材から作れる料理をAIが提案します')
    .addStringOption(option =>
      option.setName('ソース')
        .setDescription('レシピ提案のソース選択')
        .setRequired(false)
        .addChoices(
          { name: 'Claude AI', value: 'claude_ai' },
          { name: 'Spoonacular', value: 'spoonacular' },
          { name: '自分のレシピ', value: 'own_recipes' },
          { name: '全て', value: 'all' }
        ))
    .addStringOption(option =>
      option.setName('料理ジャンル')
        .setDescription('希望する料理ジャンル')
        .setRequired(false)
        .addChoices(
          { name: '和食', value: 'japanese' },
          { name: '洋食', value: 'american' },
          { name: '中華', value: 'chinese' },
          { name: '韓国料理', value: 'korean' },
          { name: 'イタリアン', value: 'italian' },
          { name: 'タイ料理', value: 'thai' },
          { name: 'インド料理', value: 'indian' },
          { name: 'なんでも', value: 'all' }
        )),

  async execute(interaction, sheetsService, spoonacularService = null, improvedRakutenAPI = null, claudeRecipeService = null) {
    await interaction.deferReply();

    try {
      const source = interaction.options.getString('ソース') || 'claude_ai';
      const cuisineType = interaction.options.getString('料理ジャンル') || null;
      
      console.log(`🍳 料理提案実行: ソース=${source}, ジャンル=${cuisineType}`);

      // 在庫データ取得
      const inventory = await sheetsService.getInventoryData();
      const availableIngredients = inventory.filter(item => item.currentAmount > 0);
      
      if (availableIngredients.length === 0) {
        await interaction.editReply('❌ 利用可能な食材がありません。`/食材追加` で食材を登録してください。');
        return;
      }

      // 期限切れ近い食材を特定
      const urgentIngredients = availableIngredients.filter(item => {
        const daysLeft = this.calculateDaysLeft(item.expiryDate);
        return daysLeft <= 3;
      });

      console.log(`📊 利用可能食材: ${availableIngredients.length}種類, 期限間近: ${urgentIngredients.length}種類`);

      // レシピ提案を並行実行
      const recipePromises = [];
      let sourcesUsed = [];

      // Claude AI
      if ((source === 'claude_ai' || source === 'all') && claudeRecipeService) {
        sourcesUsed.push('Claude AI');
        recipePromises.push(
          this.getClaudeRecipes(claudeRecipeService, availableIngredients, urgentIngredients, cuisineType)
        );
      }

      // Spoonacular
      if ((source === 'spoonacular' || source === 'all') && spoonacularService) {
        sourcesUsed.push('Spoonacular');
        recipePromises.push(
          this.getSpoonacularRecipes(spoonacularService, availableIngredients, urgentIngredients, cuisineType)
        );
      }

      // 自分のレシピ
      if (source === 'own_recipes' || source === 'all') {
        sourcesUsed.push('自分のレシピ');
        recipePromises.push(
          this.getOwnRecipes(sheetsService, availableIngredients)
        );
      }

      // 並行実行
      const recipeResults = await Promise.allSettled(recipePromises);
      
      // 結果をまとめる
      let allClaudeRecipes = [];
      let allSpoonacularRecipes = [];
      let allOwnRecipes = [];
      
      recipeResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          const sourceIndex = sourcesUsed[index];
          if (sourceIndex === 'Claude AI') {
            allClaudeRecipes = result.value;
          } else if (sourceIndex === 'Spoonacular') {
            allSpoonacularRecipes = result.value;
          } else if (sourceIndex === '自分のレシピ') {
            allOwnRecipes = result.value;
          }
        } else {
          console.error(`${sourcesUsed[index]}レシピ取得エラー:`, result.reason);
        }
      });

      // 結果の集計
      const totalRecipes = allClaudeRecipes.length + allSpoonacularRecipes.length + allOwnRecipes.length;
      
      if (totalRecipes === 0) {
        await interaction.editReply(this.createNoRecipesMessage(cuisineType));
        return;
      }

      // 結果表示
      const embed = this.createIntegratedRecipeEmbed(
        availableIngredients,
        urgentIngredients,
        allClaudeRecipes,
        allSpoonacularRecipes,
        allOwnRecipes,
        cuisineType,
        sourcesUsed
      );

      const components = this.createRecipeSelectMenus(
        allClaudeRecipes,
        allSpoonacularRecipes,
        allOwnRecipes
      );

      await interaction.editReply({
        embeds: [embed],
        components: components
      });

    } catch (error) {
      console.error('料理提案統合エラー:', error);
      await interaction.editReply('❌ 料理提案の取得中にエラーが発生しました。しばらく待ってから再度お試しください。');
    }
  },

  // 🆕 Claude レシピ取得（ジャンル対応）
  async getClaudeRecipes(claudeRecipeService, availableIngredients, urgentIngredients, cuisineType) {
    try {
      const options = {
        maxRecipes: 4,
        includeDetails: false // 一覧表示用なので詳細は不要
      };

      // ジャンル指定があれば追加
      if (cuisineType && cuisineType !== 'all') {
        options.cuisineType = cuisineType;
      }

      const recipes = await claudeRecipeService.suggestRecipes(
        availableIngredients,
        urgentIngredients,
        options
      );

      return recipes || [];

    } catch (error) {
      console.error('Claude レシピ取得エラー:', error);
      return [];
    }
  },

  // 🔧 Spoonacular レシピ取得（改善版）
  async getSpoonacularRecipes(spoonacularService, availableIngredients, urgentIngredients, cuisineType) {
    try {
      // 使用量チェック
      const usage = spoonacularService.getUsageReport();
      if (usage.spoonacular.remaining <= 0) {
        console.log('⚠️ Spoonacular API制限に達しました');
        return [];
      }

      // 🆕 検索戦略を改善：複数の食材で検索
      const targetIngredients = urgentIngredients.length > 0 ?
        urgentIngredients.slice(0, 2) :
        availableIngredients.sort(() => Math.random() - 0.5).slice(0, 2);

      const allRecipes = [];

      // 🆕 各食材でジャンル指定検索を実行
      for (const ingredient of targetIngredients) {
        try {
          console.log(`🔍 Spoonacular検索: ${ingredient.name} (ジャンル: ${cuisineType || '指定なし'})`);
          
          // 修正: improvedSearchWithCuisineメソッドを使用
          const recipes = await spoonacularService.improvedSearchWithCuisine(
            ingredient.name, 
            4, // 各食材で4件まで取得
            cuisineType === 'all' ? null : cuisineType
          );
          
          if (recipes && recipes.length > 0) {
            allRecipes.push(...recipes);
            console.log(`✅ ${recipes.length}件取得: ${ingredient.name}`);
          } else {
            console.log(`⚠️ 0件: ${ingredient.name} (${cuisineType})`);
          }

          // API制限対策の待機
          await new Promise(resolve => setTimeout(resolve, 1200));

        } catch (ingredientError) {
          console.error(`Spoonacular検索エラー (${ingredient.name}):`, ingredientError.message);
          continue;
        }
      }

      // 🆕 結果が少ない場合は、より汎用的な検索を試行
      if (allRecipes.length < 2 && cuisineType && cuisineType !== 'all') {
        console.log(`🔄 結果が少ないため汎用検索を試行: ${allRecipes.length}件`);
        
        try {
          const mainIngredient = targetIngredients[0];
          const genericRecipes = await spoonacularService.improvedSearch(mainIngredient.name, 3);
          
          if (genericRecipes && genericRecipes.length > 0) {
            allRecipes.push(...genericRecipes);
            console.log(`✅ 汎用検索で${genericRecipes.length}件追加`);
          }
        } catch (error) {
          console.error('汎用検索エラー:', error.message);
        }
      }

      // 重複除去とスコア順ソート
      const uniqueRecipes = this.removeDuplicateRecipes(allRecipes);
      const finalResults = uniqueRecipes.slice(0, 4); // 最大4件

      console.log(`🎯 Spoonacular最終結果: ${finalResults.length}件 (${cuisineType || '汎用'})`);
      return finalResults;

    } catch (error) {
      console.error('Spoonacular レシピ取得エラー:', error);
      return [];
    }
  },

  // 自分のレシピ取得
  async getOwnRecipes(sheetsService, availableIngredients) {
    try {
      const suggestions = await sheetsService.getSuggestableRecipes();
      return suggestions.canMake.slice(0, 4).map(suggestion => ({
        ...suggestion.recipe,
        recipeTitle: suggestion.recipe.recipeName,
        recipeId: `own_${suggestion.recipe.recipeName}`,
        isOwnRecipe: true,
        relevanceScore: suggestion.matchPercentage
      }));
    } catch (error) {
      console.error('自分のレシピ取得エラー:', error);
      return [];
    }
  },

  // 🆕 統合レシピEmbed作成
  createIntegratedRecipeEmbed(availableIngredients, urgentIngredients, claudeRecipes, spoonacularRecipes, ownRecipes, cuisineType, sourcesUsed) {
    const embed = new EmbedBuilder()
      .setTitle('🤖 AI料理提案システム（拡張版）')
      .setColor(0x00AE86)
      .setTimestamp();

    // 基本情報
    const cuisineText = cuisineType && cuisineType !== 'all' ? 
      this.getCuisineDisplayName(cuisineType) : '指定なし';
    
    embed.setDescription(
      `**利用可能食材:** ${availableIngredients.length}種類 | **期限切れ近い食材:** ${urgentIngredients.length}種類\n` +
      `**料理ジャンル:** ${cuisineText} | **提案元:** ${sourcesUsed.join(' + ')}`
    );

    // 期限切れ近い食材の表示
    if (urgentIngredients.length > 0) {
      const urgentList = urgentIngredients.slice(0, 5).map(item => {
        const daysLeft = this.calculateDaysLeft(item.expiryDate);
        const urgency = daysLeft <= 1 ? '🔴' : daysLeft <= 2 ? '🟡' : '🟠';
        return `${urgency} **${item.name}** (${item.currentAmount}${item.unit})`;
      }).join('\n');
      
      embed.addFields({
        name: '⚠️ 優先的に使いたい食材',
        value: urgentList,
        inline: false
      });
    }

    // Claude AI レシピ
    if (claudeRecipes.length > 0) {
      const claudeList = claudeRecipes.map((recipe, index) => {
        const urgentUsed = this.countUrgentIngredientsUsed(recipe, urgentIngredients);
        const urgentText = urgentUsed > 0 ? ` | 期限切れ食材${urgentUsed}種使用` : '';
        
        return `${index + 1}. **${recipe.recipeTitle}** (適合度:${recipe.relevanceScore || 'N/A'}%)\n` +
               `   ${recipe.cookingTime || '調理時間不明'} ${recipe.difficulty || '難易度普通'} | ${recipe.cuisineType || recipe.category || 'その他'}料理 | ${recipe.estimatedCost || '費用不明'}${urgentText}`;
      }).join('\n');

      embed.addFields({
        name: `🧠 Claude AI${cuisineType ? '拡張' : ''}提案 (${claudeRecipes.length}件) - 詳細表示可能`,
        value: claudeList.length > 1024 ? claudeList.substring(0, 1021) + '...' : claudeList,
        inline: false
      });
    }

    // Spoonacular レシピ
    if (spoonacularRecipes.length > 0) {
      const spoonacularList = spoonacularRecipes.map((recipe, index) => {
        return `${index + 1}. **${recipe.recipeTitle}** (適合度:${recipe.relevanceScore}%)\n` +
               `   ${recipe.recipeIndication} ${recipe.difficulty} | ${recipe.category}`;
      }).join('\n');

      embed.addFields({
        name: `🌟 Spoonacularレシピ (${spoonacularRecipes.length}件)`,
        value: spoonacularList.length > 1024 ? spoonacularList.substring(0, 1021) + '...' : spoonacularList,
        inline: false
      });
    }

    // 自分のレシピ
    if (ownRecipes.length > 0) {
      const ownList = ownRecipes.map((recipe, index) => {
        return `${index + 1}. **${recipe.recipeTitle}** (一致度:${recipe.relevanceScore}%)\n` +
               `   ${recipe.category} | 材料${recipe.totalIngredients || 'N/A'}種`;
      }).join('\n');

      embed.addFields({
        name: `📖 あなたのレシピ (${ownRecipes.length}件)`,
        value: ownList,
        inline: false
      });
    }

    // おすすめアクション
    const actions = [];
    if (claudeRecipes.length > 0) {
      actions.push('• 下のメニューでClaude AIレシピの詳細を表示');
    }
    if (spoonacularRecipes.length > 0) {
      actions.push('• Spoonacularレシピの詳細リンクを確認');
    }
    actions.push('• `/買い物リスト` で不足材料を確認');
    
    if (!cuisineType || cuisineType === 'all') {
      actions.push('• 他のジャンル試したい？ → 和食・韓国料理・中華・イタリアン');
    }

    embed.addFields({
      name: '💡 おすすめアクション',
      value: actions.join('\n'),
      inline: false
    });

    return embed;
  },

  // セレクトメニュー作成
  createRecipeSelectMenus(claudeRecipes, spoonacularRecipes, ownRecipes) {
    const components = [];

    // Claude レシピセレクトメニュー
    if (claudeRecipes.length > 0) {
      const claudeOptions = claudeRecipes.map((recipe, index) => ({
        label: recipe.recipeTitle.length > 100 ? 
          recipe.recipeTitle.substring(0, 97) + '...' : 
          recipe.recipeTitle,
        description: `${recipe.cuisineType || recipe.category || 'その他'}料理 | 適合度:${recipe.relevanceScore || 'N/A'}%`,
        value: recipe.recipeId || `claude_${index}`,
        emoji: '🧠'
      }));

      const claudeMenu = new StringSelectMenuBuilder()
        .setCustomId('claude_recipe_select_enhanced')  // 拡張バージョンを使用
        .setPlaceholder('Claude AIレシピから詳細を表示したいものを選択')
        .addOptions(claudeOptions);

      components.push(new ActionRowBuilder().addComponents(claudeMenu));
    }

    // Spoonacular レシピセレクトメニュー
    if (spoonacularRecipes.length > 0) {
      const spoonacularOptions = spoonacularRecipes.map((recipe, index) => ({
        label: recipe.recipeTitle.length > 100 ? 
          recipe.recipeTitle.substring(0, 97) + '...' : 
          recipe.recipeTitle,
        description: `${recipe.category} | 適合度:${recipe.relevanceScore}%`,
        value: String(recipe.recipeId), // 🔧 修正: 必ず文字列に変換
        emoji: '🌟'
      }));

      const spoonacularMenu = new StringSelectMenuBuilder()
        .setCustomId('spoonacular_recipe_select')
        .setPlaceholder('Spoonacularレシピから詳細を表示したいものを選択')
        .addOptions(spoonacularOptions);

      components.push(new ActionRowBuilder().addComponents(spoonacularMenu));
    }

    return components;
  },

  // ユーティリティ関数
  calculateDaysLeft(expiryDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const expiryDate = new Date(expiryDateStr);
    expiryDate.setHours(0, 0, 0, 0);
    
    const diffTime = expiryDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  },

  countUrgentIngredientsUsed(recipe, urgentIngredients) {
    if (!recipe.ingredients && !recipe.recipeMaterial) return 0;
    
    const recipeIngredients = recipe.ingredients || recipe.recipeMaterial || [];
    const urgentNames = urgentIngredients.map(item => item.name.toLowerCase());
    
    return recipeIngredients.filter(ingredient => {
      const ingredientName = (typeof ingredient === 'string' ? ingredient : ingredient.name || '').toLowerCase();
      return urgentNames.some(urgentName => ingredientName.includes(urgentName));
    }).length;
  },

  removeDuplicateRecipes(recipes) {
    const seen = new Set();
    return recipes.filter(recipe => {
      const key = `${recipe.recipeTitle}_${recipe.recipeId}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  },

  getCuisineDisplayName(cuisineType) {
    const displayNames = {
      'japanese': '和食（日本料理）',
      'korean': '韓国料理',
      'chinese': '中華料理',
      'italian': 'イタリア料理',
      'american': '洋食（西洋料理）',
      'thai': 'タイ料理',
      'indian': 'インド料理',
      'all': 'なんでも'
    };
    return displayNames[cuisineType] || cuisineType;
  },

  createNoRecipesMessage(cuisineType) {
    const cuisineText = cuisineType && cuisineType !== 'all' ?
      `${this.getCuisineDisplayName(cuisineType)}の` : '';
    
    return `❌ ${cuisineText}レシピが見つかりませんでした。\n\n` +
           '**対処法:**\n' +
           '• 料理ジャンルを変更してみる\n' +
           '• `/食材追加` で食材を追加する\n' +
           '• ソースを「全て」に変更して再試行\n' +
           '• しばらく待ってから再度お試しください';
  }
};
