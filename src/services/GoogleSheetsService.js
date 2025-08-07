// src/services/GoogleSheetsService.js
const { google } = require('googleapis');
const config = require('../config/config');

class GoogleSheetsService {
  constructor() {
    this.sheets = null;
    this.auth = null;
    this.spreadsheetId = config.googleSheets.spreadsheetId;
  }

  async initialize() {
    try {
      // サービスアカウント認証
      this.auth = new google.auth.GoogleAuth({
        keyFile: config.googleSheets.credentialsPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const authClient = await this.auth.getClient();
      this.sheets = google.sheets({ version: 'v4', auth: authClient });
      
      console.log('Google Sheets API initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Google Sheets API:', error);
      throw error;
    }
  }

  // データを読み取る
  async readRange(sheetName, range) {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!${range}`,
      });
      return response.data.values || [];
    } catch (error) {
      console.error(`Error reading from ${sheetName}:`, error);
      throw error;
    }
  }

  // データを書き込む
  async writeRange(sheetName, range, values) {
    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!${range}`,
        valueInputOption: 'RAW',
        resource: { values },
      });
    } catch (error) {
      console.error(`Error writing to ${sheetName}:`, error);
      throw error;
    }
  }

  // データを追加する（ヘッダーを避けて2行目以降に追加）
  async appendData(sheetName, values) {
    try {
      // ヘッダーを避けて2行目以降に追加
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A2:Z`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values },
      });
    } catch (error) {
      console.error(`Error appending to ${sheetName}:`, error);
      throw error;
    }
  }

  // 安全にデータを追加する（次の空行を自動検出）
  async safeAppendData(sheetName, values) {
    try {
      // 現在のデータを取得して次の空行を特定
      const existingData = await this.readRange(sheetName, 'A:A');
      const nextRow = existingData.length + 1;
      
      // 特定の行に直接書き込み
      await this.writeRange(sheetName, `A${nextRow}:Z${nextRow}`, values);
    } catch (error) {
      console.error(`Error safely appending to ${sheetName}:`, error);
      throw error;
    }
  }

  // 在庫管理シートから全データを取得
  async getInventoryData() {
    const data = await this.readRange('在庫管理', 'A2:L1000');
    return data.map(row => ({
      id: row[0],
      name: row[1],
      category: row[2],
      currentAmount: parseFloat(row[3]) || 0,
      unit: row[4],
      storageLocation: row[5],
      purchaseDate: row[6],
      expiryDate: row[7],
      openStatus: row[8],
      notificationThreshold: parseFloat(row[9]) || 0,
      isStaple: row[10] === 'TRUE',
      lastUpdated: row[11]
    })).filter(item => item.name);
  }

  // 米管理データを取得（正しい行を参照）
  async getRiceData() {
    try {
      // B2:B4の範囲でデータを取得
      const data = await this.readRange('米管理', 'B2:B4');
      
      const currentAmount = parseFloat(data[0]?.[0]) || 0;      // B2: 現在の米の量
      const gramsPerCup = parseFloat(data[1]?.[0]) || 150;     // B3: 1合あたりのグラム数
      const notificationThreshold = parseFloat(data[2]?.[0]) || 1500; // B4: 通知閾値
      
      return {
        currentAmount: currentAmount,
        gramsPerCup: gramsPerCup,
        notificationThreshold: notificationThreshold,
        remainingCooking: Math.floor(currentAmount / gramsPerCup / 3)
      };
    } catch (error) {
      console.error('米データ取得エラー:', error);
      // エラーの場合はデフォルト値を返す
      return {
        currentAmount: 0,
        gramsPerCup: 150,
        notificationThreshold: 1500,
        remainingCooking: 0
      };
    }
  }

  // 料理テンプレートを取得
  async getCookingTemplates() {
    const data = await this.readRange('料理テンプレート', 'A2:M1000');
    return data.map(row => ({
      id: row[0],
      name: row[1],
      ingredients: [
        { name: row[2], amount: parseFloat(row[3]) || 0 },
        { name: row[4], amount: parseFloat(row[5]) || 0 },
        { name: row[6], amount: parseFloat(row[7]) || 0 },
        { name: row[8], amount: parseFloat(row[9]) || 0 },
        { name: row[10], amount: parseFloat(row[11]) || 0 }
      ].filter(ing => ing.name && ing.amount > 0),
      registeredDate: row[12]
    })).filter(template => template.name);
  }

  // 米の購入を記録（B2セルに直接加算）
  async purchaseRice(gramsAdded, brand = '', memo = '') {
    try {
      // 現在の米の残量を取得（B2セル）
      const currentAmountData = await this.readRange('米管理', 'B2:B2');
      const currentAmount = parseFloat(currentAmountData[0]?.[0]) || 0;
      
      // 新しい残量を計算
      const newAmount = currentAmount + gramsAdded;
      
      // B2セルに新しい値を書き込み
      await this.writeRange('米管理', 'B2:B2', [[newAmount]]);
      
      // C2セル（更新日時）も更新
      await this.writeRange('米管理', 'C2:C2', [[new Date().toLocaleString('ja-JP')]]);
      
      // 使用履歴に記録（安全な方法で）
      const brandInfo = brand ? ` (${brand})` : '';
      const memoText = memo ? memo : `米購入${brandInfo}`;
      
      await this.safeAppendData('使用履歴', [[
        '', // ID（自動採番想定）
        new Date().toLocaleDateString('ja-JP'),
        new Date().toLocaleTimeString('ja-JP'),
        '米購入',
        '米',
        gramsAdded,
        newAmount,
        '補充',
        memoText
      ]]);

      // 1合のグラム数を取得して炊飯可能回数を計算
      const gramsPerCupData = await this.readRange('米管理', 'B3:B3');
      const gramsPerCup = parseFloat(gramsPerCupData[0]?.[0]) || 150;

      return {
        addedAmount: gramsAdded,
        newAmount: newAmount,
        remainingCooking: Math.floor(newAmount / gramsPerCup / 3)
      };
    } catch (error) {
      console.error('米購入記録エラー:', error);
      throw error;
    }
  }

  // 米の使用を記録（B2セルから直接減算）
  async useRice(cups, memo = '') {
    try {
      // 現在の米の残量を取得（B2セル）
      const currentAmountData = await this.readRange('米管理', 'B2:B2');
      const currentAmount = parseFloat(currentAmountData[0]?.[0]) || 0;
      
      // 1合のグラム数を取得（B3セル）
      const gramsPerCupData = await this.readRange('米管理', 'B3:B3');
      const gramsPerCup = parseFloat(gramsPerCupData[0]?.[0]) || 150;
      
      const usedGrams = cups * gramsPerCup;
      const newAmount = currentAmount - usedGrams;
      
      if (newAmount < 0) {
        throw new Error(`米の在庫が不足しています（現在: ${currentAmount}g, 必要: ${usedGrams}g）`);
      }
      
      // B2セルに新しい値を書き込み
      await this.writeRange('米管理', 'B2:B2', [[newAmount]]);
      
      // C2セル（更新日時）も更新
      await this.writeRange('米管理', 'C2:C2', [[new Date().toLocaleString('ja-JP')]]);
      
      // 使用履歴に記録（安全な方法で）
      await this.safeAppendData('使用履歴', [[
        '', // ID（自動採番想定）
        new Date().toLocaleDateString('ja-JP'),
        new Date().toLocaleTimeString('ja-JP'),
        `米${cups}合`,
        '米',
        usedGrams,
        newAmount,
        '使用',
        memo
      ]]);

      return {
        usedAmount: usedGrams,
        remainingAmount: newAmount,
        remainingCooking: Math.floor(newAmount / gramsPerCup / 3)
      };
    } catch (error) {
      console.error('米使用記録エラー:', error);
      throw error;
    }
  }

  // 在庫の使用を記録
  async useIngredient(ingredientName, amount, memo = '') {
    const inventory = await this.getInventoryData();
    const item = inventory.find(i => i.name === ingredientName);
    
    if (!item) {
      throw new Error(`食材「${ingredientName}」が見つかりません`);
    }

    const newAmount = item.currentAmount - amount;
    if (newAmount < 0) {
      throw new Error(`「${ingredientName}」の在庫が不足しています（現在: ${item.currentAmount}${item.unit}）`);
    }

    // 在庫管理シートを更新（該当行を探して更新）
    const rowIndex = parseInt(item.id) + 1; // ヘッダー分+1
    await this.writeRange('在庫管理', `D${rowIndex}:L${rowIndex}`, [[
      newAmount,
      item.unit,
      item.storageLocation,
      item.purchaseDate,
      item.expiryDate,
      item.openStatus,
      item.notificationThreshold,
      item.isStaple,
      new Date().toLocaleString('ja-JP')
    ]]);

    // 使用履歴に記録
    await this.appendData('使用履歴', [[
      '',
      new Date().toLocaleDateString('ja-JP'),
      new Date().toLocaleTimeString('ja-JP'),
      memo || '個別使用',
      ingredientName,
      amount,
      newAmount,
      '使用',
      memo
    ]]);

    return {
      ingredient: ingredientName,
      usedAmount: amount,
      remainingAmount: newAmount,
      unit: item.unit
    };
  }

// 使用履歴取得メソッドを追加
async getUsageHistory() {
  const range = '使用履歴!A:I';
  const response = await this.sheets.spreadsheets.values.get({
    spreadsheetId: this.spreadsheetId,
    range: range,
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) return [];

  return rows.slice(1).map((row, index) => ({
    id: index,
    date: row[1] || '',
    time: row[2] || '',
    dishName: row[3] || '',
    ingredientName: row[4] || '',
    usedAmount: row[5] || '0',
    remainingAmount: row[6] || '0',
    operationType: row[7] || '',
    memo: row[8] || ''
  }));
}

  // 料理テンプレートを使用
  async useCookingTemplate(templateName, memo = '') {
    const templates = await this.getCookingTemplates();
    const template = templates.find(t => t.name === templateName);
    
    if (!template) {
      throw new Error(`料理テンプレート「${templateName}」が見つかりません`);
    }

    const results = [];
    
    for (const ingredient of template.ingredients) {
      if (ingredient.name === '米') {
        const riceResult = await this.useRice(ingredient.amount / 150, memo); // グラムを合に変換
        results.push({
          ingredient: '米',
          usedAmount: ingredient.amount,
          remainingAmount: riceResult.remainingAmount,
          unit: 'g'
        });
      } else {
        const result = await this.useIngredient(ingredient.name, ingredient.amount, memo);
        results.push(result);
      }
    }

    return {
      templateName,
      usedIngredients: results
    };
  }


// GoogleSheetsService.js に追加する統合シート管理機能

  // =================
  // 統合料理管理機能
  // =================

  // 統合シートの初期化・作成
  async ensureIntegratedRecipeSheets() {
    try {
      const sheetsResponse = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });

      const existingSheets = sheetsResponse.data.sheets.map(sheet => sheet.properties.title);
      
      // 料理マスターシートの作成・確認
      if (!existingSheets.includes('料理マスター')) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          resource: {
            requests: [{
              addSheet: {
                properties: { title: '料理マスター' }
              }
            }]
          }
        });

        // ヘッダー追加
        const masterHeaders = [
          '料理ID', '料理名', 'カテゴリ', '調理時間', '難易度', 
          'メモ', '登録者', '登録日時'
        ];
        await this.writeRange('料理マスター', 'A1:H1', [masterHeaders]);
        console.log('✅ 料理マスターシート作成完了');
      }

      // 料理材料シートの作成・確認
      if (!existingSheets.includes('料理材料')) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          resource: {
            requests: [{
              addSheet: {
                properties: { title: '料理材料' }
              }
            }]
          }
        });

        // ヘッダー追加
        const ingredientHeaders = [
          '料理ID', '材料名', '使用量', '単位', '材料タイプ', '必須フラグ'
        ];
        await this.writeRange('料理材料', 'A1:F1', [ingredientHeaders]);
        console.log('✅ 料理材料シート作成完了');
      }

    } catch (error) {
      console.error('統合シート作成エラー:', error);
      throw new Error('統合シートの作成に失敗しました');
    }
  }

  // 新料理登録（統合版）
  async registerIntegratedRecipe(recipeData) {
    const {
      recipeName,
      category,
      cookingTime,
      difficulty,
      memo,
      ingredients, // [{ name, amount, unit, type, required }]
      registeredBy
    } = recipeData;

    // 統合シート初期化
    await this.ensureIntegratedRecipeSheets();

    // 重複チェック
    const existingRecipes = await this.getIntegratedRecipes();
    if (existingRecipes.some(recipe => recipe.recipeName.toLowerCase() === recipeName.toLowerCase())) {
      throw new Error(`「${recipeName}」は既に登録されています`);
    }

    // 料理IDを生成
    const recipeId = `recipe_${Date.now()}`;
    const registeredAt = new Date().toLocaleString('ja-JP');

    try {
      // 料理マスターに基本情報を追加
      await this.safeAppendData('料理マスター', [[
        recipeId,
        recipeName,
        category,
        cookingTime,
        difficulty,
        memo,
        registeredBy,
        registeredAt
      ]]);

      // 料理材料に材料情報を追加
      for (const ingredient of ingredients) {
        await this.safeAppendData('料理材料', [[
          recipeId,
          ingredient.name,
          ingredient.amount,
          ingredient.unit,
          ingredient.type, // '在庫管理対象' or '非対象'
          ingredient.required // '必須' or '任意'
        ]]);
      }

      console.log(`✅ 統合料理登録完了: ${recipeName} (ID: ${recipeId})`);

      return {
        recipeId,
        recipeName,
        category,
        cookingTime,
        difficulty,
        memo,
        ingredients,
        registeredBy,
        registeredAt
      };

    } catch (error) {
      console.error('統合料理登録エラー:', error);
      throw new Error(`料理登録に失敗しました: ${error.message}`);
    }
  }

  // 統合料理一覧取得
  async getIntegratedRecipes(searchOptions = {}) {
    try {
      // 料理マスター取得
      const masterData = await this.readRange('料理マスター', 'A2:H1000');
      if (!masterData.length) return [];

      // 料理材料取得
      const ingredientData = await this.readRange('料理材料', 'A2:F1000');

      const recipes = masterData.map(row => {
        const recipeId = row[0];
        
        // この料理の材料を取得
        const recipeIngredients = ingredientData
          .filter(ingRow => ingRow[0] === recipeId)
          .map(ingRow => ({
            name: ingRow[1],
            amount: parseFloat(ingRow[2]) || 0,
            unit: ingRow[3],
            type: ingRow[4], // '在庫管理対象' or '非対象'
            required: ingRow[5] // '必須' or '任意'
          }));

        return {
          recipeId: recipeId,
          recipeName: row[1],
          category: row[2],
          cookingTime: parseInt(row[3]) || 0,
          difficulty: row[4],
          memo: row[5],
          registeredBy: row[6],
          registeredAt: row[7],
          ingredients: recipeIngredients,
          // 在庫管理対象の材料のみフィルタ
          stockIngredients: recipeIngredients.filter(ing => ing.type === '在庫管理対象'),
          // レシピ表示用の全材料
          allIngredients: recipeIngredients
        };
      }).filter(recipe => recipe.recipeName);

      // 検索フィルタ適用
      let filteredRecipes = recipes;

      if (searchOptions.category) {
        filteredRecipes = filteredRecipes.filter(recipe => 
          recipe.category === searchOptions.category
        );
      }

      if (searchOptions.ingredient) {
        filteredRecipes = filteredRecipes.filter(recipe =>
          recipe.ingredients.some(ing => 
            ing.name.includes(searchOptions.ingredient)
          )
        );
      }

      if (searchOptions.name) {
        filteredRecipes = filteredRecipes.filter(recipe =>
          recipe.recipeName.includes(searchOptions.name)
        );
      }

      return filteredRecipes;

    } catch (error) {
      console.error('統合料理一覧取得エラー:', error);
      return [];
    }
  }

  // 統合料理実行（在庫消費）
  async executeIntegratedRecipe(recipeName, memo = '') {
    try {
      // 料理を検索
      const recipes = await this.getIntegratedRecipes({ name: recipeName });
      const recipe = recipes.find(r => r.recipeName === recipeName);

      if (!recipe) {
        throw new Error(`料理「${recipeName}」が見つかりません`);
      }

      // 在庫管理対象の材料のみ処理
      const stockIngredients = recipe.stockIngredients;
      if (stockIngredients.length === 0) {
        throw new Error(`「${recipeName}」には在庫管理対象の材料がありません`);
      }

      // 在庫チェック
      const inventory = await this.getInventoryData();
      const unavailableIngredients = [];

      for (const ingredient of stockIngredients) {
        const stockItem = inventory.find(item => item.name === ingredient.name);
        if (!stockItem) {
          unavailableIngredients.push(`${ingredient.name}（在庫に存在しません）`);
        } else if (stockItem.currentAmount < ingredient.amount) {
          unavailableIngredients.push(
            `${ingredient.name}（必要: ${ingredient.amount}${ingredient.unit}, 在庫: ${stockItem.currentAmount}${stockItem.unit}）`
          );
        }
      }

      if (unavailableIngredients.length > 0) {
        throw new Error(`材料が不足しています:\n${unavailableIngredients.join('\n')}`);
      }

      // 材料を消費
      const usedIngredients = [];
      for (const ingredient of stockIngredients) {
        if (ingredient.name === '米') {
          // 米の場合は専用メソッド使用
          const cups = ingredient.amount / 150; // グラムを合に変換
          const result = await this.useRice(cups, `${recipeName} - ${memo}`);
          usedIngredients.push({
            ingredient: '米',
            usedAmount: ingredient.amount,
            remainingAmount: result.remainingAmount,
            unit: 'g'
          });
        } else {
          // 通常の食材
          const result = await this.useIngredient(
            ingredient.name, 
            ingredient.amount, 
            `${recipeName} - ${memo}`
          );
          usedIngredients.push(result);
        }
      }

      return {
        recipeName: recipe.recipeName,
        recipeId: recipe.recipeId,
        usedIngredients: usedIngredients,
        allIngredients: recipe.allIngredients, // レシピ表示用
        category: recipe.category,
        cookingTime: recipe.cookingTime,
        difficulty: recipe.difficulty
      };

    } catch (error) {
      console.error('統合料理実行エラー:', error);
      throw error;
    }
  }

  // 作れる料理の提案
  async getSuggestableRecipes() {
    try {
      const recipes = await this.getIntegratedRecipes();
      const inventory = await this.getInventoryData();
      const riceData = await this.getRiceData();

      const suggestions = [];

      for (const recipe of recipes) {
        const stockIngredients = recipe.stockIngredients;
        let canMake = true;
        const missingIngredients = [];

        for (const ingredient of stockIngredients) {
          if (ingredient.name === '米') {
            if (riceData.currentAmount < ingredient.amount) {
              canMake = false;
              missingIngredients.push(`米（必要: ${ingredient.amount}g, 在庫: ${riceData.currentAmount}g）`);
            }
          } else {
            const stockItem = inventory.find(item => item.name === ingredient.name);
            if (!stockItem || stockItem.currentAmount < ingredient.amount) {
              canMake = false;
              const stockAmount = stockItem ? stockItem.currentAmount : 0;
              const unit = stockItem ? stockItem.unit : ingredient.unit;
              missingIngredients.push(`${ingredient.name}（必要: ${ingredient.amount}${ingredient.unit}, 在庫: ${stockAmount}${unit}）`);
            }
          }
        }

        suggestions.push({
          recipe: recipe,
          canMake: canMake,
          missingIngredients: missingIngredients
        });
      }

      return {
        canMake: suggestions.filter(s => s.canMake),
        needIngredients: suggestions.filter(s => !s.canMake)
      };

    } catch (error) {
      console.error('作れる料理提案エラー:', error);
      return { canMake: [], needIngredients: [] };
    }
  }

  // 既存データの移行
  async migrateExistingData() {
    try {
      console.log('🔄 既存データの移行を開始します...');
      
      // 統合シート初期化
      await this.ensureIntegratedRecipeSheets();

      // レシピ管理シートからのデータ移行
      try {
        const oldRecipes = await this.readRange('レシピ管理', 'A2:M1000');
        for (const row of oldRecipes) {
          if (!row[1]) continue; // 料理名がない行はスキップ

          const recipeId = `migrated_recipe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          // 料理マスターに追加
          await this.safeAppendData('料理マスター', [[
            recipeId,
            row[1], // 料理名
            row[9] || 'その他', // カテゴリ
            parseInt(row[7]) || 30, // 調理時間
            row[8] || '普通', // 難易度
            row[10] || '', // メモ
            row[11] || 'migrated', // 登録者
            row[12] || new Date().toLocaleString('ja-JP') // 登録日時
          ]]);

          // 材料を料理材料シートに追加（レシピ表示用として非対象に）
          for (let i = 2; i <= 6; i++) {
            if (row[i] && row[i].trim()) {
              await this.safeAppendData('料理材料', [[
                recipeId,
                row[i].trim(),
                0, // 使用量不明
                '', // 単位不明
                '非対象', // レシピ表示用
                '必須'
              ]]);
            }
          }
        }
        console.log('✅ レシピ管理シートからの移行完了');
      } catch (error) {
        console.log('ℹ️ レシピ管理シートが存在しないかデータなし');
      }

      // 料理テンプレートシートからのデータ移行
      try {
        const oldTemplates = await this.readRange('料理テンプレート', 'A2:M1000');
        for (const row of oldTemplates) {
          if (!row[1]) continue; // 料理名がない行はスキップ

          const recipeId = `migrated_template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          // 料理マスターに追加
          await this.safeAppendData('料理マスター', [[
            recipeId,
            row[1], // 料理名
            'おかず', // デフォルトカテゴリ
            30, // デフォルト調理時間
            '普通', // デフォルト難易度
            'テンプレートから移行', // メモ
            'migrated', // 登録者
            row[12] || new Date().toLocaleString('ja-JP') // 登録日時
          ]]);

          // 材料を料理材料シートに追加（在庫管理対象として）
          for (let i = 0; i < 5; i++) {
            const nameIndex = 2 + (i * 2);
            const amountIndex = 3 + (i * 2);
            
            if (row[nameIndex] && row[amountIndex] && parseFloat(row[amountIndex]) > 0) {
              await this.safeAppendData('料理材料', [[
                recipeId,
                row[nameIndex],
                parseFloat(row[amountIndex]),
                '個', // デフォルト単位（後で修正可能）
                '在庫管理対象',
                '必須'
              ]]);
            }
          }
        }
        console.log('✅ 料理テンプレートシートからの移行完了');
      } catch (error) {
        console.log('ℹ️ 料理テンプレートシートが存在しないかデータなし');
      }

      console.log('🎉 データ移行が完了しました！');
      return true;

    } catch (error) {
      console.error('データ移行エラー:', error);
      throw new Error(`データ移行に失敗しました: ${error.message}`);
    }
  }
}
module.exports = GoogleSheetsService;
