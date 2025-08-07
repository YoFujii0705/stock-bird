// src/commands/recipeRegister.js - 新シート「レシピ管理」対応版
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('レシピ登録')
    .setDescription('オリジナルレシピを登録します')
    .addStringOption(option =>
      option.setName('料理名')
        .setDescription('料理の名前')
        .setRequired(true)
        .setMaxLength(50))
    .addStringOption(option =>
      option.setName('材料1')
        .setDescription('主要な材料1（食材名のみ）')
        .setRequired(true)
        .setMaxLength(20))
    .addStringOption(option =>
      option.setName('材料2')
        .setDescription('主要な材料2（食材名のみ）')
        .setRequired(false)
        .setMaxLength(20))
    .addStringOption(option =>
      option.setName('材料3')
        .setDescription('主要な材料3（食材名のみ）')
        .setRequired(false)
        .setMaxLength(20))
    .addStringOption(option =>
      option.setName('材料4')
        .setDescription('主要な材料4（食材名のみ）')
        .setRequired(false)
        .setMaxLength(20))
    .addStringOption(option =>
      option.setName('材料5')
        .setDescription('主要な材料5（食材名のみ）')
        .setRequired(false)
        .setMaxLength(20))
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
    .addStringOption(option =>
      option.setName('メモ')
        .setDescription('コツや特徴など（簡潔に）')
        .setRequired(false)
        .setMaxLength(100)),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const recipeName = interaction.options.getString('料理名');
      const cookingTime = interaction.options.getInteger('調理時間') || 30;
      const difficulty = interaction.options.getString('難易度') || '普通';
      const category = interaction.options.getString('カテゴリ') || 'おかず';
      const memo = interaction.options.getString('メモ') || '';

      // 材料を収集（空でない材料のみ）
      const ingredients = [];
      for (let i = 1; i <= 5; i++) {
        const ingredient = interaction.options.getString(`材料${i}`);
        if (ingredient && ingredient.trim()) {
          ingredients.push(ingredient.trim());
        }
      }

      if (ingredients.length === 0) {
        await interaction.editReply('❌ 少なくとも1つの材料を指定してください。');
        return;
      }

      // レシピ管理シートの存在確認・作成
      await this.ensureRecipeSheet(sheetsService);

      // 重複チェック
      const existingRecipes = await this.getExistingRecipes(sheetsService);
      const duplicateRecipe = existingRecipes.find(recipe => 
        recipe.recipeName.toLowerCase() === recipeName.toLowerCase()
      );

      if (duplicateRecipe) {
        await interaction.editReply(`❌ 「${recipeName}」は既に登録されています。\n別の名前を使用するか、\`/レシピ編集\` で既存のレシピを更新してください。`);
        return;
      }

      // レシピ登録
      const recipeData = await this.registerRecipe(sheetsService, {
        recipeName,
        ingredients,
        cookingTime,
        difficulty,
        category,
        memo,
        registeredBy: interaction.user.username,
        registeredAt: new Date()
      });

      // 成功レスポンス
      await this.showRegistrationResult(interaction, recipeData);

    } catch (error) {
      console.error('レシピ登録エラー:', error);
      await interaction.editReply(`❌ レシピ登録中にエラーが発生しました: ${error.message}`);
    }
  },

  // レシピ管理シートの存在確認・作成
  async ensureRecipeSheet(sheetsService) {
    try {
      // まずシートの存在確認
      const sheetsResponse = await sheetsService.sheets.spreadsheets.get({
        spreadsheetId: sheetsService.spreadsheetId
      });

      const sheetExists = sheetsResponse.data.sheets.some(sheet => 
        sheet.properties.title === 'レシピ管理'
      );

      if (!sheetExists) {
        console.log('📋 Creating new "レシピ管理" sheet...');
        
        // 新しいシートを作成
        await sheetsService.sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetsService.spreadsheetId,
          resource: {
            requests: [{
              addSheet: {
                properties: {
                  title: 'レシピ管理'
                }
              }
            }]
          }
        });

        // ヘッダーを追加
        const headers = [
          'レシピID', '料理名', '材料1', '材料2', '材料3', '材料4', '材料5', 
          '調理時間', '難易度', 'カテゴリ', 'メモ', '登録者', '登録日時'
        ];

        await sheetsService.writeRange('レシピ管理', 'A1:M1', [headers]);
        
        console.log('✅ "レシピ管理" sheet created successfully');
      } else {
        console.log('📋 "レシピ管理" sheet already exists');
      }
    } catch (error) {
      console.error('シート作成エラー:', error);
      throw new Error('レシピ管理シートの作成に失敗しました');
    }
  },

  // 既存レシピ取得（レシピ管理シートから）
  async getExistingRecipes(sheetsService) {
    try {
      const range = 'レシピ管理!A:M';
      const response = await sheetsService.sheets.spreadsheets.values.get({
        spreadsheetId: sheetsService.spreadsheetId,
        range: range,
      });

      const rows = response.data.values || [];
      if (rows.length <= 1) return [];

      return rows.slice(1).map((row, index) => ({
        id: index + 2, // スプレッドシートの行番号
        recipeId: row[0] || '',
        recipeName: row[1] || '',
        ingredients: [row[2], row[3], row[4], row[5], row[6]].filter(ing => ing && ing.trim()),
        cookingTime: row[7] || '',
        difficulty: row[8] || '',
        category: row[9] || '',
        memo: row[10] || '',
        registeredBy: row[11] || '',
        registeredAt: row[12] || ''
      }));
    } catch (error) {
      console.error('既存レシピ取得エラー:', error);
      return [];
    }
  },

  // レシピ登録実行（レシピ管理シートに保存）
  async registerRecipe(sheetsService, recipeData) {
    const {
      recipeName,
      ingredients,
      cookingTime,
      difficulty,
      category,
      memo,
      registeredBy,
      registeredAt
    } = recipeData;

    // レシピIDを生成（タイムスタンプベース）
    const recipeId = `recipe_${Date.now()}`;

    // レシピ管理シートに追加するデータを準備
    const rowData = [
      recipeId,
      recipeName,
      ingredients[0] || '', // 材料1
      ingredients[1] || '', // 材料2
      ingredients[2] || '', // 材料3
      ingredients[3] || '', // 材料4
      ingredients[4] || '', // 材料5
      `約${cookingTime}分`,  // 調理時間
      difficulty,           // 難易度
      category,            // カテゴリ
      memo,                // メモ
      registeredBy,        // 登録者
      registeredAt.toLocaleString('ja-JP') // 登録日時
    ];

    // レシピ管理シートに追加
    await sheetsService.safeAppendData('レシピ管理', [rowData]);

    console.log(`✅ Recipe registered: ${recipeName} (ID: ${recipeId})`);

    return {
      recipeId,
      recipeName,
      ingredients,
      cookingTime,
      difficulty,
      category,
      memo,
      registeredBy,
      registeredAt
    };
  },

  // 登録結果表示
  async showRegistrationResult(interaction, recipeData) {
    const embed = new EmbedBuilder()
      .setTitle('✅ レシピ登録完了')
      .setDescription(`**${recipeData.recipeName}** を「レシピ管理」シートに登録しました！`)
      .setColor(0x00AE86)
      .setTimestamp();

    // 基本情報
    embed.addFields(
      { name: '🍳 料理名', value: recipeData.recipeName, inline: true },
      { name: '⏱️ 調理時間', value: `約${recipeData.cookingTime}分`, inline: true },
      { name: '📊 難易度', value: recipeData.difficulty, inline: true }
    );

    // 材料一覧
    const ingredientsList = recipeData.ingredients
      .map((ingredient, index) => `${index + 1}. ${ingredient}`)
      .join('\n');

    embed.addFields(
      { name: '🥬 主要材料', value: ingredientsList, inline: false },
      { name: '📂 カテゴリ', value: recipeData.category, inline: true },
      { name: '👤 登録者', value: recipeData.registeredBy, inline: true }
    );

    if (recipeData.memo) {
      embed.addFields({ name: '📝 メモ', value: recipeData.memo, inline: false });
    }

    // シート分離の説明
    embed.addFields({
      name: '📋 保存場所',
      value: '• 「レシピ管理」シート：あなたの登録レシピ\n• 「料理テンプレート」シート：`/料理`コマンド用',
      inline: false
    });

    // 使用方法のヒント
    embed.addFields({
      name: '💡 使用方法',
      value: '• `/料理提案` でこのレシピも提案されます\n• `/レシピ一覧` で登録済みレシピを確認できます\n• `/レシピ編集` `/レシピ削除` で管理できます',
      inline: false
    });

    await interaction.editReply({ embeds: [embed] });
  }
};
