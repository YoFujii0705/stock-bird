// ==================================================
// src/services/ClaudeRecipeService.js - 大幅改善版
// ==================================================

const axios = require('axios');

class ClaudeRecipeService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.anthropic.com/v1/messages';
    this.model = 'claude-3-haiku-20240307';
    this.cache = new Map();
    this.requestCount = 0;
    this.maxRequestsPerDay = 1000;
  }

  // 🍳 メイン料理提案機能（大幅改善版）
  async suggestRecipes(availableIngredients, urgentIngredients = [], options = {}) {
    try {
      console.log(`🧠 Claude AI料理提案開始: ${availableIngredients.length}食材`);
      
      // キャッシュキー生成
      const cacheKey = this.generateCacheKey(availableIngredients, urgentIngredients, options);
      if (this.cache.has(cacheKey)) {
        console.log('💾 キャッシュから料理提案取得');
        return this.cache.get(cacheKey);
      }

      // 使用量チェック
      if (this.requestCount >= this.maxRequestsPerDay) {
        throw new Error('Claude API日次制限に達しました');
      }

      // 改善されたプロンプト生成
      const prompt = this.buildEnhancedRecipePrompt(availableIngredients, urgentIngredients, options);
      
      // Claude API呼び出し
      const response = await this.callClaudeAPI(prompt);
      this.requestCount++;

      // レスポンス解析
      const recipes = this.parseRecipeResponse(response);
      
      // キャッシュに保存
      this.cache.set(cacheKey, recipes);
      
      console.log(`✅ Claude AIから${recipes.length}件のレシピ提案を取得`);
      return recipes;

    } catch (error) {
      console.error('Claude料理提案エラー:', error.message);
      return this.generateFallbackRecipes(availableIngredients, urgentIngredients, options);
    }
  }

  // 🎯 大幅改善されたプロンプト構築
  buildEnhancedRecipePrompt(availableIngredients, urgentIngredients, options) {
    const {
      cuisineType = 'any',        // 料理ジャンル
      cookingStyle = 'normal',    // 調理スタイル
      priorityIngredient,
      maxRecipes = 5,
      includeDetails = true
    } = options;

    // 料理ジャンルの設定
    const cuisinePrompts = {
      'japanese': '日本料理・和食（煮物、焼き物、汁物、丼物、定食など）',
      'western': '洋食（パスタ、グリル、サラダ、スープ、オムライスなど）',
      'chinese': '中華料理（炒め物、蒸し物、麻婆、餃子、チャーハンなど）',
      'korean': '韓国料理（キムチ、ナムル、チゲ、ビビンバ、焼肉など）',
      'italian': 'イタリア料理（パスタ、ピザ、リゾット、カルパッチョなど）',
      'ethnic': 'エスニック料理（タイ、インド、メキシカン、東南アジアなど）',
      'any': '様々なジャンル（和洋中なんでも）'
    };

    // 調理スタイルの設定
    const stylePrompts = {
      'easy': '簡単・時短（調理時間20分以内、手順3-5ステップ、特別な技術不要）',
      'healthy': 'ヘルシー（低カロリー、野菜多め、蒸す・茹でる調理法優先、栄養バランス重視）',
      'hearty': 'がっつり・ボリューム満点（肉や炭水化物多め、満足感重視、食べ応えあり）',
      'meal_prep': '作り置き・保存重視（冷蔵3-5日保存可能、冷凍対応、まとめて作れる）',
      'gourmet': '本格的・特別な日（手の込んだ調理、見栄えを重視、特別感のある仕上がり）',
      'comfort': '家庭的・ほっこり（懐かしい味、温かい料理、心が安らぐ優しい味付け）',
      'normal': '普通・バランス型（適度な調理時間、栄養バランス、日常的な料理）'
    };

    let prompt = `あなたは経験豊富な料理研究家で、創造性豊かなレシピ開発のプロフェッショナルです。以下の条件に基づいて、実用的で美味しく、独創的な料理を提案してください。

## 🥗 利用可能な食材リスト
`;

    // 期限切れ近い食材を強調
    if (urgentIngredients.length > 0) {
      prompt += `### ⚠️ 期限切れ近い食材（最優先使用）\n`;
      urgentIngredients.forEach(ing => {
        const urgencyLevel = ing.daysLeft === 0 ? '🔴今日期限!' : 
                            ing.daysLeft === 1 ? '🟡明日期限' : '🟢期限間近';
        prompt += `- **${ing.name}** ${urgencyLevel} (${ing.amount}${ing.unit})\n`;
      });
      prompt += '\n';
    }

    // 通常の食材（カテゴリ別に整理）
    const normalIngredients = availableIngredients.filter(ing => 
      !urgentIngredients.some(urgent => urgent.name === ing.name)
    );
    
    if (normalIngredients.length > 0) {
      // カテゴリ別に分類
      const categorizedIngredients = this.categorizeIngredients(normalIngredients);
      
      Object.keys(categorizedIngredients).forEach(category => {
        if (categorizedIngredients[category].length > 0) {
          prompt += `### ${this.getCategoryIcon(category)} ${category}\n`;
          categorizedIngredients[category].forEach(ing => {
            prompt += `- ${ing.name} (${ing.amount}${ing.unit})\n`;
          });
          prompt += '\n';
        }
      });
    }

    // 料理の条件設定
    prompt += `## 🎯 料理提案の条件\n`;
    prompt += `- **料理ジャンル**: ${cuisinePrompts[cuisineType]}\n`;
    prompt += `- **調理スタイル**: ${stylePrompts[cookingStyle]}\n`;
    
    if (priorityIngredient) {
      prompt += `- **メイン食材**: ${priorityIngredient}を中心とした料理\n`;
    }
    
    if (urgentIngredients.length > 0) {
      prompt += `- **重要**: 期限切れ近い食材を可能な限り多く使用\n`;
    }

    prompt += `- **提案数**: ${maxRecipes}件\n`;

    // 🔧 極めて簡潔なプロンプト（レスポンスが切れないように最小限に）
    prompt += `
## ⚡ 重要：簡潔な出力

以下のJSON形式のみで回答してください。説明文は不要です。

\`\`\`json
{
  "recipes": [
    {
      "title": "創意工夫した料理名",
      "category": "主菜/副菜/汁物/丼物",
      "cuisineType": "${cuisineType === 'any' ? '和食' : cuisineType}",
      "cookingTime": 調理時間（分）,
      "difficulty": "簡単/普通/上級",
      "servings": 人数,
      "description": "料理の特徴（1文のみ）",
      "ingredients": [
        {"name": "食材名", "amount": "分量", "unit": "単位", "fromStock": true/false}
      ],
      "seasonings": [
        {"name": "調味料名", "amount": "分量", "timing": "使用時"}
      ],
      "instructions": [
        {"step": 1, "description": "手順", "tip": "コツ", "time": "時間"}
      ],
      "features": {"mainAppeal": "魅力", "nutritionBenefits": "栄養"},
      "arrangements": [{"variation": "アレンジ名", "method": "方法"}],
      "relevanceScore": 適合度（0-100）,
      "urgentIngredientsUsed": ["期限切れ近い食材"],
      "estimatedCost": "材料費"
    }
  ],
  "summary": {"totalRecipes": ${maxRecipes}, "recommendation": "提案理由"}
}
\`\`\``;

    return prompt;
  }

  // 🔧 食材のカテゴリ分類ヘルパー
  categorizeIngredients(ingredients) {
    const categories = {
      '野菜類': [],
      '肉類・魚介類': [],
      '乳製品・卵': [],
      '主食・麺類': [],
      '冷凍・加工食品': [],
      'その他': []
    };

    ingredients.forEach(ing => {
      switch (ing.category) {
        case '野菜':
          categories['野菜類'].push(ing);
          break;
        case '肉類':
        case '魚介類':
          categories['肉類・魚介類'].push(ing);
          break;
        case '乳製品':
          categories['乳製品・卵'].push(ing);
          break;
        case 'パン類':
        case '麺類':
          categories['主食・麺類'].push(ing);
          break;
        case '冷凍食品':
          categories['冷凍・加工食品'].push(ing);
          break;
        default:
          categories['その他'].push(ing);
      }
    });

    return categories;
  }

  // 🎨 カテゴリアイコンの取得
  getCategoryIcon(category) {
    const icons = {
      '野菜類': '🥬',
      '肉類・魚介類': '🥩',
      '乳製品・卵': '🥚',
      '主食・麺類': '🍚',
      '冷凍・加工食品': '🧊',
      'その他': '📦'
    };
    return icons[category] || '📦';
  }

  // 🌐 Claude API呼び出し（レスポンス切れ対策強化）
  async callClaudeAPI(prompt) {
    try {
      const response = await axios.post(this.baseUrl, {
        model: this.model,
        max_tokens: 2500, // さらに削減して確実に完了させる
        temperature: 0.7, // 創造性よりも確実性を重視
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        timeout: 30000 // タイムアウトも短縮
      });

      return response.data.content[0].text;
    } catch (error) {
      if (error.response?.status === 429) {
        throw new Error('Claude API使用量制限に達しました');
      } else if (error.response?.status === 401) {
        throw new Error('Claude APIキーが無効です');
      } else if (error.response?.status === 529) {
        console.log('⚠️ Claude API server overloaded (529), using enhanced fallback');
        throw new Error('Claude APIサーバーが過負荷状態です');
      } else {
        console.error('Claude API詳細エラー:', error.response?.data || error.message);
        throw new Error(`Claude API呼び出しエラー: ${error.message}`);
      }
    }
  }

  // 📝 改善されたレスポンス解析
  parseRecipeResponse(response) {
    try {
      console.log('🔍 Claude レスポンス解析開始...');
      console.log(`📏 レスポンス長: ${response.length}文字`);
      
      let jsonData = null;
      let jsonString = null;
      
      // パターン1: 標準的な```json形式
      let jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonString = jsonMatch[1].trim();
        try {
          jsonData = JSON.parse(jsonString);
          console.log('✅ 標準JSON形式で解析成功');
        } catch (e) {
          console.log('⚠️ 標準JSON形式の解析失敗:', e.message);
        }
      }
      
      // パターン2: ```のみ
      if (!jsonData) {
        jsonMatch = response.match(/```\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonString = jsonMatch[1].trim();
          try {
            jsonData = JSON.parse(jsonString);
            console.log('✅ 簡略JSON形式で解析成功');
          } catch (e) {
            console.log('⚠️ 簡略JSON形式の解析失敗:', e.message);
          }
        }
      }
      
      // パターン3: JSONブロックが直接ある場合
      if (!jsonData) {
        const startIndex = response.indexOf('{');
        const lastIndex = response.lastIndexOf('}');
        if (startIndex !== -1 && lastIndex !== -1 && startIndex < lastIndex) {
          jsonString = response.substring(startIndex, lastIndex + 1);
          try {
            jsonData = JSON.parse(jsonString);
            console.log('✅ 直接JSON抽出で解析成功');
          } catch (e) {
            console.log('⚠️ 直接JSON抽出失敗:', e.message);
          }
        }
      }
      
      // パターン4: 高度なJSON修復
      if (!jsonData && jsonString) {
        console.log('🔧 高度なJSON修復を試行...');
        jsonData = this.repairIncompleteJSON(jsonString);
      }
      
      if (!jsonData) {
        console.error('❌ 全てのJSON解析パターンが失敗');
        throw new Error('JSON形式のレスポンスが見つかりません');
      }
      
      if (!jsonData.recipes || !Array.isArray(jsonData.recipes)) {
        console.error('❌ レシピデータの形式が不正:', typeof jsonData.recipes);
        throw new Error('レシピデータの形式が不正です');
      }

      console.log(`✅ ${jsonData.recipes.length}件のレシピを解析`);

      // レシピデータを拡張形式に変換
      const enhancedRecipes = jsonData.recipes.map((recipe, index) => ({
        recipeId: `claude_enhanced_${Date.now()}_${index}`,
        recipeTitle: recipe.title || 'レシピ名不明',
        recipeUrl: '#',
        foodImageUrl: null,
        recipeMaterial: recipe.ingredients?.map(ing => 
          `${ing.name} ${ing.amount || ''}${ing.unit || ''}`
        ) || [],
        recipeIndication: recipe.cookingTime ? `${recipe.cookingTime}分` : '時間不明',
        difficulty: recipe.difficulty || '普通',
        category: recipe.category || 'その他',
        cuisineType: recipe.cuisineType || '和食',
        relevanceScore: recipe.relevanceScore || 85,
        isClaudeGenerated: true,
        isEnhanced: true,
        
        // 🆕 拡張詳細情報
        description: recipe.description || '',
        detailedIngredients: recipe.ingredients || [],
        seasonings: recipe.seasonings || [],
        enhancedInstructions: recipe.instructions || [],
        features: recipe.features || {},
        arrangements: recipe.arrangements || [],
        tips: recipe.tips || {},
        servings: recipe.servings || 2,
        urgentIngredientsUsed: recipe.urgentIngredientsUsed || [],
        estimatedCost: recipe.estimatedCost || '300-500円',
        
        // 従来の形式との互換性
        instructions: recipe.instructions?.map(inst => 
          typeof inst === 'string' ? inst : inst.description
        ).join('\n\n') || [],
        nutritionInfo: recipe.features?.nutritionBenefits || '',
        
        summary: jsonData.summary
      }));

      return enhancedRecipes;

    } catch (error) {
      console.error('Claude レスポンス解析エラー:', error.message);
      console.log('Raw response sample:', response.substring(0, 1000) + '...');
      throw new Error('レシピデータの解析に失敗しました');
    }
  }

  // 🆕 高度なJSON修復関数
  repairIncompleteJSON(jsonString) {
    try {
      console.log('🔧 高度なJSON修復開始...');
      
      let fixedJson = jsonString;
      
      // Step 1: 不完全な文字列を探す
      // 引用符が閉じられていない場合
      const unclosedQuotes = (fixedJson.match(/"/g) || []).length % 2;
      if (unclosedQuotes !== 0) {
        console.log('🔧 未閉じ引用符を修復...');
        fixedJson += '"';
      }
      
      // Step 2: 不完全なオブジェクト・配列の修復
      const openBraces = (fixedJson.match(/{/g) || []).length;
      const closeBraces = (fixedJson.match(/}/g) || []).length;
      const openBrackets = (fixedJson.match(/\[/g) || []).length;
      const closeBrackets = (fixedJson.match(/\]/g) || []).length;
      
      console.log(`🔧 括弧バランス: {} ${openBraces}/${closeBraces}, [] ${openBrackets}/${closeBrackets}`);
      
      // Step 3: 末尾の不完全なエントリを削除
      // 最後のカンマ以降を削除する戦略
      let lastValidPosition = fixedJson.length;
      
      // 最後から逆順に検索して、完全な構造を見つける
      for (let i = fixedJson.length - 1; i >= 0; i--) {
        const char = fixedJson[i];
        if (char === '}' || char === ']') {
          // ここから前の部分を試してみる
          const candidate = fixedJson.substring(0, i + 1);
          
          // 必要な閉じ括弧を追加
          let testJson = candidate;
          const testOpenBraces = (testJson.match(/{/g) || []).length;
          const testCloseBraces = (testJson.match(/}/g) || []).length;
          const testOpenBrackets = (testJson.match(/\[/g) || []).length;
          const testCloseBrackets = (testJson.match(/\]/g) || []).length;
          
          // 不足分を補完
          for (let j = 0; j < (testOpenBrackets - testCloseBrackets); j++) {
            testJson += ']';
          }
          for (let j = 0; j < (testOpenBraces - testCloseBraces); j++) {
            testJson += '}';
          }
          
          try {
            const parsed = JSON.parse(testJson);
            if (parsed.recipes && Array.isArray(parsed.recipes) && parsed.recipes.length > 0) {
              console.log(`✅ JSON修復成功: ${parsed.recipes.length}件のレシピ`);
              return parsed;
            }
          } catch (e) {
            // この位置では修復できない、続行
          }
        }
      }
      
      // Step 4: 最後の手段として基本的な修復
      // 末尾の不完全な部分を削除
      const lastCompleteComma = fixedJson.lastIndexOf(',');
      const lastCompleteBrace = fixedJson.lastIndexOf('}');
      const lastCompleteBracket = fixedJson.lastIndexOf(']');
      
      if (lastCompleteComma > Math.max(lastCompleteBrace, lastCompleteBracket)) {
        fixedJson = fixedJson.substring(0, lastCompleteComma);
      }
      
      // 不足分の括弧を追加
      for (let i = 0; i < (openBrackets - closeBrackets); i++) {
        fixedJson += ']';
      }
      for (let i = 0; i < (openBraces - closeBraces); i++) {
        fixedJson += '}';
      }
      
      const finalParsed = JSON.parse(fixedJson);
      console.log(`✅ 基本修復成功: ${finalParsed.recipes?.length || 0}件のレシピ`);
      return finalParsed;
      
    } catch (error) {
      console.log('⚠️ JSON修復失敗:', error.message);
      return null;
    }
  }

  // 🆕 拡張された詳細レシピ取得
  async getDetailedRecipe(recipeId, recipeData) {
    try {
      console.log(`📖 Claude拡張レシピ詳細取得: ${recipeId}`);
      
      return {
        id: recipeId,
        originalTitle: recipeData.recipeTitle,
        translatedTitle: recipeData.recipeTitle,
        image: null,
        description: recipeData.description || '',
        translatedSummary: recipeData.features?.mainAppeal || recipeData.description || '',
        
        // 拡張された手順情報
        enhancedInstructions: recipeData.enhancedInstructions || [],
        translatedInstructions: this.formatDetailedInstructions(recipeData.enhancedInstructions || []),
        
        // 食材情報（調味料も含む）
        translatedIngredients: [
          ...(recipeData.detailedIngredients || []),
          ...(recipeData.seasonings?.map(s => ({
            name: s.name,
            amount: s.amount || '',
            unit: '',
            fromStock: false,
            timing: s.timing
          })) || [])
        ],
        
        cookingMinutes: parseInt(recipeData.recipeIndication) || null,
        servings: recipeData.servings || 2,
        difficulty: recipeData.difficulty,
        cuisineType: recipeData.cuisineType,
        
        // 拡張情報
        features: recipeData.features || {},
        arrangements: recipeData.arrangements || [],
        tips: recipeData.tips || {},
        urgentIngredientsUsed: recipeData.urgentIngredientsUsed || [],
        estimatedCost: recipeData.estimatedCost || '300-500円',
        
        sourceUrl: '#',
        spoonacularUrl: null,
        likes: 0,
        nutritionInfo: recipeData.features?.nutritionBenefits || '',
        isClaudeGenerated: true,
        isEnhanced: true
      };
      
    } catch (error) {
      console.error('Claude拡張詳細レシピ取得エラー:', error.message);
      throw error;
    }
  }

  // 🔧 詳細手順のフォーマット
  formatDetailedInstructions(instructions) {
    return instructions.map((inst, index) => {
      let formatted = `**手順${inst.step || index + 1}**\n${inst.description}`;
      if (inst.time) formatted += `\n⏱️ ${inst.time}`;
      if (inst.tip) formatted += `\n💡 ${inst.tip}`;
      return formatted;
    }).join('\n\n');
  }

  // 🔧 拡張されたフォールバックレシピ生成
  generateFallbackRecipes(availableIngredients, urgentIngredients, options = {}) {
    console.log('🔄 Claude API エラー、拡張フォールバック生成中...');
    
    const { cuisineType = 'any', cookingStyle = 'normal' } = options;
    const fallbackRecipes = [];
    
    // より詳細なフォールバックレシピを生成
    if (urgentIngredients.length > 0) {
      urgentIngredients.slice(0, 3).forEach((ingredient, index) => {
        const recipes = this.generateEnhancedFallbackRecipe(ingredient, cuisineType, cookingStyle, index);
        fallbackRecipes.push(...recipes);
      });
    }

    // 最低限のレシピ保証
    if (fallbackRecipes.length === 0) {
      fallbackRecipes.push(...this.getDefaultFallbackRecipes(availableIngredients, options));
    }

    console.log(`🍳 拡張フォールバックレシピ生成完了: ${fallbackRecipes.length}件`);
    return fallbackRecipes;
  }

  // 🆕 拡張フォールバックレシピの生成
  generateEnhancedFallbackRecipe(ingredient, cuisineType, cookingStyle, index) {
    const recipes = [];
    
    // 料理ジャンルに応じたレシピパターン
    const patterns = this.getFallbackPatternsByCuisine(ingredient.name, cuisineType, cookingStyle);
    
    patterns.slice(0, 2).forEach((pattern, patternIndex) => {
      recipes.push({
        recipeId: `fallback_enhanced_${ingredient.name}_${index}_${patternIndex}`,
        recipeTitle: pattern.title,
        recipeUrl: '#',
        recipeMaterial: pattern.ingredients,
        recipeIndication: pattern.time,
        difficulty: pattern.difficulty,
        category: pattern.category,
        cuisineType: pattern.cuisineType || cuisineType,
        relevanceScore: 70 - (index * 5),
        isClaudeGenerated: true,
        isFallback: true,
        isEnhanced: true,
        
        // 拡張情報
        description: pattern.description,
        detailedIngredients: pattern.detailedIngredients,
        seasonings: pattern.seasonings,
        enhancedInstructions: pattern.instructions,
        features: pattern.features,
        tips: pattern.tips,
        servings: 2,
        estimatedCost: pattern.estimatedCost || '200-400円'
      });
    });
    
    return recipes;
  }

  // 🔧 料理ジャンル別フォールバックパターン
  getFallbackPatternsByCuisine(ingredientName, cuisineType, cookingStyle) {
    const basePatterns = {
      'japanese': [
        {
          title: `${ingredientName}の和風炒め煮`,
          category: '主菜',
          cuisineType: '和食',
          time: '15分',
          difficulty: '簡単',
          description: `${ingredientName}を醤油ベースで優しく炒め煮にした家庭的な一品`,
          ingredients: [ingredientName, '醤油', 'みりん', 'だし'],
          detailedIngredients: [
            { name: ingredientName, amount: '適量', fromStock: true },
            { name: '醤油', amount: '大さじ2', fromStock: false },
            { name: 'みりん', amount: '大さじ1', fromStock: false }
          ],
          seasonings: [
            { name: '醤油', amount: '大さじ2', timing: '途中' },
            { name: 'みりん', amount: '大さじ1', timing: '途中' }
          ],
          instructions: [
            { step: 1, description: `${ingredientName}を食べやすい大きさに切る`, time: '3分' },
            { step: 2, description: 'フライパンに油を熱し、中火で炒める', time: '5分' },
            { step: 3, description: '醤油とみりんを加えて炒め煮にする', time: '7分', tip: '煮詰めすぎないよう注意' }
          ],
          features: {
            mainAppeal: '家庭的で優しい味付け',
            nutritionBenefits: `${ingredientName}の栄養をしっかり摂取`,
            storageInfo: '冷蔵庫で2-3日保存可能'
          },
          tips: {
            cooking: '強火にしすぎず、じっくり炒める',
            serving: '温かいご飯と一緒に',
            leftover: '翌日のお弁当のおかずにも'
          }
        }
      ],
      'western': [
        {
          title: `${ingredientName}のガーリックソテー`,
          category: '主菜',
          cuisineType: '洋食',
          time: '12分',
          difficulty: '簡単',
          description: `${ingredientName}をにんにくと一緒に香り高くソテーした洋風料理`,
          ingredients: [ingredientName, 'にんにく', 'オリーブオイル', '塩', 'こしょう'],
          // ... 他の詳細情報
        }
      ]
      // 他のジャンルも同様に定義
    };

    return basePatterns[cuisineType] || basePatterns['japanese'];
  }

  // その他のメソッド（既存のもの）
  generateCacheKey(availableIngredients, urgentIngredients, options) {
    const ingredientNames = availableIngredients.map(ing => ing.name).sort().join(',');
    const urgentNames = urgentIngredients.map(ing => ing.name).sort().join(',');
    const optionsStr = JSON.stringify(options);
    
    return `claude_enhanced_${this.hashString(ingredientNames + urgentNames + optionsStr)}`;
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  getDefaultFallbackRecipes(availableIngredients, options) {
    // デフォルトのフォールバックレシピ（簡略化）
    return [
      {
        recipeId: 'fallback_enhanced_default_1',
        recipeTitle: '冷蔵庫のお掃除炒め',
        category: '主菜',
        cuisineType: '和食',
        difficulty: '簡単',
        description: '冷蔵庫にある食材を使った万能炒め物',
        isClaudeGenerated: true,
        isFallback: true,
        isEnhanced: true
      }
    ];
  }

  getUsageReport() {
    return {
      claude: {
        used: this.requestCount,
        remaining: this.maxRequestsPerDay - this.requestCount,
        total: this.maxRequestsPerDay
      },
      cacheSize: this.cache.size
    };
  }

  resetDailyLimits() {
    this.requestCount = 0;
    console.log('🔄 Claude API日次制限リセット');
  }
}

module.exports = ClaudeRecipeService;
