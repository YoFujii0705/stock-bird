// ==================================================
// src/handlers/enhancedClaudeRecipeHandler.js - 拡張版レシピ詳細表示
// ==================================================

const { EmbedBuilder } = require('discord.js');

// 🆕 拡張Claude レシピ選択処理
async function handleEnhancedClaudeRecipeSelect(interaction, claudeService) {
  // 🔧 修正: ephemeralをflagsに変更
  await interaction.deferReply({ flags: 64 }); // 64 = ephemeral flag

  try {
    const selectedValue = interaction.values[0];
    console.log(`🧠✨ Claude AI拡張レシピ詳細表示: ${selectedValue}`);

    // レシピIDから詳細レシピ情報を取得
    const detailedRecipe = await getEnhancedRecipeFromCache(selectedValue);
    
    if (!detailedRecipe) {
      await interaction.editReply('❌ レシピ詳細が見つかりませんでした。キャッシュの有効期限が切れた可能性があります。もう一度料理提案をお試しください。');
      return;
    }

    // 拡張された詳細レシピEmbed作成
    const detailEmbed = await createEnhancedRecipeDetailEmbed(detailedRecipe);
    
    await interaction.editReply({ 
      content: `🧠✨ **Claude AI拡張レシピ詳細**`,
      embeds: [detailEmbed] 
    });

  } catch (error) {
    console.error('Claude拡張レシピ詳細エラー:', error);
    
    let errorMessage = '❌ レシピ詳細の表示中にエラーが発生しました。';
    
    if (error.message.includes('見つかりませんでした')) {
      errorMessage = '❌ 指定されたレシピが見つかりませんでした。キャッシュの有効期限が切れた可能性があります。もう一度料理提案をお試しください。';
    } else if (error.message.includes('API制限')) {
      errorMessage = '❌ API使用量の制限に達しました。しばらく待ってから再度お試しください。';
    }
    
    await interaction.editReply(errorMessage);
  }
}

// 🆕 拡張レシピ詳細Embed作成
async function createEnhancedRecipeDetailEmbed(recipe) {
  const embed = new EmbedBuilder()
    .setTitle(`🧠✨ ${recipe.recipeTitle}`)
    .setColor(0x7C3AED)
    .setTimestamp();

  // 基本情報（拡張版）
  let basicInfo = [];
  if (recipe.recipeIndication) basicInfo.push(`⏱️ **調理時間**: ${recipe.recipeIndication}`);
  if (recipe.servings) basicInfo.push(`👥 **人数**: ${recipe.servings}人分`);
  if (recipe.difficulty) basicInfo.push(`📊 **難易度**: ${recipe.difficulty}`);
  if (recipe.cuisineType) basicInfo.push(`🍽️ **ジャンル**: ${recipe.cuisineType}`);
  if (recipe.estimatedCost) basicInfo.push(`💰 **目安費用**: ${recipe.estimatedCost}`);

  if (basicInfo.length > 0) {
    embed.addFields({
      name: '📋 基本情報',
      value: basicInfo.join('\n'),
      inline: false
    });
  }

  // 料理の説明・特徴
  if (recipe.description) {
    embed.addFields({
      name: '📝 料理について',
      value: recipe.description,
      inline: false
    });
  }

  // 期限切れ近い食材の使用状況
  if (recipe.urgentIngredientsUsed && recipe.urgentIngredientsUsed.length > 0) {
    embed.addFields({
      name: '⚠️ 期限切れ近い食材を活用',
      value: `✅ **${recipe.urgentIngredientsUsed.join('、')}** を効果的に使用`,
      inline: false
    });
  }

  // 材料リスト（拡張版：調味料も含む）
  if (recipe.detailedIngredients && recipe.detailedIngredients.length > 0) {
    const ingredients = recipe.detailedIngredients.slice(0, 15).map((ing, index) => {
      const amount = ing.amount ? ` ${ing.amount}${ing.unit || ''}` : '';
      const stockIcon = ing.fromStock ? '✅' : '🛒';
      const note = ing.note ? ` (${ing.note})` : '';
      return `${stockIcon} **${ing.name}**${amount}${note}`;
    }).join('\n');

    embed.addFields({
      name: '🥄 材料（✅在庫あり / 🛒要購入）',
      value: ingredients.length > 1024 ? ingredients.substring(0, 1021) + '...' : ingredients,
      inline: false
    });
  }

  // 調味料（別途表示）
  if (recipe.seasonings && recipe.seasonings.length > 0) {
    const seasonings = recipe.seasonings.map((seasoning, index) => {
      const timing = seasoning.timing ? ` (${seasoning.timing})` : '';
      return `${index + 1}. **${seasoning.name}** ${seasoning.amount}${timing}`;
    }).join('\n');

    embed.addFields({
      name: '🧂 調味料',
      value: seasonings,
      inline: false
    });
  }

  // 詳細な作り方（拡張版）
  if (recipe.enhancedInstructions && recipe.enhancedInstructions.length > 0) {
    const instructions = recipe.enhancedInstructions.slice(0, 8).map(inst => {
      let formatted = `**手順${inst.step}** ${inst.description}`;
      if (inst.time) formatted += `\n⏱️ 目安時間: ${inst.time}`;
      if (inst.tip) formatted += `\n💡 コツ: ${inst.tip}`;
      return formatted;
    }).join('\n\n');

    const truncatedInstructions = instructions.length > 1000 ? 
      instructions.substring(0, 997) + '...' : instructions;

    embed.addFields({
      name: '👨‍🍳 詳しい作り方',
      value: truncatedInstructions,
      inline: false
    });
  }

  // 料理の特徴・魅力（拡張版）
  if (recipe.features) {
    let featureText = [];
    if (recipe.features.mainAppeal) featureText.push(`🌟 **魅力**: ${recipe.features.mainAppeal}`);
    if (recipe.features.nutritionBenefits) featureText.push(`🥗 **栄養**: ${recipe.features.nutritionBenefits}`);
    if (recipe.features.storageInfo) featureText.push(`📦 **保存**: ${recipe.features.storageInfo}`);

    if (featureText.length > 0) {
      embed.addFields({
        name: '✨ この料理の特徴',
        value: featureText.join('\n'),
        inline: false
      });
    }
  }

  // アレンジ・バリエーション
  if (recipe.arrangements && recipe.arrangements.length > 0) {
    const arrangements = recipe.arrangements.slice(0, 3).map((arr, index) => {
      return `${index + 1}. **${arr.variation}**\n   ${arr.method}\n   💡 ${arr.effect}`;
    }).join('\n\n');

    embed.addFields({
      name: '🔄 アレンジ・バリエーション',
      value: arrangements.length > 1000 ? arrangements.substring(0, 997) + '...' : arrangements,
      inline: false
    });
  }

  // 料理のコツ・ポイント（拡張版）
  if (recipe.tips) {
    let tipsList = [];
    if (recipe.tips.cooking) tipsList.push(`👨‍🍳 **調理のコツ**: ${recipe.tips.cooking}`);
    if (recipe.tips.serving) tipsList.push(`🍽️ **盛り付け**: ${recipe.tips.serving}`);
    if (recipe.tips.leftover) tipsList.push(`♻️ **余った時**: ${recipe.tips.leftover}`);

    if (tipsList.length > 0) {
      embed.addFields({
        name: '💡 成功のコツ',
        value: tipsList.join('\n\n'),
        inline: false
      });
    }
  }

  // 適合度・評価情報
  if (recipe.relevanceScore) {
    embed.addFields({
      name: '📊 AI評価',
      value: `適合度: **${recipe.relevanceScore}%** / 100%\n🤖 Claude AIが在庫状況と条件を総합的に判断`,
      inline: false
    });
  }

  // フッター
  embed.setFooter({
    text: `レシピID: ${recipe.recipeId} | Claude AI 拡張版で生成`
  });

  return embed;
}

// 🔧 キャッシュからレシピ取得（デバッグ強化版）
async function getEnhancedRecipeFromCache(recipeId) {
  try {
    console.log(`🔍 レシピキャッシュ検索: ${recipeId}`);
    
    // グローバルキャッシュの状態をチェック
    if (!global.claudeRecipeCache) {
      console.log('❌ グローバルキャッシュが初期化されていません');
      global.claudeRecipeCache = {};
      return null;
    }
    
    console.log(`📦 現在のキャッシュ件数: ${Object.keys(global.claudeRecipeCache).length}件`);
    console.log(`🔑 キャッシュのキー一覧:`, Object.keys(global.claudeRecipeCache));
    
    // レシピIDでの直接検索
    if (global.claudeRecipeCache[recipeId]) {
      console.log(`✅ レシピ発見: ${recipeId}`);
      return global.claudeRecipeCache[recipeId];
    }
    
    // 部分マッチでの検索（IDの形式が変わった場合の対策）
    const matchingKeys = Object.keys(global.claudeRecipeCache).filter(key => 
      key.includes(recipeId) || recipeId.includes(key)
    );
    
    if (matchingKeys.length > 0) {
      console.log(`✅ 部分マッチでレシピ発見: ${matchingKeys[0]}`);
      return global.claudeRecipeCache[matchingKeys[0]];
    }
    
    // インデックスベースでの検索（claude_simple_1754386409987_0 → インデックス0）
    const indexMatch = recipeId.match(/_(\d+)$/);
    if (indexMatch) {
      const index = parseInt(indexMatch[1]);
      const timestampMatch = recipeId.match(/(\d{13})/);
      if (timestampMatch) {
        const timestamp = timestampMatch[1];
        // 近い時刻のレシピを探す
        const similarKeys = Object.keys(global.claudeRecipeCache).filter(key => 
          key.includes(timestamp) || Math.abs(parseInt(key.match(/(\d{13})/)?.[1] || '0') - parseInt(timestamp)) < 10000
        );
        
        if (similarKeys.length > index) {
          console.log(`✅ インデックスベース検索でレシピ発見: ${similarKeys[index]}`);
          return global.claudeRecipeCache[similarKeys[index]];
        }
      }
    }
    
    console.log(`⚠️ レシピID ${recipeId} がキャッシュに見つかりません`);
    return null;
    
  } catch (error) {
    console.error('レシピキャッシュ取得エラー:', error);
    return null;
  }
}

// 🆕 レシピキャッシュ管理（有効期限延長版）
function cacheEnhancedRecipes(recipes) {
  if (!global.claudeRecipeCache) {
    global.claudeRecipeCache = {};
  }
  
  recipes.forEach(recipe => {
    if (recipe.recipeId) {
      global.claudeRecipeCache[recipe.recipeId] = recipe;
      console.log(`📦 キャッシュ保存: ${recipe.recipeId} - ${recipe.recipeTitle}`);
      
      // 🔧 有効期限を60分に延長（30分→60分）
      setTimeout(() => {
        if (global.claudeRecipeCache && global.claudeRecipeCache[recipe.recipeId]) {
          delete global.claudeRecipeCache[recipe.recipeId];
          console.log(`🗑️ キャッシュ期限切れ削除: ${recipe.recipeId}`);
        }
      }, 60 * 60 * 1000); // 60分
    }
  });
  
  console.log(`📦 ${recipes.length}件のレシピをキャッシュに保存（60分間有効）`);
  console.log(`📊 現在のキャッシュ総数: ${Object.keys(global.claudeRecipeCache).length}件`);
}

module.exports = {
  handleEnhancedClaudeRecipeSelect,
  createEnhancedRecipeDetailEmbed,
  cacheEnhancedRecipes,
  getEnhancedRecipeFromCache
};
