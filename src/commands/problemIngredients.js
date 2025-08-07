// src/commands/problemIngredients.js - 問題食材特定コマンド
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const AnalysisService = require('../services/AnalysisService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('問題食材')
    .setDescription('よく余らせたり廃棄してしまう食材を特定し、改善策を提案します')
    .addIntegerOption(option =>
      option.setName('分析期間')
        .setDescription('分析する期間（月数）')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(12))
    .addBooleanOption(option =>
      option.setName('詳細分析')
        .setDescription('詳細な分析結果も表示するか')
        .setRequired(false)),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const analysisService = new AnalysisService(sheetsService);
      const analysisMonths = interaction.options.getInteger('分析期間') || 3;
      const showDetails = interaction.options.getBoolean('詳細分析') || false;

      // 問題食材を特定
      const problemIngredients = await analysisService.identifyProblemIngredients();
      
      if (problemIngredients.length === 0) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('🎉 問題食材なし！')
              .setDescription('過去3ヶ月間で特に問題となる食材は見つかりませんでした。\n食材管理が上手にできています！')
              .setColor(0x2ECC71)
              .addFields({
                name: '💡 継続のコツ',
                value: '• 期限切れ近い食材の優先消費\n• 適量購入を心がける\n• 定期的な在庫チェック',
                inline: false
              })
          ]
        });
        return;
      }

      // 在庫予測も取得
      const stockPredictions = await analysisService.predictStockOut(7);

      // 結果表示
      await this.displayProblemAnalysis(
        interaction, 
        problemIngredients, 
        stockPredictions, 
        analysisMonths, 
        showDetails
      );

    } catch (error) {
      console.error('問題食材分析エラー:', error);
      await interaction.editReply(`❌ 分析中にエラーが発生しました: ${error.message}`);
    }
  },

  // 問題分析結果を表示
  async displayProblemAnalysis(interaction, problemIngredients, stockPredictions, months, showDetails) {
    const embeds = [];

    // メイン分析結果
    const mainEmbed = new EmbedBuilder()
      .setTitle('🔍 問題食材分析結果')
      .setDescription(`過去${months}ヶ月間のデータを分析しました`)
      .setColor(0xE74C3C)
      .setTimestamp();

    if (problemIngredients.length > 0) {
      const problemList = problemIngredients
        .slice(0, 10)
        .map((item, index) => {
          const severity = this.getSeverityLevel(parseFloat(item.wasteRatio));
          return `${index + 1}. **${item.ingredient}** ${severity}\n` +
                 `   廃棄${item.wasteCount}回 / 使用${item.usageCount}回 (廃棄率${item.wasteRatio}%)`;
        })
        .join('\n\n');

      mainEmbed.addFields({
        name: '🗑️ 問題食材ランキング',
        value: problemList,
        inline: false
      });
    }

    embeds.push(mainEmbed);

    // 改善提案
    const suggestionEmbed = new EmbedBuilder()
      .setTitle('💡 改善提案')
      .setColor(0x3498DB);

    const suggestions = this.generateSuggestions(problemIngredients);
    suggestionEmbed.addFields({
      name: '📋 具体的な対策',
      value: suggestions,
      inline: false
    });

    // 各問題食材への個別アドバイス
    const individualAdvice = problemIngredients
      .slice(0, 5)
      .map(item => this.generateIndividualAdvice(item))
      .join('\n\n');

    if (individualAdvice) {
      suggestionEmbed.addFields({
        name: '🎯 食材別アドバイス',
        value: individualAdvice,
        inline: false
      });
    }

    embeds.push(suggestionEmbed);

    // 在庫切れ予測
    if (stockPredictions.length > 0) {
      const predictionEmbed = new EmbedBuilder()
        .setTitle('📊 在庫切れ予測（今後7日間）')
        .setColor(0xF39C12);

      const predictionList = stockPredictions
        .slice(0, 10)
        .map(pred => {
          const urgency = pred.daysUntilStockOut <= 2 ? '🔴' : 
                         pred.daysUntilStockOut <= 4 ? '🟡' : '🟢';
          return `${urgency} **${pred.ingredient}**: あと${pred.daysUntilStockOut}日で切れる予定\n` +
                 `   現在量: ${pred.currentAmount}${pred.unit} / 日消費: ${pred.dailyUsage}`;
        })
        .join('\n\n');

      predictionEmbed.addFields({
        name: '⏰ 買い物スケジュール',
        value: predictionList,
        inline: false
      });

      embeds.push(predictionEmbed);
    }

    // 詳細分析
    if (showDetails) {
      const detailEmbed = new EmbedBuilder()
        .setTitle('📈 詳細分析データ')
        .setColor(0x9B59B6);

      // 廃棄パターン分析
      const patterns = this.analyzeWastePatterns(problemIngredients);
      detailEmbed.addFields({
        name: '🔍 廃棄パターン',
        value: patterns,
        inline: false
      });

      // カテゴリ別傾向
      const categoryTends = this.analyzeCategoryTrends(problemIngredients);
      if (categoryTends) {
        detailEmbed.addFields({
          name: '📂 カテゴリ別傾向',
          value: categoryTends,
          inline: false
        });
      }

      embeds.push(detailEmbed);
    }

    // アクションプラン
    const actionEmbed = new EmbedBuilder()
      .setTitle('📅 30日間改善プラン')
      .setColor(0x17A2B8);

    const actionPlan = this.generateActionPlan(problemIngredients);
    actionEmbed.addFields({
      name: '🎯 今すぐできること',
      value: actionPlan.immediate,
      inline: false
    });

    actionEmbed.addFields({
      name: '📝 今後の習慣化',
      value: actionPlan.longTerm,
      inline: false
    });

    embeds.push(actionEmbed);

    // フッター
    const footerEmbed = new EmbedBuilder()
      .setColor(0x95A5A6)
      .setDescription('📌 **活用のヒント**\n' +
                     '• 問題食材は少量購入から始めましょう\n' +
                     '• `/料理提案` で余りがちな食材のレシピを探してみてください\n' +
                     '• 定期的にこの分析を行い、改善を確認しましょう\n' +
                     '• 廃棄した際は必ず `/食材廃棄` で理由を記録してください');

    embeds.push(footerEmbed);

    await interaction.editReply({ embeds: embeds });
  },

  // 深刻度レベルを取得
  getSeverityLevel(wasteRatio) {
    if (wasteRatio >= 80) return '🔴 緊急';
    if (wasteRatio >= 60) return '🟠 深刻';
    if (wasteRatio >= 40) return '🟡 注意';
    return '🟢 軽微';
  },

  // 一般的な改善提案を生成
  generateSuggestions(problemIngredients) {
    const suggestions = [
      '🛒 **購入量の見直し**\n   問題食材は通常の半分量から始めてみましょう',
      '📅 **消費計画の立案**\n   購入時に使用予定日を決めておきましょう',
      '🔄 **代替食材の検討**\n   似た栄養価で日持ちする食材への切り替えを検討',
      '📱 **定期チェック**\n   週2回程度、期限切れ近い食材をチェック',
      '👥 **家族との共有**\n   家族全員で食材の状況を把握できるように'
    ];

    return suggestions.slice(0, 3).join('\n\n');
  },

  // 個別アドバイスを生成
  generateIndividualAdvice(item) {
    const advice = {
      '野菜': '🥬 野菜室での適切な保存、カット野菜の冷凍保存を活用',
      '肉類': '🥩 小分け冷凍、下味冷凍で日持ちと時短を両立',
      '乳製品': '🥛 開封後は早めの消費を心がけ、料理への活用も検討',
      '調味料': '🧂 使用頻度の低い調味料は小容量タイプを選択'
    };

    // 食材名から推測されるカテゴリ
    let category = 'その他';
    const vegetables = ['キャベツ', '人参', '玉ねぎ', 'もやし', 'ピーマン'];
    const meats = ['豚肉', '鶏肉', '牛肉'];
    const dairy = ['牛乳', 'ヨーグルト', 'チーズ'];

    if (vegetables.some(v => item.ingredient.includes(v))) category = '野菜';
    else if (meats.some(m => item.ingredient.includes(m))) category = '肉類';
    else if (dairy.some(d => item.ingredient.includes(d))) category = '乳製品';

    const specificAdvice = advice[category] || '📦 使用頻度を見直し、適量購入を心がけましょう';

    return `**${item.ingredient}**: ${specificAdvice}`;
  },

  // 廃棄パターンを分析
  analyzeWastePatterns(problemIngredients) {
    const totalWaste = problemIngredients.reduce((sum, item) => sum + item.wasteCount, 0);
    const avgWasteRatio = problemIngredients.reduce((sum, item) => 
      sum + parseFloat(item.wasteRatio), 0) / problemIngredients.length;

    return [
      `• 問題食材数: ${problemIngredients.length}品目`,
      `• 総廃棄回数: ${totalWaste}回`,
      `• 平均廃棄率: ${avgWasteRatio.toFixed(1)}%`,
      `• 最も問題の食材: ${problemIngredients[0]?.ingredient}（廃棄率${problemIngredients[0]?.wasteRatio}%）`
    ].join('\n');
  },

  // カテゴリ別傾向を分析
  analyzeCategoryTrends(problemIngredients) {
    const categoryCount = {};
    
    problemIngredients.forEach(item => {
      // 簡易的なカテゴリ分類
      let category = 'その他';
      if (['キャベツ', '人参', '玉ねぎ', 'もやし'].some(v => item.ingredient.includes(v))) {
        category = '野菜';
      } else if (['豚肉', '鶏肉', '牛肉'].some(m => item.ingredient.includes(m))) {
        category = '肉類';
      } else if (['牛乳', 'ヨーグルト', 'チーズ'].some(d => item.ingredient.includes(d))) {
        category = '乳製品';
      }
      
      categoryCount[category] = (categoryCount[category] || 0) + 1;
    });

    const trends = Object.entries(categoryCount)
      .sort(([,a], [,b]) => b - a)
      .map(([category, count]) => `• ${category}: ${count}品目`)
      .join('\n');

    return trends || null;
  },

  // アクションプランを生成
  generateActionPlan(problemIngredients) {
    const topProblem = problemIngredients[0];
    
    const immediate = [
      `🎯 **最優先**: ${topProblem?.ingredient}の購入量を半分に減らす`,
      '📋 **今日**: 期限切れ近い食材で料理1品作る',
      '🔍 **今週**: 問題食材の現在の在庫状況を確認'
    ].join('\n');

    const longTerm = [
      '📅 **毎週**: 買い物前に在庫チェック習慣化',
      '📱 **毎月**: 問題食材分析を実行して改善確認',
      '💡 **継続**: 新しいレシピ開発で食材活用の幅を広げる'
    ].join('\n');

    return { immediate, longTerm };
  }
};
