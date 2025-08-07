// SpoonacularFreeTierService.js - デバッグ強化版
const axios = require('axios');

class SpoonacularFreeTierService {
  constructor(spoonacularApiKey, deeplApiKey) {
    this.spoonacularApiKey = spoonacularApiKey;
    this.deeplApiKey = deeplApiKey;
    this.baseUrl = 'https://api.spoonacular.com/recipes';
    this.cache = new Map();
    this.dailyRequestCount = 0;
    this.monthlyTranslationChars = 0;
    
    // 無料枠管理
    this.limits = {
      spoonacular: {
        daily: 150,
        current: 0
      },
      deepl: {
        monthly: 500000,
        current: 0
      }
    };

    // 料理ジャンル別検索戦略
    this.cuisineFilters = {
      'korean': ['korean', 'kimchi', 'bulgogi', 'bibimbap', 'gochujang'],
      'japanese': ['japanese', 'soy sauce', 'miso', 'teriyaki', 'sushi'],
      'indian': ['indian', 'curry', 'turmeric', 'garam masala', 'tandoori', 'cumin'],
      'chinese': ['chinese', 'stir fry', 'wok', 'szechuan', 'cantonese'],
      'italian': ['italian', 'pasta', 'pizza', 'basil', 'parmesan'],
      'thai': ['thai', 'coconut', 'pad thai', 'curry', 'lemongrass', 'fish sauce'],
      'american': ['american', 'burger', 'bbq', 'sandwich'],
      'mexican': ['mexican', 'taco', 'burrito', 'salsa', 'guacamole']
    };

    // 包括的な日本語→英語食材辞書
    this.ingredientDict = {
      'キャベツ': 'cabbage', 'きゃべつ': 'cabbage',
      '人参': 'carrot', 'にんじん': 'carrot', 'ニンジン': 'carrot',
      '玉ねぎ': 'onion', 'たまねぎ': 'onion', 'タマネギ': 'onion', '玉葱': 'onion',
      'じゃがいも': 'potato', 'ジャガイモ': 'potato', 'じゃが芋': 'potato', 'ポテト': 'potato',
      'トマト': 'tomato', 'とまと': 'tomato',
      'きゅうり': 'cucumber', 'キュウリ': 'cucumber',
      'レタス': 'lettuce', 'もやし': 'bean sprouts',
      'ナス': 'eggplant', 'なす': 'eggplant', '茄子': 'eggplant',
      'ピーマン': 'bell pepper', 'パプリカ': 'paprika', 'ブロッコリー': 'broccoli',
      '白菜': 'napa cabbage', 'はくさい': 'napa cabbage',
      '大根': 'daikon radish', 'だいこん': 'daikon radish',
      '長ネギ': 'green onion', 'ながねぎ': 'green onion', 'ねぎ': 'green onion',
      'ニンニク': 'garlic', 'にんにく': 'garlic',
      '生姜': 'ginger', 'しょうが': 'ginger', 'ショウガ': 'ginger',
      'ほうれん草': 'spinach', 'ホウレンソウ': 'spinach',
      '小松菜': 'komatsuna', 'アスパラガス': 'asparagus',
      'とうもろこし': 'corn', 'コーン': 'corn',
      // 肉類
      '豚肉': 'pork', 'ぶた肉': 'pork', '豚バラ肉': 'pork belly', '豚バラ': 'pork belly',
      '豚こま': 'pork', '豚ロース': 'pork loin', '豚もも': 'pork leg',
      '牛肉': 'beef', 'うし肉': 'beef', '牛バラ': 'beef belly',
      '牛もも': 'beef leg', '牛ロース': 'beef loin',
      '鶏肉': 'chicken', 'とり肉': 'chicken', '鶏もも肉': 'chicken thigh',
      '鶏むね肉': 'chicken breast', '鶏ささみ': 'chicken breast',
      'ひき肉': 'ground meat', 'ミンチ': 'ground meat',
      '豚ひき肉': 'ground pork', '牛ひき肉': 'ground beef', '鶏ひき肉': 'ground chicken',
      'ハム': 'ham', 'ベーコン': 'bacon', 'ソーセージ': 'sausage',
      // 魚介類
      '魚': 'fish', 'さけ': 'salmon', '鮭': 'salmon', 'サーモン': 'salmon',
      'まぐろ': 'tuna', 'マグロ': 'tuna', 'ツナ': 'tuna',
      'さば': 'mackerel', '鯖': 'mackerel', 'いわし': 'sardine', '鰯': 'sardine',
      'あじ': 'horse mackerel', '鯵': 'horse mackerel',
      'えび': 'shrimp', 'エビ': 'shrimp', '海老': 'shrimp',
      'かに': 'crab', 'カニ': 'crab', '蟹': 'crab',
      'いか': 'squid', 'イカ': 'squid', 'たこ': 'octopus', 'タコ': 'octopus', '蛸': 'octopus',
      // 乳製品・卵
      '卵': 'egg', 'たまご': 'egg', '玉子': 'egg',
      '牛乳': 'milk', 'ぎゅうにゅう': 'milk', 'ミルク': 'milk',
      'チーズ': 'cheese', 'バター': 'butter', 'ヨーグルト': 'yogurt',
      '生クリーム': 'heavy cream', 'クリーム': 'cream',
      // 主食
      '米': 'rice', 'こめ': 'rice', 'ごはん': 'rice', 'ご飯': 'rice',
      'パン': 'bread', 'パスタ': 'pasta',
      'うどん': 'udon noodles', 'そば': 'soba noodles', 'ラーメン': 'ramen noodles',
      '中華麺': 'chinese noodles', 'そうめん': 'somen noodles',
      // 調味料
      '塩': 'salt', 'しお': 'salt', '砂糖': 'sugar', 'さとう': 'sugar',
      '醤油': 'soy sauce', 'しょうゆ': 'soy sauce',
      '味噌': 'miso', 'みそ': 'miso', 'みりん': 'mirin',
      '酢': 'vinegar', 'す': 'vinegar', 'お酢': 'vinegar',
      '酒': 'sake', 'さけ': 'sake', '日本酒': 'sake',
      'サラダ油': 'vegetable oil', 'ごま油': 'sesame oil', 'オリーブオイル': 'olive oil',
      'マヨネーズ': 'mayonnaise', 'ケチャップ': 'ketchup', 'ソース': 'sauce',
      'マスタード': 'mustard', '胡椒': 'pepper', 'こしょう': 'pepper', 'コショウ': 'pepper',
      '唐辛子': 'chili pepper', 'とうがらし': 'chili pepper',
      // その他
      '豆腐': 'tofu', 'とうふ': 'tofu', '納豆': 'natto', 'なっとう': 'natto',
      'わかめ': 'wakame seaweed', 'ワカメ': 'wakame seaweed',
      'のり': 'nori seaweed', 'ノリ': 'nori seaweed', '海苔': 'nori seaweed',
      'こんにゃく': 'konjac', 'コンニャク': 'konjac', '蒟蒻': 'konjac'
    };

    console.log(`📚 食材辞書初期化完了: ${Object.keys(this.ingredientDict).length}語登録`);
  }

  // 使用量監視
  checkLimits() {
    const spoonacularRemaining = this.limits.spoonacular.daily - this.limits.spoonacular.current;
    const deeplRemaining = this.limits.deepl.monthly - this.limits.deepl.current;
    
    return {
      canUseSpoonacular: spoonacularRemaining > 0,
      canUseDeepL: deeplRemaining > 500,
      spoonacularRemaining,
      deeplRemaining
    };
  }

  // 食材翻訳
  async translateIngredient(ingredient) {
    try {
      const normalized = ingredient.trim().toLowerCase();
      if (this.ingredientDict[ingredient] || this.ingredientDict[normalized]) {
        const translation = this.ingredientDict[ingredient] || this.ingredientDict[normalized];
        return translation;
      }

      const cacheKey = `ingredient_${ingredient}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const limits = this.checkLimits();
      if (!limits.canUseDeepL) {
        return ingredient;
      }

      const translation = await this.translateWithDeepL(ingredient);
      this.cache.set(cacheKey, translation);
      this.limits.deepl.current += ingredient.length;
      
      return translation;

    } catch (error) {
      console.error(`翻訳エラー (${ingredient}):`, error.message);
      return ingredient;
    }
  }

  // DeepL翻訳
  async translateWithDeepL(text, sourceLang = 'JA', targetLang = 'EN') {
    try {
      const response = await axios.post(
        'https://api-free.deepl.com/v2/translate',
        new URLSearchParams({
          auth_key: this.deeplApiKey,
          text: text,
          source_lang: sourceLang,
          target_lang: targetLang
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000
        }
      );

      return response.data.translations[0].text.trim();

    } catch (error) {
      if (error.response?.status === 456) {
        this.limits.deepl.current = this.limits.deepl.monthly;
      }
      throw new Error(`DeepL翻訳エラー: ${error.message}`);
    }
  }

  // 🚀 デバッグ強化版メイン検索
  async improvedSearchWithCuisine(ingredient, maxResults = 6, cuisineType = null) {
    try {
      console.log(`🔍 === デバッグ強化版検索開始 ===`);
      console.log(`🔍 検索条件: 食材="${ingredient}", ジャンル="${cuisineType}", 最大件数=${maxResults}`);
      
      const limits = this.checkLimits();
      if (!limits.canUseSpoonacular) {
        console.log('❌ Spoonacular日次制限に達しました');
        return this.generateFallbackRecipes(ingredient, cuisineType);
      }

      // 食材を英語に翻訳
      const englishIngredient = await this.translateIngredient(ingredient);
      console.log(`🔍 英語食材名: "${englishIngredient}"`);

      // 🆕 複数の検索戦略を並行実行
      const searchPromises = [];
      
      // 検索1: findByIngredients (食材検索)
      console.log(`🔍 検索1: findByIngredients を開始`);
      searchPromises.push(
        this.searchByIngredients(englishIngredient, 8).catch(error => {
          console.error('検索1エラー:', error.message);
          return [];
        })
      );

      // 検索2: complexSearch (人気順)
      console.log(`🔍 検索2: complexSearch (人気順) を開始`);
      searchPromises.push(
        this.searchComplexPopular(englishIngredient, 6).catch(error => {
          console.error('検索2エラー:', error.message);
          return [];
        })
      );

      // 検索3: complexSearch + cuisine (ジャンル指定)
      if (cuisineType && cuisineType !== 'all') {
        console.log(`🔍 検索3: complexSearch + cuisine (${cuisineType}) を開始`);
        searchPromises.push(
          this.searchComplexWithCuisine(englishIngredient, cuisineType, 6).catch(error => {
            console.error('検索3エラー:', error.message);
            return [];
          })
        );
      }

      // 検索4: 代替検索（異なるパラメータ）
      console.log(`🔍 検索4: 代替検索を開始`);
      searchPromises.push(
        this.searchAlternative(englishIngredient, cuisineType, 6).catch(error => {
          console.error('検索4エラー:', error.message);
          return [];
        })
      );

      // 並行実行して結果を取得
      const searchResults = await Promise.all(searchPromises);
      
      // 結果をまとめる
      const allResults = [];
      searchResults.forEach((results, index) => {
        console.log(`🔍 検索${index + 1}の結果: ${results.length}件`);
        if (results.length > 0) {
          results.forEach(recipe => {
            console.log(`   - ${recipe.title} (ID: ${recipe.id})`);
          });
          allResults.push(...results);
        }
      });

      console.log(`🔍 合計取得件数: ${allResults.length}件`);

      // 重複除去
      const uniqueResults = this.removeDuplicateRecipes(allResults);
      console.log(`🔍 重複除去後: ${uniqueResults.length}件`);

      // ジャンルフィルタリング（寛容版）
      const filteredResults = this.filterByCuisineGentle(uniqueResults, cuisineType);
      console.log(`🔍 フィルタリング後: ${filteredResults.length}件`);

      if (filteredResults.length === 0) {
        console.log(`⚠️ フィルタリング後0件、フォールバック使用`);
        return this.generateFallbackRecipes(ingredient, cuisineType);
      }

      // 楽天API形式に変換
      const formattedRecipes = await this.formatToRakutenStyle(
        filteredResults.slice(0, maxResults),
        ingredient,
        englishIngredient,
        cuisineType
      );

      console.log(`🎯 最終出力: ${formattedRecipes.length}件`);
      formattedRecipes.forEach((recipe, index) => {
        console.log(`   ${index + 1}. ${recipe.recipeTitle} (スコア: ${recipe.relevanceScore})`);
      });

      return formattedRecipes;

    } catch (error) {
      console.error('デバッグ強化版検索エラー:', error.message);
      return this.generateFallbackRecipes(ingredient, cuisineType);
    }
  }

  // 🆕 検索1: findByIngredients (食材検索)
  async searchByIngredients(englishIngredient, maxResults) {
    try {
      console.log(`🥬 [検索1] findByIngredients: ${englishIngredient}`);

      const response = await axios.get(`${this.baseUrl}/findByIngredients`, {
        params: {
          apiKey: this.spoonacularApiKey,
          ingredients: englishIngredient,
          number: maxResults,
          ranking: 1,
          ignorePantry: false,
          limitLicense: false
        },
        timeout: 15000
      });

      this.limits.spoonacular.current++;
      const results = response.data || [];
      
      console.log(`🥬 [検索1] 結果: ${results.length}件`);
      return results;

    } catch (error) {
      console.error('[検索1] エラー:', error.message);
      return [];
    }
  }

  // 🆕 検索2: complexSearch (人気順)
  async searchComplexPopular(englishIngredient, maxResults) {
    try {
      console.log(`🌟 [検索2] complexSearch (人気順): ${englishIngredient}`);

      const response = await axios.get(`${this.baseUrl}/complexSearch`, {
        params: {
          apiKey: this.spoonacularApiKey,
          query: englishIngredient,
          number: maxResults,
          addRecipeInformation: true,
          fillIngredients: true,
          sort: 'popularity',
          instructionsRequired: true
        },
        timeout: 15000
      });

      this.limits.spoonacular.current++;
      const results = response.data.results || [];
      
      console.log(`🌟 [検索2] 結果: ${results.length}件`);
      return results;

    } catch (error) {
      console.error('[検索2] エラー:', error.message);
      return [];
    }
  }

  // 🆕 検索3: complexSearch + cuisine (ジャンル指定)
  async searchComplexWithCuisine(englishIngredient, cuisineType, maxResults) {
    try {
      const cuisineMap = {
        'korean': 'korean',
        'japanese': 'japanese', 
        'indian': 'indian',
        'chinese': 'chinese',
        'italian': 'italian',
        'thai': 'thai',
        'american': 'american',
        'mexican': 'mexican'
      };

      const spoonacularCuisine = cuisineMap[cuisineType];
      if (!spoonacularCuisine) return [];

      console.log(`🌍 [検索3] complexSearch + cuisine: ${englishIngredient} (${spoonacularCuisine})`);

      const response = await axios.get(`${this.baseUrl}/complexSearch`, {
        params: {
          apiKey: this.spoonacularApiKey,
          query: englishIngredient,
          cuisine: spoonacularCuisine,
          number: maxResults,
          addRecipeInformation: true,
          fillIngredients: true,
          sort: 'max-used-ingredients',
          instructionsRequired: true
        },
        timeout: 15000
      });

      this.limits.spoonacular.current++;
      const results = response.data.results || [];
      
      console.log(`🌍 [検索3] 結果: ${results.length}件`);
      return results;

    } catch (error) {
      console.error('[検索3] エラー:', error.message);
      return [];
    }
  }

  // 🆕 検索4: 代替検索
  async searchAlternative(englishIngredient, cuisineType, maxResults) {
    try {
      // ジャンル特有のキーワードを含めた検索
      let searchQuery = englishIngredient;
      
      if (cuisineType && this.cuisineFilters[cuisineType]) {
        const keywords = this.cuisineFilters[cuisineType];
        searchQuery += ` ${keywords[0]}`; // メインキーワードを追加
      }

      console.log(`🔄 [検索4] 代替検索: "${searchQuery}"`);

      const response = await axios.get(`${this.baseUrl}/complexSearch`, {
        params: {
          apiKey: this.spoonacularApiKey,
          query: searchQuery,
          number: maxResults,
          addRecipeInformation: true,
          fillIngredients: true,
          sort: 'random', // ランダム順で多様性を確保
          instructionsRequired: false // 制約を緩める
        },
        timeout: 15000
      });

      this.limits.spoonacular.current++;
      const results = response.data.results || [];
      
      console.log(`🔄 [検索4] 結果: ${results.length}件`);
      return results;

    } catch (error) {
      console.error('[検索4] エラー:', error.message);
      return [];
    }
  }

  // 🆕 寛容なジャンルフィルタリング
  filterByCuisineGentle(recipes, cuisineType) {
    if (!cuisineType || cuisineType === 'all') {
      console.log(`🔍 フィルタリング: ジャンル指定なし、全件通過`);
      return recipes;
    }

    console.log(`🔍 フィルタリング開始: ${cuisineType}料理 (元: ${recipes.length}件)`);

    // 完全に除外するパターン（非常に厳格）
    const strictExcludes = {
      'thai': ['pizza', 'burger', 'sandwich'],
      'indian': ['pizza', 'burger', 'sandwich'],
      'korean': ['pizza', 'burger', 'sandwich'],
      'chinese': ['pizza', 'burger', 'sandwich'],
      'japanese': ['pizza', 'burger', 'sandwich'],
      'italian': [],
      'american': [],
      'mexican': []
    };

    const excludePatterns = strictExcludes[cuisineType] || [];

    return recipes.map(recipe => {
      const title = (recipe.title || '').toLowerCase();
      let relevanceScore = 0;

      // 厳格な除外チェック
      const shouldExclude = excludePatterns.some(pattern => title.includes(pattern));
      if (shouldExclude) {
        console.log(`❌ 厳格除外: "${recipe.title}"`);
        return null;
      }

      // ジャンル関連キーワードのボーナス
      if (this.cuisineFilters[cuisineType]) {
        const keywords = this.cuisineFilters[cuisineType];
        keywords.forEach(keyword => {
          if (title.includes(keyword.toLowerCase())) {
            relevanceScore += 15;
            console.log(`✅ キーワード一致: "${recipe.title}" (${keyword})`);
          }
        });
      }

      recipe.cuisineRelevanceScore = relevanceScore;
      console.log(`📊 "${recipe.title}" スコア: ${relevanceScore}`);
      return recipe;
    }).filter(recipe => recipe !== null)
      .sort((a, b) => (b.cuisineRelevanceScore || 0) - (a.cuisineRelevanceScore || 0));
  }

  // 🔧 既存のimprovedSearchメソッドを維持（下位互換性）
  async improvedSearch(ingredient, maxResults = 6) {
    return await this.improvedSearchWithCuisine(ingredient, maxResults, null);
  }

  // 重複除去
  removeDuplicateRecipes(recipes) {
    const seen = new Set();
    return recipes.filter(recipe => {
      const key = recipe.id || recipe.title;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  // 詳細レシピ取得
  async getDetailedRecipe(recipeId) {
    try {
      const cleanRecipeId = String(recipeId).replace(/^spoon_/, '');
      
      if (!/^\d+$/.test(cleanRecipeId)) {
        throw new Error(`無効なレシピID: ${cleanRecipeId}`);
      }

      const limits = this.checkLimits();
      if (!limits.canUseSpoonacular) {
        throw new Error('Spoonacular日次制限に達しています');
      }

      const cacheKey = `detail_${cleanRecipeId}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const response = await axios.get(`${this.baseUrl}/${cleanRecipeId}/information`, {
        params: {
          apiKey: this.spoonacularApiKey,
          includeNutrition: false
        },
        timeout: 15000
      });

      this.limits.spoonacular.current++;

      const detail = response.data;
      const translationResults = await this.safeTranslateRecipeDetails(detail);
      const translatedIngredients = await this.safeTranslateIngredients(detail.extendedIngredients || []);

      const detailedRecipe = {
        id: detail.id,
        originalTitle: detail.title,
        translatedTitle: translationResults.title,
        image: detail.image,
        translatedSummary: translationResults.summary,
        translatedInstructions: translationResults.instructions,
        translatedIngredients: translatedIngredients,
        cookingMinutes: detail.cookingMinutes || detail.readyInMinutes,
        servings: detail.servings,
        sourceUrl: detail.sourceUrl,
        spoonacularUrl: detail.spoonacularSourceUrl,
        difficulty: this.estimateDifficulty({
          usedIngredientCount: translatedIngredients.length,
          missedIngredientCount: 0
        }),
        likes: detail.aggregateLikes || 0,
        diets: detail.diets || [],
        dishTypes: detail.dishTypes || [],
        cuisines: detail.cuisines || []
      };

      this.cache.set(cacheKey, detailedRecipe);
      return detailedRecipe;

    } catch (error) {
      console.error(`詳細レシピ取得エラー (${recipeId}):`, error.message);
      
      if (error.response?.status === 404) {
        throw new Error(`レシピ（ID: ${recipeId}）が見つかりませんでした。`);
      } else if (error.response?.status === 402) {
        throw new Error('API制限に達しました。しばらく待ってから再試行してください。');
      } else {
        throw new Error(`レシピ詳細の取得に失敗しました: ${error.message}`);
      }
    }
  }

  // 以下、既存のメソッドは同じなので省略...
  // (安全な翻訳処理、材料翻訳、HTML除去、フォーマット変換、スコア計算など)

  async safeTranslateRecipeDetails(detail) {
    const results = { title: '', summary: '', instructions: '' };
    try {
      if (detail.title) {
        results.title = await this.translateRecipeTitle(detail.title);
      }
    } catch (error) {
      results.title = this.simpleTranslateTitle(detail.title || 'レシピ');
    }
    return results;
  }

  async safeTranslateIngredients(ingredients) {
    const translatedIngredients = [];
    for (const ingredient of ingredients.slice(0, 15)) {
      try {
        const translatedName = await this.translateIngredient(ingredient.name || ingredient.original || '不明な材料');
        translatedIngredients.push({
          name: translatedName,
          amount: ingredient.amount || '',
          unit: ingredient.unit || '',
          original: ingredient.original || ''
        });
      } catch (error) {
        translatedIngredients.push({
          name: ingredient.name || ingredient.original || '不明な材料',
          amount: ingredient.amount || '',
          unit: ingredient.unit || '',
          original: ingredient.original || ''
        });
      }
    }
    return translatedIngredients;
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
  }

  async formatToRakutenStyle(recipes, originalIngredient, englishIngredient, cuisineType = null) {
    const formattedRecipes = [];
    for (const recipe of recipes) {
      try {
        const formatted = {
          recipeId: recipe.id,
          recipeTitle: await this.translateRecipeTitle(recipe.title),
          recipeUrl: `https://spoonacular.com/recipes/${recipe.title.replace(/\s+/g, '-').toLowerCase()}-${recipe.id}`,
          foodImageUrl: recipe.image,
          recipeMaterial: await this.translateIngredients(recipe.usedIngredients || recipe.extendedIngredients, recipe.missedIngredients),
          recipeIndication: this.estimateCookingTime(recipe),
          difficulty: this.estimateDifficulty(recipe),
          category: this.determineCategoryFromCuisine(cuisineType) || this.determineCategoryFromTitle(recipe.title),
          relevanceScore: this.calculateRelevanceScore(recipe, originalIngredient, cuisineType),
          isSpoonacular: true,
          originalTitle: recipe.title,
          usedIngredientCount: recipe.usedIngredientCount || (recipe.extendedIngredients ? recipe.extendedIngredients.length : 0),
          missedIngredientCount: recipe.missedIngredientCount || 0,
          likes: recipe.aggregateLikes || recipe.likes || 0,
          spoonacularData: {
            id: recipe.id,
            title: recipe.title,
            image: recipe.image,
            usedIngredients: recipe.usedIngredients || [],
            missedIngredients: recipe.missedIngredients || []
          }
        };

        formattedRecipes.push(formatted);
        console.log(`📝 変換完了: ${formatted.recipeTitle} (ID: ${formatted.recipeId}, スコア: ${formatted.relevanceScore})`);
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (formatError) {
        console.error(`フォーマット変換エラー (${recipe.id}):`, formatError.message);
      }
    }

    formattedRecipes.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    return formattedRecipes;
  }

  determineCategoryFromCuisine(cuisineType) {
    const cuisineMap = {
      'korean': '韓国料理',
      'japanese': '和食',
      'chinese': '中華料理',  
      'italian': 'イタリア料理',
      'thai': 'タイ料理',
      'indian': 'インド料理',
      'mexican': 'メキシコ料理',
      'american': 'アメリカ料理'
    };
    return cuisineMap[cuisineType?.toLowerCase()] || null;
  }

  determineCategoryFromTitle(title) {
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('korean') || titleLower.includes('kimchi') || titleLower.includes('bulgogi')) {
      return '韓国料理';
    } else if (titleLower.includes('japanese') || titleLower.includes('teriyaki') || titleLower.includes('sushi')) {
      return '和食';
    } else if (titleLower.includes('chinese') || titleLower.includes('stir fry') || titleLower.includes('wok')) {
      return '中華料理';
    } else if (titleLower.includes('italian') || titleLower.includes('pasta') || titleLower.includes('pizza')) {
      return 'イタリア料理';
    } else if (titleLower.includes('thai') || titleLower.includes('curry') || titleLower.includes('coconut')) {
      return 'タイ料理';
    } else if (titleLower.includes('indian') || titleLower.includes('curry') || titleLower.includes('turmeric')) {
      return 'インド料理';
    }
    return 'その他';
  }

  async translateRecipeTitle(title) {
    try {
      const cacheKey = `title_${title}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const limits = this.checkLimits();
      if (!limits.canUseDeepL || title.length > 100) {
        return this.simpleTranslateTitle(title);
      }

      const japaneseTitle = await this.translateWithDeepL(title, 'EN', 'JA');
      this.cache.set(cacheKey, japaneseTitle);
      this.limits.deepl.current += title.length;
      
      return japaneseTitle;

    } catch (error) {
      console.error(`タイトル翻訳エラー: ${error.message}`);
      return this.simpleTranslateTitle(title);
    }
  }

  simpleTranslateTitle(title) {
    const commonWords = {
      'chicken': '鶏肉',
      'beef': '牛肉', 
      'pork': '豚肉',
      'fish': '魚',
      'salmon': 'サーモン',
      'rice': 'ライス',
      'soup': 'スープ',
      'salad': 'サラダ',
      'pasta': 'パスタ',
      'pizza': 'ピザ',
      'sandwich': 'サンドイッチ',
      'curry': 'カレー',
      'kimchi': 'キムチ',
      'korean': '韓国風',
      'indian': 'インド風',
      'thai': 'タイ風',
      'chinese': '中華風',
      'italian': 'イタリア風',
      'stir fry': '炒め物',
      'grilled': 'グリル',
      'baked': '焼き',
      'fried': '揚げ',
      'roasted': 'ロースト',
      'easy': '簡単',
      'quick': '時短',
      'healthy': 'ヘルシー',
      'spicy': 'スパイシー',
      'sweet': '甘い',
      'sour': '酸っぱい',
      'cabbage': 'キャベツ',
      'tomato': 'トマト',
      'onion': '玉ねぎ',
      'pad thai': 'パッタイ',
      'coconut': 'ココナッツ',
      'lemongrass': 'レモングラス'
    };

    let translated = title;
    Object.entries(commonWords).forEach(([en, jp]) => {
      const regex = new RegExp(`\\b${en}\\b`, 'gi');
      translated = translated.replace(regex, jp);
    });

    return translated;
  }

  async translateIngredients(usedIngredients = [], missedIngredients = []) {
    const allIngredients = [...usedIngredients, ...missedIngredients];
    const translatedIngredients = [];

    for (const ingredient of allIngredients.slice(0, 8)) {
      try {
        const name = ingredient.name || ingredient.original || ingredient;
        const translatedName = await this.translateIngredient(name);
        translatedIngredients.push(translatedName);
      } catch (error) {
        console.error(`材料翻訳エラー: ${error.message}`);
        translatedIngredients.push(ingredient.name || ingredient.original || ingredient);
      }
    }

    return translatedIngredients;
  }

  estimateCookingTime(recipe) {
    if (recipe.readyInMinutes) {
      return `約${recipe.readyInMinutes}分`;
    }
    if (recipe.cookingMinutes) {
      return `約${recipe.cookingMinutes}分`;
    }
    
    const totalIngredients = (recipe.usedIngredientCount || 0) + (recipe.missedIngredientCount || 0) ||
                            (recipe.extendedIngredients ? recipe.extendedIngredients.length : 5);
    
    if (totalIngredients <= 5) return '約15分';
    if (totalIngredients <= 8) return '約25分';
    return '約35分';
  }

  estimateDifficulty(recipe) {
    const totalIngredients = (recipe.usedIngredientCount || 0) + (recipe.missedIngredientCount || 0) ||
                            (recipe.extendedIngredients ? recipe.extendedIngredients.length : 5);
    const missedCount = recipe.missedIngredientCount || 0;
    
    if (totalIngredients <= 5 && missedCount <= 2) return '簡単';
    if (totalIngredients <= 8 && missedCount <= 3) return '普通';
    return '上級';
  }

  calculateRelevanceScore(recipe, originalIngredient, cuisineType = null) {
    let score = 0;
    const title = (recipe.title || '').toLowerCase();
    const originalLower = originalIngredient.toLowerCase();
    
    // 食材の使用状況を重視
    const usedCount = recipe.usedIngredientCount || 0;
    const totalCount = usedCount + (recipe.missedIngredientCount || 0);
    
    if (totalCount > 0) {
      score += (usedCount / totalCount) * 40;
    } else {
      score += 20;
    }
    
    // タイトルに食材名が含まれている
    if (title.includes(originalLower)) {
      score += 35;
    } else if (title.includes(originalIngredient)) {
      score += 30;
    }

    // ジャンル一致ボーナス
    if (cuisineType && recipe.cuisineRelevanceScore) {
      score += recipe.cuisineRelevanceScore;
    }
    
    // 人気度
    if (recipe.aggregateLikes || recipe.likes) {
      const likes = recipe.aggregateLikes || recipe.likes;
      score += Math.min(likes / 200, 10);
    }
    
    // 調理時間ボーナス
    if (recipe.readyInMinutes && recipe.readyInMinutes <= 30) {
      score += 5;
    }
    
    return Math.round(Math.max(0, Math.min(score, 100)));
  }

  generateFallbackRecipes(ingredient, cuisineType = null) {
    const baseCuisine = this.determineCategoryFromCuisine(cuisineType) || '汎用';
    const fallbackRecipes = [
      {
        recipeId: `fallback_${ingredient}_1`,
        recipeTitle: `${ingredient}の${baseCuisine}風炒め`,
        recipeUrl: 'https://recipe.rakuten.co.jp/',
        recipeMaterial: [ingredient, '塩', 'こしょう', 'サラダ油'],
        recipeIndication: '10分',
        difficulty: '簡単',
        category: `${baseCuisine}料理`,
        relevanceScore: 80,
        isSpoonacular: false,
        isFallback: true
      },
      {
        recipeId: `fallback_${ingredient}_2`,
        recipeTitle: `${ingredient}の${baseCuisine}風サラダ`,
        recipeUrl: 'https://recipe.rakuten.co.jp/',
        recipeMaterial: [ingredient, 'ドレッシング', 'レタス'],
        recipeIndication: '5分',
        difficulty: '簡単',
        category: `${baseCuisine}料理`,
        relevanceScore: 75,
        isSpoonacular: false,
        isFallback: true
      }
    ];

    console.log(`🔄 フォールバックレシピ生成: ${ingredient} (${baseCuisine})`);
    return fallbackRecipes;
  }

  getUsageReport() {
    const limits = this.checkLimits();
    return {
      spoonacular: {
        used: this.limits.spoonacular.current,
        remaining: limits.spoonacularRemaining,
        total: this.limits.spoonacular.daily
      },
      deepl: {
        used: this.limits.deepl.current,
        remaining: limits.deeplRemaining,
        total: this.limits.deepl.monthly
      },
      cacheSize: this.cache.size,
      dictionarySize: Object.keys(this.ingredientDict).length
    };
  }

  resetDailyLimits() {
    this.limits.spoonacular.current = 0;
    console.log('🔄 Spoonacular日次制限をリセット');
  }

  resetMonthlyLimits() {
    this.limits.deepl.current = 0;
    console.log('🔄 DeepL月次制限をリセット');
  }
}

module.exports = SpoonacularFreeTierService;
