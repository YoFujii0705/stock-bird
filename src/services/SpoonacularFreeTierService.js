// SpoonacularFreeTierService.js - Part 1: コンストラクタと基本設定
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

    // 除外すべき食材パターン
    // 除外すべき食材パターン（コンストラクタ内）
this.excludePatterns = [
  // 曖昧な表現
  /あまり$/,
  /残り$/,
  /余り$/,
  /ストック$/,
  /在庫$/,
  // 一般的でない食材名
  /夕食の/,
  /朝食の/,
  /昼食の/,
  /料理の/,
  /食事の/,
  // 単位のみ
  /^パック$/,
  /^個$/,
  /^本$/,
  /^袋$/,
  /^缶$/,
  // 🔧 修正: 1文字の食材を除外
  /^.{1}$/,
  // 空白や意味のない文字列
  /^\s*$/
];

    // 優先食材の判定パターン
    this.priorityPatterns = [
      /期限/,
      /消費期限/,
      /賞味期限/,
      /キャベツ/,
      /人参|にんじん/,
      /玉ねぎ|たまねぎ/,
      /豚肉/,
      /鶏肉/,
      /牛肉/,
      /じゃがいも/,
      /トマト/,
      /なす|ナス/,
      /ピーマン/,
      /きのこ/
    ];

    // 拡張された料理ジャンル別検索戦略
    this.cuisineFilters = {
      'korean': {
        primary: ['korean', 'kimchi', 'bulgogi', 'bibimbap', 'gochujang'],
        secondary: ['ssam', 'banchan', 'galbi', 'japchae', 'tteokboki', 'samgyeopsal', 'doenjang', 'sesame oil'],
        cooking_methods: ['fermented', 'grilled', 'braised', 'marinated'],
        ingredients: ['napa cabbage', 'korean chili', 'garlic', 'ginger', 'scallion'],
        expectedResults: 'limited'
      },
      'japanese': {
        primary: ['japanese', 'soy sauce', 'miso', 'teriyaki', 'sushi'],
        secondary: ['ramen', 'udon', 'tempura', 'katsu', 'yakitori', 'donburi', 'onigiri', 'dashi'],
        cooking_methods: ['steamed', 'grilled', 'fried', 'simmered'],
        ingredients: ['shiitake', 'nori', 'wasabi', 'pickled', 'rice vinegar', 'mirin'],
        expectedResults: 'moderate'
      },
      'chinese': {
        primary: ['chinese', 'stir fry', 'wok', 'szechuan', 'cantonese'],
        secondary: ['dim sum', 'hot pot', 'kung pao', 'sweet and sour', 'black bean', 'oyster sauce'],
        cooking_methods: ['stir-fried', 'braised', 'steamed', 'deep-fried'],
        ingredients: ['bok choy', 'water chestnuts', 'bamboo shoots', 'hoisin', 'rice wine'],
        expectedResults: 'good'
      },
      'thai': {
        primary: ['thai', 'coconut', 'pad thai', 'curry', 'lemongrass', 'fish sauce'],
        secondary: ['tom yum', 'som tam', 'massaman', 'green curry', 'red curry', 'pad krapow'],
        cooking_methods: ['spicy', 'coconut milk', 'wok-fried'],
        ingredients: ['galangal', 'kaffir lime', 'thai basil', 'bird chili', 'tamarind'],
        expectedResults: 'limited'
      },
      'indian': {
        primary: ['indian', 'curry', 'turmeric', 'garam masala', 'tandoori', 'cumin'],
        secondary: ['biryani', 'dal', 'naan', 'samosa', 'chutney', 'masala', 'vindaloo', 'korma'],
        cooking_methods: ['spiced', 'roasted', 'slow-cooked'],
        ingredients: ['cardamom', 'coriander', 'fenugreek', 'mustard seed', 'curry leaves'],
        expectedResults: 'moderate'
      },
      'italian': {
        primary: ['italian', 'pasta', 'pizza', 'basil', 'parmesan'],
        secondary: ['risotto', 'gnocchi', 'carbonara', 'pesto', 'marinara', 'alfredo', 'bruschetta'],
        cooking_methods: ['al dente', 'sautéed', 'roasted'],
        ingredients: ['oregano', 'mozzarella', 'prosciutto', 'balsamic', 'olive tapenade'],
        expectedResults: 'limited'
      },
      'mexican': {
        primary: ['mexican', 'taco', 'burrito', 'salsa', 'guacamole'],
        secondary: ['quesadilla', 'enchilada', 'fajita', 'mole', 'carnitas', 'ceviche', 'tamale'],
        cooking_methods: ['grilled', 'charred', 'slow-cooked'],
        ingredients: ['cilantro', 'jalapeño', 'chipotle', 'cumin', 'lime', 'cotija cheese'],
        expectedResults: 'moderate'
      },
      'american': {
        primary: ['american', 'burger', 'bbq', 'sandwich'],
        secondary: ['mac and cheese', 'fried chicken', 'meatloaf', 'coleslaw', 'cornbread', 'wings'],
        cooking_methods: ['grilled', 'barbecued', 'fried', 'baked'],
        ingredients: ['cheddar', 'bacon', 'ranch', 'buttermilk', 'brown sugar'],
        expectedResults: 'good'
      },
      'french': {
        primary: ['french', 'béchamel', 'roux', 'confit', 'bourguignon'],
        secondary: ['quiche', 'coq au vin', 'ratatouille', 'bouillabaisse', 'cassoulet'],
        cooking_methods: ['braised', 'sautéed', 'poached', 'flambéed'],
        ingredients: ['herbs de provence', 'crème fraîche', 'butter', 'wine', 'shallots'],
        expectedResults: 'moderate'
      }
    };

    // 食材辞書
    this.ingredientDict = {
      'キャベツ': 'cabbage', 'きゃべつ': 'cabbage',
      '人参': 'carrot', 'にんじん': 'carrot', 'ニンジン': 'carrot',
      '玉ねぎ': 'onion', 'たまねぎ': 'onion', 'タマネギ': 'onion',
      'じゃがいも': 'potato', 'ジャガイモ': 'potato', 'ポテト': 'potato',
      'トマト': 'tomato', 'とまと': 'tomato',
      'ピーマン': 'bell pepper', 'パプリカ': 'paprika',
      'なす': 'eggplant', 'ナス': 'eggplant', '茄子': 'eggplant',
      'きのこ': 'mushroom', 'しいたけ': 'shiitake', 'マッシュルーム': 'mushroom',
      '豚肉': 'pork', 'ぶたにく': 'pork', '牛肉': 'beef', 'ぎゅうにく': 'beef',
      '鶏肉': 'chicken', 'とりにく': 'chicken', '鶏': 'chicken',
      '卵': 'egg', 'たまご': 'egg', 'エッグ': 'egg',
      '米': 'rice', 'こめ': 'rice', 'ライス': 'rice',
      'チーズ': 'cheese', 'バター': 'butter', '牛乳': 'milk',
      '大根': 'daikon', 'だいこん': 'daikon',
      'もやし': 'bean sprouts', 'ほうれん草': 'spinach',
      '白菜': 'napa cabbage', 'はくさい': 'napa cabbage'
    };

    // 食材ペアリング辞書
    this.ingredientPairings = {
      'cabbage': {
        'korean': ['pork', 'garlic', 'ginger', 'chili paste', 'sesame oil'],
        'japanese': ['carrot', 'onion', 'soy sauce', 'mirin', 'dashi'],
        'chinese': ['ginger', 'soy sauce', 'rice wine', 'scallion'],
        'american': ['bacon', 'onion', 'apple', 'vinegar'],
        'default': ['onion', 'carrot', 'garlic', 'butter']
      },
      'carrot': {
        'korean': ['beef', 'sesame oil', 'garlic', 'soy sauce'],
        'japanese': ['daikon', 'soy sauce', 'mirin', 'ginger'],
        'chinese': ['ginger', 'scallion', 'soy sauce', 'hoisin'],
        'indian': ['cumin', 'turmeric', 'onion', 'garam masala'],
        'default': ['onion', 'celery', 'potato', 'herbs']
      },
      'onion': {
        'korean': ['garlic', 'ginger', 'soy sauce', 'sesame oil'],
        'japanese': ['soy sauce', 'mirin', 'sake', 'dashi'],
        'chinese': ['ginger', 'garlic', 'soy sauce', 'oyster sauce'],
        'indian': ['garlic', 'ginger', 'tomato', 'spices'],
        'default': ['garlic', 'celery', 'carrot', 'herbs']
      },
      'potato': {
        'korean': ['beef', 'soy sauce', 'sesame oil'],
        'japanese': ['carrot', 'onion', 'dashi'],
        'american': ['bacon', 'cheese', 'butter'],
        'indian': ['turmeric', 'cumin', 'coriander'],
        'default': ['onion', 'garlic', 'herbs']
      }
    };

    // 類似食材マッピング
    this.similarIngredients = {
      'cabbage': ['napa cabbage', 'bok choy', 'kale', 'brussels sprouts', 'coleslaw mix'],
      'carrot': ['parsnip', 'sweet potato', 'turnip', 'baby carrot'],
      'onion': ['shallot', 'leek', 'green onion', 'garlic', 'red onion'],
      'potato': ['sweet potato', 'turnip', 'parsnip', 'yam'],
      'tomato': ['bell pepper', 'eggplant', 'zucchini', 'cherry tomato'],
      'mushroom': ['shiitake', 'portobello', 'button mushroom', 'oyster mushroom'],
      'beef': ['pork', 'lamb', 'ground beef', 'steak'],
      'chicken': ['turkey', 'duck', 'chicken breast', 'chicken thigh'],
      'pork': ['bacon', 'ham', 'sausage', 'pork belly'],
      'eggplant': ['zucchini', 'bell pepper', 'tomato']
    };

    console.log(`📚 拡張版食材辞書初期化完了（フィルタリング機能付き）`);
  }

// Part 2: フィルタリング機能とメイン検索

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
        return this.ingredientDict[ingredient] || this.ingredientDict[normalized];
      }
      return ingredient;
    } catch (error) {
      console.error(`翻訳エラー (${ingredient}):`, error.message);
      return ingredient;
    }
  }

  // 食材の適格性チェック
  isValidIngredient(ingredientName) {
    // 除外パターンにマッチするものは無効
    for (const pattern of this.excludePatterns) {
      if (pattern.test(ingredientName)) {
        console.log(`🚫 除外食材: "${ingredientName}" (パターン: ${pattern})`);
        return false;
      }
    }

    // 短すぎる名前も除外
    if (ingredientName.length <= 1) {
      console.log(`🚫 除外食材: "${ingredientName}" (短すぎる)`);
      return false;
    }

    return true;
  }

  // 優先食材の判定
  isPriorityIngredient(ingredientName) {
    for (const pattern of this.priorityPatterns) {
      if (pattern.test(ingredientName)) {
        return true;
      }
    }
    return false;
  }

  // 食材リストのフィルタリングと整理
  filterAndPrioritizeIngredients(ingredients, options = {}) {
    const {
      excludeList = [],
      priorityList = [],
      maxIngredients = 3,
      daysLeftThreshold = 3
    } = options;

    console.log(`🔍 食材フィルタリング開始: ${ingredients.length}個の食材`);

    // Step 1: 無効な食材を除外
// Step 1: 無効な食材を除外
let validIngredients = ingredients.filter(ingredient => {
  const name = ingredient.name || ingredient;
  
  // 明示的な除外リストチェック
  if (excludeList.includes(name)) {
    console.log(`🚫 明示的除外: "${name}"`);
    return false;
  }

  // パターンマッチング除外
  if (!this.isValidIngredient(name)) {
    return false;
  }

  // 🔧 修正: 在庫量チェック強化
  if (ingredient.currentAmount !== undefined) {
    if (ingredient.currentAmount <= 0) {
      console.log(`🚫 在庫なし: "${name}" (在庫: ${ingredient.currentAmount})`);
      return false;
    }
  }

  // 🆕 追加: 空文字や不正な値のチェック
  if (!name || name.trim() === '') {
    console.log(`🚫 無効な食材名: "${name}"`);
    return false;
  }

  return true;
});
    console.log(`✅ 有効食材: ${validIngredients.length}個`);

    // Step 2: 優先度スコアリング
    validIngredients = validIngredients.map(ingredient => {
      const name = ingredient.name || ingredient;
      let priorityScore = 0;

      // 明示的な優先リスト
      if (priorityList.includes(name)) {
        priorityScore += 100;
      }

      // 期限が近い食材
      if (ingredient.daysLeft !== undefined && ingredient.daysLeft <= daysLeftThreshold) {
        priorityScore += 50 + (daysLeftThreshold - ingredient.daysLeft) * 10;
      }

      // パターンマッチング優先度
      if (this.isPriorityIngredient(name)) {
        priorityScore += 30;
      }

      // 在庫量が少ない場合
      if (ingredient.currentAmount !== undefined && ingredient.notificationThreshold !== undefined) {
        if (ingredient.currentAmount <= ingredient.notificationThreshold) {
          priorityScore += 20;
        }
      }

      // 開封済み食材を優先
      if (ingredient.openStatus === '開封済み') {
        priorityScore += 15;
      }

      return {
        ...ingredient,
        priorityScore,
        name: name
      };
    });

    // Step 3: 優先度でソート
    validIngredients.sort((a, b) => b.priorityScore - a.priorityScore);

    // Step 4: 上位食材を選択
    const selectedIngredients = validIngredients.slice(0, maxIngredients);

    console.log(`🎯 選択された食材:`, selectedIngredients.map(ing => 
      `${ing.name} (スコア: ${ing.priorityScore})`
    ));

    return selectedIngredients;
  }

  // 改良されたメイン検索メソッド（フィルタリング付き）
  async improvedSearchWithFiltering(allIngredients, maxResults = 6, cuisineType = null, options = {}) {
    try {
      console.log(`🔍 === フィルタリング付き検索開始 ===`);
      
      // 食材フィルタリング
      const filteredIngredients = this.filterAndPrioritizeIngredients(allIngredients, options);
      
      if (filteredIngredients.length === 0) {
        console.log(`⚠️ 有効な食材がありません`);
        return this.generateInformedFallbackRecipes('基本食材', cuisineType);
      }

      // 最も優先度の高い食材で検索
      const primaryIngredient = filteredIngredients[0].name;
      console.log(`🎯 メイン食材: ${primaryIngredient}`);

      const limits = this.checkLimits();
      if (!limits.canUseSpoonacular) {
        return this.generateInformedFallbackRecipes(primaryIngredient, cuisineType);
      }

      const englishIngredient = await this.translateIngredient(primaryIngredient);
      console.log(`🔍 英語食材名: "${englishIngredient}"`);

      // 期待値情報を表示
      if (cuisineType && this.cuisineFilters[cuisineType]) {
        const strategy = this.cuisineFilters[cuisineType];
        console.log(`💡 期待値: ${strategy.expectedResults} (${strategy.fallbackMessage})`);
      }

      // 多層検索実行
      const allResults = await this.multiLayerSearch(englishIngredient, cuisineType, maxResults);

      if (allResults.length === 0) {
        console.log(`⚠️ 多層検索で結果なし、フォールバック検索実行`);
        return await this.enhancedFallbackSearch(englishIngredient, cuisineType);
      }

      // 追加の食材情報を結果に含める
      const enhancedResults = allResults.map(result => ({
        ...result,
        searchContext: {
          primaryIngredient,
          filteredIngredients: filteredIngredients.map(ing => ing.name),
          urgentIngredients: filteredIngredients.filter(ing => ing.daysLeft <= 3).map(ing => ing.name)
        }
      }));

      // 楽天API形式に変換
      const formattedRecipes = await this.formatToRakutenStyleWithInsights(
        enhancedResults.slice(0, maxResults),
        primaryIngredient,
        englishIngredient,
        cuisineType
      );

      // 結果についての洞察を追加
      this.logSearchInsights(formattedRecipes, primaryIngredient, cuisineType);

      return formattedRecipes;

    } catch (error) {
      console.error('フィルタリング付き検索エラー:', error.message);
      return this.generateInformedFallbackRecipes('基本食材', cuisineType);
    }
  }

  // 既存メソッドの更新（下位互換性維持）
  async improvedSearchWithCuisine(ingredient, maxResults = 6, cuisineType = null, options = {}) {
    // 単一食材の場合
    if (typeof ingredient === 'string') {
      return await this.improvedSearchWithFiltering([{name: ingredient}], maxResults, cuisineType, options);
    }
    
    // 食材リストの場合
    if (Array.isArray(ingredient)) {
      return await this.improvedSearchWithFiltering(ingredient, maxResults, cuisineType, options);
    }

    // 食材オブジェクトの場合
    return await this.improvedSearchWithFiltering([ingredient], maxResults, cuisineType, options);
  }

// Part 3: 多層検索戦略

  // 多層検索戦略
  async multiLayerSearch(englishIngredient, cuisineType, maxResults) {
    const allResults = [];
    console.log(`🔍 多層検索開始: ${englishIngredient} (${cuisineType})`);

    try {
      // Layer 1: 直接検索（最も関連性が高い）
      const directResults = await this.directIngredientSearch(englishIngredient, cuisineType, 4);
      allResults.push(...directResults.map(r => ({...r, searchLayer: 'direct', priority: 1})));

      // Layer 2: 料理法組み合わせ検索
      if (allResults.length < maxResults) {
        const cookingMethodResults = await this.cookingMethodSearch(englishIngredient, cuisineType, 3);
        allResults.push(...cookingMethodResults.map(r => ({...r, searchLayer: 'cooking_method', priority: 2})));
      }

      // Layer 3: 関連食材組み合わせ検索
      if (allResults.length < maxResults) {
        const combinationResults = await this.ingredientCombinationSearch(englishIngredient, cuisineType, 3);
        allResults.push(...combinationResults.map(r => ({...r, searchLayer: 'combination', priority: 3})));
      }

      // Layer 4: カテゴリ検索（料理名で検索）
      if (allResults.length < maxResults) {
        const categoryResults = await this.categoryBasedSearch(englishIngredient, cuisineType, 2);
        allResults.push(...categoryResults.map(r => ({...r, searchLayer: 'category', priority: 4})));
      }

      // Layer 5: 類似食材検索
      if (allResults.length < maxResults) {
        const similarResults = await this.similarIngredientSearch(englishIngredient, cuisineType, 2);
        allResults.push(...similarResults.map(r => ({...r, searchLayer: 'similar', priority: 5})));
      }

      return this.prioritizeAndDedup(allResults, maxResults);

    } catch (error) {
      console.error('多層検索エラー:', error.message);
      return [];
    }
  }

  // 直接検索
  async directIngredientSearch(ingredient, cuisineType, count) {
    const queries = [
      cuisineType && cuisineType !== 'all' ? `${ingredient} ${cuisineType}` : null,
      `${ingredient} recipe`,
      ingredient
    ].filter(Boolean);

    const results = [];
    for (const query of queries) {
      try {
        const response = await axios.get(`${this.baseUrl}/complexSearch`, {
          params: {
            apiKey: this.spoonacularApiKey,
            query: query,
            cuisine: cuisineType !== 'all' ? cuisineType : undefined,
            number: count,
            addRecipeInformation: true,
            sort: 'max-used-ingredients'
          },
          timeout: 15000
        });
        
        const recipeResults = response.data.results || [];
        results.push(...recipeResults);
        this.limits.spoonacular.current++;
        console.log(`  直接検索 "${query}": ${recipeResults.length}件`);

        // 良い結果が得られたら早期終了
        if (recipeResults.length >= 3) break;

      } catch (error) {
        console.error(`直接検索エラー (${query}):`, error.message);
      }
    }
    return results;
  }

  // 料理法組み合わせ検索
  async cookingMethodSearch(ingredient, cuisineType, count) {
    const cuisineData = this.cuisineFilters[cuisineType];
    if (!cuisineData || !cuisineData.cooking_methods) return [];

    const cookingMethods = cuisineData.cooking_methods.slice(0, 2);
    const results = [];

    for (const method of cookingMethods) {
      try {
        const query = `${method} ${ingredient}`;
        const response = await axios.get(`${this.baseUrl}/complexSearch`, {
          params: {
            apiKey: this.spoonacularApiKey,
            query: query,
            number: count,
            addRecipeInformation: true,
            sort: 'popularity'
          },
          timeout: 15000
        });
        
        const recipeResults = response.data.results || [];
        results.push(...recipeResults);
        this.limits.spoonacular.current++;
        console.log(`  料理法検索 "${method}": ${recipeResults.length}件`);

      } catch (error) {
        console.error(`料理法検索エラー (${method}):`, error.message);
      }
    }
    return results;
  }

  // 食材組み合わせ検索
  async ingredientCombinationSearch(ingredient, cuisineType, count) {
    const pairings = this.getCommonPairings(ingredient, cuisineType);
    const results = [];

    for (const pairing of pairings.slice(0, 2)) {
      try {
        const response = await axios.get(`${this.baseUrl}/findByIngredients`, {
          params: {
            apiKey: this.spoonacularApiKey,
            ingredients: `${ingredient},${pairing}`,
            number: count,
            ranking: 1
          },
          timeout: 15000
        });
        
        const recipeResults = response.data || [];
        results.push(...recipeResults);
        this.limits.spoonacular.current++;
        console.log(`  組み合わせ検索 "${pairing}": ${recipeResults.length}件`);

      } catch (error) {
        console.error(`組み合わせ検索エラー (${pairing}):`, error.message);
      }
    }
    return results;
  }

  // カテゴリベース検索
  async categoryBasedSearch(ingredient, cuisineType, count) {
    const cuisineData = this.cuisineFilters[cuisineType];
    if (!cuisineData || !cuisineData.secondary) return [];

    const dishNames = cuisineData.secondary.slice(0, 3);
    const results = [];

    for (const dish of dishNames) {
      try {
        const query = `${dish} ${ingredient}`;
        const response = await axios.get(`${this.baseUrl}/complexSearch`, {
          params: {
            apiKey: this.spoonacularApiKey,
            query: query,
            number: count,
            addRecipeInformation: true,
            sort: 'popularity'
          },
          timeout: 15000
        });
        
        const recipeResults = response.data.results || [];
        results.push(...recipeResults);
        this.limits.spoonacular.current++;
        console.log(`  カテゴリ検索 "${dish}": ${recipeResults.length}件`);

      } catch (error) {
        console.error(`カテゴリ検索エラー (${dish}):`, error.message);
      }
    }
    return results;
  }

  // 類似食材検索
  async similarIngredientSearch(ingredient, cuisineType, count) {
    const similarIngredients = this.similarIngredients[ingredient] || [];
    if (similarIngredients.length === 0) return [];

    const results = [];
    for (const similar of similarIngredients.slice(0, 2)) {
      try {
        const query = cuisineType && cuisineType !== 'all' ? 
          `${similar} ${cuisineType}` : similar;
          
        const response = await axios.get(`${this.baseUrl}/complexSearch`, {
          params: {
            apiKey: this.spoonacularApiKey,
            query: query,
            cuisine: cuisineType !== 'all' ? cuisineType : undefined,
            number: count,
            addRecipeInformation: true,
            sort: 'max-used-ingredients'
          },
          timeout: 15000
        });
        
        const recipeResults = response.data.results || [];
        results.push(...recipeResults);
        this.limits.spoonacular.current++;
        console.log(`  類似食材検索 "${similar}": ${recipeResults.length}件`);

      } catch (error) {
        console.error(`類似食材検索エラー (${similar}):`, error.message);
      }
    }
    return results;
  }

  // 強化されたフォールバック検索
  async enhancedFallbackSearch(ingredient, cuisineType) {
    console.log(`🔄 強化フォールバック検索開始: ${ingredient}`);
    
    const fallbackStrategies = [
      // 1. より広いカテゴリでの検索
      async () => {
        try {
          const response = await axios.get(`${this.baseUrl}/complexSearch`, {
            params: {
              apiKey: this.spoonacularApiKey,
              query: ingredient,
              number: 4,
              addRecipeInformation: true,
              sort: 'popularity'
            },
            timeout: 15000
          });
          this.limits.spoonacular.current++;
          return response.data.results || [];
        } catch (error) {
          console.error('広域検索エラー:', error.message);
          return [];
        }
      },

      // 2. 基本的な調理法での検索
      async () => {
        const basicMethods = ['soup', 'salad', 'stir fry', 'roasted'];
        const results = [];
        
        for (const method of basicMethods.slice(0, 2)) {
          try {
            const response = await axios.get(`${this.baseUrl}/complexSearch`, {
              params: {
                apiKey: this.spoonacularApiKey,
                query: `${method} ${ingredient}`,
                number: 2,
                addRecipeInformation: true
              },
              timeout: 15000
            });
            results.push(...(response.data.results || []));
            this.limits.spoonacular.current++;
          } catch (error) {
            console.error(`基本調理法検索エラー (${method}):`, error.message);
          }
        }
        return results;
      }
    ];

    for (const strategy of fallbackStrategies) {
      const results = await strategy();
      if (results.length > 0) {
        console.log(`✅ フォールバック成功: ${results.length}件`);
        return results;
      }
    }

    // すべて失敗した場合は生成レシピ
    return this.generateInformedFallbackRecipes(ingredient, cuisineType);
  }

  // 一般的な食材ペアリング
  getCommonPairings(ingredient, cuisineType) {
    const pairings = this.ingredientPairings[ingredient];
    if (!pairings) return ['garlic', 'onion'];

    return pairings[cuisineType] || pairings['default'] || ['garlic', 'onion'];
  }

  // 優先順位付けと重複除去
  prioritizeAndDedup(results, maxResults) {
    // IDベースで重複除去
    const uniqueResults = new Map();
    
    results.forEach(recipe => {
      const id = recipe.id;
      if (!uniqueResults.has(id) || uniqueResults.get(id).priority > recipe.priority) {
        uniqueResults.set(id, recipe);
      }
    });

    // 優先順位とスコアでソート
    return Array.from(uniqueResults.values())
      .sort((a, b) => {
        // まず優先順位（層の重要度）
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        // 次にSpoonacularのスコア
        return (b.spoonacularScore || 0) - (a.spoonacularScore || 0);
      })
      .slice(0, maxResults);
  }

// Part 4: データ処理とフォーマット機能

  // 品質スコアリング
  calculateQualityScore(recipe, searchContext) {
    let score = 0;
    
    // 基本関連性 (40%)
    score += this.calculateEnhancedRelevanceScore(recipe, searchContext.ingredient, searchContext.cuisineType) * 0.4;
    
    // 人気度 (20%)
    const likes = recipe.aggregateLikes || recipe.likes || 0;
    score += Math.min(likes / 100, 1) * 20;
    
    // 評価 (20%)
    const spoonacularScore = recipe.spoonacularScore || 50;
    score += (spoonacularScore / 100) * 20;
    
    // 完全性 (20%)
    let completeness = 0.5;
    if (recipe.image) completeness += 0.25;
    if (recipe.instructions || recipe.analyzedInstructions) completeness += 0.25;
    score += completeness * 20;
    
    return Math.round(score);
  }

  // 洞察ログ
  logSearchInsights(recipes, ingredient, cuisineType) {
    console.log(`💡 === 検索結果の洞察 ===`);
    console.log(`💡 ${ingredient} × ${cuisineType}料理: ${recipes.length}件取得`);
    
    if (cuisineType && this.cuisineFilters[cuisineType]) {
      const strategy = this.cuisineFilters[cuisineType];
      console.log(`💡 期待値: ${strategy.expectedResults}`);
      console.log(`💡 説明: ${strategy.fallbackMessage}`);
    }

    const uniqueTitles = [...new Set(recipes.map(r => r.recipeTitle))];
    console.log(`💡 ユニークなレシピ: ${uniqueTitles.length}件`);
    
    // 検索層の分析
    const layerCounts = {};
    recipes.forEach(recipe => {
      const layer = recipe.searchLayer || 'unknown';
      layerCounts[layer] = (layerCounts[layer] || 0) + 1;
    });
    console.log(`💡 検索層分布:`, layerCounts);
    
    if (recipes.length < 3) {
      console.log(`⚠️ 結果が少ない理由: ${ingredient}を使った${cuisineType}料理のデータベース登録数が限定的`);
    }
  }

  // 情報付きフォールバック
  generateInformedFallbackRecipes(ingredient, cuisineType = null) {
    const strategy = cuisineType ? this.cuisineFilters[cuisineType] : null;
    const baseCuisine = this.determineCategoryFromCuisine(cuisineType) || '汎用';
    
    console.log(`🔄 情報付きフォールバック: ${ingredient} (${baseCuisine})`);
    if (strategy) {
      console.log(`💡 理由: ${strategy.fallbackMessage}`);
    }

    const fallbackRecipes = [
      {
        recipeId: `fallback_informed_${ingredient}_1`,
        recipeTitle: `${ingredient}の${baseCuisine}風炒め（提案レシピ）`,
        recipeUrl: 'https://recipe.rakuten.co.jp/',
        recipeMaterial: [ingredient, '基本調味料'],
        recipeIndication: '15分',
        difficulty: '簡単',
        category: `${baseCuisine}料理`,
        relevanceScore: 85,
        isSpoonacular: false,
        isFallback: true,
        fallbackReason: strategy ? strategy.fallbackMessage : 'データベースにレシピが少ないため'
      },
      {
        recipeId: `fallback_informed_${ingredient}_2`,
        recipeTitle: `${ingredient}の簡単スープ（提案レシピ）`,
        recipeUrl: 'https://recipe.rakuten.co.jp/',
        recipeMaterial: [ingredient, '野菜ブイヨン', '塩胡椒'],
        recipeIndication: '20分',
        difficulty: '簡単',
        category: 'スープ',
        relevanceScore: 80,
        isSpoonacular: false,
        isFallback: true,
        fallbackReason: strategy ? strategy.fallbackMessage : 'データベースにレシピが少ないため'
      },
      {
        recipeId: `fallback_informed_${ingredient}_3`,
        recipeTitle: `${ingredient}のサラダ（提案レシピ）`,
        recipeUrl: 'https://recipe.rakuten.co.jp/',
        recipeMaterial: [ingredient, 'ドレッシング', 'その他野菜'],
        recipeIndication: '10分',
        difficulty: '簡単',
        category: 'サラダ',
        relevanceScore: 75,
        isSpoonacular: false,
        isFallback: true,
        fallbackReason: strategy ? strategy.fallbackMessage : 'データベースにレシピが少ないため'
      }
    ];

    return fallbackRecipes;
  }

  // 洞察付きフォーマット
  async formatToRakutenStyleWithInsights(recipes, originalIngredient, englishIngredient, cuisineType) {
    console.log(`📝 洞察付きフォーマット開始: ${recipes.length}件`);
    
    const formattedRecipes = [];
    for (const recipe of recipes) {
      try {
        const searchContext = {
          ingredient: originalIngredient,
          englishIngredient: englishIngredient,
          cuisineType: cuisineType
        };

        const formatted = {
          recipeId: recipe.id,
          recipeTitle: await this.translateRecipeTitle(recipe.title),
          recipeUrl: recipe.sourceUrl || `https://spoonacular.com/recipes/${recipe.title.replace(/\s+/g, '-').toLowerCase()}-${recipe.id}`,
          foodImageUrl: recipe.image,
          recipeMaterial: await this.translateIngredients(recipe.usedIngredients || recipe.extendedIngredients, recipe.missedIngredients),
          recipeIndication: this.estimateCookingTime(recipe),
          difficulty: this.estimateDifficulty(recipe),
          category: this.determineCategoryFromCuisine(cuisineType) || this.determineCategoryFromTitle(recipe.title),
          relevanceScore: this.calculateQualityScore(recipe, searchContext),
          isSpoonacular: true,
          originalTitle: recipe.title,
          usedIngredientCount: recipe.usedIngredientCount || 0,
          missedIngredientCount: recipe.missedIngredientCount || 0,
          likes: recipe.aggregateLikes || recipe.likes || 0,
          searchLayer: recipe.searchLayer || 'unknown',
          priority: recipe.priority || 999
        };

        formattedRecipes.push(formatted);
        console.log(`📝 ${formatted.recipeTitle} (スコア: ${formatted.relevanceScore}, 層: ${formatted.searchLayer})`);

      } catch (formatError) {
        console.error(`フォーマット変換エラー (${recipe.id}):`, formatError.message);
      }
    }

    return formattedRecipes.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  }

  // 重複除去
  removeDuplicateRecipes(recipes) {
    const seen = new Set();
    return recipes.filter(recipe => {
      const key = recipe.id || recipe.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // 拡張された関連性スコア計算
  calculateEnhancedRelevanceScore(recipe, originalIngredient, cuisineType) {
    let score = 0;
    const title = (recipe.title || '').toLowerCase();
    const ingredients = this.extractIngredientText(recipe);
    
    // 食材一致 (30点)
    if (title.includes(originalIngredient.toLowerCase()) || 
        ingredients.includes(originalIngredient.toLowerCase())) {
      score += 30;
    }
    
    // ジャンル一致 (25点)
    if (recipe.cuisineRelevanceScore) {
      score += Math.min(recipe.cuisineRelevanceScore, 25);
    } else if (cuisineType && this.cuisineFilters[cuisineType]) {
      const cuisineData = this.cuisineFilters[cuisineType];
      let cuisineScore = 0;
      
      [...cuisineData.primary, ...cuisineData.secondary].forEach(keyword => {
        if (title.includes(keyword.toLowerCase())) {
          cuisineScore += 5;
        }
      });
      score += Math.min(cuisineScore, 25);
    }
    
    // 使用材料率 (20点)
    const usedCount = recipe.usedIngredientCount || 0;
    const totalCount = usedCount + (recipe.missedIngredientCount || 0);
    if (totalCount > 0) {
      score += (usedCount / totalCount) * 20;
    }
    
    // 人気度 (15点)
    const likes = recipe.aggregateLikes || recipe.likes || 0;
    score += Math.min(likes / 20, 15);
    
    // 完全性 (10点)
    let completeness = 0;
    if (recipe.image) completeness += 5;
    if (recipe.instructions || recipe.analyzedInstructions) completeness += 5;
    score += completeness;
    
    return Math.round(Math.max(0, Math.min(score, 100)));
  }

  // 食材テキスト抽出
  extractIngredientText(recipe) {
    const ingredientSources = [
      recipe.usedIngredients,
      recipe.missedIngredients,
      recipe.extendedIngredients
    ].filter(Boolean).flat();
    
    return ingredientSources
      .map(ing => ing.name || ing.original || ing)
      .join(' ')
      .toLowerCase();
  }

// Part 5: 翻訳とユーティリティ機能

  // 料理ジャンル判定
  determineCategoryFromCuisine(cuisineType) {
    const cuisineMap = {
      'korean': '韓国料理',
      'japanese': '和食',
      'chinese': '中華料理',  
      'thai': 'タイ料理',
      'indian': 'インド料理',
      'italian': 'イタリア料理',
      'american': 'アメリカ料理',
      'mexican': 'メキシコ料理',
      'french': 'フランス料理'
    };
    return cuisineMap[cuisineType?.toLowerCase()] || null;
  }

  // タイトルからカテゴリ判定
  determineCategoryFromTitle(title) {
    const titleLower = title.toLowerCase();
    
    // 料理ジャンル判定
    if (titleLower.includes('korean') || titleLower.includes('kimchi')) return '韓国料理';
    if (titleLower.includes('thai') || titleLower.includes('pad thai')) return 'タイ料理';
    if (titleLower.includes('indian') || titleLower.includes('curry')) return 'インド料理';
    if (titleLower.includes('chinese') || titleLower.includes('stir fry')) return '中華料理';
    if (titleLower.includes('italian') || titleLower.includes('pasta')) return 'イタリア料理';
    if (titleLower.includes('mexican') || titleLower.includes('taco')) return 'メキシコ料理';
    if (titleLower.includes('french') || titleLower.includes('roux')) return 'フランス料理';
    
    // 料理種類判定
    if (titleLower.includes('soup') || titleLower.includes('broth')) return 'スープ';
    if (titleLower.includes('salad') || titleLower.includes('slaw')) return 'サラダ';
    if (titleLower.includes('stir fry') || titleLower.includes('fried')) return '炒め物';
    if (titleLower.includes('grilled') || titleLower.includes('bbq')) return '焼き物';
    
    return 'その他';
  }

   // レシピタイトル翻訳（DeepL対応版）
async translateRecipeTitle(title) {
  // DeepL APIが利用可能で、十分な残量がある場合
  const limits = this.checkLimits();
  if (limits.canUseDeepL && title.length > 5) {
    try {
      return await this.translateWithDeepL(title);
    } catch (error) {
      console.log('DeepL翻訳失敗、簡易翻訳にフォールバック');
    }
  }

  // フォールバック: 既存の簡易翻訳
  const commonWords = {
    'stir fry': '炒め', 'stir-fry': '炒め', 'stir fried': '炒め',
    'fried': '揚げ', 'grilled': 'グリル', 'roasted': 'ロースト',
    'steamed': '蒸し', 'braised': '煮込み', 'sautéed': 'ソテー',
    'korean': '韓国風', 'chinese': '中華風', 'thai': 'タイ風',
    'japanese': '和風', 'italian': 'イタリア風',
    'chicken': '鶏肉', 'beef': '牛肉', 'pork': '豚肉',
    'cabbage': 'キャベツ', 'carrot': '人参', 'onion': '玉ねぎ',
    'quick': '簡単', 'easy': '手軽', 'healthy': 'ヘルシー',
    'soup': 'スープ', 'salad': 'サラダ', 'recipe': 'レシピ'
  };

  let translated = title;
  Object.entries(commonWords).forEach(([en, jp]) => {
    const regex = new RegExp(`\\b${en}\\b`, 'gi');
    translated = translated.replace(regex, jp);
  });

  return translated;
}
  // 食材リスト翻訳
  async translateIngredients(usedIngredients = [], missedIngredients = []) {
    const allIngredients = [...usedIngredients, ...missedIngredients];
    const translated = [];
    
    for (const ingredient of allIngredients.slice(0, 8)) {
      const ingredientText = ingredient.name || ingredient.original || ingredient;
      const translatedIngredient = await this.translateIngredient(ingredientText);
      translated.push(translatedIngredient);
    }
    
    return translated;
  }

  // 調理時間推定
  estimateCookingTime(recipe) {
    if (recipe.readyInMinutes) {
      return `約${recipe.readyInMinutes}分`;
    }
    
    // タイトルから推定
    const title = (recipe.title || '').toLowerCase();
    if (title.includes('quick') || title.includes('easy')) return '約15分';
    if (title.includes('slow') || title.includes('braised')) return '約60分';
    if (title.includes('soup') || title.includes('stew')) return '約30分';
    if (title.includes('salad') || title.includes('raw')) return '約10分';
    
    return '約25分';
  }

  // 難易度推定
  estimateDifficulty(recipe) {
    const totalIngredients = (recipe.usedIngredientCount || 0) + (recipe.missedIngredientCount || 0);
    const title = (recipe.title || '').toLowerCase();
    
    // タイトルから推定
    if (title.includes('easy') || title.includes('simple') || title.includes('quick')) {
      return '簡単';
    }
    if (title.includes('gourmet') || title.includes('complex') || title.includes('advanced')) {
      return '上級';
    }
    
    // 食材数から推定
    if (totalIngredients <= 5) return '簡単';
    if (totalIngredients <= 10) return '普通';
    return '上級';
  }

  // 現在の季節取得
  getCurrentSeason() {
    const month = new Date().getMonth() + 1;
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'autumn';
    return 'winter';
  }

  // 動的クエリ生成
  generateDynamicQueries(ingredient, cuisineType, userPreferences = {}) {
    const queries = [];
    
    // 基本クエリ
    queries.push({
      query: cuisineType && cuisineType !== 'all' ? `${ingredient} ${cuisineType}` : ingredient,
      priority: 1,
      type: 'basic'
    });
    
    // 時間ベース
    if (userPreferences.timeConstraint === 'quick') {
      queries.push({
        query: `quick ${ingredient}`,
        priority: 2,
        type: 'quick'
      });
      queries.push({
        query: `15 minute ${ingredient}`,
        priority: 3,
        type: 'fast'
      });
    }
    
    // 健康志向
    if (userPreferences.healthy) {
      queries.push({
        query: `healthy ${ingredient} recipe`,
        priority: 2,
        type: 'healthy'
      });
      queries.push({
        query: `low calorie ${ingredient}`,
        priority: 3,
        type: 'diet'
      });
    }
    
    // 季節性
    const season = this.getCurrentSeason();
    queries.push({
      query: `${season} ${ingredient}`,
      priority: 4,
      type: 'seasonal'
    });
    
    return queries.sort((a, b) => a.priority - b.priority);
  }

  // 既存メソッドとの互換性
  async improvedSearch(ingredient, maxResults = 6) {
    return await this.improvedSearchWithFiltering([{name: ingredient}], maxResults, null);
  }

// DeepL API翻訳メソッド（新規追加）
async translateWithDeepL(text, targetLang = 'JA') {
  if (!text || text.trim().length === 0) return text;
  
  // 短すぎるテキストは簡易翻訳で済ませる
  if (text.length < 10) {
    return await this.translateRecipeTitle(text);
  }

  try {
    const response = await axios.post('https://api-free.deepl.com/v2/translate', null, {
      params: {
        auth_key: this.deeplApiKey,
        text: text,
        target_lang: targetLang,
        source_lang: 'EN'
      },
      timeout: 10000
    });

    const translatedText = response.data.translations[0].text;
    
    // 使用量をカウント
    this.limits.deepl.current += text.length;
    console.log(`📝 DeepL翻訳: ${text.length}字 (残り: ${this.limits.deepl.monthly - this.limits.deepl.current}字)`);
    
    return translatedText;

  } catch (error) {
    console.error('DeepL翻訳エラー:', error.message);
    // フォールバック: 簡易翻訳を使用
    return await this.translateRecipeTitle(text);
  }
}

// HTMLタグを除去してからDeepL翻訳
async translateWithDeepLClean(text, targetLang = 'JA') {
  if (!text) return text;
  
  // HTMLタグ除去
  const cleanText = text.replace(/<[^>]*>/g, '').trim();
  
  if (cleanText.length === 0) return text;
  
  return await this.translateWithDeepL(cleanText, targetLang);
}

// レシピ詳細取得（DeepL翻訳対応版）
async getDetailedRecipe(recipeId) {
  try {
    const cleanRecipeId = String(recipeId).replace(/^spoon_/, '');
    if (!/^\d+$/.test(cleanRecipeId)) {
      throw new Error(`無効なレシピID: ${cleanRecipeId}`);
    }

    const limits = this.checkLimits();
    if (!limits.canUseSpoonacular) {
      throw new Error('Spoonacular API制限に達しています');
    }

    console.log(`📖 レシピ詳細取得: ID ${cleanRecipeId}`);

    const response = await axios.get(`${this.baseUrl}/${cleanRecipeId}/information`, {
      params: {
        apiKey: this.spoonacularApiKey,
        includeNutrition: false
      },
      timeout: 15000
    });

    this.limits.spoonacular.current++;
    const recipe = response.data;

    // 🆕 DeepL翻訳を積極活用
    console.log(`🌐 DeepL翻訳開始: レシピ "${recipe.title}"`);
    
    // 並行してDeepL翻訳を実行
    const translationPromises = [
      this.translateRecipeTitle(recipe.title),
      this.translateInstructionsWithDeepL(recipe.instructions),
      recipe.summary ? this.translateWithDeepLClean(recipe.summary) : Promise.resolve(null),
      this.translateIngredientsWithDeepL(recipe.extendedIngredients || [])
    ];

    const [translatedTitle, translatedInstructions, translatedSummary, translatedIngredients] = 
      await Promise.all(translationPromises);

    console.log(`✅ DeepL翻訳完了: "${translatedTitle}"`);

    return {
      recipeId: recipe.id,
      recipeTitle: translatedTitle,
      originalTitle: recipe.title,
      recipeUrl: recipe.sourceUrl || recipe.spoonacularSourceUrl,
      foodImageUrl: recipe.image,
      recipeMaterial: translatedIngredients,
      recipeIndication: this.estimateCookingTime(recipe),
      recipeDescription: translatedInstructions,
      difficulty: this.estimateDifficulty(recipe),
      category: this.determineCategoryFromTitle(recipe.title),
      servings: recipe.servings || 2,
      likes: recipe.aggregateLikes || 0,
      isSpoonacular: true,
      cuisines: recipe.cuisines || [],
      dishTypes: recipe.dishTypes || [],
      translatedSummary: translatedSummary
    };

  } catch (error) {
    console.error('レシピ詳細取得エラー:', error.message);
    throw error;
  }
}

// 食材リスト翻訳（DeepL対応版）
async translateIngredientsWithDeepL(ingredients = []) {
  if (!ingredients || ingredients.length === 0) return [];

  const translated = [];
  
  for (const ingredient of ingredients.slice(0, 10)) {
    const originalText = ingredient.original || ingredient.name || ingredient;
    
    // 基本的な食材は辞書翻訳
    const basicTranslation = await this.translateIngredient(originalText);
    
    // DeepLが利用可能で、複雑な表現の場合はDeepL翻訳
    const limits = this.checkLimits();
    if (limits.canUseDeepL && originalText.length > 15 && originalText.includes(' ')) {
      try {
        const deeplTranslation = await this.translateWithDeepL(originalText);
        translated.push(deeplTranslation);
      } catch (error) {
        translated.push(basicTranslation);
      }
    } else {
      translated.push(basicTranslation);
    }
  }
  
  return translated;
}

// 調理手順のDeepL翻訳
async translateInstructionsWithDeepL(instructions) {
  if (!instructions) return '調理手順の詳細情報がありません。';
  
  // HTMLタグ除去
  const cleanInstructions = instructions.replace(/<[^>]*>/g, '').trim();
  
  if (cleanInstructions.length === 0) return '調理手順の詳細情報がありません。';
  
  const limits = this.checkLimits();
  if (limits.canUseDeepL) {
    try {
      // 長すぎる場合は分割して翻訳
      if (cleanInstructions.length > 1000) {
        const sentences = cleanInstructions.split('. ').slice(0, 5); // 最初の5文
        const translatedSentences = [];
        
        for (const sentence of sentences) {
          if (sentence.trim().length > 0) {
            const translated = await this.translateWithDeepL(sentence + '.');
            translatedSentences.push(translated);
          }
        }
        
        return translatedSentences.join(' ') + '\n\n（詳細は元のレシピをご確認ください）';
      } else {
        const translated = await this.translateWithDeepL(cleanInstructions);
        return translated + '\n\n（詳細は元のレシピをご確認ください）';
      }
    } catch (error) {
      console.error('DeepL手順翻訳エラー:', error.message);
    }
  }
  
  // フォールバック: 簡易翻訳
  return this.translateInstructions(cleanInstructions);
}

// Part 6: 詳細レシピ取得とサポート機能

  // レシピ詳細取得
  async getDetailedRecipe(recipeId) {
    try {
      const cleanRecipeId = String(recipeId).replace(/^spoon_/, '');
      if (!/^\d+$/.test(cleanRecipeId)) {
        throw new Error(`無効なレシピID: ${cleanRecipeId}`);
      }

      const limits = this.checkLimits();
      if (!limits.canUseSpoonacular) {
        throw new Error('Spoonacular API制限に達しています');
      }

      console.log(`📖 レシピ詳細取得: ID ${cleanRecipeId}`);

      const response = await axios.get(`${this.baseUrl}/${cleanRecipeId}/information`, {
        params: {
          apiKey: this.spoonacularApiKey,
          includeNutrition: false
        },
        timeout: 15000
      });

      this.limits.spoonacular.current++;

      const recipe = response.data;
      const translatedInstructions = await this.translateInstructions(recipe.instructions);

      return {
        recipeId: recipe.id,
        recipeTitle: await this.translateRecipeTitle(recipe.title),
        originalTitle: recipe.title,
        recipeUrl: recipe.sourceUrl || recipe.spoonacularSourceUrl,
        foodImageUrl: recipe.image,
        recipeMaterial: await this.translateIngredients(recipe.extendedIngredients),
        recipeIndication: this.estimateCookingTime(recipe),
        recipeDescription: translatedInstructions,
        difficulty: this.estimateDifficulty(recipe),
        category: this.determineCategoryFromTitle(recipe.title),
        servings: recipe.servings || 2,
        likes: recipe.aggregateLikes || 0,
        isSpoonacular: true,
        cuisines: recipe.cuisines || [],
        dishTypes: recipe.dishTypes || [],
        translatedSummary: recipe.summary ? await this.translateSummary(recipe.summary) : null
      };

    } catch (error) {
      console.error('レシピ詳細取得エラー:', error.message);
      throw error;
    }
  }

  // 調理手順翻訳
  async translateInstructions(instructions) {
    if (!instructions) return '調理手順の詳細情報がありません。';
    
    // HTMLタグ除去
    const cleanInstructions = instructions.replace(/<[^>]*>/g, '');
    
    // 簡易翻訳（最初の200文字のみ）
    const shortInstructions = cleanInstructions.substring(0, 200);
    
    // 基本的な調理用語を翻訳
    const cookingTerms = {
      'heat': '加熱',
      'cook': '調理',
      'add': '加える',
      'mix': '混ぜる',
      'stir': 'かき混ぜる',
      'season': '味付け',
      'serve': '盛り付け',
      'minute': '分',
      'minutes': '分',
      'hour': '時間',
      'medium heat': '中火',
      'high heat': '強火',
      'low heat': '弱火',
      'oil': '油',
      'salt': '塩',
      'pepper': '胡椒'
    };

    let translated = shortInstructions;
    Object.entries(cookingTerms).forEach(([en, jp]) => {
      const regex = new RegExp(`\\b${en}\\b`, 'gi');
      translated = translated.replace(regex, jp);
    });

    return translated + '...（詳細は元のレシピをご確認ください）';
  }

  // サマリー翻訳
  async translateSummary(summary) {
    if (!summary) return null;
    
    // HTMLタグ除去
    const cleanSummary = summary.replace(/<[^>]*>/g, '');
    
    // 簡易翻訳（最初の150文字のみ）
    const shortSummary = cleanSummary.substring(0, 150);
    
    // 基本的な用語を翻訳
    const basicTerms = {
      'recipe': 'レシピ',
      'delicious': '美味しい',
      'easy': '簡単',
      'quick': '手軽',
      'healthy': 'ヘルシー',
      'perfect': '完璧',
      'great': '素晴らしい'
    };

    let translated = shortSummary;
    Object.entries(basicTerms).forEach(([en, jp]) => {
      const regex = new RegExp(`\\b${en}\\b`, 'gi');
      translated = translated.replace(regex, jp);
    });

    return translated + '...';
  }

// SpoonacularFreeTierService.js に全文翻訳メソッドを追加

// 🆕 レシピの全文翻訳取得
async getFullRecipeTranslation(recipeId) {
  try {
    const cleanRecipeId = String(recipeId).replace(/^spoon_/, '');
    if (!/^\d+$/.test(cleanRecipeId)) {
      throw new Error(`無効なレシピID: ${cleanRecipeId}`);
    }

    console.log(`📖 全文翻訳用レシピ取得: ID ${cleanRecipeId}`);

    // Spoonacular APIから詳細情報を取得
    const response = await axios.get(`${this.baseUrl}/${cleanRecipeId}/information`, {
      params: {
        apiKey: this.spoonacularApiKey,
        includeNutrition: false
      },
      timeout: 15000
    });

    this.limits.spoonacular.current++;
    const recipe = response.data;

    console.log(`🌐 DeepL全文翻訳開始: "${recipe.title}"`);

    // 🔧 改良1: タイトル翻訳
    const translatedTitle = await this.translateWithDeepL(recipe.title);

    // 🔧 改良2: 概要翻訳（より詳細に）
    let translatedSummary = null;
    if (recipe.summary) {
      const cleanSummary = recipe.summary.replace(/<[^>]*>/g, '').trim();
      if (cleanSummary.length > 0) {
        translatedSummary = await this.translateWithDeepL(cleanSummary);
      }
    }

    // 🔧 改良3: 材料リスト翻訳（フォーマット改善）
    let formattedIngredients = null;
    if (recipe.extendedIngredients && recipe.extendedIngredients.length > 0) {
      const ingredientList = recipe.extendedIngredients.map((ing, index) => {
        // より詳細な量の表記
        let amount = '';
        if (ing.amount && ing.amount > 0) {
          // 小数点以下の処理
          const amountStr = ing.amount % 1 === 0 ? ing.amount.toString() : ing.amount.toFixed(2);
          amount = `${amountStr}${ing.unit ? ' ' + ing.unit : ''}`;
        }
        
        // 材料名の取得（originalを優先、なければname）
        const name = ing.original || ing.name || 'unknown ingredient';
        
        // 追加情報があれば含める
        let additionalInfo = '';
        if (ing.aisle) {
          additionalInfo = ` (${ing.aisle}コーナー)`;
        }
        
        return `**${index + 1}.** ${amount ? amount + ' ' : ''}${name}${additionalInfo}`;
      }).join('\n');
      
      console.log(`📝 材料リスト翻訳中: ${ingredientList.length}文字`);
      formattedIngredients = await this.translateWithDeepL(ingredientList);
    }

    // 🔧 改良4: 調理手順翻訳（構造化改善）
    let formattedInstructions = null;
    
    if (recipe.instructions) {
      // HTML形式の手順を処理
      const cleanInstructions = recipe.instructions.replace(/<[^>]*>/g, '').trim();
      
      // 手順を分離して番号付けする
      let steps = [];
      
      // 既に番号付きの場合は分割
      if (/^\d+\./.test(cleanInstructions)) {
        steps = cleanInstructions.split(/(?=\d+\.)/).filter(step => step.trim());
      } else {
        // 文章を句点で分割して手順化
        const sentences = cleanInstructions.split(/[.。]/).filter(s => s.trim().length > 10);
        steps = sentences;
      }
      
      // 番号付きの手順に整形
      const numberedSteps = steps.map((step, index) => {
        const cleanStep = step.replace(/^\d+\.\s*/, '').trim();
        return `**手順${index + 1}:** ${cleanStep}`;
      }).join('\n\n');
      
      console.log(`📝 調理手順翻訳中: ${numberedSteps.length}文字, ${steps.length}ステップ`);
      formattedInstructions = await this.translateWithDeepL(numberedSteps);
      
    } else if (recipe.analyzedInstructions && recipe.analyzedInstructions.length > 0) {
      // 構造化された手順を処理
      const allSteps = recipe.analyzedInstructions.flatMap(instruction => instruction.steps || []);
      
      const numberedSteps = allSteps.map((step, index) => {
        let stepText = `**手順${index + 1}:** ${step.step}`;
        
        // 材料情報があれば追加
        if (step.ingredients && step.ingredients.length > 0) {
          const ingredientNames = step.ingredients.map(ing => ing.name).join(', ');
          stepText += `\n*使用する材料: ${ingredientNames}*`;
        }
        
        // 器具情報があれば追加
        if (step.equipment && step.equipment.length > 0) {
          const equipmentNames = step.equipment.map(eq => eq.name).join(', ');
          stepText += `\n*必要な器具: ${equipmentNames}*`;
        }
        
        // 時間情報があれば追加
        if (step.length && step.length.number) {
          stepText += `\n*所要時間: ${step.length.number} ${step.length.unit || '分'}*`;
        }
        
        return stepText;
      }).join('\n\n');
      
      console.log(`📝 構造化手順翻訳中: ${numberedSteps.length}文字, ${allSteps.length}ステップ`);
      formattedInstructions = await this.translateWithDeepL(numberedSteps);
    }

    // 🔧 改良5: 追加情報の取得と翻訳
    let additionalInfo = {};
    
    // 料理のコツやヒント
    if (recipe.tips && recipe.tips.length > 0) {
      const tips = recipe.tips.join('\n');
      additionalInfo.tips = await this.translateWithDeepL(tips);
    }
    
    // ワインペアリング情報
    if (recipe.winePairing && recipe.winePairing.pairingText) {
      additionalInfo.winePairing = await this.translateWithDeepL(recipe.winePairing.pairingText);
    }

    console.log(`✅ DeepL全文翻訳完了: "${translatedTitle}"`);

    return {
      recipeId: recipe.id,
      recipeTitle: translatedTitle,
      originalTitle: recipe.title,
      image: recipe.image,
      translatedSummary: translatedSummary,
      detailedIngredients: formattedIngredients,
      fullInstructions: formattedInstructions,
      cookingTime: this.estimateCookingTime(recipe),
      servings: recipe.servings,
      difficulty: this.estimateDifficulty(recipe),
      sourceUrl: recipe.sourceUrl,
      // 🆕 追加情報
      additionalInfo: additionalInfo,
      // 🆕 メタデータ
      metadata: {
        totalSteps: formattedInstructions ? formattedInstructions.split('**手順').length - 1 : 0,
        totalIngredients: recipe.extendedIngredients ? recipe.extendedIngredients.length : 0,
        originalLanguage: 'English',
        translationSource: 'DeepL',
        cuisineTypes: recipe.cuisines || [],
        dishTypes: recipe.dishTypes || [],
        readyInMinutes: recipe.readyInMinutes || null,
        healthScore: recipe.healthScore || null
      }
    };

  } catch (error) {
    console.error('全文翻訳取得エラー:', error.message);
    throw error;
  }
}

  // 使用状況レポート（DeepL詳細表示対応）
getUsageReport() {
  const limits = this.checkLimits();
  return {
    spoonacular: {
      used: this.limits.spoonacular.current,
      remaining: limits.spoonacularRemaining,
      total: this.limits.spoonacular.daily,
      percentage: Math.round((this.limits.spoonacular.current / this.limits.spoonacular.daily) * 100)
    },
    deepl: {
      used: this.limits.deepl.current,
      remaining: limits.deeplRemaining,
      total: this.limits.deepl.monthly,
      percentage: Math.round((this.limits.deepl.current / this.limits.deepl.monthly) * 100),
      estimatedRecipesRemaining: Math.floor(limits.deeplRemaining / 700) // 1レシピ約700字として計算
    },
    timestamp: new Date().toISOString()
  };
}

  // 制限リセット
  resetDailyLimits() {
    this.limits.spoonacular.current = 0;
    console.log('🔄 Spoonacular日次制限をリセット');
  }

// 緊急使用量チェック
checkCurrentUsage() {
  console.log(`📊 === Spoonacular使用量チェック ===`);
  console.log(`📊 現在の使用量: ${this.limits.spoonacular.current}/${this.limits.spoonacular.daily}回`);
  console.log(`📊 残り回数: ${this.limits.spoonacular.daily - this.limits.spoonacular.current}回`);
  
  const limits = this.checkLimits();
  if (!limits.canUseSpoonacular) {
    console.log(`⚠️ 日次制限に達しています`);
    return false;
  }
  return true;
}

// 緊急リセット
emergencyReset() {
  console.log(`🚨 緊急リセット実行`);
  this.limits.spoonacular.current = 0;
  console.log(`✅ 使用量をリセットしました`);
}

  resetMonthlyLimits() {
    this.limits.deepl.current = 0;
    console.log('🔄 DeepL月次制限をリセット');
  }

  // キャッシュクリア
  clearCache() {
    this.cache.clear();
    console.log('🗑️ キャッシュをクリアしました');
  }

  // 検索統計取得
  getSearchStats() {
    return {
      totalSearches: this.limits.spoonacular.current,
      cacheSize: this.cache.size,
      availableCuisines: Object.keys(this.cuisineFilters),
      supportedIngredients: Object.keys(this.ingredientDict).length,
      filterPatterns: {
        excludePatterns: this.excludePatterns.length,
        priorityPatterns: this.priorityPatterns.length
      }
    };
  }

  // フィルタリング機能のテスト
  async testFiltering() {
    console.log('🧪 フィルタリング機能テスト開始');
    
    const testIngredients = [
      { name: 'キャベツ', currentAmount: 200, unit: 'g', daysLeft: 1 },
      { name: '夕食のあまり', currentAmount: 1, unit: 'パック', daysLeft: 5 },
      { name: '玉ねぎ', currentAmount: 3, unit: '個', daysLeft: 10 },
      { name: 'あまり物', currentAmount: 1, unit: '袋', daysLeft: 3 }
    ];

    const filterOptions = {
      excludeList: ['夕食のあまり', 'あまり物'],
      priorityList: ['キャベツ'],
      maxIngredients: 2,
      daysLeftThreshold: 3
    };

    const filtered = this.filterAndPrioritizeIngredients(testIngredients, filterOptions);
    
    console.log('✅ フィルタリング結果:');
    filtered.forEach(ing => {
      console.log(`  - ${ing.name} (スコア: ${ing.priorityScore})`);
    });

    return filtered;
  }

  // バッチ検索（複数食材の同時検索）
  async batchSearch(ingredients, cuisineType = 'japanese', maxResultsPerIngredient = 2) {
    console.log(`🔍 バッチ検索開始: ${ingredients.length}種類の食材`);
    
    const allResults = [];
    const filteredIngredients = this.filterAndPrioritizeIngredients(ingredients, {
      maxIngredients: ingredients.length, // 全ての有効食材を使用
      daysLeftThreshold: 7
    });

    for (const ingredient of filteredIngredients.slice(0, 3)) { // 最大3食材まで
      try {
        const recipes = await this.improvedSearchWithFiltering(
          [ingredient], 
          maxResultsPerIngredient, 
          cuisineType
        );
        
        allResults.push(...recipes.map(recipe => ({
          ...recipe,
          primaryIngredient: ingredient.name
        })));

        // API制限を考慮した待機
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`バッチ検索エラー (${ingredient.name}):`, error.message);
      }
    }

    // 重複除去と品質順ソート
    const uniqueResults = this.removeDuplicateRecipes(allResults);
    return uniqueResults.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  }

  // 高度な検索オプション
  async advancedSearch(options = {}) {
    const {
      ingredients = [],
      cuisineType = 'japanese',
      cookingTime = null, // 'quick', 'medium', 'long'
      difficulty = null,  // 'easy', 'medium', 'hard'
      dietary = null,     // 'vegetarian', 'vegan', 'gluten-free'
      maxResults = 6,
      filterOptions = {}
    } = options;

    console.log(`🔍 高度な検索開始:`, options);

    // 検索クエリの構築
    let searchModifiers = [];
    
    if (cookingTime === 'quick') searchModifiers.push('quick');
    if (difficulty === 'easy') searchModifiers.push('easy');
    if (dietary) searchModifiers.push(dietary);

    const filteredIngredients = this.filterAndPrioritizeIngredients(ingredients, filterOptions);
    
    if (filteredIngredients.length === 0) {
      return this.generateInformedFallbackRecipes('基本食材', cuisineType);
    }

    const primaryIngredient = filteredIngredients[0].name;
    const englishIngredient = await this.translateIngredient(primaryIngredient);
    
    // 修飾語付きクエリの作成
    const enhancedQuery = [englishIngredient, ...searchModifiers, cuisineType].filter(Boolean).join(' ');
    
    try {
      const response = await axios.get(`${this.baseUrl}/complexSearch`, {
        params: {
          apiKey: this.spoonacularApiKey,
          query: enhancedQuery,
          cuisine: cuisineType !== 'all' ? cuisineType : undefined,
          diet: dietary || undefined,
          maxReadyTime: cookingTime === 'quick' ? 30 : undefined,
          number: maxResults,
          addRecipeInformation: true,
          sort: 'max-used-ingredients'
        },
        timeout: 15000
      });

      this.limits.spoonacular.current++;
      
      const results = response.data.results || [];
      return await this.formatToRakutenStyleWithInsights(
        results, 
        primaryIngredient, 
        englishIngredient, 
        cuisineType
      );

    } catch (error) {
      console.error('高度な検索エラー:', error.message);
      return this.generateInformedFallbackRecipes(primaryIngredient, cuisineType);
    }
  }
}

module.exports = SpoonacularFreeTierService;
