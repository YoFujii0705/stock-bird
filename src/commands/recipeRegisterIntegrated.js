// src/commands/recipeRegisterIntegrated.js - デバッグ版
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('料理登録')
    .setDescription('料理を登録します（レシピ・テンプレート統合版）')
    .addStringOption(option =>
      option.setName('料理名')
        .setDescription('料理の名前')
        .setRequired(true)
        .setMaxLength(50))
    .addStringOption(option =>
      option.setName('カテゴリ')
        .setDescription('料理のカテゴリ')
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
    .addIntegerOption(option =>
      option.setName('調理時間')
        .setDescription('調理時間（分）')
        .setRequired(false)
        .setMinValue(5)
        .setMaxValue(180))
    .addStringOption(option =>
      option.setName('難易度')
        .setDescription('料理の難易度')
        .setRequired(false)
        .addChoices(
          { name: '簡単', value: '簡単' },
          { name: '普通', value: '普通' },
          { name: '難しい', value: '難しい' }
        ))
    .addStringOption(option =>
      option.setName('メモ')
        .setDescription('コツや特徴など')
        .setRequired(false)
        .setMaxLength(100)),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const recipeName = interaction.options.getString('料理名');
      const category = interaction.options.getString('カテゴリ') || 'おかず';
      const cookingTime = interaction.options.getInteger('調理時間') || 30;
      const difficulty = interaction.options.getString('難易度') || '普通';
      const memo = interaction.options.getString('メモ') || '';

      console.log(`🍳 料理登録開始: ${recipeName}, ユーザー: ${interaction.user.id}`);

      // 統合シートの初期化
      await sheetsService.ensureIntegratedRecipeSheets();

      // 重複チェック
      const existingRecipes = await sheetsService.getIntegratedRecipes({ name: recipeName });
      if (existingRecipes.length > 0) {
        await interaction.editReply(`❌ 「${recipeName}」は既に登録されています。別の名前を使用してください。`);
        return;
      }

      // 材料入力のための初期Embed
      const initialEmbed = new EmbedBuilder()
        .setTitle('🍳 料理登録 - 材料入力')
        .setDescription(`**${recipeName}** の材料を入力してください`)
        .setColor(0x00AE86)
        .addFields(
          { name: '📋 基本情報', value: `**カテゴリ**: ${category}\n**調理時間**: ${cookingTime}分\n**難易度**: ${difficulty}`, inline: false },
          { name: '🥬 材料入力方法', value: '下のボタンから材料を追加してください\n• **在庫管理対象**: 実際に在庫から消費される材料\n• **非対象**: レシピ表示のみ（調味料・水など）\n• **複数の材料を順番に追加可能**', inline: false }
        );

      if (memo) {
        initialEmbed.addFields({ name: '📝 メモ', value: memo, inline: false });
      }

      // シンプルなカスタムIDを使用
      const selectMenuId = `recipe_menu_${interaction.user.id}`;
      const row = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(selectMenuId)
            .setPlaceholder('材料を追加...')
            .addOptions([
              {
                label: '在庫管理対象の材料を追加',
                description: '実際に在庫から消費される材料（キャベツ、豚肉など）',
                value: 'stock_ingredient'
              },
              {
                label: '非対象材料を追加',
                description: 'レシピ表示のみ（塩、油、水など）',
                value: 'non_stock_ingredient'
              },
              {
                label: '登録完了',
                description: '材料入力を完了して料理を登録',
                value: 'complete_registration'
              }
            ])
        );

      // セッションデータの初期化（シンプル版）
      if (!global.tempRecipeData) {
        global.tempRecipeData = {};
      }
      
      const sessionKey = interaction.user.id;
      global.tempRecipeData[sessionKey] = {
        recipeName,
        category,
        cookingTime,
        difficulty,
        memo,
        ingredients: [],
        registeredBy: interaction.user.username,
        interactionId: interaction.id
      };

      console.log(`📝 セッション作成: ${sessionKey}`, global.tempRecipeData[sessionKey]);

      await interaction.editReply({ 
        embeds: [initialEmbed], 
        components: [row] 
      });

    } catch (error) {
      console.error('料理登録エラー:', error);
      await interaction.editReply(`❌ 料理登録中にエラーが発生しました: ${error.message}`);
    }
  },

  // 材料追加のモーダル表示
  async handleIngredientAdd(interaction, type) {
    console.log(`🔧 材料追加モーダル表示: ${type}, ユーザー: ${interaction.user.id}`);
    
    const isStockIngredient = type === 'stock_ingredient';
    
    // カスタムIDを修正：アンダースコアの問題を回避
    const modalId = `ingredient-modal-${type}-${interaction.user.id}`;
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle(isStockIngredient ? '在庫管理対象材料を追加' : '非対象材料を追加');

    const nameInput = new TextInputBuilder()
      .setCustomId('ingredient_name')
      .setLabel('材料名')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(isStockIngredient ? 'キャベツ、豚肉、米など' : '塩、胡椒、サラダ油など')
      .setRequired(true)
      .setMaxLength(20);

    const amountInput = new TextInputBuilder()
      .setCustomId('ingredient_amount')
      .setLabel(isStockIngredient ? '使用量（数値のみ）' : '使用量（表示用）')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(isStockIngredient ? '0.5, 200, 3など' : '少々、適量、大さじ1など')
      .setRequired(true);

    const unitInput = new TextInputBuilder()
      .setCustomId('ingredient_unit')
      .setLabel('単位')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(isStockIngredient ? '個, g, 本, 玉など' : '空欄でもOK')
      .setRequired(isStockIngredient);

    const requiredInput = new TextInputBuilder()
      .setCustomId('ingredient_required')
      .setLabel('必須度（必須 or 任意）')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('必須')
      .setValue('必須')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(amountInput),
      new ActionRowBuilder().addComponents(unitInput),
      new ActionRowBuilder().addComponents(requiredInput)
    );

    await interaction.showModal(modal);
  },

  // モーダル送信の処理
  async handleIngredientModal(interaction, type) {
    console.log(`📝 モーダル送信処理: ${type}, ユーザー: ${interaction.user.id}`);
    
    const isStockIngredient = type === 'stock_ingredient';
    
    const ingredientName = interaction.fields.getTextInputValue('ingredient_name');
    const amountInput = interaction.fields.getTextInputValue('ingredient_amount');
    const unit = interaction.fields.getTextInputValue('ingredient_unit') || '';
    const required = interaction.fields.getTextInputValue('ingredient_required') || '必須';

    // 在庫管理対象の場合は数値チェック
    let amount = amountInput;
    if (isStockIngredient) {
      const numAmount = parseFloat(amountInput);
      if (isNaN(numAmount) || numAmount <= 0) {
        await interaction.reply({ 
          content: '❌ 在庫管理対象の材料は数値で使用量を入力してください（例: 0.5, 200, 3）', 
          ephemeral: true 
        });
        return;
      }
      amount = numAmount;
    }

    // セッションデータを取得（シンプル版）
    const userId = interaction.user.id;
    const userData = global.tempRecipeData[userId];

    if (!userData) {
      console.log(`❌ セッションデータが見つからない: ${userId}`);
      await interaction.reply({ 
        content: '❌ セッションが切れました。最初からやり直してください。', 
        ephemeral: true 
      });
      return;
    }

    console.log(`📋 セッションデータ取得成功:`, userData);

    // 重複材料チェック
    const existingIngredient = userData.ingredients.find(ing => ing.name === ingredientName);
    if (existingIngredient) {
      await interaction.reply({ 
        content: `❌ 「${ingredientName}」は既に追加されています。別の材料を追加してください。`, 
        ephemeral: true 
      });
      return;
    }

    // 材料を追加
    userData.ingredients.push({
      name: ingredientName,
      amount: amount,
      unit: unit,
      type: isStockIngredient ? '在庫管理対象' : '非対象',
      required: required
    });

    console.log(`✅ 材料追加: ${ingredientName}`, userData.ingredients);

    // 更新されたEmbedを表示
    await this.updateRecipePreview(interaction, userData);
  },

  // 料理登録プレビューの更新
  async updateRecipePreview(interaction, userData) {
    const embed = new EmbedBuilder()
      .setTitle('🍳 料理登録 - 材料確認')
      .setDescription(`**${userData.recipeName}** の材料一覧`)
      .setColor(0x00AE86)
      .addFields(
        { name: '📋 基本情報', value: `**カテゴリ**: ${userData.category}\n**調理時間**: ${userData.cookingTime}分\n**難易度**: ${userData.difficulty}`, inline: false }
      );

    if (userData.memo) {
      embed.addFields({ name: '📝 メモ', value: userData.memo, inline: false });
    }

    // 在庫管理対象の材料
    const stockIngredients = userData.ingredients.filter(ing => ing.type === '在庫管理対象');
    if (stockIngredients.length > 0) {
      const stockList = stockIngredients.map((ing, index) => 
        `${index + 1}. **${ing.name}**: ${ing.amount}${ing.unit} (${ing.required})`
      ).join('\n');
      embed.addFields({ name: '🥬 在庫管理対象材料', value: stockList, inline: false });
    }

    // 非対象材料
    const nonStockIngredients = userData.ingredients.filter(ing => ing.type === '非対象');
    if (nonStockIngredients.length > 0) {
      const nonStockList = nonStockIngredients.map((ing, index) => 
        `${index + 1}. **${ing.name}**: ${ing.amount}${ing.unit} (${ing.required})`
      ).join('\n');
      embed.addFields({ name: '🧂 その他材料', value: nonStockList, inline: false });
    }

    embed.addFields({ 
      name: '💡 次のステップ', 
      value: `登録済み材料: ${userData.ingredients.length}個\n材料を追加するか、「登録完了」を選択してください`, 
      inline: false 
    });

    // 同じカスタムIDを再利用
    const selectMenuId = `recipe_menu_${interaction.user.id}`;
    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(selectMenuId)
          .setPlaceholder('材料を追加または登録完了...')
          .addOptions([
            {
              label: '在庫管理対象の材料を追加',
              description: '実際に在庫から消費される材料',
              value: 'stock_ingredient'
            },
            {
              label: '非対象材料を追加',
              description: 'レシピ表示のみ（調味料など）',
              value: 'non_stock_ingredient'
            },
            {
              label: '登録完了',
              description: '材料入力を完了して料理を登録',
              value: 'complete_registration'
            }
          ])
      );

    await interaction.update({ 
      embeds: [embed], 
      components: [row] 
    });
  },

  // 料理登録完了処理
  async completeRegistration(interaction, sheetsService) {
    console.log(`✅ 料理登録完了開始: ユーザー ${interaction.user.id}`);
    
    const userId = interaction.user.id;
    const userData = global.tempRecipeData[userId];

    if (!userData) {
      console.log(`❌ 登録完了時セッションデータなし: ${userId}`);
      try {
        await interaction.update({ 
          content: '❌ セッションが切れました。最初からやり直してください。', 
          embeds: [], 
          components: [] 
        });
      } catch (error) {
        console.log(`⚠️ インタラクション更新失敗、followUpで送信: ${error.message}`);
        await interaction.followUp({ 
          content: '❌ セッションが切れました。最初からやり直してください。', 
          ephemeral: true 
        });
      }
      return;
    }

    if (userData.ingredients.length === 0) {
      try {
        await interaction.update({ 
          content: '❌ 少なくとも1つの材料を追加してください。', 
          embeds: [], 
          components: [] 
        });
      } catch (error) {
        console.log(`⚠️ インタラクション更新失敗、followUpで送信: ${error.message}`);
        await interaction.followUp({ 
          content: '❌ 少なくとも1つの材料を追加してください。', 
          ephemeral: true 
        });
      }
      return;
    }

    try {
      console.log(`🔧 統合レシピ登録実行:`, userData);
      
      // 統合レシピ登録実行
      const result = await sheetsService.registerIntegratedRecipe(userData);

      // 成功レスポンス
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ 料理登録完了')
        .setDescription(`**${result.recipeName}** を統合シートに登録しました！`)
        .setColor(0x00AE86)
        .setTimestamp();

      // 基本情報
      successEmbed.addFields(
        { name: '🍳 料理名', value: result.recipeName, inline: true },
        { name: '📂 カテゴリ', value: result.category, inline: true },
        { name: '⏱️ 調理時間', value: `${result.cookingTime}分`, inline: true },
        { name: '📊 難易度', value: result.difficulty, inline: true },
        { name: '👤 登録者', value: result.registeredBy, inline: true },
        { name: '🆔 料理ID', value: result.recipeId, inline: true }
      );

      if (result.memo) {
        successEmbed.addFields({ name: '📝 メモ', value: result.memo, inline: false });
      }

      // 在庫管理対象材料
      const stockIngredients = result.ingredients.filter(ing => ing.type === '在庫管理対象');
      if (stockIngredients.length > 0) {
        const stockList = stockIngredients.map(ing => 
          `• **${ing.name}**: ${ing.amount}${ing.unit}`
        ).join('\n');
        successEmbed.addFields({ name: '🥬 在庫管理対象材料', value: stockList, inline: false });
      }

      // その他材料
      const nonStockIngredients = result.ingredients.filter(ing => ing.type === '非対象');
      if (nonStockIngredients.length > 0) {
        const nonStockList = nonStockIngredients.map(ing => 
          `• **${ing.name}**: ${ing.amount}${ing.unit}`
        ).join('\n');
        successEmbed.addFields({ name: '🧂 その他材料', value: nonStockList, inline: false });
      }

      // 使用方法のヒント
      successEmbed.addFields({
        name: '💡 使用方法',
        value: [
          '• `/料理実行 料理名:' + result.recipeName + '` で材料を消費',
          '• `/料理一覧` で登録済み料理を確認',
          '• `/料理提案` で作れる料理を確認'
        ].join('\n'),
        inline: false
      });

      // セッションデータをクリア
      delete global.tempRecipeData[userId];
      console.log(`🧹 セッションクリア: ${userId}`);

      // インタラクション更新を試行、失敗した場合は新しいメッセージで送信
      try {
        await interaction.update({ 
          embeds: [successEmbed], 
          components: [] 
        });
        console.log(`✅ 料理登録完了メッセージ送信成功（update）`);
      } catch (updateError) {
        console.log(`⚠️ インタラクション更新失敗、新しいメッセージで送信: ${updateError.message}`);
        
        // 新しいメッセージとして送信（最も確実な方法）
        try {
          const channel = interaction.channel;
          await channel.send({ 
            content: `<@${interaction.user.id}> `,
            embeds: [successEmbed]
          });
          console.log(`✅ 料理登録完了メッセージ送信成功（新しいメッセージ）`);
          
          // 元のメッセージを簡潔に更新
          try {
            await interaction.message.edit({
              content: `✅ **${result.recipeName}** の登録処理が完了しました。`,
              embeds: [],
              components: []
            });
          } catch (editError) {
            console.log(`⚠️ 元メッセージ編集失敗: ${editError.message}`);
          }
          
        } catch (sendError) {
          console.error(`❌ 新しいメッセージ送信も失敗:`, sendError);
          
          // 最後の手段：コンソールログで確認
          console.log(`✅ データ保存完了: ${result.recipeName} (ID: ${result.recipeId})`);
          console.log(`📊 在庫管理対象材料: ${stockIngredients.length}個`);
          console.log(`🧂 その他材料: ${nonStockIngredients.length}個`);
        }
      }

    } catch (error) {
      console.error('料理登録完了エラー:', error);
      
      try {
        await interaction.update({ 
          content: `❌ 料理登録に失敗しました: ${error.message}`, 
          embeds: [], 
          components: [] 
        });
      } catch (updateError) {
        console.log(`⚠️ エラーメッセージ更新失敗、followUpで送信: ${updateError.message}`);
        await interaction.followUp({ 
          content: `❌ 料理登録に失敗しました: ${error.message}`, 
          ephemeral: true 
        });
      }
    }
  }
};

// ==============================
// インタラクション処理用のヘルパー関数（デバッグ版）
// ==============================

// 選択メニューの処理（デバッグ版）
async function handleRecipeSelectMenu(interaction, sheetsService) {
  console.log(`🔍 選択メニュー処理開始: customId="${interaction.customId}", ユーザー=${interaction.user.id}`);
  
  if (!interaction.customId.startsWith('recipe_menu_')) {
    console.log(`⏭️ 関係ないメニュー: ${interaction.customId}`);
    return false;
  }

  // カスタムIDからユーザーIDを抽出
  const parts = interaction.customId.split('_');
  console.log(`🔧 customId分解:`, parts);
  
  if (parts.length < 3) {
    console.log(`❌ customId形式が正しくない: ${interaction.customId}`);
    return false;
  }

  const customIdUserId = parts[2];
  console.log(`👤 customIdから抽出されたユーザーID: "${customIdUserId}"`);
  console.log(`👤 実際のユーザーID: "${interaction.user.id}"`);

  if (customIdUserId !== interaction.user.id) {
    console.log(`❌ ユーザーID不一致: customId="${customIdUserId}" vs actual="${interaction.user.id}"`);
    await interaction.reply({ content: '❌ 他のユーザーの操作です。', ephemeral: true });
    return true;
  }

  // セッション確認
  const userData = global.tempRecipeData[interaction.user.id];
  if (!userData) {
    console.log(`❌ セッションデータなし: ${interaction.user.id}`);
    await interaction.reply({ content: '❌ セッションが切れました。最初からやり直してください。', ephemeral: true });
    return true;
  }

  console.log(`✅ セッション確認OK`, userData);

  const value = interaction.values[0];
  console.log(`🎯 選択された値: ${value}`);
  
  const recipeRegisterCommand = require('./recipeRegisterIntegrated');

  try {
    switch (value) {
      case 'stock_ingredient':
      case 'non_stock_ingredient':
        await recipeRegisterCommand.handleIngredientAdd(interaction, value);
        break;
      case 'complete_registration':
        await recipeRegisterCommand.completeRegistration(interaction, sheetsService);
        break;
    }
  } catch (error) {
    console.error(`❌ 選択メニュー処理エラー:`, error);
  }
  
  return true;
}

// モーダル送信の処理（デバッグ版）
async function handleRecipeModal(interaction, sheetsService) {
  console.log(`🔍 モーダル処理開始: customId="${interaction.customId}", ユーザー=${interaction.user.id}`);
  
  if (!interaction.customId.startsWith('ingredient-modal-')) {
    console.log(`⏭️ 関係ないモーダル: ${interaction.customId}`);
    return false;
  }

  // ハイフン区切りで分解: ingredient-modal-{type}-{userId}
  const parts = interaction.customId.split('-');
  console.log(`🔧 customId分解:`, parts);
  
  if (parts.length !== 4) {
    console.log(`❌ customId形式が正しくない（要素数: ${parts.length}）: ${interaction.customId}`);
    return false;
  }

  const type = parts[2]; // stock_ingredient または non_stock_ingredient
  const customIdUserId = parts[3];
  
  console.log(`🏷️ タイプ: "${type}"`);
  console.log(`👤 customIdから抽出されたユーザーID: "${customIdUserId}"`);
  console.log(`👤 実際のユーザーID: "${interaction.user.id}"`);

  // タイプの検証
  if (type !== 'stock_ingredient' && type !== 'non_stock_ingredient') {
    console.log(`❌ 不明なタイプ: "${type}"`);
    return false;
  }

  if (customIdUserId !== interaction.user.id) {
    console.log(`❌ ユーザーID不一致: customId="${customIdUserId}" vs actual="${interaction.user.id}"`);
    await interaction.reply({ content: '❌ 他のユーザーの操作です。', ephemeral: true });
    return true;
  }

  const recipeRegisterCommand = require('./recipeRegisterIntegrated');
  
  try {
    await recipeRegisterCommand.handleIngredientModal(interaction, type);
  } catch (error) {
    console.error(`❌ モーダル処理エラー:`, error);
  }
  
  return true;
}

module.exports.handleRecipeSelectMenu = handleRecipeSelectMenu;
module.exports.handleRecipeModal = handleRecipeModal;
