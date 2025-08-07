// src/commands/useIngredients.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('食材使用')
    .setDescription('複数の食材を一括で使用記録します')
    .addStringOption(option =>
      option.setName('食材リスト')
        .setDescription('使用した食材（例: キャベツ:0.25,人参:0.5,豚肉:200g）')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('料理名')
        .setDescription('作った料理名（省略可）')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('メモ')
        .setDescription('備考があれば入力')
        .setRequired(false)),

  async execute(interaction, sheetsService) {
    await interaction.deferReply();

    try {
      const ingredientList = interaction.options.getString('食材リスト');
      const dishName = interaction.options.getString('料理名') || '手動入力';
      const memo = interaction.options.getString('メモ') || '';

      // 食材リストを解析
      const parsedIngredients = this.parseIngredientList(ingredientList);
      
      if (parsedIngredients.length === 0) {
        await interaction.editReply('❌ 食材リストの形式が正しくありません。\n\n**正しい形式例:**\n`キャベツ:0.25,人参:0.5,豚肉:200g`');
        return;
      }

      // 在庫確認
      const inventory = await sheetsService.getInventoryData();
      const stockCheck = this.checkStock(parsedIngredients, inventory);
      
      if (stockCheck.errors.length > 0) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ 在庫不足エラー')
          .setColor(0xFF6B6B)
          .setDescription('以下の食材で問題があります:')
          .addFields({
            name: '⚠️ エラー内容',
            value: stockCheck.errors.join('\n'),
            inline: false
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // 食材を一括使用
      const results = [];
      for (const ingredient of parsedIngredients) {
        try {
          if (ingredient.name === '米') {
            // 米の場合は合数に変換して処理
            const cups = ingredient.amount / 150; // 150g = 1合として計算
            const riceResult = await sheetsService.useRice(cups, `${dishName}: ${memo}`.trim());
            results.push({
              ingredient: '米',
              usedAmount: ingredient.amount,
              remainingAmount: riceResult.remainingAmount,
              unit: 'g',
              success: true
            });
          } else {
            const result = await sheetsService.useIngredient(
              ingredient.name, 
              ingredient.amount, 
              `${dishName}: ${memo}`.trim()
            );
            results.push({
              ...result,
              success: true
            });
          }
        } catch (error) {
          results.push({
            ingredient: ingredient.name,
            usedAmount: ingredient.amount,
            error: error.message,
            success: false
          });
        }
      }

      // 結果表示
      const embed = new EmbedBuilder()
        .setTitle('🍳 一括食材使用完了')
        .setColor(0x00AE86)
        .setDescription(`**${dishName}** で使用した食材を記録しました`)
        .setTimestamp();

      // 成功した食材
      const successResults = results.filter(r => r.success);
      if (successResults.length > 0) {
        const successList = successResults.map(result => {
          const warningIcon = result.remainingAmount <= 0 ? '⚠️ ' : '';
          return `${warningIcon}**${result.ingredient}**: ${result.usedAmount}${result.unit} → 残り${result.remainingAmount}${result.unit}`;
        }).join('\n');

        embed.addFields({
          name: '✅ 使用完了',
          value: successList,
          inline: false
        });
      }

      // エラーが発生した食材
      const errorResults = results.filter(r => !r.success);
      if (errorResults.length > 0) {
        const errorList = errorResults.map(result => 
          `**${result.ingredient}**: ${result.error}`
        ).join('\n');

        embed.addFields({
          name: '❌ エラー',
          value: errorList,
          inline: false
        });
        embed.setColor(0xFFA500); // 部分的成功の場合はオレンジ色
      }

      if (memo) {
        embed.addFields({ name: 'メモ', value: memo, inline: false });
      }

      // 在庫不足警告
      const lowStockItems = successResults.filter(r => r.remainingAmount <= 0);
      if (lowStockItems.length > 0) {
        embed.addFields({
          name: '⚠️ 在庫切れ',
          value: lowStockItems.map(item => `• ${item.ingredient}`).join('\n'),
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('一括食材使用エラー:', error);
      await interaction.editReply(`❌ エラーが発生しました: ${error.message}`);
    }
  },

  // 食材リストを解析する関数
  parseIngredientList(ingredientList) {
    const ingredients = [];
    
    // カンマで分割
    const items = ingredientList.split(',').map(item => item.trim());
    
    for (const item of items) {
      // コロンで食材名と数量を分割
      const parts = item.split(':').map(part => part.trim());
      
      if (parts.length !== 2) {
        continue; // 形式が正しくない場合はスキップ
      }
      
      const name = parts[0];
      const amountStr = parts[1];
      
      // 数量と単位を解析
      const { amount, unit } = this.parseAmount(amountStr);
      
      if (amount > 0 && name) {
        ingredients.push({
          name: name,
          amount: amount,
          unit: unit,
          originalInput: item
        });
      }
    }
    
    return ingredients;
  },

  // 数量文字列を解析する関数
  parseAmount(amountStr) {
    // 数字部分と単位部分を分離
    const match = amountStr.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    
    if (!match) {
      return { amount: 0, unit: '' };
    }
    
    const amount = parseFloat(match[1]);
    let unit = match[2] || '';
    
    // 単位の正規化
    if (unit === '' || unit === 'g' || unit === 'グラム') {
      unit = 'g';
    } else if (unit === 'ml' || unit === 'ミリリットル') {
      unit = 'ml';
    } else if (unit === '個' || unit === 'こ') {
      unit = '個';
    } else if (unit === '本' || unit === 'ほん') {
      unit = '本';
    } else if (unit === '袋' || unit === 'ふくろ') {
      unit = '袋';
    } else if (unit === 'パック') {
      unit = 'パック';
    } else if (unit === '枚' || unit === 'まい') {
      unit = '枚';
    }
    
    return { amount, unit };
  },

  // 在庫チェック関数
  checkStock(parsedIngredients, inventory) {
    const errors = [];
    
    for (const ingredient of parsedIngredients) {
      if (ingredient.name === '米') {
        // 米は別途チェック（getRiceDataを使用）
        continue;
      }
      
      const inventoryItem = inventory.find(item => 
        item.name.toLowerCase() === ingredient.name.toLowerCase()
      );
      
      if (!inventoryItem) {
        errors.push(`• **${ingredient.name}**: 在庫に登録されていません`);
        continue;
      }
      
      // 単位が一致するかチェック
      if (inventoryItem.unit !== ingredient.unit && ingredient.unit !== '') {
        errors.push(`• **${ingredient.name}**: 単位が一致しません（在庫: ${inventoryItem.unit}, 入力: ${ingredient.unit}）`);
        continue;
      }
      
      // 在庫量チェック
      if (inventoryItem.currentAmount < ingredient.amount) {
        errors.push(`• **${ingredient.name}**: 在庫不足（在庫: ${inventoryItem.currentAmount}${inventoryItem.unit}, 必要: ${ingredient.amount}${ingredient.unit}）`);
      }
    }
    
    return { errors };
  }
};
