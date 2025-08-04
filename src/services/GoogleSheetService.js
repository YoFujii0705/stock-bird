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

  // データを追加する
  async appendData(sheetName, values) {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        resource: { values },
      });
    } catch (error) {
      console.error(`Error appending to ${sheetName}:`, error);
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

  // 米管理データを取得
  async getRiceData() {
    const data = await this.readRange('米管理', 'B1:B4');
    return {
      currentAmount: parseFloat(data[0][0]) || 0,
      gramsPerCup: parseFloat(data[1][0]) || 150,
      notificationThreshold: parseFloat(data[2][0]) || 1500,
      remainingCooking: Math.floor((parseFloat(data[0][0]) || 0) / (parseFloat(data[1][0]) || 150) / 3)
    };
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

  // 米の使用を記録
  async useRice(cups, memo = '') {
    const riceData = await this.getRiceData();
    const usedGrams = cups * riceData.gramsPerCup;
    const newAmount = riceData.currentAmount - usedGrams;
    
    // 米管理シートを更新
    await this.writeRange('米管理', 'B1:C1', [[newAmount, new Date().toLocaleString('ja-JP')]]);
    
    // 使用履歴に記録
    await this.appendData('使用履歴', [[
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
      remainingCooking: Math.floor(newAmount / riceData.gramsPerCup / 3)
    };
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
}
