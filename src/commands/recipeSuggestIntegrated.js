// commands/recipeSuggestIntegrated.js の修正版

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('料理提案統合版')
    .setDescription('統合されたレシピ提案システム')
    .addStringOption(option =>
      option.setName('ソース')
        .setDescription('レシピの取得元')
        .setRequired(false)
        .addChoices(
          { name: 'Spoonacular', value: 'spoonacular' },
          { name: 'Claude AI', value: 'claude_ai' },
          { name: 'すべて', value: 'all' }
        ))
    .addStringOption(option =>
      option.setName('料理ジャンル')
        .setDescription('料理のジャンル')
        .setRequired(false)
        .addChoices(
          { name: '韓国料理', value: 'korean' },
          { name: '和食', value: 'japanese' },
          { name: '中華料理', value: 'chinese' },
          { name: 'タイ料理', value: 'thai' },
          { name: 'インド料理', value: 'indian' },
          { name: 'イタリア料理', value: 'italian' },
          { name: 'アメリカ料理', value: 'american' },
          { name: 'メキシコ料理', value: 'mexican' }
        ))
    .addStringOption(option =>
      option.setName('除外食材')
        .setDescription('検索から除外したい食材（カンマ区切り）')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('優先食材')
        .setDescription('優先的に使いたい食材（カンマ区切り）')
        .setRequired(false)),

  async execute(interaction, sheetsService, spoonacularService = null, rakutenService = null, claudeService = null, filterOptions = {}) {
    await interaction.deferReply();

    try {
      // オプション取得
      const source = interaction.options.getString('ソース') || 'spoonacular';
      const cuisineType = interaction.options.getString('料理ジャンル') || 'japanese';
      const excludeInput = interaction.options.getString('除外食材');
      const priorityInput = interaction.options.getString('優先食材');

      console.log(`🍳 統合料理提案開始: ソース=${source}, ジャンル=${cuisineType}`);

      // フィルタリングオプション構築
      const enhancedFilterOptions = { ...filterOptions };
      
      if (excludeInput) {
        enhancedFilterOptions.excludeList = [...(enhancedFilterOptions.excludeList || []), 
          ...excludeInput.split(',').map(s => s.trim())];
        console.log(`🚫 除外食材: ${enhancedFilterOptions.excludeList.join(', ')}`);
      }
      
      if (priorityInput) {
        enhancedFilterOptions.priorityList = [...(enhancedFilterOptions.priorityList || []), 
          ...priorityInput.split(',').map(s => s.trim())];
        console.log(`🎯 優先食材: ${enhancedFilterOptions.priorityList.join(', ')}`);
      }

      // 在庫データ取得（在庫0を事前に除外）
const inventory = await sheetsService.getInventoryData();
const availableIngredients = inventory.filter(item => {
  // 🔧 修正: より厳密な在庫チェック
  return item.currentAmount > 0 && 
         item.name && 
         item.name.trim() !== '' &&
         item.name !== '卵' && // 1文字の食材は除外
         item.name !== '鯖';   // 1文字の食材は除外
});

console.log(`📊 フィルタリング前: ${inventory.length}種類, フィルタリング後: ${availableIngredients.length}種類`);

      // 期限切れ近い食材の識別
      const urgentIngredients = availableIngredients.filter(item => {
        const daysLeft = this.calculateDaysLeft(item.expiryDate);
        return daysLeft <= 3 && daysLeft >= 0;
      }).map(item => ({ ...item, daysLeft: this.calculateDaysLeft(item.expiryDate) }));

      console.log(`📊 食材状況: 全${availableIngredients.length}種類, 期限切れ近い: ${urgentIngredients.length}種類`);

      // レシピ取得
      let recipes = [];
      let apiUsage = '';

      if (source === 'spoonacular' || source === 'all') {
        if (spoonacularService) {
          try {
            console.log(`🌐 Spoonacular検索開始`);
            
            // 🔧 修正: フィルタリング機能を使用
            const spoonacularRecipes = await spoonacularService.improvedSearchWithFiltering(
              availableIngredients, 
              6, 
              cuisineType, 
              {
                ...enhancedFilterOptions,
                daysLeftThreshold: 3,
                maxIngredients: 3
              }
            );
            
            recipes.push(...spoonacularRecipes);
            
            const usage = spoonacularService.getUsageReport();
            apiUsage += `📊 **API使用状況**: Spoonacular ${usage.spoonacular.used}/${usage.spoonacular.total}回使用`;
            
            console.log(`✅ Spoonacular: ${spoonacularRecipes.length}件取得`);
          } catch (error) {
            console.error('Spoonacular検索エラー:', error);
            apiUsage += `⚠️ Spoonacular: エラーが発生しました`;
          }
        }
      }

      if (source === 'claude_ai' || source === 'all') {
        if (claudeService) {
          try {
            console.log(`🧠 Claude AI検索開始`);
            
            // Claude AIにもフィルタリング情報を渡す
            const claudeOptions = {
              cuisineType: cuisineType,
              maxRecipes: 6,
              excludeIngredients: enhancedFilterOptions.excludeList || [],
              priorityIngredients: enhancedFilterOptions.priorityList || []
            };
            
            const claudeRecipes = await claudeService.suggestRecipes(
              availableIngredients,
              urgentIngredients,
              claudeOptions
            );
            
            recipes.push(...claudeRecipes);
            console.log(`✅ Claude AI: ${claudeRecipes.length}件取得`);
          } catch (error) {
            console.error('Claude AI検索エラー:', error);
          }
        }
      }

      // 結果の整理
      if (recipes.length === 0) {
        await interaction.editReply(`❌ ${cuisineType}料理のレシピが見つかりませんでした。\n\n💡 **ヒント**: \n• 料理ジャンルを変更してみてください\n• 除外食材を減らしてみてください\n• 優先食材を追加してみてください`);
        return;
      }

      // 重複除去と優先順位付け
      const uniqueRecipes = this.removeDuplicateRecipes(recipes);
      const sortedRecipes = uniqueRecipes.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

      // 🔧 修正: 結果表示の改善
      const embed = this.createRecipeListEmbed(sortedRecipes, cuisineType, urgentIngredients, enhancedFilterOptions);
      
      // 🔧 修正: セレクトメニューの作成（データ検証強化）
      const selectMenu = this.createRecipeSelectMenu(sortedRecipes.slice(0, 25));

      const actionRow = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.editReply({
        content: apiUsage,
        embeds: [embed],
        components: [actionRow]
      });

    } catch (error) {
      console.error('統合料理提案エラー:', error);
      await interaction.editReply('❌ レシピ提案中にエラーが発生しました。しばらく待ってから再度お試しください。');
    }
  },

  // 🔧 修正: レシピリストEmbed作成
  createRecipeListEmbed(recipes, cuisineType, urgentIngredients, filterOptions) {
    const embed = new EmbedBuilder()
      .setTitle('🍳 AI料理提案システム（拡張版）')
      .setColor(0x00AE86)
      .setTimestamp();

    // 基本情報
    let basicInfo = `**利用可能食材:** ${recipes.length > 0 ? 'データあり' : '不明'}種類`;
    if (urgentIngredients.length > 0) {
      basicInfo += ` | **期限切れ近い食材:** ${urgentIngredients.length}種類`;
    }
    basicInfo += `\n**料理ジャンル:** ${this.getCuisineDisplayName(cuisineType)}`;
    
    // 検索条件表示
    const sourceInfo = recipes.map(r => r.isSpoonacular ? 'Spoonacular' : 'Claude AI');
    const uniqueSources = [...new Set(sourceInfo)];
    basicInfo += ` | **提案元:** ${uniqueSources.join(', ')}`;

    embed.setDescription(basicInfo);

    // フィルタリング情報
    if (filterOptions.excludeList && filterOptions.excludeList.length > 0) {
      embed.addFields({
        name: '🚫 除外された食材',
        value: filterOptions.excludeList.join(', '),
        inline: false
      });
    }

    if (filterOptions.priorityList && filterOptions.priorityList.length > 0) {
      embed.addFields({
        name: '🎯 優先的に使用する食材',
        value: filterOptions.priorityList.join(', '),
        inline: false
      });
    }

    // 期限切れ近い食材
    if (urgentIngredients.length > 0) {
      const urgentList = urgentIngredients.slice(0, 5).map(item => 
        `**${item.name}** (${item.currentAmount}${item.unit})`
      ).join(', ');
      
      embed.addFields({
        name: '⚠️ 優先的に使いたい食材',
        value: urgentList,
        inline: false
      });
    }

    // レシピリスト
    if (recipes.length > 0) {
      const spoonacularRecipes = recipes.filter(r => r.isSpoonacular);
      const claudeRecipes = recipes.filter(r => !r.isSpoonacular);

      if (spoonacularRecipes.length > 0) {
        const spoonList = spoonacularRecipes.slice(0, 6).map((recipe, index) => {
          const title = recipe.recipeTitle || recipe.translatedTitle || recipe.originalTitle || 'タイトル不明';
          const score = recipe.relevanceScore || 0;
          const time = recipe.recipeIndication || '時間不明';
          const difficulty = recipe.difficulty || '難易度不明';
          const category = recipe.category || 'カテゴリ不明';
          return `${index + 1}. **${title}** (適合度:${score}%) ${time} ${difficulty} | ${category}`;
        }).join('\n');

        embed.addFields({
          name: `🌐 Spoonacularレシピ (${spoonacularRecipes.length}件)`,
          value: spoonList || 'レシピデータの取得に失敗しました',
          inline: false
        });
      }

      if (claudeRecipes.length > 0) {
        const claudeList = claudeRecipes.slice(0, 4).map((recipe, index) => {
          const title = recipe.recipeTitle || recipe.translatedTitle || 'タイトル不明';
          const score = recipe.relevanceScore || 0;
          const time = recipe.recipeIndication || '時間不明';
          const difficulty = recipe.difficulty || '難易度不明';
          return `${index + 1}. **${title}** (適合度:${score}%) ${time} ${difficulty}`;
        }).join('\n');

        embed.addFields({
          name: `🧠 Claude AIレシピ (${claudeRecipes.length}件)`,
          value: claudeList,
          inline: false
        });
      }
    }

    // おすすめアクション
    embed.addFields({
      name: '💡 おすすめアクション',
      value: '• 下のメニューから詳細を確認\n• `/買い物リスト` で不足材料を確認\n• 除外食材・優先食材を調整して再検索',
      inline: false
    });

    return embed;
  },

  // 🔧 修正: セレクトメニュー作成（データ検証強化）
  createRecipeSelectMenu(recipes) {
    const options = recipes.map((recipe, index) => {
      // データ検証
      const title = recipe.recipeTitle || recipe.translatedTitle || recipe.originalTitle || `レシピ${index + 1}`;
      const score = recipe.relevanceScore || 0;
      const source = recipe.isSpoonacular ? '🌐' : '🧠';
      const id = recipe.recipeId || recipe.id || `recipe_${index}`;

      // タイトルの長さ制限
      const truncatedTitle = title.length > 80 ? title.substring(0, 77) + '...' : title;
      
      return {
        label: `${source} ${truncatedTitle}`,
        description: `適合度: ${score}% | ${recipe.difficulty || '難易度不明'} | ${recipe.recipeIndication || '時間不明'}`,
        value: recipe.isSpoonacular ? String(id) : `claude_${id}`
      };
    });

    return new StringSelectMenuBuilder()
      .setCustomId('recipe_detail_select')
      .setPlaceholder('詳細を見たいレシピを選択してください')
      .addOptions(options);
  },

  // ユーティリティメソッド
  getCuisineDisplayName(cuisineType) {
    const cuisineMap = {
      'korean': '韓国料理',
      'japanese': '和食',
      'chinese': '中華料理',
      'thai': 'タイ料理',
      'indian': 'インド料理',
      'italian': 'イタリア料理',
      'american': 'アメリカ料理',
      'mexican': 'メキシコ料理',
      'french': 'フランス料理'
    };
    return cuisineMap[cuisineType] || cuisineType;
  },

  calculateDaysLeft(expiryDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const expiryDate = new Date(expiryDateStr);
    expiryDate.setHours(0, 0, 0, 0);
    
    const diffTime = expiryDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  },

  removeDuplicateRecipes(recipes) {
    const seen = new Set();
    return recipes.filter(recipe => {
      const key = recipe.recipeId || recipe.id || recipe.recipeTitle || recipe.translatedTitle;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
};
