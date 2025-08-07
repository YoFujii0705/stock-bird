// ==================================================
// src/commands/enhancedRecipeSuggest.js - 修正版（キャッシュ統合）
// ==================================================

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('拡張料理提案')
    .setDescription('Claude AIによる拡張料理提案システム')
    .addStringOption(option =>
      option.setName('料理ジャンル')
        .setDescription('作りたい料理のジャンルを選択')
        .setRequired(false)
        .addChoices(
          { name: '和食（日本料理）', value: 'japanese' },
          { name: '洋食（西洋料理）', value: 'western' },
          { name: '中華料理', value: 'chinese' },
          { name: '韓国料理', value: 'korean' },
          { name: 'イタリア料理', value: 'italian' },
          { name: 'エスニック料理', value: 'ethnic' },
          { name: 'なんでも（お任せ）', value: 'any' }
        ))
    .addStringOption(option =>
      option.setName('調理スタイル')
        .setDescription('料理のスタイルを選択')
        .setRequired(false)
        .addChoices(
          { name: '簡単・時短（20分以内）', value: 'easy' },
          { name: 'ヘルシー（低カロリー・栄養重視）', value: 'healthy' },
          { name: 'がっつり・ボリューム満点', value: 'hearty' },
          { name: '作り置き・保存重視', value: 'meal_prep' },
          { name: '本格的・特別な日', value: 'gourmet' },
          { name: '家庭的・ほっこり', value: 'comfort' },
          { name: '普通・バランス型', value: 'normal' }
        ))
    .addStringOption(option =>
      option.setName('優先材料')
        .setDescription('優先的に使いたい材料名')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('レシピ数')
        .setDescription('提案するレシピの数（1-6）')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(6))
    .addBooleanOption(option =>
      option.setName('使用量表示')
        .setDescription('API使用量を表示する')
        .setRequired(false)),

  async execute(interaction, sheetsService, spoonacularService = null, rakutenService = null, claudeService = null) {
    await interaction.deferReply();

    try {
      const cuisineType = interaction.options.getString('料理ジャンル') || 'any';
      const cookingStyle = interaction.options.getString('調理スタイル') || 'normal';
      const priorityIngredient = interaction.options.getString('優先材料');
      const maxRecipes = interaction.options.getInteger('レシピ数') || 4;
      const showUsage = interaction.options.getBoolean('使用量表示') || false;

      console.log(`🧠✨ 拡張料理提案開始: ジャンル=${cuisineType}, スタイル=${cookingStyle}, 数=${maxRecipes}`);

      // Claude AI サービスが利用できない場合のエラーハンドリング
      if (!claudeService) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Claude AIサービス利用不可')
          .setDescription('Claude AIサービスが初期化されていません。')
          .setColor(0xFF0000)
          .addFields({
            name: '対処法',
            value: '• 管理者にClaude API設定を確認してもらってください\n• 従来の `/料理提案統合版` をお試しください',
            inline: false
          });
        
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // 在庫データ取得
      const inventory = await sheetsService.getInventoryData();
      const riceData = await sheetsService.getRiceData();
      
      const availableIngredients = inventory
        .filter(item => item.currentAmount > 0)
        .map(item => ({
          name: item.name,
          amount: item.currentAmount,
          unit: item.unit,
          category: item.category,
          expiryDate: item.expiryDate,
          daysLeft: this.calculateDaysLeft(item.expiryDate)
        }));

      if (riceData.currentAmount > 0) {
        availableIngredients.push({
          name: '米',
          amount: riceData.currentAmount,
          unit: 'g',
          category: '主食',
          daysLeft: 9999
        });
      }

      // 期限切れ近い食材を特定
      const urgentIngredients = availableIngredients
        .filter(item => item.daysLeft <= 3 && item.daysLeft >= 0)
        .sort((a, b) => a.daysLeft - b.daysLeft);

      console.log(`⚠️ 期限切れ近い食材: ${urgentIngredients.map(item => item.name).join(', ')}`);

      // Claude AIから拡張提案を取得
      const claudeSuggestions = await this.getEnhancedClaudeSuggestions(
        claudeService, availableIngredients, urgentIngredients,
        priorityIngredient, cuisineType, cookingStyle, maxRecipes
      );

      // 結果の表示
      const result = await this.createEnhancedSuggestionEmbed(
        claudeSuggestions,
        urgentIngredients,
        availableIngredients,
        cuisineType,
        cookingStyle,
        priorityIngredient,
        showUsage,
        claudeService
      );

      console.log('✅ 拡張料理提案完了');
      await interaction.editReply(result);

    } catch (error) {
      console.error('拡張料理提案エラー:', error);
      
      const fallbackEmbed = new EmbedBuilder()
        .setTitle('🍳 拡張料理提案（エラー発生）')
        .setDescription('申し訳ございません。拡張料理提案の取得中にエラーが発生しました。')
        .setColor(0xFF0000)
        .addFields(
          {
            name: '🔧 対処法',
            value: '• しばらく時間をおいて再度試してください\n• Claude API制限に達している可能性があります\n• `/拡張料理提案 使用量表示:True` で使用状況を確認',
            inline: false
          },
          {
            name: '🔄 代替案',
            value: '• `/料理提案統合版 ソース:自分のレシピ` で登録済みレシピを確認\n• `/在庫確認` で現在の在庫状況を確認',
            inline: false
          }
        );

      await interaction.editReply({ embeds: [fallbackEmbed] });
    }
  },

  // 🔧 修正: 拡張Claude AI提案取得（キャッシュ処理を削除）
  async getEnhancedClaudeSuggestions(claudeService, availableIngredients, urgentIngredients, priorityIngredient, cuisineType, cookingStyle, maxRecipes) {
    try {
      console.log(`🧠 Claude AI拡張提案取得開始 - ジャンル:${cuisineType}, スタイル:${cookingStyle}`);

      const options = {
        cuisineType,
        cookingStyle,
        priorityIngredient,
        maxRecipes,
        includeDetails: true
      };

      const claudeRecipes = await claudeService.suggestRecipes(
        availableIngredients,
        urgentIngredients,
        options
      );

      // 🔧 修正: キャッシュ処理はClaudeRecipeService内で自動実行されるため削除
      console.log(`✅ Claude AI拡張提案: ${claudeRecipes.length}件（キャッシュ処理済み）`);
      return claudeRecipes;

    } catch (error) {
      console.error('Claude AI拡張提案エラー:', error);
      return [];
    }
  },

  // 🆕 拡張Embed作成
  async createEnhancedSuggestionEmbed(claudeSuggestions, urgentIngredients, availableIngredients, cuisineType, cookingStyle, priorityIngredient, showUsage, claudeService) {
    const embed = new EmbedBuilder()
      .setTitle('🧠✨ Claude AI 拡張料理提案')
      .setColor(0x7C3AED)
      .setTimestamp();

    // 基本情報の表示
    let description = `📊 利用可能食材: ${availableIngredients?.length || 0}種類`;
    
    if (urgentIngredients && urgentIngredients.length > 0) {
      description += `\n⚠️ 期限切れ近い食材: ${urgentIngredients.length}種類`;
    }
    
    // 選択された条件の表示
    const cuisineNames = {
      'japanese': '和食（日本料理）',
      'western': '洋食（西洋料理）',
      'chinese': '中華料理',
      'korean': '韓国料理',
      'italian': 'イタリア料理',
      'ethnic': 'エスニック料理',
      'any': 'なんでも（お任せ）'
    };

    const styleNames = {
      'easy': '簡単・時短',
      'healthy': 'ヘルシー',
      'hearty': 'がっつり・ボリューム満点',
      'meal_prep': '作り置き・保存重視',
      'gourmet': '本格的・特別な日',
      'comfort': '家庭的・ほっこり',
      'normal': '普通・バランス型'
    };

    if (cuisineType && cuisineType !== 'any') {
      description += `\n🍽️ 料理ジャンル: ${cuisineNames[cuisineType]}`;
    }
    
    if (cookingStyle && cookingStyle !== 'normal') {
      description += `\n🎯 調理スタイル: ${styleNames[cookingStyle]}`;
    }

    if (priorityIngredient) {
      description += `\n🥬 優先材料: ${priorityIngredient}`;
    }
    
    embed.setDescription(description);

    // 期限切れ近い食材の表示（改善版）
    if (urgentIngredients && urgentIngredients.length > 0) {
      const urgentList = urgentIngredients.slice(0, 5).map(ing => {
        const urgency = ing.daysLeft === 0 ? '🔴 今日期限!' : 
                       ing.daysLeft === 1 ? '🟡 明日期限' : 
                       ing.daysLeft === 2 ? '🟠 あと2日' : '🟢 期限間近';
        return `${urgency} **${ing.name}** (${ing.amount}${ing.unit})`;
      }).join('\n');
      
      embed.addFields({
        name: '⚠️ 優先的に使いたい食材',
        value: urgentList,
        inline: false
      });
    }

    // Claude AI レシピの表示
    if (claudeSuggestions && claudeSuggestions.length > 0) {
      const claudeList = claudeSuggestions.slice(0, 6).map((recipe, index) => {
        const scoreDisplay = recipe.relevanceScore ? ` (適合度:${recipe.relevanceScore}%)` : '';
        const qualityIcon = recipe.relevanceScore >= 90 ? '🌟 ' : 
                           recipe.relevanceScore >= 80 ? '⭐ ' : 
                           recipe.isEnhanced ? '🤖✨ ' : '🤖 ';
        
        // 料理の特徴を表示
        const features = [];
        if (recipe.cuisineType) features.push(recipe.cuisineType);
        if (recipe.estimatedCost) features.push(recipe.estimatedCost);
        if (recipe.urgentIngredientsUsed && recipe.urgentIngredientsUsed.length > 0) {
          features.push(`期限切れ食材${recipe.urgentIngredientsUsed.length}種使用`);
        }
        
        const featureText = features.length > 0 ? `\n   💡 ${features.join(' | ')}` : '';
        
        return `${index + 1}. ${qualityIcon}**${recipe.recipeTitle}**${scoreDisplay}\n   ⏱️${recipe.recipeIndication} 📊${recipe.difficulty}${featureText}`;
      }).join('\n\n');

      embed.addFields({
        name: `🧠✨ Claude AI拡張レシピ提案 (${claudeSuggestions.length}件)`,
        value: claudeList + '\n\n🔽 **下のメニューから詳細を表示したいレシピを選択**',
        inline: false
      });
    } else {
      embed.addFields({
        name: '❌ レシピ提案なし',
        value: 'Claude AIからのレシピ提案を取得できませんでした。\n• API制限に達している可能性があります\n• 在庫が不足している可能性があります',
        inline: false
      });
    }

    // 使用量情報（拡張版）
    if (showUsage && claudeService) {
      const claudeUsage = claudeService.getUsageReport();
      const usagePercent = Math.round((claudeUsage.claude.used / claudeUsage.claude.total) * 100);
      
      let usageText = `使用量: ${claudeUsage.claude.used}/${claudeUsage.claude.total}回 (${usagePercent}%)`;
      usageText += `\nローカルキャッシュ: ${claudeUsage.recipeCacheSize}件`;
      usageText += `\nグローバルキャッシュ: ${claudeUsage.globalRecipeCacheSize}件`;
      
      embed.addFields({
        name: '📊 Claude AI使用状況',
        value: usageText,
        inline: false
      });
    }

    // アクションヒント
    const actions = [
      '• 🔽 下のメニューでレシピの詳細を表示',
      '• `/買い物リスト` で不足材料を確認',
      '• `/在庫確認` で現在の在庫状況を確認'
    ];

    // 他のジャンル・スタイルの提案
    const suggestions = [];
    if (cuisineType === 'any') {
      suggestions.push('具体的なジャンルを選んでより精密な提案を取得');
    }
    if (cookingStyle === 'normal') {
      suggestions.push('調理スタイルを選んで気分に合った料理を見つける');
    }
    
    if (suggestions.length > 0) {
      actions.push(`• 💡 ${suggestions.join('、')}`);
    }
    
    embed.addFields({
      name: '💡 おすすめアクション',
      value: actions.join('\n'),
      inline: false
    });

    // セレクトメニューを作成
    const components = [];
    if (claudeSuggestions && claudeSuggestions.length > 0) {
      try {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('claude_recipe_select_enhanced')
          .setPlaceholder('詳細を表示したいレシピを選択してください')
          .setMaxValues(1);

        claudeSuggestions.slice(0, 6).forEach((recipe, index) => {
          const optionLabel = (recipe.recipeTitle && recipe.recipeTitle.length > 80) ? 
            recipe.recipeTitle.substring(0, 77) + '...' : 
            (recipe.recipeTitle || `レシピ ${index + 1}`);
          
          const features = [];
          if (recipe.cuisineType) features.push(recipe.cuisineType);
          if (recipe.estimatedCost) features.push(recipe.estimatedCost);
          
          const description = `${recipe.category} | ${recipe.recipeIndication} | ${features.join(' | ')}`.substring(0, 100);
          
          selectMenu.addOptions({
            label: optionLabel,
            value: String(recipe.recipeId || index),
            description: description,
            emoji: recipe.relevanceScore >= 90 ? '🌟' : recipe.isEnhanced ? '✨' : '🤖'
          });
        });

        const row = new ActionRowBuilder().addComponents(selectMenu);
        components.push(row);
      } catch (componentError) {
        console.error('拡張セレクトメニュー作成エラー:', componentError.message);
      }
    }

    const result = { embeds: [embed] };
    if (components.length > 0) {
      result.components = components;
    }

    return result;
  },

  // 🔧 修正: レシピキャッシュ管理（削除：ClaudeRecipeServiceに統合）
  // キャッシュ処理はClaudeRecipeService内で自動実行されるため削除

  // 日数計算ヘルパー
  calculateDaysLeft(expiryDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const expiryDate = new Date(expiryDateStr);
    expiryDate.setHours(0, 0, 0, 0);
    
    const diffTime = expiryDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
};
