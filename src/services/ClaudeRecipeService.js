// ==================================================
// src/services/ClaudeRecipeService.js - 修正版
// ==================================================

const axios = require('axios');

class ClaudeRecipeService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.anthropic.com/v1/messages';
    this.model = 'claude-3-haiku-20240307';
    this.cache = new Map();
    this.recipeCache = new Map(); // 🔧 追加: 専用レシピキャッシュ
    this.requestCount = 0;
    this.maxRequestsPerDay = 1000;
    
    // 🔧 追加: グローバルキャッシュの参照（静的キャッシュ）
    if (!ClaudeRecipeService.globalRecipeCache) {
      ClaudeRecipeService.globalRecipeCache = new Map();
    }
    
    // 🔧 追加: キャッシュクリーンアップのタイマー（24時間後）
    setInterval(() => {
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      let cleanedCount = 0;
      
      for (const [key, value] of ClaudeRecipeService.globalRecipeCache.entries()) {
        if (value.timestamp && value.timestamp < oneDayAgo) {
          ClaudeRecipeService.globalRecipeCache.delete(key);
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`🧹 古いグローバルレシピキャッシュを${cleanedCount}件削除しました`);
      }
    }, 60 * 60 * 1000); // 1時間ごとにチェック
  }

  // 🍳 メイン料理提案機能（修正版）
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

      // 修正されたプロンプト生成
      const prompt = this.buildEnhancedRecipePrompt(availableIngredients, urgentIngredients, options);
      
      // Claude API呼び出し
      const response = await this.callClaudeAPI(prompt);
      this.requestCount++;

      // レスポンス解析（修正版）
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

  // 🎯 修正されたプロンプト構築（バランス版）
  buildEnhancedRecipePrompt(availableIngredients, urgentIngredients, options) {
    const {
      cuisineType = 'any',
      cookingStyle = 'normal',
      priorityIngredient,
      maxRecipes = 2,
      includeDetails = true
    } = options;

    // 🔧 バランスの取れたプロンプト
    let prompt = `食材: `;
    
    // 期限切れ近い食材（最大2個）
    if (urgentIngredients.length > 0) {
      prompt += urgentIngredients.slice(0, 2).map(ing => `${ing.name}(期限${ing.daysLeft}日)`).join('、') + '。';
    }
    
    // 通常食材（最大3個）
    const normalIngredients = availableIngredients.filter(ing => 
      !urgentIngredients.some(urgent => urgent.name === ing.name)
    ).slice(0, 3);
    
    if (normalIngredients.length > 0) {
      prompt += normalIngredients.map(ing => ing.name).join('、') + '。';
    }

    // 条件（簡潔化）
    const cuisineMap = {
      'japanese': '和食',
      'western': '洋食', 
      'chinese': '中華',
      'korean': '韓国料理',
      'italian': 'イタリア料理',
      'ethnic': 'エスニック',
      'any': 'なんでも'
    };

    const styleMap = {
      'easy': '簡単',
      'healthy': 'ヘルシー',
      'hearty': 'がっつり',
      'meal_prep': '作り置き',
      'gourmet': '本格',
      'comfort': '家庭的',
      'normal': '普通'
    };

    prompt += `条件: ${cuisineMap[cuisineType]}、${styleMap[cookingStyle]}、${maxRecipes}品。`;
    
    if (priorityIngredient) {
      prompt += `優先: ${priorityIngredient}。`;
    }

    // 🚨 重要: 短縮版JSONテンプレート（調味料付き）
    prompt += `

JSON形式で回答（説明不要）：

{
  "recipes": [
    {
      "title": "${cuisineMap[cuisineType]}らしい料理名",
      "category": "主菜",
      "cuisineType": "${cuisineMap[cuisineType]}",
      "cookingTime": 30,
      "difficulty": "簡単",
      "servings": 2,
      "description": "簡潔な説明",
      "ingredients": [
        {"name": "食材名", "amount": "分量", "unit": "単位", "fromStock": true}
      ],
      "seasonings": [
        {"name": "${this.getMainSeasoning(cuisineType)}", "amount": "分量", "timing": "タイミング"}
      ],
      "instructions": [
        {"step": 1, "description": "具体的な手順", "time": "5分"}
      ],
      "relevanceScore": 85,
      "urgentIngredientsUsed": ["使用食材"],
      "estimatedCost": "300円"
    }
  ],
  "summary": {
    "totalRecipes": ${maxRecipes},
    "recommendation": "提案理由"
  }
}`;

    return prompt;
  }

  // 🆕 メイン調味料の取得（短縮版）
  getMainSeasoning(cuisineType) {
    const mainSeasonings = {
      'chinese': '醤油・オイスターソース',
      'korean': 'コチュジャン・ごま油',
      'japanese': '醤油・みりん',
      'italian': 'オリーブオイル・にんにく',
      'western': 'バター・コンソメ',
      'ethnic': 'ナンプラー・ライム'
    };
    return mainSeasonings[cuisineType] || '醤油・塩コショウ';
  }

  // 🌐 Claude API呼び出し（リトライ機能付き修正版）
  async callClaudeAPI(prompt) {
    const maxRetries = 3;
    const baseDelay = 5000; // 5秒
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Claude API呼び出し試行 ${attempt}/${maxRetries}`);
        
        const response = await axios.post(this.baseUrl, {
          model: this.model,
          max_tokens: 3000,
          temperature: 0.4, // 🔧 修正: 創造性と確実性のバランス（0.2→0.4）
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
          timeout: 60000
        });

        console.log(`✅ Claude API呼び出し成功 (試行${attempt}回目)`);
        return response.data.content[0].text;
        
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        
        if (error.response?.status === 429) {
          console.log(`⚠️ Claude API使用量制限 (試行${attempt}/${maxRetries})`);
          if (isLastAttempt) {
            throw new Error('Claude API使用量制限に達しました');
          }
        } else if (error.response?.status === 401) {
          throw new Error('Claude APIキーが無効です');
        } else if (error.response?.status === 529) {
          console.log(`⚠️ Claude API server overloaded (529) - 試行${attempt}/${maxRetries}`);
          if (isLastAttempt) {
            console.log('🔄 最大リトライ回数に達しました。フォールバックを使用します');
            throw new Error('Claude APIサーバーが過負荷状態です');
          }
        } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          console.log(`⏰ Claude APIタイムアウト (試行${attempt}/${maxRetries})`);
          if (isLastAttempt) {
            throw new Error('Claude APIがタイムアウトしました');
          }
        } else {
          console.error('Claude API詳細エラー:', error.response?.data || error.message);
          if (isLastAttempt) {
            throw new Error(`Claude API呼び出しエラー: ${error.message}`);
          }
        }
        
        // リトライ待機（指数バックオフ）
        if (!isLastAttempt) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // 5秒, 10秒, 20秒
          console.log(`⏳ ${delay/1000}秒待機してリトライします...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }

  // 📝 修正されたJSON解析（より堅牢）
  parseRecipeResponse(response) {
    try {
      console.log('🔍 Claude レスポンス解析開始...');
      console.log(`📏 レスポンス長: ${response.length}文字`);
      
      // デバッグ用：レスポンス全体をログ出力
      console.log('📄 完全なレスポンス:', response);
      
      let jsonData = null;
      
      // Step 1: 直接JSONを探す（より厳密）
      const jsonMatches = response.match(/\{[\s\S]*\}/g);
      if (jsonMatches && jsonMatches.length > 0) {
        // 最も長いJSONを選択（完全である可能性が高い）
        const longestJson = jsonMatches.reduce((a, b) => a.length > b.length ? a : b);
        
        try {
          jsonData = JSON.parse(longestJson);
          console.log('✅ 直接JSON抽出で成功');
        } catch (e) {
          console.log('⚠️ 直接JSON抽出失敗:', e.message);
          
          // Step 2: JSON修復を試行
          const repairedJson = this.repairIncompleteJSON(longestJson);
          if (repairedJson) {
            jsonData = repairedJson;
            console.log('✅ JSON修復で成功');
          }
        }
      }
      
      // Step 3: コードブロック内のJSONを探す
      if (!jsonData) {
        const codeBlockPatterns = [
          /```json\s*([\s\S]*?)\s*```/g,
          /```\s*([\s\S]*?)\s*```/g
        ];
        
        for (const pattern of codeBlockPatterns) {
          const matches = [...response.matchAll(pattern)];
          for (const match of matches) {
            try {
              const jsonString = match[1].trim();
              jsonData = JSON.parse(jsonString);
              console.log('✅ コードブロック内JSON解析で成功');
              break;
            } catch (e) {
              console.log('⚠️ コードブロック内JSON解析失敗:', e.message);
            }
          }
          if (jsonData) break;
        }
      }
      
      if (!jsonData) {
        console.error('❌ 全てのJSON解析が失敗');
        throw new Error('JSON形式のレスポンスが見つかりません');
      }
      
      // データ検証
      if (!jsonData.recipes || !Array.isArray(jsonData.recipes)) {
        console.error('❌ レシピデータの形式が不正');
        console.log('受信データ:', JSON.stringify(jsonData, null, 2));
        throw new Error('レシピデータの形式が不正です');
      }

      console.log(`✅ ${jsonData.recipes.length}件のレシピを解析成功`);

      // 🔧 修正: 一意なベースタイムスタンプを生成
      const baseTimestamp = Date.now();
      
      // 拡張レシピデータに変換
      const enhancedRecipes = jsonData.recipes.map((recipe, index) => {
        const recipeId = `claude_${baseTimestamp}_${index}`;
        const enhancedRecipe = {
          recipeId: recipeId,
          recipeTitle: recipe.title || 'レシピ名不明',
          recipeUrl: '#',
          recipeMaterial: recipe.ingredients?.map(ing => 
            `${ing.name} ${ing.amount || ''}${ing.unit || ''}`
          ) || [],
          recipeIndication: recipe.cookingTime ? `${recipe.cookingTime}分` : '30分',
          difficulty: recipe.difficulty || '普通',
          category: recipe.category || 'その他',
          cuisineType: recipe.cuisineType || '和食',
          relevanceScore: recipe.relevanceScore || 85,
          isClaudeGenerated: true,
          isEnhanced: true,
          
          // 詳細情報
          description: recipe.description || '',
          detailedIngredients: recipe.ingredients || [],
          seasonings: recipe.seasonings || [],
          enhancedInstructions: recipe.instructions || [],
          features: recipe.features || {},
          arrangements: recipe.arrangements || [],
          servings: recipe.servings || 2,
          urgentIngredientsUsed: recipe.urgentIngredientsUsed || [],
          estimatedCost: recipe.estimatedCost || '300-500円',
          
          summary: jsonData.summary
        };
        
        // 🔧 修正: グローバルキャッシュに保存（すべてのインスタンスで共有）
        const cacheData = {
          ...enhancedRecipe,
          timestamp: baseTimestamp, // タイムスタンプを保存
          cacheKey: recipeId
        };
        
        // ローカルキャッシュにも保存
        this.recipeCache.set(recipeId, cacheData);
        
        // グローバルキャッシュに保存（重要！）
        ClaudeRecipeService.globalRecipeCache.set(recipeId, cacheData);
        console.log(`🔑 レシピをグローバルキャッシュに保存: ${recipeId}`);
        
        // 🔧 追加: 保存後即座に確認
        const immediateCheck = ClaudeRecipeService.globalRecipeCache.has(recipeId);
        console.log(`🔍 保存直後の確認: ${recipeId} -> ${immediateCheck ? '存在' : '不存在'}`);
        console.log(`🌐 グローバルキャッシュ総数: ${ClaudeRecipeService.globalRecipeCache.size}件`);
        
        return enhancedRecipe;
      });

      console.log(`🔑 合計${enhancedRecipes.length}件のレシピを個別キャッシュに保存完了`);
      return enhancedRecipes;

    } catch (error) {
      console.error('Claude レスポンス解析エラー:', error.message);
      throw new Error('レシピデータの解析に失敗しました');
    }
  }

  // 🆕 改善されたJSON修復関数（より高度）
  repairIncompleteJSON(jsonString) {
    try {
      console.log('🔧 高度なJSON修復開始...');
      
      let fixedJson = jsonString.trim();
      
      // Step 1: 基本的なクリーンアップ
      fixedJson = fixedJson.replace(/[\x00-\x1F\x7F]/g, '');
      
      // Step 2: 未閉じの文字列を修復
      const quotes = (fixedJson.match(/"/g) || []).length;
      if (quotes % 2 !== 0) {
        console.log('🔧 未閉じ引用符を修復');
        fixedJson += '"';
      }
      
      // Step 3: 最後の完全な要素を探す
      const lastValidObjectEnd = this.findLastValidObject(fixedJson);
      if (lastValidObjectEnd !== -1) {
        console.log(`🔧 最後の完全なオブジェクト位置: ${lastValidObjectEnd}`);
        fixedJson = fixedJson.substring(0, lastValidObjectEnd + 1);
        
        // 必要な閉じ括弧を追加
        const openBraces = (fixedJson.match(/{/g) || []).length;
        const closeBraces = (fixedJson.match(/}/g) || []).length;
        const openBrackets = (fixedJson.match(/\[/g) || []).length;
        const closeBrackets = (fixedJson.match(/\]/g) || []).length;
        
        for (let i = 0; i < (openBrackets - closeBrackets); i++) {
          fixedJson += ']';
        }
        for (let i = 0; i < (openBraces - closeBraces); i++) {
          fixedJson += '}';
        }
        
        try {
          const parsed = JSON.parse(fixedJson);
          console.log(`✅ 高度修復成功: ${parsed.recipes?.length || 0}件のレシピ`);
          return parsed;
        } catch (e) {
          console.log('⚠️ 高度修復後パース失敗:', e.message);
        }
      }
      
      // Step 4: 基本的な修復を試行
      return this.basicJSONRepair(jsonString);
      
    } catch (error) {
      console.log('⚠️ 高度JSON修復失敗:', error.message);
      return null;
    }
  }

  // 🆕 最後の完全なオブジェクトを探す
  findLastValidObject(jsonString) {
    let lastValidPos = -1;
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount >= 0) {
            // 完全なオブジェクトまたは配列要素の終端をチェック
            const nextChar = jsonString[i + 1];
            if (nextChar === ',' || nextChar === ']' || nextChar === '}' || i === jsonString.length - 1) {
              lastValidPos = i;
            }
          }
        }
      }
    }
    
    return lastValidPos;
  }

  // 🆕 基本的なJSON修復
  basicJSONRepair(jsonString) {
    try {
      let fixedJson = jsonString.trim();
      
      // 末尾の不完全な部分を削除
      const lastCommaIndex = fixedJson.lastIndexOf(',');
      const lastBraceIndex = fixedJson.lastIndexOf('}');
      const lastBracketIndex = fixedJson.lastIndexOf(']');
      
      if (lastCommaIndex > Math.max(lastBraceIndex, lastBracketIndex)) {
        fixedJson = fixedJson.substring(0, lastCommaIndex);
      }
      
      // 括弧のバランスを取る
      const openBraces = (fixedJson.match(/{/g) || []).length;
      const closeBraces = (fixedJson.match(/}/g) || []).length;
      const openBrackets = (fixedJson.match(/\[/g) || []).length;
      const closeBrackets = (fixedJson.match(/\]/g) || []).length;
      
      for (let i = 0; i < (openBrackets - closeBrackets); i++) {
        fixedJson += ']';
      }
      for (let i = 0; i < (openBraces - closeBraces); i++) {
        fixedJson += '}';
      }
      
      const parsed = JSON.parse(fixedJson);
      console.log(`✅ 基本修復成功: ${parsed.recipes?.length || 0}件のレシピ`);
      return parsed;
      
    } catch (error) {
      console.log('⚠️ 基本修復失敗:', error.message);
      return null;
    }
  }

  // 🆕 キャッシュメソッド（不足していたメソッド）
  cacheEnhancedRecipes(recipes) {
    console.log(`📦 ${recipes.length}件のレシピをキャッシュに保存中...`);
    // キャッシュロジックは既にsuggestRecipesメソッド内で実装済み
    console.log(`✅ ${recipes.length}件のレシピがキャッシュされました`);
    return recipes;
  }

  // 🆕 代替メソッド名（もし呼び出し側で別の名前を使用している場合）
  cacheRecipes(recipes) {
    return this.cacheEnhancedRecipes(recipes);
  }

  // 🆕 エンハンスドレシピの処理メソッド
  processEnhancedRecipes(recipes) {
    return this.cacheEnhancedRecipes(recipes);
  }

  // 🆕 拡張された詳細レシピ取得（緊急修正版）
  async getDetailedRecipe(recipeId, recipeData = null) {
    try {
      console.log(`📖 Claude拡張レシピ詳細取得: ${recipeId}`);
      
      // 🔧 追加: 検索前のグローバルキャッシュ状況確認
      console.log(`🌐 検索時のグローバルキャッシュ総数: ${ClaudeRecipeService.globalRecipeCache?.size || 0}件`);
      console.log(`🔑 グローバルキャッシュの全キー:`, Array.from(ClaudeRecipeService.globalRecipeCache?.keys() || []));
      
      let targetRecipe = null;
      
      // 🔧 修正: グローバルキャッシュから優先検索
      if (ClaudeRecipeService.globalRecipeCache && ClaudeRecipeService.globalRecipeCache.has(recipeId)) {
        targetRecipe = ClaudeRecipeService.globalRecipeCache.get(recipeId);
        console.log(`✅ グローバルキャッシュからレシピ取得: ${recipeId}`);
      } 
      // 🆕 緊急修正: 類似キーの検索
      else if (ClaudeRecipeService.globalRecipeCache) {
        const similarKey = this.findSimilarRecipeKey(recipeId);
        if (similarKey) {
          targetRecipe = ClaudeRecipeService.globalRecipeCache.get(similarKey);
          console.log(`🔍 類似キーでレシピ取得: ${recipeId} -> ${similarKey}`);
        }
      }
      
      // ローカル専用キャッシュから検索
      if (!targetRecipe && this.recipeCache.has(recipeId)) {
        targetRecipe = this.recipeCache.get(recipeId);
        console.log(`✅ ローカル専用キャッシュからレシピ取得: ${recipeId}`);
      }
      // 従来のキャッシュからも検索
      else if (!targetRecipe && this.cache.has(recipeId)) {
        targetRecipe = this.cache.get(recipeId);
        console.log(`✅ 従来キャッシュからレシピ取得: ${recipeId}`);
      }
      
      if (!targetRecipe && recipeData) {
        // キャッシュにない場合は、渡されたデータを使用
        targetRecipe = recipeData;
        console.log(`📋 渡されたデータを使用: ${recipeId}`);
      }
      
      if (!targetRecipe) {
        // 🔧 追加: 全キャッシュ状況をデバッグ表示
        this.debugAllCaches();
        console.log(`❌ レシピが見つかりません: ${recipeId}`);
        
        // 🔧 追加: キャッシュキー比較分析
        const allKeys = Array.from(ClaudeRecipeService.globalRecipeCache?.keys() || []);
        console.log(`🔍 探しているキー: ${recipeId}`);
        console.log(`🔍 類似キー分析:`);
        allKeys.forEach(key => {
          const similarity = this.calculateKeySimilarity(recipeId, key);
          console.log(`   - ${key} (類似度: ${similarity}%)`);
        });
        
        // 🆕 緊急修正: 最も新しいレシピを返す（最後の手段）
        if (allKeys.length > 0) {
          const latestKey = this.findLatestRecipeKey();
          if (latestKey) {
            targetRecipe = ClaudeRecipeService.globalRecipeCache.get(latestKey);
            console.log(`🚨 緊急措置: 最新レシピを返却 ${latestKey} -> ${targetRecipe?.recipeTitle || 'タイトル不明'}`);
          }
        }
        
        if (!targetRecipe) {
          throw new Error(`レシピID ${recipeId} が見つかりません`);
        }
      }
      
      // 詳細レシピオブジェクトを作成
      const detailedRecipe = {
        id: recipeId,
        originalTitle: targetRecipe.recipeTitle || targetRecipe.title,
        translatedTitle: targetRecipe.recipeTitle || targetRecipe.title,
        image: null,
        description: targetRecipe.description || '',
        translatedSummary: targetRecipe.features?.mainAppeal || targetRecipe.description || '',
        
        // 拡張された手順情報
        enhancedInstructions: targetRecipe.enhancedInstructions || targetRecipe.instructions || [],
        translatedInstructions: this.formatDetailedInstructions(targetRecipe.enhancedInstructions || targetRecipe.instructions || []),
        
        // 食材情報（調味料も含む）
        translatedIngredients: [
          ...(targetRecipe.detailedIngredients || []),
          ...(targetRecipe.seasonings?.map(s => ({
            name: s.name,
            amount: s.amount || '',
            unit: '',
            fromStock: false,
            timing: s.timing
          })) || [])
        ],
        
        cookingMinutes: parseInt(targetRecipe.recipeIndication) || parseInt(targetRecipe.cookingTime) || null,
        servings: targetRecipe.servings || 2,
        difficulty: targetRecipe.difficulty,
        cuisineType: targetRecipe.cuisineType,
        
        // 拡張情報
        features: targetRecipe.features || {},
        arrangements: targetRecipe.arrangements || [],
        tips: targetRecipe.tips || {},
        urgentIngredientsUsed: targetRecipe.urgentIngredientsUsed || [],
        estimatedCost: targetRecipe.estimatedCost || '300-500円',
        
        sourceUrl: '#',
        spoonacularUrl: null,
        likes: 0,
        nutritionInfo: targetRecipe.features?.nutritionBenefits || '',
        isClaudeGenerated: true,
        isEnhanced: true
      };
      
      console.log(`✅ 詳細レシピ取得成功: ${targetRecipe.recipeTitle || targetRecipe.title}`);
      return detailedRecipe;
      
    } catch (error) {
      console.error('Claude拡張詳細レシピ取得エラー:', error.message);
      throw error;
    }
  }

  // 🆕 類似レシピキーの検索
  findSimilarRecipeKey(targetId) {
    if (!ClaudeRecipeService.globalRecipeCache) return null;
    
    const allKeys = Array.from(ClaudeRecipeService.globalRecipeCache.keys());
    
    // ベースタイムスタンプを抽出
    const targetTimestamp = targetId.match(/claude_(\d+)_/)?.[1];
    const targetIndex = targetId.match(/_(\d+)$/)?.[1];
    
    if (!targetTimestamp || !targetIndex) return null;
    
    // 同じインデックスで最も近いタイムスタンプを探す
    let bestMatch = null;
    let minTimeDiff = Infinity;
    
    for (const key of allKeys) {
      const keyTimestamp = key.match(/claude_(\d+)_/)?.[1];
      const keyIndex = key.match(/_(\d+)$/)?.[1];
      
      if (keyIndex === targetIndex && keyTimestamp) {
        const timeDiff = Math.abs(parseInt(targetTimestamp) - parseInt(keyTimestamp));
        if (timeDiff < minTimeDiff && timeDiff < 300000) { // 5分以内
          minTimeDiff = timeDiff;
          bestMatch = key;
        }
      }
    }
    
    return bestMatch;
  }

  // 🆕 最新レシピキーの検索
  findLatestRecipeKey() {
    if (!ClaudeRecipeService.globalRecipeCache) return null;
    
    const allKeys = Array.from(ClaudeRecipeService.globalRecipeCache.keys());
    if (allKeys.length === 0) return null;
    
    // タイムスタンプが最大のキーを探す
    let latestKey = null;
    let latestTimestamp = 0;
    
    for (const key of allKeys) {
      const timestamp = key.match(/claude_(\d+)_/)?.[1];
      if (timestamp && parseInt(timestamp) > latestTimestamp) {
        latestTimestamp = parseInt(timestamp);
        latestKey = key;
      }
    }
    
    return latestKey;
  }

  // 🆕 キー類似度計算（デバッグ用）
  calculateKeySimilarity(key1, key2) {
    if (key1 === key2) return 100;
    
    // タイムスタンプ部分を抽出して比較
    const timestamp1 = key1.match(/claude_(\d+)_/)?.[1];
    const timestamp2 = key2.match(/claude_(\d+)_/)?.[1];
    
    if (timestamp1 && timestamp2) {
      const timeDiff = Math.abs(parseInt(timestamp1) - parseInt(timestamp2));
      if (timeDiff < 60000) return 80; // 1分以内なら80%
      if (timeDiff < 300000) return 60; // 5分以内なら60%
    }
    
    return 0;
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
      urgentIngredients.slice(0, 2).forEach((ingredient, index) => {
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
    
    patterns.slice(0, 1).forEach((pattern, patternIndex) => {
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
      'ethnic': [
        {
          title: `${ingredientName}のエスニック炒め`,
          category: '主菜',
          cuisineType: 'エスニック',
          time: '20分',
          difficulty: '簡単',
          description: `${ingredientName}をスパイシーに炒めたエスニック料理`,
          ingredients: [ingredientName, 'ナンプラー', 'ライム', '唐辛子'],
          detailedIngredients: [
            { name: ingredientName, amount: '適量', fromStock: true },
            { name: 'ナンプラー', amount: '大さじ1', fromStock: false },
            { name: 'ライム', amount: '1/2個', fromStock: false }
          ],
          seasonings: [
            { name: 'ナンプラー', amount: '大さじ1', timing: '途中' },
            { name: 'ライム汁', amount: '適量', timing: '仕上げ' }
          ],
          instructions: [
            { step: 1, description: `${ingredientName}を食べやすい大きさに切る`, time: '5分' },
            { step: 2, description: 'フライパンを強火で熱し、炒める', time: '8分' },
            { step: 3, description: 'ナンプラーとライムで味付けする', time: '7分', tip: '最後にライムを絞ると風味UP' }
          ],
          features: {
            mainAppeal: 'スパイシーでエキゾチックな味わい',
            nutritionBenefits: `${ingredientName}の栄養をしっかり摂取`,
            storageInfo: '冷蔵庫で1-2日保存可能'
          },
          tips: {
            cooking: '強火で短時間調理がポイント',
            serving: 'ジャスミンライスと一緒に',
            leftover: 'パクチーを加えるとさらに本格的'
          },
          estimatedCost: '250円'
        }
      ],
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
          },
          estimatedCost: '200円'
        }
      ]
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
        recipeMaterial: availableIngredients.slice(0, 3).map(ing => ing.name),
        recipeIndication: '20分',
        relevanceScore: 60,
        isClaudeGenerated: true,
        isFallback: true,
        isEnhanced: true,
        detailedIngredients: availableIngredients.slice(0, 3).map(ing => ({
          name: ing.name,
          amount: '適量',
          fromStock: true
        })),
        enhancedInstructions: [
          { step: 1, description: '食材を食べやすい大きさに切る', time: '5分' },
          { step: 2, description: 'フライパンで炒める', time: '10分' },
          { step: 3, description: '調味料で味付けして完成', time: '5分' }
        ],
        estimatedCost: '200円'
      }
    ];
  }

  // 🆕 全キャッシュデバッグ用メソッド
  debugAllCaches() {
    console.log(`🔍 全キャッシュデバッグ情報:`);
    
    // グローバルキャッシュ
    const globalCacheSize = ClaudeRecipeService.globalRecipeCache?.size || 0;
    console.log(`🌐 グローバルレシピキャッシュ件数: ${globalCacheSize}件`);
    if (globalCacheSize > 0) {
      console.log(`🔑 グローバルキャッシュのキー一覧:`, Array.from(ClaudeRecipeService.globalRecipeCache.keys()));
      for (const [key, value] of ClaudeRecipeService.globalRecipeCache.entries()) {
        const title = value.recipeTitle || value.title || 'タイトル不明';
        const timestamp = value.timestamp ? new Date(value.timestamp).toLocaleString() : '不明';
        console.log(`   - ${key}: ${title} (作成: ${timestamp})`);
      }
    }
    
    // ローカル専用キャッシュ
    console.log(`📦 ローカル専用レシピキャッシュ件数: ${this.recipeCache.size}件`);
    console.log(`🔑 ローカル専用キャッシュのキー一覧:`, Array.from(this.recipeCache.keys()));
    
    // 従来キャッシュ
    console.log(`📦 従来キャッシュ件数: ${this.cache.size}件`);
    console.log(`🔑 従来キャッシュのキー一覧:`, Array.from(this.cache.keys()));
  }

  // 🆕 特定レシピの存在確認（全キャッシュ対応版）
  hasRecipe(recipeId) {
    const inGlobalCache = ClaudeRecipeService.globalRecipeCache?.has(recipeId) || false;
    const inRecipeCache = this.recipeCache.has(recipeId);
    const inMainCache = this.cache.has(recipeId);
    console.log(`🔍 レシピ存在確認 ${recipeId}: グローバル=${inGlobalCache}, 専用=${inRecipeCache}, 従来=${inMainCache}`);
    return inGlobalCache || inRecipeCache || inMainCache;
  }

  getUsageReport() {
    return {
      claude: {
        used: this.requestCount,
        remaining: this.maxRequestsPerDay - this.requestCount,
        total: this.maxRequestsPerDay
      },
      cacheSize: this.cache.size,
      recipeCacheSize: this.recipeCache.size,
      globalRecipeCacheSize: ClaudeRecipeService.globalRecipeCache?.size || 0, // グローバルキャッシュサイズ追加
      cacheKeys: Array.from(this.cache.keys()),
      recipeCacheKeys: Array.from(this.recipeCache.keys()),
      globalRecipeCacheKeys: Array.from(ClaudeRecipeService.globalRecipeCache?.keys() || []) // グローバルキャッシュキー追加
    };
  }

  resetDailyLimits() {
    this.requestCount = 0;
    console.log('🔄 Claude API日次制限リセット');
  }
}

module.exports = ClaudeRecipeService;
