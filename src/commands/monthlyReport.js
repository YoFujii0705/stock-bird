// src/commands/monthlyReport.js - 月間レポートコマンド
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const AnalysisService = require('../services/AnalysisService');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('月間レポート')
    .setDescription('指定月の食材使用状況や廃棄率の詳細レポートを生成します')
    .addIntegerOption(option =>
      option.setName('年')
        .setDescription('レポート対象年（省略時は今年）')
        .setRequired(false)
        .setMinValue(2020)
        .setMaxValue(2030))
    .addIntegerOption(option =>
      option.setName('月')
        .setDescription('レポート対象月（省略時は先月）')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(12))
    .addBooleanOption(option =>
      option.setName('詳細表示')
        .setDescription('詳細な分析データも表示するか')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('ファイル出力')
        .setDescription('CSVファイルとしても出力するか')
        .setRequired(false)),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const analysisService = new AnalysisService(sheetsService);
      
      // パラメータ取得
      const currentDate = new Date();
      const targetYear = interaction.options.getInteger('年') || currentDate.getFullYear();
      let targetMonth = interaction.options.getInteger('月');
      
      if (!targetMonth) {
        // 先月を設定
        const lastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1);
        targetMonth = lastMonth.getMonth() + 1;
      }
      
      const showDetails = interaction.options.getBoolean('詳細表示') || false;
      const generateFile = interaction.options.getBoolean('ファイル出力') || false;

      // レポート生成
      const report = await analysisService.generateMonthlyReport(targetYear, targetMonth);
      
      if (!report || report.summary.totalRecords === 0) {
        await interaction.editReply(`📊 ${targetYear}年${targetMonth}月のデータが見つかりませんでした。`);
        return;
      }

      // レポート表示
      await this.displayReport(interaction, report, showDetails);

      // ファイル出力が要求された場合
      if (generateFile) {
        await this.generateReportFile(interaction, report, targetYear, targetMonth);
      }

    } catch (error) {
      console.error('月間レポート生成エラー:', error);
      await interaction.editReply(`❌ レポート生成中にエラーが発生しました: ${error.message}`);
    }
  },

  // レポートを表示
  async displayReport(interaction, report, showDetails) {
    const embeds = [];

    // メインサマリー
    const summaryEmbed = new EmbedBuilder()
      .setTitle(`📊 ${report.period} 月間レポート`)
      .setColor(0x3498DB)
      .setTimestamp();

    // 基本統計
    summaryEmbed.addFields(
      { 
        name: '📈 基本統計', 
        value: [
          `総記録数: **${report.summary.totalRecords}件**`,
          `料理記録: **${report.summary.cookingRecords}件**`,
          `廃棄記録: **${report.summary.wastageRecords}件**`,
          `編集記録: **${report.summary.editRecords}件**`
        ].join('\n'),
        inline: true 
      },
      { 
        name: '♻️ 廃棄率分析', 
        value: [
          `廃棄率: **${report.summary.wastePercentage}%**`,
          `総使用量: **${report.summary.totalUsage}**`,
          `総廃棄量: **${report.summary.totalWaste}**`,
          `${this.getWasteRateEmoji(report.summary.wastePercentage)} ${this.getWasteRateComment(report.summary.wastePercentage)}`
        ].join('\n'),
        inline: true 
      }
    );

    // コスト分析
    if (report.costAnalysis) {
      summaryEmbed.addFields({
        name: '💰 コスト分析（概算）',
        value: [
          `使用コスト: **¥${report.costAnalysis.totalUsageCost}**`,
          `廃棄コスト: **¥${report.costAnalysis.totalWasteCost}**`,
          `節約可能額: **¥${report.costAnalysis.monthlySavingPotential}**`
        ].join('\n'),
        inline: false
      });
    }

    embeds.push(summaryEmbed);

    // 食品ロス詳細
    if (report.foodWaste.totalWasteCount > 0) {
      const wasteEmbed = new EmbedBuilder()
        .setTitle('🗑️ 食品ロス分析')
        .setColor(0xE74C3C);

      // 廃棄が多い食材 Top 5
      if (report.foodWaste.topWastedIngredients.length > 0) {
        const wasteList = report.foodWaste.topWastedIngredients
          .map((item, index) => `${index + 1}. ${item.ingredient}: ${item.amount}`)
          .join('\n');
        
        wasteEmbed.addFields({
          name: '🔸 廃棄量が多い食材 Top 5',
          value: wasteList,
          inline: false
        });
      }

      // 廃棄理由分析
      const reasonsList = Object.entries(report.foodWaste.wasteReasons)
        .sort(([,a], [,b]) => b - a)
        .map(([reason, count]) => `• ${reason}: ${count}件`)
        .join('\n');

      if (reasonsList) {
        wasteEmbed.addFields({
          name: '📝 廃棄理由別統計',
          value: reasonsList,
          inline: false
        });
      }

      embeds.push(wasteEmbed);
    }

    // よく使用される食材
    if (report.frequentlyUsed.topByCount.length > 0) {
      const usageEmbed = new EmbedBuilder()
        .setTitle('🍳 使用頻度分析')
        .setColor(0x2ECC71);

      const usageList = report.frequentlyUsed.topByCount
        .slice(0, 10)
        .map((item, index) => `${index + 1}. ${item.ingredient}: ${item.count}回 (${item.totalAmount})`)
        .join('\n');

      usageEmbed.addFields({
        name: '🔸 よく使用される食材 Top 10',
        value: usageList,
        inline: false
      });

      embeds.push(usageEmbed);
    }

    // 詳細表示の場合
    if (showDetails) {
      // 消費パターン分析
      const patternEmbed = new EmbedBuilder()
        .setTitle('📅 消費パターン分析')
        .setColor(0x9B59B6);

      patternEmbed.addFields(
        {
          name: '📊 活動パターン',
          value: [
            `最も料理する日: **${report.consumptionPatterns.mostActiveDay}曜日**`,
            `最も料理する時間: **${report.consumptionPatterns.mostActiveHour}**`,
            `1日平均料理回数: **${report.consumptionPatterns.averageCookingPerDay}回**`
          ].join('\n'),
          inline: false
        }
      );

      embeds.push(patternEmbed);

      // カテゴリ別分析
      if (Object.keys(report.categoryBreakdown).length > 0) {
        const categoryEmbed = new EmbedBuilder()
          .setTitle('📂 カテゴリ別分析')
          .setColor(0xF39C12);

        const categoryList = Object.entries(report.categoryBreakdown)
          .sort(([,a], [,b]) => parseFloat(b.wasteRate) - parseFloat(a.wasteRate))
          .map(([category, data]) => 
            `• ${category}: 使用${data.usage} / 廃棄${data.waste} (廃棄率${data.wasteRate}%)`
          )
          .join('\n');

        categoryEmbed.addFields({
          name: '📊 カテゴリ別廃棄率',
          value: categoryList || 'データなし',
          inline: false
        });

        embeds.push(categoryEmbed);
      }
    }

    // 改善提案
    if (report.recommendations.length > 0) {
      const recommendEmbed = new EmbedBuilder()
        .setTitle('💡 改善提案')
        .setColor(0x17A2B8);

      const recommendations = report.recommendations
        .map(rec => {
          const priorityEmoji = rec.priority === 'high' ? '🔴' : 
                               rec.priority === 'medium' ? '🟡' : '🟢';
          return `${priorityEmoji} ${rec.message}`;
        })
        .join('\n\n');

      recommendEmbed.addFields({
        name: '📋 今月の改善ポイント',
        value: recommendations,
        inline: false
      });

      embeds.push(recommendEmbed);
    }

    // フッター
    const footerEmbed = new EmbedBuilder()
      .setColor(0x95A5A6)
      .setDescription('📌 **このレポートの活用方法**\n' +
                     '• 廃棄率が高い食材は購入量を見直しましょう\n' +
                     '• よく使う食材は常備品設定で買い忘れを防止\n' +
                     '• 消費パターンを把握して計画的な買い物を\n' +
                     '• `/料理提案` で余りがちな食材のレシピを探してみてください');

    embeds.push(footerEmbed);

    await interaction.followUp({ embeds: embeds });
  },

  // レポートファイルを生成
  async generateReportFile(interaction, report, year, month) {
    try {
      const csvData = this.generateCSVData(report);
      const filename = `monthly_report_${year}_${month.toString().padStart(2, '0')}.csv`;
      const tempPath = path.join(__dirname, '../../temp', filename);

      // tempディレクトリが存在しない場合は作成
      await fs.mkdir(path.dirname(tempPath), { recursive: true });

      // CSVファイル作成
      await fs.writeFile(tempPath, csvData, 'utf-8');

      // Discord添付ファイルとして送信
      const attachment = new AttachmentBuilder(tempPath, { name: filename });
      
      await interaction.followUp({
        content: '📄 月間レポートのCSVファイルを生成しました。',
        files: [attachment]
      });

      // 一時ファイル削除
      setTimeout(async () => {
        try {
          await fs.unlink(tempPath);
        } catch (error) {
          console.error('Temp file cleanup error:', error);
        }
      }, 60000); // 1分後に削除

    } catch (error) {
      console.error('CSV生成エラー:', error);
      await interaction.followUp('❌ CSVファイルの生成に失敗しました。');
    }
  },

  // CSV データを生成
  generateCSVData(report) {
    let csv = '月間レポート\n';
    csv += `期間,${report.period}\n`;
    csv += `生成日時,${new Date().toLocaleString('ja-JP')}\n\n`;

    // サマリー
    csv += '基本統計\n';
    csv += `項目,値\n`;
    csv += `総記録数,${report.summary.totalRecords}\n`;
    csv += `料理記録,${report.summary.cookingRecords}\n`;
    csv += `廃棄記録,${report.summary.wastageRecords}\n`;
    csv += `編集記録,${report.summary.editRecords}\n`;
    csv += `廃棄率(%),${report.summary.wastePercentage}\n`;
    csv += `総使用量,${report.summary.totalUsage}\n`;
    csv += `総廃棄量,${report.summary.totalWaste}\n\n`;

    // よく使用される食材
    csv += 'よく使用される食材\n';
    csv += `順位,食材名,使用回数,総使用量\n`;
    report.frequentlyUsed.topByCount.forEach((item, index) => {
      csv += `${index + 1},${item.ingredient},${item.count},${item.totalAmount}\n`;
    });
    csv += '\n';

    // 廃棄の多い食材
    if (report.foodWaste.topWastedIngredients.length > 0) {
      csv += '廃棄量の多い食材\n';
      csv += `順位,食材名,廃棄量\n`;
      report.foodWaste.topWastedIngredients.forEach((item, index) => {
        csv += `${index + 1},${item.ingredient},${item.amount}\n`;
      });
      csv += '\n';
    }

    // カテゴリ別分析
    if (Object.keys(report.categoryBreakdown).length > 0) {
      csv += 'カテゴリ別分析\n';
      csv += `カテゴリ,使用量,廃棄量,廃棄率(%)\n`;
      Object.entries(report.categoryBreakdown).forEach(([category, data]) => {
        csv += `${category},${data.usage},${data.waste},${data.wasteRate}\n`;
      });
    }

    return csv;
  },

  // 廃棄率に応じた絵文字
  getWasteRateEmoji(wastePercentage) {
    if (wastePercentage <= 5) return '🟢';
    if (wastePercentage <= 15) return '🟡';
    return '🔴';
  },

  // 廃棄率に応じたコメント
  getWasteRateComment(wastePercentage) {
    if (wastePercentage <= 5) return '素晴らしい！';
    if (wastePercentage <= 10) return '良好です';
    if (wastePercentage <= 15) return '改善の余地あり';
    return '要改善';
  }
};
