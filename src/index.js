// src/index.js - 統合システム整理・修正版
const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
const config = require('./config/config');
const GoogleSheetsService = require('./services/GoogleSheetsService');
const AnalysisService = require('./services/AnalysisService');
const RecipeService = require('./services/RecipeService');

// 改良版API サービス
const RelaxedRakutenRecipeAPI = require('./services/RelaxedRakutenRecipeAPI');
const SpoonacularFreeTierService = require('./services/SpoonacularFreeTierService');

// 既存コマンド
const inventoryCommand = require('./commands/inventory');
const riceCommand = require('./commands/rice');
const cookingCommand = require('./commands/cooking');
const addIngredientCommand = require('./commands/addIngredient');
const useIngredientsCommand = require('./commands/useIngredients');
const expiryCheckCommand = require('./commands/expiryCheck');
const shoppingListCommand = require('./commands/shoppingList');
const openIngredientCommand = require('./commands/openIngredient');
const editIngredientCommand = require('./commands/editIngredient');
const discardIngredientCommand = require('./commands/discardIngredient');
const recipeRegisterCommand = require('./commands/recipeRegister');
const recipeListCommand = require('./commands/recipeList');

// 新機能コマンド
const recipeSuggestIntegratedCommand = require('./commands/recipeSuggestIntegrated');
const monthlyReportCommand = require('./commands/monthlyReport');
const problemIngredientsCommand = require('./commands/problemIngredients');
const enhancedRecipeSuggestCommand = require('./commands/enhancedRecipeSuggest');

// 統合システムコマンド
const recipeRegisterIntegratedCommand = require('./commands/recipeRegisterIntegrated');
const recipeExecuteCommand = require('./commands/recipeExecute');
const recipeListIntegratedCommand = require('./commands/recipeList');
const { handleRecipeSelectMenu, handleRecipeModal } = require('./commands/recipeRegisterIntegrated');

// 拡張Claude処理ハンドラー
const { 
  handleEnhancedClaudeRecipeSelect, 
  cacheEnhancedRecipes 
} = require('./handlers/enhancedClaudeRecipeHandler');

class FridgeBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.sheetsService = new GoogleSheetsService();
    this.analysisService = new AnalysisService(this.sheetsService);
    this.recipeService = new RecipeService();
    
    // サービス初期化
    this.initializeServices();
    
    this.commands = new Collection();
    
    // 統合システム用のセッション管理
    global.tempRecipeData = {};
    global.claudeRecipeCache = {};
    
    this.setupCommands();
    this.setupEventHandlers();
  }

  // 🔧 サービス初期化を整理
initializeServices() {
  // Claude Recipe Service
  try {
    const ClaudeRecipeService = require('./services/ClaudeRecipeService');
    this.claudeRecipeService = new ClaudeRecipeService(process.env.CLAUDE_API_KEY);
    console.log('✅ Claude Recipe Service初期化完了');
  } catch (error) {
    console.error('❌ Claude Service初期化エラー:', error.message);
    this.claudeRecipeService = null;
  }

  // 改良版楽天API
  try {
    this.improvedRakutenAPI = new RelaxedRakutenRecipeAPI(process.env.RAKUTEN_API_KEY);
    console.log('✅ 改良版楽天API初期化完了');
  } catch (error) {
    console.error('❌ 楽天API初期化エラー:', error.message);
    this.improvedRakutenAPI = null;
  }

  // 🔧 修正: Spoonacular + DeepL Service（フィルタリング対応）
  try {
    if (!process.env.SPOONACULAR_API_KEY || !process.env.DEEPL_API_KEY) {
      throw new Error('Spoonacular/DeepL API KEY未設定');
    }
    
    this.spoonacularService = new SpoonacularFreeTierService(
      process.env.SPOONACULAR_API_KEY,
      process.env.DEEPL_API_KEY
    );
    console.log('✅ Spoonacular + DeepL サービス初期化完了（フィルタリング機能付き）');
    
  } catch (error) {
    console.error('❌ Spoonacularサービス初期化エラー:', error.message);
    
    // 🔧 修正: フォールバックサービス（フィルタリング対応）
    this.spoonacularService = {
      improvedSearch: async () => [],
      improvedSearchWithFiltering: async () => [],
      getDetailedRecipe: async () => null,
      getUsageReport: () => ({
        spoonacular: { used: 0, remaining: 0, total: 150 },
        deepl: { used: 0, remaining: 500000, total: 500000 }
      }),
      resetDailyLimits: () => console.log('🔄 ダミー: 日次制限リセット'),
      resetMonthlyLimits: () => console.log('🔄 ダミー: 月次制限リセット')
    };
  }
}

  setupCommands() {
    // 既存コマンドを登録
    const existingCommands = [
      inventoryCommand, riceCommand, cookingCommand, addIngredientCommand,
      useIngredientsCommand, expiryCheckCommand, shoppingListCommand,
      openIngredientCommand, editIngredientCommand, discardIngredientCommand,
      recipeRegisterCommand, recipeListCommand, recipeSuggestIntegratedCommand,
      monthlyReportCommand, problemIngredientsCommand, enhancedRecipeSuggestCommand
    ];

    existingCommands.forEach(command => {
      this.commands.set(command.data.name, command);
    });

    // 統合システムコマンド
    this.commands.set('料理登録', recipeRegisterIntegratedCommand);
    this.commands.set('料理実行', recipeExecuteCommand);
    this.commands.set('料理一覧', recipeListIntegratedCommand);
    this.commands.set('料理提案', recipeListIntegratedCommand.recipeSuggest);

    console.log(`✅ ${this.commands.size} commands loaded`);
  }

  setupEventHandlers() {
    this.client.once('ready', async () => {
      console.log(`✅ Bot logged in as ${this.client.user.tag}`);
      
      await this.sheetsService.initialize();
      await this.registerSlashCommands();
      this.setupScheduledNotifications();
      await this.initializeIntegratedSystem();
      
      // API テスト
      await this.runAPITests();
    });

    this.client.on('interactionCreate', async (interaction) => {
      await this.handleInteraction(interaction);
    });
  }

  // 🔧 インタラクション処理を整理
  async handleInteraction(interaction) {
    try {
      // セレクトメニュー処理
      if (interaction.isStringSelectMenu()) {
        await this.handleSelectMenu(interaction);
        return;
      }

// 🆕 ボタン処理
    if (interaction.isButton()) {
      await this.handleButtonInteraction(interaction);
      return;
    }

      // モーダル処理
      if (interaction.isModalSubmit()) {
        if (await handleRecipeModal(interaction, this.sheetsService)) {
          return;
        }
      }

      // オートコンプリート処理
      if (interaction.isAutocomplete()) {
        await this.handleAutocomplete(interaction);
        return;
      }

      // スラッシュコマンド処理
      if (interaction.isChatInputCommand()) {
        await this.handleSlashCommand(interaction);
        return;
      }

    } catch (error) {
      console.error('Interaction handling error:', error);
      await this.sendErrorResponse(interaction, 'インタラクション処理中にエラーが発生しました。');
    }
  }

// 🆕 ボタンインタラクション処理
async handleButtonInteraction(interaction) {
  const { customId } = interaction;
  console.log(`🔘 ボタン処理: ${customId}`);

  if (customId.startsWith('full_translate_')) {
    await this.handleFullTranslationRequest(interaction);
    return;
  }

  if (customId.startsWith('recipe_nutrition_')) {
    await interaction.reply({ content: '📊 栄養情報機能は今後実装予定です', ephemeral: true });
    return;
  }

  console.log(`⏭️ 未処理ボタン: ${customId}`);
}

  // 🔧 セレクトメニュー処理を統合
  async handleSelectMenu(interaction) {
  const { customId } = interaction;
  console.log(`🔍 セレクトメニュー処理: ${customId}`);

  // 🆕 統合レシピ詳細選択（新しいメニューハンドラー）
  if (customId === 'recipe_detail_select') {
    await this.handleUnifiedRecipeSelect(interaction);
    return;
  }

  // 拡張Claude レシピ選択
  if (customId === 'claude_recipe_select_enhanced') {
    await this.handleEnhancedClaudeRecipeSelect(interaction);
    return;
  }

  // Spoonacular レシピ選択
  if (customId === 'spoonacular_recipe_select') {
    await this.handleSpoonacularRecipeSelect(interaction);
    return;
  }

  // 従来のClaude レシピ選択
  if (customId === 'claude_recipe_select') {
    await this.handleClaudeRecipeSelect(interaction);
    return;
  }

  // 統合システムレシピ選択
  if (await handleRecipeSelectMenu(interaction, this.sheetsService)) {
    return;
  }

  console.log(`⏭️ 未処理メニュー: ${customId}`);
}

// 🆕 統合レシピ選択処理（新しいメソッドを追加）
async handleUnifiedRecipeSelect(interaction) {
  await interaction.deferReply();

  try {
    const selectedValue = interaction.values[0];
    console.log(`🔍 統合レシピ詳細選択: ${selectedValue}`);

    // 値の形式に基づいて処理を分岐
    if (selectedValue.startsWith('claude_')) {
      // Claude AIレシピの処理
      await this.handleClaudeRecipeFromUnified(interaction, selectedValue);
    } else {
      // Spoonacularレシピの処理
      await this.handleSpoonacularRecipeFromUnified(interaction, selectedValue);
    }

  } catch (error) {
    console.error('統合レシピ選択エラー:', error);
    await interaction.editReply('❌ レシピ詳細の取得中にエラーが発生しました。');
  }
}

  // 🔧 拡張Claudeセレクトメニュー処理
  async handleEnhancedClaudeRecipeSelect(interaction) {
    await interaction.deferReply();

    try {
      const selectedValue = interaction.values[0];
      console.log(`🧠✨ Claude AI拡張レシピ詳細表示: ${selectedValue}`);

      if (!this.claudeRecipeService) {
        await interaction.editReply('❌ Claude Recipe Serviceが利用できません。');
        return;
      }

      const detailedRecipe = await this.claudeRecipeService.getDetailedRecipe(selectedValue);
      
      if (!detailedRecipe) {
        await interaction.editReply('❌ レシピの詳細を取得できませんでした。キャッシュの有効期限が切れた可能性があります。');
        return;
      }

      const detailEmbed = this.createEnhancedClaudeRecipeEmbed(detailedRecipe);
      
      await interaction.editReply({ 
        content: `🍳 **${detailedRecipe.translatedTitle}の詳細レシピ**`,
        embeds: [detailEmbed] 
      });

    } catch (error) {
      console.error('Claude拡張レシピ詳細取得エラー:', error);
      await interaction.editReply(this.getClaudeErrorMessage(error));
    }
  }

// 既存のcreateSpoonacularRecipeEmbedメソッドを以下のように修正
createSpoonacularRecipeEmbed(recipe) {
  console.log('🔍 Embedレシピデータ検証:', Object.keys(recipe));
  
  const embed = new EmbedBuilder()
    .setTitle(`🍳 ${recipe.recipeTitle || recipe.translatedTitle || recipe.originalTitle || 'レシピ'}`)
    .setColor(0xFF6B35)
    .setTimestamp();

  // 画像URL検証
  if (recipe.foodImageUrl && recipe.foodImageUrl.startsWith('http')) {
    embed.setThumbnail(recipe.foodImageUrl);
  } else if (recipe.image && recipe.image.startsWith('http')) {
    embed.setThumbnail(recipe.image);
  }

  // 基本情報
  let basicInfo = [];
  if (recipe.recipeIndication) basicInfo.push(`⏱️ **調理時間**: ${recipe.recipeIndication}`);
  if (recipe.servings) basicInfo.push(`👥 **人数**: ${recipe.servings}人分`);
  if (recipe.difficulty) basicInfo.push(`📊 **難易度**: ${recipe.difficulty}`);
  if (recipe.likes) basicInfo.push(`👍 **人気度**: ${recipe.likes}いいね`);
  if (recipe.relevanceScore) basicInfo.push(`🎯 **適合度**: ${recipe.relevanceScore}%`);

  if (basicInfo.length > 0) {
    embed.addFields({
      name: '📋 基本情報',
      value: basicInfo.join('\n'),
      inline: false
    });
  }

  // 材料リスト
  let ingredients = [];
  if (recipe.recipeMaterial && Array.isArray(recipe.recipeMaterial)) {
    ingredients = recipe.recipeMaterial;
  } else if (recipe.translatedIngredients && Array.isArray(recipe.translatedIngredients)) {
    ingredients = recipe.translatedIngredients.map(ing => 
      typeof ing === 'string' ? ing : ing.name || ing.original || 'unknown'
    );
  } else if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
    ingredients = recipe.ingredients;
  }

  if (ingredients.length > 0) {
    const ingredientList = ingredients.slice(0, 15).map((ing, index) => {
      const ingredientName = typeof ing === 'string' ? ing : ing.name || ing.original || 'unknown';
      const amount = typeof ing === 'object' && ing.amount ? ` ${ing.amount}${ing.unit || ''}` : '';
      return `${index + 1}. **${ingredientName}**${amount}`;
    }).join('\n');

    const truncatedIngredients = ingredientList.length > 1024 ? 
      ingredientList.substring(0, 1021) + '...' : ingredientList;

    embed.addFields({
      name: '🥄 材料',
      value: truncatedIngredients || '材料情報が取得できませんでした',
      inline: false
    });
  }

  // 手順
  if (recipe.recipeDescription || recipe.translatedInstructions) {
    const instructions = recipe.recipeDescription || recipe.translatedInstructions;
    const truncatedInstructions = instructions.length > 1000 ? 
      instructions.substring(0, 997) + '...' : instructions;

    embed.addFields({
      name: '👨‍🍳 作り方',
      value: truncatedInstructions,
      inline: false
    });
  }

  // 概要
  if (recipe.translatedSummary && recipe.translatedSummary.trim().length > 0) {
    const summary = recipe.translatedSummary.length > 300 ? 
      recipe.translatedSummary.substring(0, 297) + '...' : 
      recipe.translatedSummary;

    embed.addFields({
      name: '📝 レシピについて',
      value: summary,
      inline: false
    });
  }

  // カテゴリ情報
  if (recipe.category) {
    embed.addFields({
      name: '🍽️ カテゴリ',
      value: recipe.category,
      inline: true
    });
  }

  // リンク情報
  const links = [];
  if (recipe.recipeUrl && recipe.recipeUrl !== 'https://spoonacular.com/' && !recipe.recipeUrl.includes('placeholder')) {
    links.push(`[📖 詳細レシピ](${recipe.recipeUrl})`);
  }
  if (recipe.sourceUrl && recipe.sourceUrl !== 'https://spoonacular.com/' && !recipe.sourceUrl.includes('spoonacular.com')) {
    links.push(`[🌐 元のレシピ（英語）](${recipe.sourceUrl})`);
  }

  if (links.length > 0) {
    embed.addFields({
      name: '🔗 詳細リンク',
      value: links.join('\n'),
      inline: false
    });
  }

  // 検索情報
  if (recipe.searchLayer) {
    embed.addFields({
      name: '🔍 検索情報',
      value: `検索層: ${recipe.searchLayer} | 優先度: ${recipe.priority || 'N/A'}`,
      inline: true
    });
  }

  embed.setFooter({
    text: `ID: ${recipe.recipeId || recipe.id || 'unknown'} | Spoonacular Recipe`
  });

  // 🆕 アクションボタンも含めて返す
  const actionRow = this.createRecipeDetailActionRow(recipe);
  
  return { 
    embed: embed, 
    actionRow: actionRow 
  };
}

// 🆕 新しいメソッドを追加（createSpoonacularRecipeEmbedメソッドの後に追加）
createRecipeDetailActionRow(recipe) {
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  
  const actionRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`full_translate_${recipe.recipeId || recipe.id}`)
        .setLabel('📖 全文翻訳')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`recipe_nutrition_${recipe.recipeId || recipe.id}`)
        .setLabel('📊 栄養情報')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true) // 今後実装予定
    );

  return actionRow;
}

  // 🔧 Spoonacularレシピ選択処理を修正（ephemeral削除）
  async handleSpoonacularRecipeSelect(interaction) {
    await interaction.deferReply();

    try {
      const selectedValue = interaction.values[0];
      console.log(`🔍 Spoonacularレシピ詳細取得: ${selectedValue}`);

      // 🔧 修正: レシピIDの抽出処理を改善
      let recipeId = selectedValue;
      
      // "spoon_"プレフィックスがある場合は除去
      if (recipeId.startsWith('spoon_')) {
        recipeId = recipeId.replace('spoon_', '');
      }
      
      // 数字以外が含まれている場合はエラー
      if (!/^\d+$/.test(recipeId)) {
        await interaction.editReply('❌ 無効なレシピIDです。');
        return;
      }

      // Spoonacularサービス確認
      if (!this.spoonacularService || typeof this.spoonacularService.getDetailedRecipe !== 'function') {
        await interaction.editReply('❌ Spoonacularサービスが利用できません。');
        return;
      }

      // 使用量チェック
      const usage = this.spoonacularService.getUsageReport();
      if (usage.spoonacular.remaining <= 0) {
        await interaction.editReply('❌ 本日のSpoonacular API使用量に達しました。明日再度お試しください。');
        return;
      }

      console.log(`🌐 Spoonacular API詳細取得開始: ID=${recipeId}`);
      const detailedRecipe = await this.spoonacularService.getDetailedRecipe(recipeId);
      
      if (!detailedRecipe) {
        await interaction.editReply('❌ レシピの詳細を取得できませんでした。');
        return;
      }

      // 詳細レシピをEmbedで表示
      const detailEmbed = this.createSpoonacularRecipeEmbed(detailedRecipe);
      
      const updatedUsage = this.spoonacularService.getUsageReport();
      const usageInfo = `📊 **API使用状況**: Spoonacular ${updatedUsage.spoonacular.used}/${updatedUsage.spoonacular.total}回使用`;
      
      await interaction.editReply({ 
        content: `🍳 **${detailedRecipe.translatedTitle || detailedRecipe.originalTitle}**\n${usageInfo}`,
        embeds: [detailEmbed] 
      });

    } catch (error) {
      console.error('Spoonacularレシピ詳細取得エラー:', error);
      await interaction.editReply(this.getSpoonacularErrorMessage(error));
    }
  }

// Claude AIレシピ処理（統合版から）
async handleClaudeRecipeFromUnified(interaction, selectedValue) {
  try {
    const recipeId = selectedValue.replace('claude_', '');
    console.log(`🧠 Claude AIレシピ詳細取得: ${recipeId}`);

    if (!this.claudeRecipeService) {
      await interaction.editReply('❌ Claude Recipe Serviceが利用できません。');
      return;
    }

    const detailedRecipe = await this.claudeRecipeService.getDetailedRecipe(recipeId);
    
    if (!detailedRecipe) {
      await interaction.editReply('❌ レシピの詳細を取得できませんでした。キャッシュの有効期限が切れた可能性があります。');
      return;
    }

    const detailEmbed = this.createEnhancedClaudeRecipeEmbed(detailedRecipe);
    
    await interaction.editReply({ 
      content: `🧠 **${detailedRecipe.translatedTitle || detailedRecipe.recipeTitle}**`,
      embeds: [detailEmbed] 
    });

  } catch (error) {
    console.error('Claude レシピ統合処理エラー:', error);
    await interaction.editReply(this.getClaudeErrorMessage(error));
  }
}

// 既存のhandleSpoonacularRecipeFromUnifiedメソッドを修正
async handleSpoonacularRecipeFromUnified(interaction, selectedValue) {
  try {
    let recipeId = selectedValue;
    
    // JSONパース試行
    try {
      const parsed = JSON.parse(selectedValue);
      if (parsed.id) {
        recipeId = parsed.id;
      }
    } catch (parseError) {
      // JSONでない場合は従来の処理
      if (recipeId.startsWith('spoon_')) {
        recipeId = recipeId.replace('spoon_', '');
      }
    }
    
    // 数字チェック強化
    if (!/^\d+$/.test(String(recipeId))) {
      console.error(`無効なレシピID: ${recipeId} (元の値: ${selectedValue})`);
      await interaction.editReply('❌ 無効なレシピIDです。再度レシピを選択してください。');
      return;
    }

    console.log(`🌐 Spoonacularレシピ詳細取得: ${recipeId}`);

    if (!this.spoonacularService || typeof this.spoonacularService.getDetailedRecipe !== 'function') {
      await interaction.editReply('❌ Spoonacularサービスが利用できません。');
      return;
    }

    // 使用量チェック
    const usage = this.spoonacularService.getUsageReport();
    if (usage.spoonacular.remaining <= 0) {
      await interaction.editReply('❌ 本日のSpoonacular API使用量に達しました。明日再度お試しください。');
      return;
    }

    const detailedRecipe = await this.spoonacularService.getDetailedRecipe(recipeId);
    
    if (!detailedRecipe) {
      await interaction.editReply('❌ レシピの詳細を取得できませんでした。別のレシピをお試しください。');
      return;
    }

    // 🔧 修正: Embedとボタンを両方取得
    const embedResult = this.createSpoonacularRecipeEmbed(detailedRecipe);
    
    const updatedUsage = this.spoonacularService.getUsageReport();
    const usageInfo = `📊 **API使用状況**: Spoonacular ${updatedUsage.spoonacular.used}/${updatedUsage.spoonacular.total}回使用`;
    
    const recipeTitle = detailedRecipe.recipeTitle || detailedRecipe.translatedTitle || detailedRecipe.originalTitle || 'レシピ';
    
    await interaction.editReply({ 
      content: `🍳 **${recipeTitle}**\n${usageInfo}`,
      embeds: [embedResult.embed],
      components: [embedResult.actionRow] // ボタンを追加
    });

  } catch (error) {
    console.error('Spoonacular レシピ統合処理エラー:', error);
    await interaction.editReply(this.getSpoonacularErrorMessage(error));
  }
}

  // 🔧 従来のClaude処理（下位互換性維持）
  async handleClaudeRecipeSelect(interaction) {
    await interaction.deferReply();

    try {
      const selectedValue = interaction.values[0];
      console.log(`🧠 Claude AIレシピ詳細表示（従来版）: ${selectedValue}`);

      const detailEmbed = new EmbedBuilder()
        .setTitle('🧠 Claude AIレシピ詳細')
        .setDescription('Claude AIが生成したレシピの詳細情報です。')
        .setColor(0x7C3AED)
        .addFields(
          { 
            name: '📝 レシピ情報', 
            value: `選択されたレシピ: ${selectedValue}\n\n⬆️ より詳細な情報は、拡張版の料理提案をご利用ください。`, 
            inline: false 
          },
          { 
            name: '🚀 拡張版のご案内', 
            value: '拡張版では以下の機能が利用できます：\n• 詳細な調理手順とコツ\n• アレンジ・バリエーション提案\n• 料理ジャンル・スタイル選択\n• 推定費用・栄養情報\n• 期限切れ食材の効果的活用', 
            inline: false 
          }
        );
      
      await interaction.editReply({ embeds: [detailEmbed] });

    } catch (error) {
      console.error('Claude レシピ詳細エラー:', error);
      await interaction.editReply('❌ レシピ詳細の表示中にエラーが発生しました。');
    }
  }

  // 🔧 スラッシュコマンド処理を整理
  async handleSlashCommand(interaction) {
    const command = this.commands.get(interaction.commandName);
    if (!command) return;

    try {
      const commandName = interaction.commandName;
      
      if (commandName === '料理提案統合版') {
        await this.handleIntegratedRecipeSuggest(interaction, command);
      } else if (commandName === '拡張料理提案') {
        await this.handleEnhancedRecipeSuggest(interaction, command);
      } else {
        await command.execute(interaction, this.sheetsService);
      }
      
    } catch (error) {
      console.error('Command execution error:', error);
      await this.sendErrorResponse(interaction, 'コマンド実行中にエラーが発生しました。');
    }
  }

  // 🔧 統合料理提案コマンド処理
  async handleIntegratedRecipeSuggest(interaction, command) {
  const source = interaction.options.getString('ソース') || 'spoonacular';
  const excludeIngredients = interaction.options.getString('除外食材');
  const priorityIngredients = interaction.options.getString('優先食材');
  
  console.log(`🍳 料理提案コマンド実行: ソース=${source}`);
  
  // 🆕 フィルタリングオプション構築
  const filterOptions = {};
  if (excludeIngredients) {
    filterOptions.excludeList = excludeIngredients.split(',').map(s => s.trim());
    console.log(`🚫 除外食材: ${filterOptions.excludeList.join(', ')}`);
  }
  if (priorityIngredients) {
    filterOptions.priorityList = priorityIngredients.split(',').map(s => s.trim());
    console.log(`🎯 優先食材: ${filterOptions.priorityList.join(', ')}`);
  }
  
  // 🔧 修正: フィルタリングオプションを各サービスに渡す
  if (source === 'claude_ai') {
    await command.execute(interaction, this.sheetsService, null, null, this.claudeRecipeService, filterOptions);
  } else if (source === 'spoonacular') {
    await command.execute(interaction, this.sheetsService, this.spoonacularService, null, null, filterOptions);
  } else if (source === 'all') {
    await command.execute(interaction, this.sheetsService, this.spoonacularService, null, this.claudeRecipeService, filterOptions);
  } else {
    await command.execute(interaction, this.sheetsService, null, null, null, filterOptions);
  }
}

// 🔧 修正: 従来のSpoonacularレシピ選択処理も更新
async handleSpoonacularRecipeSelect(interaction) {
  await interaction.deferReply();

  try {
    const selectedValue = interaction.values[0];
    console.log(`🔍 Spoonacularレシピ詳細取得: ${selectedValue}`);

    // 🔧 修正: レシピIDの抽出処理を改善
    let recipeId = selectedValue;
    
    // JSONパース試行（新しい形式対応）
    try {
      const parsed = JSON.parse(selectedValue);
      if (parsed.id) {
        recipeId = parsed.id;
      }
    } catch (parseError) {
      // JSONでない場合は従来の処理
      if (recipeId.startsWith('spoon_')) {
        recipeId = recipeId.replace('spoon_', '');
      }
    }
    
    // 数字以外が含まれている場合はエラー
    if (!/^\d+$/.test(String(recipeId))) {
      console.error(`無効なレシピID: ${recipeId} (元の値: ${selectedValue})`);
      await interaction.editReply('❌ 無効なレシピIDです。再度レシピを選択してください。');
      return;
    }

    // Spoonacularサービス確認
    if (!this.spoonacularService || typeof this.spoonacularService.getDetailedRecipe !== 'function') {
      await interaction.editReply('❌ Spoonacularサービスが利用できません。');
      return;
    }

    // 使用量チェック
    const usage = this.spoonacularService.getUsageReport();
    if (usage.spoonacular.remaining <= 0) {
      await interaction.editReply('❌ 本日のSpoonacular API使用量に達しました。明日再度お試しください。');
      return;
    }

    console.log(`🌐 Spoonacular API詳細取得開始: ID=${recipeId}`);
    const detailedRecipe = await this.spoonacularService.getDetailedRecipe(recipeId);
    
    if (!detailedRecipe) {
      await interaction.editReply('❌ レシピの詳細を取得できませんでした。別のレシピをお試しください。');
      return;
    }

    // 詳細レシピをEmbedで表示
    const detailEmbed = this.createSpoonacularRecipeEmbed(detailedRecipe);
    
    const updatedUsage = this.spoonacularService.getUsageReport();
    const usageInfo = `📊 **API使用状況**: Spoonacular ${updatedUsage.spoonacular.used}/${updatedUsage.spoonacular.total}回使用`;
    
    const recipeTitle = detailedRecipe.recipeTitle || detailedRecipe.translatedTitle || detailedRecipe.originalTitle || 'レシピ';
    
    await interaction.editReply({ 
      content: `🍳 **${recipeTitle}**\n${usageInfo}`,
      embeds: [detailEmbed] 
    });

  } catch (error) {
    console.error('Spoonacularレシピ詳細取得エラー:', error);
    await interaction.editReply(this.getSpoonacularErrorMessage(error));
  }
}

  // 🔧 エラーメッセージ統一
  getClaudeErrorMessage(error) {
    if (error.message.includes('見つかりません')) {
      return '❌ 指定されたレシピが見つかりませんでした。キャッシュの有効期限が切れた可能性があります。';
    } else if (error.message.includes('API制限')) {
      return '❌ Claude API使用量の制限に達しました。しばらく待ってから再度お試しください。';
    }
    return '❌ レシピ詳細の取得中にエラーが発生しました。';
  }

  getSpoonacularErrorMessage(error) {
  console.error('Spoonacularエラー詳細:', error);
  
  if (error.message.includes('見つかりませんでした') || error.message.includes('not found')) {
    return '❌ 指定されたレシピが見つかりませんでした。別のレシピをお試しください。';
  } else if (error.message.includes('API制限') || error.message.includes('rate limit')) {
    return '❌ API使用量の制限に達しました。しばらく待ってから再度お試しください。';
  } else if (error.message.includes('ネットワーク') || error.message.includes('timeout')) {
    return '❌ ネットワーク接続エラーです。しばらく待ってから再度お試しください。';
  } else if (error.message.includes('無効なレシピID')) {
    return '❌ 無効なレシピIDです。レシピリストから再度選択してください。';
  }
  return `❌ レシピ詳細の取得中にエラーが発生しました: ${error.message}`;
}

// 🆕 フィルタリング機能のテスト追加
async testSpoonacularFiltering() {
  if (!this.spoonacularService || typeof this.spoonacularService.improvedSearchWithFiltering !== 'function') {
    console.log('⚠️ Spoonacularフィルタリング機能が利用できません');
    return;
  }

  try {
    console.log('🧪 Spoonacularフィルタリングテスト開始');
    
    const testIngredients = [
      { name: 'キャベツ', currentAmount: 200, unit: 'g', daysLeft: 1 },
      { name: '夕食のあまり', currentAmount: 1, unit: 'パック', daysLeft: 5 },
      { name: '玉ねぎ', currentAmount: 3, unit: '個', daysLeft: 10 }
    ];

    const filterOptions = {
      excludeList: ['夕食のあまり', 'あまり'],
      priorityList: ['キャベツ'],
      maxIngredients: 2,
      daysLeftThreshold: 3
    };

    const results = await this.spoonacularService.improvedSearchWithFiltering(
      testIngredients,
      4,
      'japanese',
      filterOptions
    );

    console.log(`✅ フィルタリングテスト完了: ${results.length}件取得`);
    results.forEach(recipe => {
      console.log(`  - ${recipe.recipeTitle || recipe.translatedTitle} (適合度: ${recipe.relevanceScore}%)`);
    });

  } catch (error) {
    console.error('❌ フィルタリングテストエラー:', error);
  }
}

// index.js の handleFullTranslationRequest メソッドを修正

async handleFullTranslationRequest(interaction) {
  await interaction.deferReply();

  try {
    const recipeId = interaction.customId.replace('full_translate_', '');
    console.log(`📖 全文翻訳リクエスト: レシピID ${recipeId}`);

    if (!this.spoonacularService) {
      await interaction.editReply('❌ Spoonacularサービスが利用できません。');
      return;
    }

    // DeepL使用量チェック
    const usage = this.spoonacularService.getUsageReport();
    if (usage.deepl.remaining < 1000) {
      await interaction.editReply('❌ DeepL翻訳の月間使用量が不足しています。来月までお待ちください。');
      return;
    }

    console.log(`🌐 全文翻訳開始: レシピID ${recipeId}`);
    
    // 全文翻訳を取得
    const fullTranslation = await this.spoonacularService.getFullRecipeTranslation(recipeId);
    
    if (!fullTranslation) {
      await interaction.editReply('❌ 全文翻訳の取得に失敗しました。');
      return;
    }

    // 🔧 修正: 複数Embedに対応
    const fullTranslationEmbeds = this.createFullTranslationEmbed(fullTranslation);
    
    const updatedUsage = this.spoonacularService.getUsageReport();
    const usageInfo = `📊 **翻訳使用量**: DeepL ${updatedUsage.deepl.used}/${updatedUsage.deepl.total}字使用`;
    
    // 🔧 最初のEmbedだけでレスポンス
    await interaction.editReply({
      content: `📖 **${fullTranslation.recipeTitle}の全文翻訳**\n${usageInfo}`,
      embeds: [fullTranslationEmbeds[0]]
    });

    // 🔧 追加のEmbedがある場合は順次送信
    if (fullTranslationEmbeds.length > 1) {
      for (let i = 1; i < fullTranslationEmbeds.length; i++) {
        await interaction.followUp({
          embeds: [fullTranslationEmbeds[i]]
        });
        
        // 送信間隔を少し空ける
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

  } catch (error) {
    console.error('全文翻訳エラー:', error);
    await interaction.editReply('❌ 全文翻訳中にエラーが発生しました。');
  }
}

// index.js の createFullTranslationEmbed メソッドを修正

createFullTranslationEmbed(translation) {
  const embeds = [];
  
  // メインEmbed（概要と材料）
  const mainEmbed = new EmbedBuilder()
    .setTitle(`📖 ${translation.recipeTitle}（全文翻訳）`)
    .setColor(0x00D4AA)
    .setTimestamp();

  if (translation.image) {
    mainEmbed.setThumbnail(translation.image);
  }

  // About（概要）
  if (translation.translatedSummary) {
    const summary = translation.translatedSummary.length > 1024 ? 
      translation.translatedSummary.substring(0, 1021) + '...' : 
      translation.translatedSummary;
    
    mainEmbed.addFields({
      name: '📋 レシピについて',
      value: summary,
      inline: false
    });
  }

  // 🔧 改良: メタデータ表示
  if (translation.metadata) {
    let metaInfo = [];
    if (translation.cookingTime) metaInfo.push(`⏱️ ${translation.cookingTime}`);
    if (translation.servings) metaInfo.push(`👥 ${translation.servings}人分`);
    if (translation.difficulty) metaInfo.push(`📊 ${translation.difficulty}`);
    if (translation.metadata.totalSteps) metaInfo.push(`📋 ${translation.metadata.totalSteps}ステップ`);
    if (translation.metadata.totalIngredients) metaInfo.push(`🥄 ${translation.metadata.totalIngredients}種類の材料`);
    
    if (metaInfo.length > 0) {
      mainEmbed.addFields({
        name: '📊 詳細情報',
        value: metaInfo.join(' | '),
        inline: false
      });
    }
  }

  // Ingredients（材料）
  if (translation.detailedIngredients) {
    const ingredientChunks = this.splitTextIntoChunks(translation.detailedIngredients, 1024);
    
    ingredientChunks.forEach((chunk, index) => {
      mainEmbed.addFields({
        name: index === 0 ? '🥄 材料（詳細）' : `🥄 材料（続き${index + 1}）`,
        value: chunk,
        inline: false
      });
    });
  }

  embeds.push(mainEmbed);

  // 調理手順用のEmbed（複数に分割）
  if (translation.fullInstructions) {
    const instructionEmbeds = this.createInstructionEmbeds(
      translation.fullInstructions, 
      translation.recipeTitle,
      translation.metadata ? translation.metadata.totalSteps : null
    );
    embeds.push(...instructionEmbeds);
  }

  // 🆕 追加情報のEmbed
  if (translation.additionalInfo && Object.keys(translation.additionalInfo).length > 0) {
    const additionalEmbed = new EmbedBuilder()
      .setTitle(`💡 ${translation.recipeTitle} - 追加情報`)
      .setColor(0x00D4AA);

    if (translation.additionalInfo.tips) {
      additionalEmbed.addFields({
        name: '💡 料理のコツ',
        value: translation.additionalInfo.tips.length > 1024 ? 
          translation.additionalInfo.tips.substring(0, 1021) + '...' : 
          translation.additionalInfo.tips,
        inline: false
      });
    }

    if (translation.additionalInfo.winePairing) {
      additionalEmbed.addFields({
        name: '🍷 ワインペアリング',
        value: translation.additionalInfo.winePairing.length > 1024 ? 
          translation.additionalInfo.winePairing.substring(0, 1021) + '...' : 
          translation.additionalInfo.winePairing,
        inline: false
      });
    }

    embeds.push(additionalEmbed);
  }

  return embeds;
}

// 🆕 調理手順専用のEmbed作成
createInstructionEmbeds(instructions, recipeTitle) {
  const embeds = [];
  const instructionChunks = this.splitTextIntoChunks(instructions, 4000); // Embed全体の制限を考慮
  
  instructionChunks.forEach((chunk, embedIndex) => {
    const instructionEmbed = new EmbedBuilder()
      .setTitle(`👨‍🍳 ${recipeTitle} - 調理手順${embedIndex > 0 ? ` (${embedIndex + 1})` : ''}`)
      .setColor(0x00D4AA);

    // 各Embedの手順をさらに1024字以下のフィールドに分割
    const fieldChunks = this.splitTextIntoChunks(chunk, 1024);
    
    fieldChunks.forEach((fieldChunk, fieldIndex) => {
      instructionEmbed.addFields({
        name: fieldIndex === 0 && embedIndex === 0 ? '👨‍🍳 調理手順（詳細）' : `手順 (続き${fieldIndex + 1})`,
        value: fieldChunk,
        inline: false
      });
    });

    embeds.push(instructionEmbed);
  });

  return embeds;
}

// テキストを指定された長さに分割
// 🔧 splitTextIntoChunks メソッドを改良
splitTextIntoChunks(text, chunkSize) {
  if (text.length <= chunkSize) return [text];
  
  const chunks = [];
  let currentChunk = '';
  
  // 改行で分割を試行
  const lines = text.split('\n');
  
  for (const line of lines) {
    // 1行が制限を超える場合は文で分割
    if (line.length > chunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      
      const sentences = line.split(/(?<=[。．.!?])\s*/);
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length <= chunkSize) {
          currentChunk += sentence;
        } else {
          if (currentChunk) chunks.push(currentChunk);
          currentChunk = sentence;
        }
      }
    } else {
      // 行の長さが制限以下の場合
      if (currentChunk.length + line.length + 1 <= chunkSize) {
        currentChunk += (currentChunk ? '\n' : '') + line;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = line;
      }
    }
  }
  
  if (currentChunk) chunks.push(currentChunk);
  
  return chunks;
}

  async sendErrorResponse(interaction, message) {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, ephemeral: true });
    } else {
      await interaction.reply({ content: message, ephemeral: true });
    }
  }

  // 🔧 APIテストを統合
  // index.js の runAPITests メソッドを以下のように修正
async runAPITests() {
  console.log('🔍 API テスト開始...');
  
  // 🚫 すべてのAPIテストを無効化
  console.log('⚠️ APIテストは手動実行のみに変更されました');
  console.log('💡 手動テストコマンド: /api-test (今後実装予定)');
  
  return; // 早期リターンでテストをスキップ
}
  // 統合システム初期化
  // index.js の initializeIntegratedSystem メソッドを修正
async initializeIntegratedSystem() {
  try {
    await this.sheetsService.ensureIntegratedRecipeSheets();
    console.log('✅ Integrated recipe system initialized');
    
    // 🚫 フィルタリングテストを無効化
    // setTimeout(() => {
    //   this.testSpoonacularFiltering();
    // }, 5000);
    
    console.log('💡 自動テストは無効化されました（API使用量節約のため）');
    
  } catch (error) {
    console.error('❌ Failed to initialize integrated system:', error);
  }
}

  // オートコンプリート処理
  async handleAutocomplete(interaction) {
    try {
      const commandName = interaction.commandName;
      const focusedValue = interaction.options.getFocused().toLowerCase();

      let filtered = [];

      if (commandName === '料理実行') {
        const recipes = await this.sheetsService.getIntegratedRecipes();
        filtered = recipes
          .filter(recipe => recipe.recipeName.toLowerCase().includes(focusedValue))
          .slice(0, 25)
          .map(recipe => ({
            name: `${recipe.recipeName} (${recipe.category})`,
            value: recipe.recipeName
          }));
      } else {
        const inventory = await this.sheetsService.getInventoryData();

        switch (commandName) {
          case '食材開封':
            filtered = inventory
              .filter(item => 
                item.name.toLowerCase().includes(focusedValue) &&
                item.openStatus === '未開封' &&
                item.currentAmount > 0
              )
              .slice(0, 25)
              .map(item => ({
                name: `${item.name} (${item.openStatus} - ${item.currentAmount}${item.unit})`,
                value: item.name
              }));
            break;

          case '食材編集':
            filtered = inventory
              .filter(item => 
                item.name.toLowerCase().includes(focusedValue) &&
                item.currentAmount > 0
              )
              .slice(0, 25)
              .map(item => ({
                name: `${item.name} (${item.currentAmount}${item.unit} - ${item.storageLocation})`,
                value: item.name
              }));
            break;

          case '食材廃棄':
            filtered = inventory
              .filter(item => 
                item.name.toLowerCase().includes(focusedValue)
              )
              .slice(0, 25)
              .map(item => {
                const daysLeft = this.calculateDaysLeft(item.expiryDate);
                const status = daysLeft < 0 ? '期限切れ' : daysLeft <= 3 ? '期限間近' : '正常';
                return {
                  name: `${item.name} (${item.currentAmount}${item.unit} - ${status})`,
                  value: item.name
                };
              });
            break;

          default:
            filtered = inventory
              .filter(item => 
                item.name.toLowerCase().includes(focusedValue) &&
                item.currentAmount > 0
              )
              .slice(0, 25)
              .map(item => ({
                name: `${item.name} (${item.currentAmount}${item.unit})`,
                value: item.name
              }));
        }
      }

      await interaction.respond(filtered);
    } catch (error) {
      console.error('Autocomplete error:', error);
      await interaction.respond([]);
    }
  }

  // スラッシュコマンド登録
  async registerSlashCommands() {
    const commands = Array.from(this.commands.values()).map(command => command.data.toJSON());
    
    const rest = new REST().setToken(config.discord.token);
    
    try {
      console.log(`🔄 Registering ${commands.length} slash commands...`);
      
      await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
        { body: commands }
      );
      
      console.log('✅ Slash commands registered successfully');
    } catch (error) {
      console.error('❌ Failed to register slash commands:', error);
    }
  }

  // 定期通知設定
  setupScheduledNotifications() {
    // 毎日18:00に期限通知
    cron.schedule('0 18 * * *', async () => {
      await this.sendExpiryNotification();
    });

    // 土曜日9:00に買い物提案
    cron.schedule('0 9 * * 6', async () => {
      await this.sendShoppingNotification();
    });

    // 毎日21:00に廃棄アラート
    cron.schedule('0 21 * * *', async () => {
      await this.sendDiscardAlert();
    });

    // 月初1日 10:00に月間レポート自動送信
    cron.schedule('0 10 1 * *', async () => {
      await this.sendMonthlyReportNotification();
    });

    // 毎週日曜日 20:00に料理提案
    cron.schedule('0 20 * * 0', async () => {
      await this.sendWeeklyRecipeSuggestionsSpoonacular();
    });

    // 毎月15日 19:00に問題食材分析
    cron.schedule('0 19 15 * *', async () => {
      await this.sendProblemIngredientsAnalysis();
    });

    // API制限リセット
    cron.schedule('0 0 * * *', async () => {
      if (this.spoonacularService) this.spoonacularService.resetDailyLimits();
      if (this.claudeRecipeService) this.claudeRecipeService.resetDailyLimits();
    });

    cron.schedule('0 0 1 * *', async () => {
      if (this.spoonacularService) this.spoonacularService.resetMonthlyLimits();
    });

    console.log('📅 All scheduled notifications set up');
  }

  // 通知メソッド群（簡略化）
  async sendExpiryNotification() {
    try {
      const inventory = await this.sheetsService.getInventoryData();
      const today = new Date();
      const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      const expiringItems = inventory.filter(item => {
        const expiryDate = new Date(item.expiryDate);
        return expiryDate <= threeDaysLater && expiryDate >= today && item.currentAmount > 0;
      });

      if (expiringItems.length === 0) return;

      const channel = await this.client.channels.fetch(config.notifications.channelId);
      const itemList = expiringItems.map(item => {
        const daysLeft = this.calculateDaysLeft(item.expiryDate);
        const urgency = daysLeft <= 1 ? '🔴' : daysLeft <= 2 ? '🟡' : '🟢';
        return `${urgency} **${item.name}**: ${item.expiryDate}まで (${item.currentAmount}${item.unit})`;
      }).join('\n');

      await channel.send(`🔔 **期限が近い食材があります！**\n\n${itemList}\n\n\`/拡張料理提案\` で作れる料理を確認！`);
    } catch (error) {
      console.error('期限通知エラー:', error);
    }
  }

  async sendShoppingNotification() {
    try {
      const inventory = await this.sheetsService.getInventoryData();
      const riceData = await this.sheetsService.getRiceData();

      const stockPredictions = await this.analysisService.predictStockOut(7);
      const lowStockItems = inventory.filter(item => 
        item.currentAmount <= item.notificationThreshold && item.currentAmount > 0
      );

      const shoppingList = [];
      
      if (riceData.currentAmount <= riceData.notificationThreshold) {
        shoppingList.push('🍚 米 (残り少なくなっています)');
      }

      lowStockItems.forEach(item => {
        const emoji = this.getCategoryEmoji(item.category);
        shoppingList.push(`${emoji} ${item.name} (残り${item.currentAmount}${item.unit})`);
      });

      if (shoppingList.length === 0) {
        const channel = await this.client.channels.fetch(config.notifications.channelId);
        await channel.send('✅ **今週の買い物**\n\n在庫は十分にあります！');
        return;
      }

      const channel = await this.client.channels.fetch(config.notifications.channelId);
      await channel.send(`🛒 **今週の買い物リスト**\n\n${shoppingList.join('\n')}\n\n購入後は \`/食材追加\` で在庫を更新してくださいね。`);
    } catch (error) {
      console.error('買い物通知エラー:', error);
    }
  }

  async sendDiscardAlert() {
    try {
      const inventory = await this.sheetsService.getInventoryData();
      const today = new Date();

      const expiredItems = inventory.filter(item => {
        const expiryDate = new Date(item.expiryDate);
        const daysOverdue = Math.floor((today.getTime() - expiryDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysOverdue >= 3 && item.currentAmount > 0;
      });

      if (expiredItems.length === 0) return;

      const channel = await this.client.channels.fetch(config.notifications.channelId);
      const itemList = expiredItems.map(item => {
        const expiryDate = new Date(item.expiryDate);
        const daysOverdue = Math.floor((today.getTime() - expiryDate.getTime()) / (1000 * 60 * 60 * 24));
        return `🗑️ **${item.name}**: 期限切れから${daysOverdue}日経過 (${item.currentAmount}${item.unit})`;
      }).join('\n');

      await channel.send(`⚠️ **廃棄を検討してください**\n\n${itemList}\n\n\`/食材廃棄\` で記録をお願いします。`);
    } catch (error) {
      console.error('廃棄アラートエラー:', error);
    }
  }

  async sendMonthlyReportNotification() {
    try {
      const channel = await this.client.channels.fetch(config.notifications.channelId);
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      
      const year = lastMonth.getFullYear();
      const month = lastMonth.getMonth() + 1;

      const report = await this.analysisService.generateMonthlyReport(year, month);
      
      if (!report || report.summary.totalRecords === 0) {
        await channel.send(`📊 ${year}年${month}月の月間レポート\n\nデータが不足しているため、レポートを生成できませんでした。`);
        return;
      }

      const wasteEmoji = report.summary.wastePercentage <= 10 ? '🟢' : 
                        report.summary.wastePercentage <= 20 ? '🟡' : '🔴';

      await channel.send(`📊 **${year}年${month}月 月間レポート**\n\n${wasteEmoji} 廃棄率: **${report.summary.wastePercentage}%**\n📈 料理記録: **${report.summary.cookingRecords}件**\n\n詳細は \`/月間レポート\` で確認できます！`);
    } catch (error) {
      console.error('月間レポート通知エラー:', error);
    }
  }

  async sendProblemIngredientsAnalysis() {
    try {
      const problemIngredients = await this.analysisService.identifyProblemIngredients();
      
      if (problemIngredients.length === 0) return;

      const channel = await this.client.channels.fetch(config.notifications.channelId);
      const topProblems = problemIngredients.slice(0, 3).map((item, index) => 
        `${index + 1}. **${item.ingredient}** (廃棄率${item.wasteRatio}%)`
      ).join('\n');

      await channel.send(`🔍 **月間問題食材分析**\n\nよく余らせがちな食材：\n\n${topProblems}\n\n詳細は \`/問題食材\` で確認できます！`);
    } catch (error) {
      console.error('問題食材分析通知エラー:', error);
    }
  }

  async sendWeeklyRecipeSuggestionsSpoonacular() {
    try {
      const inventory = await this.sheetsService.getInventoryData();
      const expiringItems = inventory.filter(item => {
        const expiryDate = new Date(item.expiryDate);
        const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        return expiryDate <= threeDaysLater && item.currentAmount > 0;
      });

      let message = `🍳 **今週のおすすめ料理**\n\n`;

      const targetIngredients = expiringItems.length > 0 ? 
        expiringItems.slice(0, 2).map(item => item.name) :
        inventory.filter(item => item.currentAmount > 0)
          .slice(0, 2).map(item => item.name);

      const allRecipes = [];
      
      if (this.spoonacularService && typeof this.spoonacularService.improvedSearch === 'function') {
        for (const ingredient of targetIngredients) {
          try {
            const recipes = await this.spoonacularService.improvedSearch(ingredient, 2);
            allRecipes.push(...recipes);
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            console.error(`Spoonacular検索エラー (${ingredient}):`, error.message);
          }
        }
      }

      if (allRecipes.length > 0) {
        message += `**🌟 AI厳選レシピ:**\n`;
        allRecipes.slice(0, 4).forEach((recipe, index) => {
          message += `${index + 1}. [${recipe.recipeTitle}](${recipe.recipeUrl}) (適合度:${recipe.relevanceScore}%)\n`;
        });
        message += '\n';
      }

      message += `💡 **使い方:**\n\`/拡張料理提案\` で詳細なレシピ提案を取得できます！`;

      const channel = await this.client.channels.fetch(config.notifications.channelId);
      await channel.send(message);

    } catch (error) {
      console.error('週間提案エラー:', error);
    }
  }

  // ユーティリティ関数
  calculateDaysLeft(expiryDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const expiryDate = new Date(expiryDateStr);
    expiryDate.setHours(0, 0, 0, 0);
    
    const diffTime = expiryDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  getCategoryEmoji(category) {
    const emojiMap = {
      '野菜': '🥬',
      '肉類': '🥩', 
      '魚介類': '🐟',
      '乳製品': '🥛',
      '調味料': '🧂',
      '冷凍食品': '🧊',
      'パン類': '🍞',
      '麺類': '🍜',
      'お菓子': '🍪',
      '飲み物': '🥤',
      'その他': '📦'
    };
    return emojiMap[category] || '📦';
  }

  async start() {
    await this.client.login(config.discord.token);
  }
}

// Bot起動
const bot = new FridgeBot();
bot.start().then(() => {
  console.log('🚀 FridgeBot with Enhanced Recipe System activated!');
  console.log('');
  console.log('🧠✨ ENHANCED FEATURES:');
  console.log('   • 🔧 整理されたコード構造とエラーハンドリング');
  console.log('   • 🔍 修正されたSpoonacularレシピ選択処理');
  console.log('   • 🎯 統合されたインタラクション処理');
  console.log('   • 📊 改善されたAPI使用量管理');
  console.log('   • ⚡ 最適化された初期化プロセス');
  console.log('');
  console.log('✅ Ready for enhanced cooking assistance!');
}).catch(console.error);
