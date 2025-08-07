// src/services/AnalysisService.js - 使用パターン分析サービス
class AnalysisService {
  constructor(sheetsService) {
    this.sheetsService = sheetsService;
  }

  // 月間レポートデータを生成
  async generateMonthlyReport(year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const usageHistory = await this.sheetsService.getUsageHistory();
    const inventory = await this.sheetsService.getInventoryData();
    
    // 対象期間のデータをフィルタリング
    const monthlyData = usageHistory.filter(record => {
      const recordDate = new Date(record.date);
      return recordDate >= startDate && recordDate <= endDate;
    });

    const report = {
      period: `${year}年${month}月`,
      summary: await this.calculateMonthlySummary(monthlyData),
      foodWaste: await this.analyzeFoodWaste(monthlyData),
      consumptionPatterns: await this.analyzeConsumptionPatterns(monthlyData),
      frequentlyUsed: await this.getFrequentlyUsedIngredients(monthlyData),
      recommendations: await this.generateRecommendations(monthlyData, inventory),
      costAnalysis: await this.analyzeCosts(monthlyData),
      categoryBreakdown: await this.analyzeCategoryBreakdown(monthlyData)
    };

    return report;
  }

  // 月間サマリーを計算
  async calculateMonthlySummary(monthlyData) {
    const totalRecords = monthlyData.length;
    const cookingRecords = monthlyData.filter(r => r.operationType === '料理').length;
    const wastageRecords = monthlyData.filter(r => r.operationType === '廃棄').length;
    const editRecords = monthlyData.filter(r => r.operationType === '編集').length;

    // 廃棄率計算
    const totalUsage = monthlyData
      .filter(r => r.operationType === '料理')
      .reduce((sum, r) => sum + (parseFloat(r.usedAmount) || 0), 0);
    
    const totalWaste = monthlyData
      .filter(r => r.operationType === '廃棄')
      .reduce((sum, r) => sum + (parseFloat(r.usedAmount) || 0), 0);

    const wastePercentage = totalUsage + totalWaste > 0 
      ? ((totalWaste / (totalUsage + totalWaste)) * 100).toFixed(1)
      : 0;

    return {
      totalRecords,
      cookingRecords,
      wastageRecords,
      editRecords,
      wastePercentage: parseFloat(wastePercentage),
      totalUsage: totalUsage.toFixed(1),
      totalWaste: totalWaste.toFixed(1)
    };
  }

  // 食品ロス分析
  async analyzeFoodWaste(monthlyData) {
    const wasteData = monthlyData.filter(r => r.operationType === '廃棄');
    
    // 廃棄理由別分析
    const wasteReasons = {};
    const wasteByIngredient = {};
    
    wasteData.forEach(record => {
      const reason = this.extractWasteReason(record.memo || '');
      const ingredient = record.ingredientName;
      const amount = parseFloat(record.usedAmount) || 0;

      wasteReasons[reason] = (wasteReasons[reason] || 0) + amount;
      wasteByIngredient[ingredient] = (wasteByIngredient[ingredient] || 0) + amount;
    });

    // トップ5の廃棄食材
    const topWastedIngredients = Object.entries(wasteByIngredient)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([ingredient, amount]) => ({ ingredient, amount: amount.toFixed(1) }));

    return {
      totalWasteCount: wasteData.length,
      wasteReasons,
      topWastedIngredients,
      averageWastePerDay: (wasteData.length / 30).toFixed(1)
    };
  }

  // 消費パターン分析
  async analyzeConsumptionPatterns(monthlyData) {
    const cookingData = monthlyData.filter(r => r.operationType === '料理');
    
    // 曜日別使用パターン
    const dayOfWeekUsage = Array(7).fill(0);
    // 時間帯別使用パターン
    const hourlyUsage = Array(24).fill(0);
    
    cookingData.forEach(record => {
      const date = new Date(record.date + ' ' + record.time);
      dayOfWeekUsage[date.getDay()]++;
      hourlyUsage[date.getHours()]++;
    });

    // 最も活発な料理の日と時間
    const mostActiveDayIndex = dayOfWeekUsage.indexOf(Math.max(...dayOfWeekUsage));
    const mostActiveHour = hourlyUsage.indexOf(Math.max(...hourlyUsage));
    
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

    return {
      dayOfWeekUsage,
      hourlyUsage,
      mostActiveDay: dayNames[mostActiveDayIndex],
      mostActiveHour: `${mostActiveHour}時`,
      averageCookingPerDay: (cookingData.length / 30).toFixed(1)
    };
  }

  // よく使用される食材分析
  async getFrequentlyUsedIngredients(monthlyData) {
    const usageCount = {};
    const usageAmount = {};

    monthlyData
      .filter(r => r.operationType === '料理')
      .forEach(record => {
        const ingredient = record.ingredientName;
        const amount = parseFloat(record.usedAmount) || 0;

        usageCount[ingredient] = (usageCount[ingredient] || 0) + 1;
        usageAmount[ingredient] = (usageAmount[ingredient] || 0) + amount;
      });

    // 使用回数トップ10
    const topByCount = Object.entries(usageCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([ingredient, count]) => ({ 
        ingredient, 
        count, 
        totalAmount: (usageAmount[ingredient] || 0).toFixed(1) 
      }));

    return { topByCount };
  }

  // 改善提案を生成
  async generateRecommendations(monthlyData, inventory) {
    const recommendations = [];
    const wasteData = monthlyData.filter(r => r.operationType === '廃棄');
    
    // 廃棄が多い食材の提案
    const wasteByIngredient = {};
    wasteData.forEach(record => {
      const ingredient = record.ingredientName;
      wasteByIngredient[ingredient] = (wasteByIngredient[ingredient] || 0) + 1;
    });

    Object.entries(wasteByIngredient)
      .filter(([, count]) => count >= 2)
      .forEach(([ingredient, count]) => {
        recommendations.push({
          type: 'waste_reduction',
          priority: 'high',
          message: `${ingredient}を${count}回廃棄しています。購入量を減らすか、早めの消費を心がけましょう。`
        });
      });

    // 在庫切れが多い食材の提案
    const currentLowStock = inventory.filter(item => 
      item.currentAmount <= item.notificationThreshold && item.currentAmount > 0
    );

    if (currentLowStock.length > 5) {
      recommendations.push({
        type: 'inventory_management',
        priority: 'medium',
        message: '在庫不足の食材が多数あります。定期的な買い物計画を立てることをお勧めします。'
      });
    }

    // 期限切れ多発の提案
    const expiredWaste = wasteData.filter(record => 
      (record.memo || '').includes('期限切れ')
    );

    if (expiredWaste.length > 3) {
      recommendations.push({
        type: 'expiry_management',
        priority: 'high',
        message: '期限切れによる廃棄が多発しています。FIFO（先入れ先出し）を心がけ、期限の近い物から使用しましょう。'
      });
    }

    return recommendations;
  }

  // コスト分析（概算）
  async analyzeCosts(monthlyData) {
    // 簡易的な価格データベース（実際の実装では外部APIやDBを使用）
    const estimatedPrices = {
      '米': 2.5, // 1gあたりの概算価格（円）
      '玉ねぎ': 0.5,
      'にんじん': 0.8,
      'じゃがいも': 0.4,
      'キャベツ': 0.3,
      '豚肉': 3.0,
      '鶏肉': 2.0,
      '卵': 25.0, // 1個あたり
      'その他': 1.0
    };

    let totalUsageCost = 0;
    let totalWasteCost = 0;

    monthlyData.forEach(record => {
      const ingredient = record.ingredientName;
      const amount = parseFloat(record.usedAmount) || 0;
      const pricePerUnit = estimatedPrices[ingredient] || estimatedPrices['その他'];
      const cost = amount * pricePerUnit;

      if (record.operationType === '料理') {
        totalUsageCost += cost;
      } else if (record.operationType === '廃棄') {
        totalWasteCost += cost;
      }
    });

    return {
      totalUsageCost: Math.round(totalUsageCost),
      totalWasteCost: Math.round(totalWasteCost),
      wastePercentage: totalUsageCost + totalWasteCost > 0 
        ? ((totalWasteCost / (totalUsageCost + totalWasteCost)) * 100).toFixed(1)
        : 0,
      monthlySavingPotential: Math.round(totalWasteCost)
    };
  }

  // カテゴリ別分析
  async analyzeCategoryBreakdown(monthlyData) {
    const inventory = await this.sheetsService.getInventoryData();
    const categoryMap = {};
    
    // 食材とカテゴリのマッピングを作成
    inventory.forEach(item => {
      categoryMap[item.name] = item.category;
    });

    const categoryUsage = {};
    const categoryWaste = {};

    monthlyData.forEach(record => {
      const category = categoryMap[record.ingredientName] || 'その他';
      const amount = parseFloat(record.usedAmount) || 0;

      if (record.operationType === '料理') {
        categoryUsage[category] = (categoryUsage[category] || 0) + amount;
      } else if (record.operationType === '廃棄') {
        categoryWaste[category] = (categoryWaste[category] || 0) + amount;
      }
    });

    // カテゴリ別廃棄率計算
    const categoryAnalysis = {};
    Object.keys({...categoryUsage, ...categoryWaste}).forEach(category => {
      const usage = categoryUsage[category] || 0;
      const waste = categoryWaste[category] || 0;
      const total = usage + waste;
      
      categoryAnalysis[category] = {
        usage: usage.toFixed(1),
        waste: waste.toFixed(1),
        wasteRate: total > 0 ? ((waste / total) * 100).toFixed(1) : 0
      };
    });

    return categoryAnalysis;
  }

  // 廃棄理由を抽出（メモから）
  extractWasteReason(memo) {
    const reasons = ['期限切れ', '傷み・腐敗', 'カビ発生', '冷凍焼け', '味・臭いの変化', '誤って傷つけた'];
    
    for (const reason of reasons) {
      if (memo.includes(reason)) {
        return reason;
      }
    }
    return 'その他';
  }

  // よく余らせる食材を特定
  async identifyProblemIngredients() {
    const usageHistory = await this.sheetsService.getUsageHistory();
    const last3Months = new Date();
    last3Months.setMonth(last3Months.getMonth() - 3);

    const recentData = usageHistory.filter(record => {
      const recordDate = new Date(record.date);
      return recordDate >= last3Months;
    });

    const wasteFrequency = {};
    const usageFrequency = {};

    recentData.forEach(record => {
      const ingredient = record.ingredientName;
      
      if (record.operationType === '廃棄') {
        wasteFrequency[ingredient] = (wasteFrequency[ingredient] || 0) + 1;
      } else if (record.operationType === '料理') {
        usageFrequency[ingredient] = (usageFrequency[ingredient] || 0) + 1;
      }
    });

    // 廃棄頻度が高く、使用頻度が低い食材を特定
    const problemIngredients = [];
    Object.keys(wasteFrequency).forEach(ingredient => {
      const wasteCount = wasteFrequency[ingredient];
      const usageCount = usageFrequency[ingredient] || 0;
      const wasteRatio = wasteCount / (wasteCount + usageCount);

      if (wasteCount >= 2 && wasteRatio > 0.5) {
        problemIngredients.push({
          ingredient,
          wasteCount,
          usageCount,
          wasteRatio: (wasteRatio * 100).toFixed(1)
        });
      }
    });

    return problemIngredients.sort((a, b) => b.wasteRatio - a.wasteRatio);
  }

  // 在庫予測（簡易版）
  async predictStockOut(days = 7) {
    const inventory = await this.sheetsService.getInventoryData();
    const usageHistory = await this.sheetsService.getUsageHistory();
    
    // 過去30日の平均使用量を計算
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const recentUsage = usageHistory.filter(record => {
      const recordDate = new Date(record.date);
      return recordDate >= last30Days && record.operationType === '料理';
    });

    const avgDailyUsage = {};
    recentUsage.forEach(record => {
      const ingredient = record.ingredientName;
      const amount = parseFloat(record.usedAmount) || 0;
      avgDailyUsage[ingredient] = (avgDailyUsage[ingredient] || 0) + amount;
    });

    // 30日で割って日平均を算出
    Object.keys(avgDailyUsage).forEach(ingredient => {
      avgDailyUsage[ingredient] = avgDailyUsage[ingredient] / 30;
    });

    // 在庫切れ予測
    const predictions = [];
    inventory.forEach(item => {
      const dailyUsage = avgDailyUsage[item.name] || 0;
      if (dailyUsage > 0) {
        const daysUntilStockOut = item.currentAmount / dailyUsage;
        if (daysUntilStockOut <= days) {
          predictions.push({
            ingredient: item.name,
            currentAmount: item.currentAmount,
            unit: item.unit,
            dailyUsage: dailyUsage.toFixed(2),
            daysUntilStockOut: Math.ceil(daysUntilStockOut)
          });
        }
      }
    });

    return predictions.sort((a, b) => a.daysUntilStockOut - b.daysUntilStockOut);
  }
}

module.exports = AnalysisService;
