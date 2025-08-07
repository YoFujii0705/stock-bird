// ==================================================
// 1. src/services/SpoonacularFreeTierService.js (新規作成)
// ==================================================

const axios = require('axios');

class SpoonacularFreeTierService {
  constructor(spoonacularApiKey, deeplApiKey) {
    this.spoonacularApiKey = spoonacularApiKey;
    this.deeplApiKey = deeplApiKey;
    this.baseUrl = 'https://api.spoonacular.com/recipes';
    this.cache = new Map();
    
    // 🎯 無料枠管理
    this.limits = {
      spoonacular: {
        daily: 150,
        current: 0
      },
      deepl: {
        monthly: 500000, // 50万文字/月
        current: 0
      }
    };

    // 💡 包括的な日本語→英語食材辞書
    this.ingredientDict = {
      // 野菜類
      'キャベツ': 'cabbage', 'きゃべつ': 'cabbage',
      '人参': 'carrot', 'にんじん': 'carrot', 'ニンジン': 'carrot',
      '玉ねぎ': 'onion', 'たまねぎ': 'onion', 'タマネギ': 'onion', '玉葱': 'onion',
      'じゃがいも': 'potato', 'ジャガイモ': 'potato', 'じゃが芋': 'potato',
      'トマト': 'tomato', 'とまと': 'tomato',
      'きゅうり': 'cucumber', 'キュウリ': 'cucumber',
      'レタス': 'lettuce', 'もやし': 'bean sprouts',
      'ナス': 'eggplant', 'なす': 'eggplant', '茄子': 'eggplant',
      'ピーマン': 'bell pepper', 'パプリカ': 'paprika',
      'ブロッコリー': 'broccoli', '白菜': 'napa cabbage', 'はくさい': 'napa cabbage',
      '大根': 'daikon radish', 'だいこん': 'daikon radish',
      '長ネギ': 'green onion', 'ながねぎ': 'green onion', 'ねぎ': 'green onion',
      'ニンニク': 'garlic', 'にんにく': 'garlic',
      '生姜': 'ginger', 'しょうが': 'ginger', 'ショウガ': 'ginger',
      'ほうれん草': 'spinach', 'ホウレンソウ': 'spinach',
      '小松菜': 'komatsuna', 'アスパラガス': 'asparagus',
      'とうもろこし': 'corn', 'コーン': 'corn',

      // 肉類
      '豚肉': 'pork', 'ぶた肉': 'pork',
      '豚バラ肉': 'pork belly', '豚バラ': 'pork belly', '豚こま': 'pork',
      '豚ロース': 'pork loin', '豚もも': 'pork leg',
      '牛肉': 'beef', 'うし肉': 'beef',
      '牛バラ': 'beef belly', '牛もも': 'beef leg', '牛ロース': 'beef loin',
      '鶏肉': 'chicken', 'とり肉': 'chicken',
      '鶏もも肉': 'chicken thigh', '鶏むね肉': 'chicken breast', '鶏ささみ': 'chicken breast',
      'ひき肉': 'ground meat', 'ミンチ': 'ground meat',
      '豚ひき肉': 'ground pork', '牛ひき肉': 'ground beef', '鶏ひき肉': 'ground chicken',
      'ハム': 'ham', 'ベーコン': 'bacon', 'ソーセージ': 'sausage',

      // 魚介類
      '魚': 'fish', 'さけ': 'salmon', '鮭': 'salmon', 'サーモン': 'salmon',
      'まぐろ': 'tuna', 'マグロ': 'tuna', 'ツナ': 'tuna',
      'さば': 'mackerel', '鯖': 'mackerel',
      'いわし': 'sardine', '鰯': 'sardine',
      'あじ': 'horse mackerel', '鯵': 'horse mackerel',
      'えび': 'shrimp', 'エビ': 'shrimp', '海老': 'shrimp',
      'かに': 'crab', 'カニ': 'crab', '蟹': 'crab',
      'いか': 'squid', 'イカ': 'squid',
      'たこ': 'octopus', 'タコ': 'octopus', '蛸': 'octopus',

      // 乳製品・卵
      '卵': 'egg', 'たまご': 'egg', '玉子': 'egg',
      '牛乳': 'milk', 'ぎゅうにゅう': 'milk', 'ミルク': 'milk',
      'チーズ': 'cheese', 'バター': 'butter', 'ヨーグルト': 'yogurt',
      '生クリーム': 'heavy cream', 'クリーム': 'cream',

      // 主食
      '米': 'rice', 'こめ': 'rice', 'ごはん': 'rice', 'ご飯': 'rice',
      'パン': 'bread', 'パスタ': 'pasta',
      'うどん': 'udon noodles', 'そば': 'soba noodles',
      'ラーメン': 'ramen noodles', '中華麺': 'chinese noodles',

      // 調味料
      '塩': 'salt', 'しお': 'salt',
      '砂糖': 'sugar', 'さとう': 'sugar',
      '醤油': 'soy sauce', 'しょうゆ': 'soy sauce',
      '味噌': 'miso', 'みそ': 'miso',
      'みりん': 'mirin', '酢': 'vinegar', 'す': 'vinegar', 'お酢': 'vinegar',
      '酒': 'sake', 'さけ': 'sake', '日本酒': 'sake',
      'サラダ油': 'vegetable oil', 'ごま油': 'sesame oil', 'オリーブオイル': 'olive oil',
      'マヨネーズ': 'mayonnaise', 'ケチャップ': 'ketchup', 'ソース': 'sauce',
      'マスタード': 'mustard', '胡椒': 'pepper', 'こしょう': 'pepper', 'コショウ': 'pepper',
      '唐辛子': 'chili pepper', 'とうがらし': 'chili pepper',

      // その他
      '豆腐': 'tofu', 'とうふ': 'tofu',
      '納豆': 'natto', 'なっとう': 'natto',
      'わかめ': 'wakame seaweed', 'ワカメ': 'wakame seaweed',
      'のり': 'nori seaweed', 'ノリ': 'nori seaweed', '海苔': 'nori seaweed',
      'こんにゃく': 'konjac', 'コンニャク': 'konjac', '蒟蒻': 'konjac'
    };

    console.log(`📚 食材辞書初期化完了: ${Object.keys(this.ingredientDict).length}語登録`);
  }

  // 使用量チェック
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

  // 食材翻訳（辞書優先）
  async translateIngredient(ingredient) {
    try {
      // 辞書チェック（最優先）
      const normalized = ingredient.trim().toLowerCase();
      if (this.ingredientDict[ingredient] || this.ingredientDict[normalized]) {
        const translation = this.ingredientDict[ingredient] || this.ingredientDict[normalized];
        console.log(`📖 辞書翻訳: ${ingredient} → ${translation}`);
        return translation;
      }

      // キャッシュチェック
      const cacheKey = `ingredient_${ingredient}`;
      if (this.cache.has(cacheKey)) {
        console.log(`💾 キャッシュ翻訳: ${ingredient} → ${this.cache.get(cacheKey)}`);
        return this.cache.get(cacheKey);
      }

      // DeepL API使用
      const limits = this.checkLimits();
      if (!limits.canUseDeepL) {
        console.log(`⚠️ DeepL制限到達、フォールバック: ${ingredient}`);
        return ingredient;
      }

      console.log(`🌐 DeepL API翻訳: ${ingredient}`);
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
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000
        }
      );

      const translation = response.data.translations[0].text.trim();
      console.log(`🌐 DeepL: "${text}" → "${translation}"`);
      return translation;

    } catch (error) {
      throw new Error(`DeepL翻訳エラー: ${error.message}`);
    }
  }

  // メイン検索機能
  async improvedSearch(ingredient, maxResults = 6) {
    try {
      console.log(`🚀 Spoonacular検索開始: "${ingredient}"`);
      
      // 使用量チェック
      const limits = this.checkLimits();
      if (!limits.canUseSpoonacular) {
        console.log('❌ Spoonacular日次制限に達しました');
        return this.generateFallbackRecipes(ingredient);
      }

      // 食材を英語に翻訳
      const englishIngredient = await this.translateIngredient(ingredient);
      console.log(`🔍 英語検索語: "${englishIngredient}"`);

      // Spoonacular APIで検索
      const searchResponse = await axios.get(`${this.baseUrl}/findByIngredients`, {
        params: {
          apiKey: this.spoonacularApiKey,
          ingredients: englishIngredient,
          number: Math.min(maxResults * 2, 12),
          ranking: 2,
          ignorePantry: false
        },
        timeout: 15000
      });

      this.limits.spoonacular.current++;
      console.log(`✅ ${searchResponse.data.length}件のレシピを取得`);

      if (!searchResponse.data || searchResponse.data.length === 0) {
        console.log('⚠️ 検索結果なし、フォールバック使用');
        return this.generateFallbackRecipes(ingredient);
      }

      // 楽天API形式に変換
      const formattedRecipes = await this.formatToRakutenStyle(
        searchResponse.data.slice(0, maxResults),
        ingredient,
        englishIngredient
      );

      console.log(`✅ 最終結果: ${formattedRecipes.length}件`);
      return formattedRecipes;

    } catch (error) {
      console.error('Spoonacular検索エラー:', error.message);
      return this.generateFallbackRecipes(ingredient);
    }
  }

  // 楽天API互換形式に変換
  async formatToRakutenStyle(recipes, originalIngredient, englishIngredient) {
    const formattedRecipes = [];

    for (const recipe of recipes) {
      try {
        const formatted = {
          recipeId: `spoon_${recipe.id}`,
          recipeTitle: await this.translateRecipeTitle(recipe.title),
          recipeUrl: `https://spoonacular.com/recipes/${recipe.title.replace(/\s+/g, '-').toLowerCase()}-${recipe.id}`,
          foodImageUrl: recipe.image,
          recipeMaterial: await this.translateIngredients(recipe.usedIngredients, recipe.missedIngredients),
          recipeIndication: this.estimateCookingTime(recipe),
          difficulty: this.estimateDifficulty(recipe),
          category: 'アメリカ料理',
          relevanceScore: this.calculateRelevanceScore(recipe, originalIngredient),
          isSpoonacular: true,
          originalTitle: recipe.title,
          usedIngredientCount: recipe.usedIngredientCount,
          missedIngredientCount: recipe.missedIngredientCount,
          likes: recipe.likes || 0
        };

        formattedRecipes.push(formatted);
        console.log(`📝 変換完了: ${formatted.recipeTitle} (スコア: ${formatted.relevanceScore})`);

        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (formatError) {
        console.error(`フォーマット変換エラー (${recipe.id}):`, formatError.message);
      }
    }

    formattedRecipes.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    return formattedRecipes;
  }

  // レシピタイトル翻訳
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

  // 簡易タイトル翻訳
  simpleTranslateTitle(title) {
    const commonWords = {
      'chicken': '鶏肉', 'beef': '牛肉', 'pork': '豚肉', 'fish': '魚',
      'salmon': 'サーモン', 'rice': 'ライス', 'soup': 'スープ',
      'salad': 'サラダ', 'pasta': 'パスタ', 'pizza': 'ピザ',
      'sandwich': 'サンドイッチ', 'curry': 'カレー',
      'stir fry': '炒め物', 'grilled': 'グリル', 'baked': '焼き',
      'fried': '揚げ', 'roasted': 'ロースト',
      'easy': '簡単', 'quick': '時短', 'healthy': 'ヘルシー'
    };

    let translated = title;
    Object.entries(commonWords).forEach(([en, jp]) => {
      const regex = new RegExp(en, 'gi');
      translated = translated.replace(regex, jp);
    });

    return `${translated}（アメリカ料理）`;
  }

  // 材料リスト翻訳
  async translateIngredients(usedIngredients = [], missedIngredients = []) {
    const allIngredients = [...usedIngredients, ...missedIngredients];
    const translatedIngredients = [];

    for (const ingredient of allIngredients.slice(0, 8)) {
      try {
        const name = ingredient.name || ingredient;
        const translatedName = await this.translateIngredient(name);
        translatedIngredients.push(translatedName);
      } catch (error) {
        console.error(`材料翻訳エラー: ${error.message}`);
        translatedIngredients.push(ingredient.name || ingredient);
      }
    }

    return translatedIngredients;
  }

  // 調理時間推定
  estimateCookingTime(recipe) {
    if (recipe.readyInMinutes) {
      return `約${recipe.readyInMinutes}分`;
    }
    
    const totalIngredients = (recipe.usedIngredientCount || 0) + (recipe.missedIngredientCount || 0);
    if (totalIngredients <= 5) return '約15分';
    if (totalIngredients <= 8) return '約25分';
    return '約35分';
  }

  // 難易度推定
  estimateDifficulty(recipe) {
    const totalIngredients = (recipe.usedIngredientCount || 0) + (recipe.missedIngredientCount || 0);
    const missedCount = recipe.missedIngredientCount || 0;
    
    if (totalIngredients <= 5 && missedCount <= 2) return '簡単';
    if (totalIngredients <= 8 && missedCount <= 3) return '普通';
    return '上級';
  }

  // 関連性スコア計算
  calculateRelevanceScore(recipe, originalIngredient) {
    let score = 0;
    
    const usedCount = recipe.usedIngredientCount || 0;
    const totalCount = usedCount + (recipe.missedIngredientCount || 0);
    
    if (totalCount > 0) {
      score += (usedCount / totalCount) * 60;
    }
    
    if (recipe.likes) {
      score += Math.min(recipe.likes / 100, 20);
    }
    
    if (recipe.title.toLowerCase().includes(originalIngredient.toLowerCase())) {
      score += 20;
    }
    
    return Math.round(Math.min(score, 100));
  }

  // フォールバックレシピ生成
  generateFallbackRecipes(ingredient) {
    const fallbackRecipes = [
      {
        recipeId: `fallback_${ingredient}_1`,
        recipeTitle: `${ingredient}の簡単炒め`,
        recipeUrl: 'https://recipe.rakuten.co.jp/',
        recipeMaterial: [ingredient, '塩', 'こしょう', 'サラダ油'],
        recipeIndication: '10分',
        difficulty: '簡単',
        category: '炒め物',
        relevanceScore: 80,
        isSpoonacular: false,
        isFallback: true
      }
    ];

    console.log(`🔄 フォールバックレシピ生成: ${ingredient}`);
    return fallbackRecipes;
  }

  // 使用状況レポート
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

  // リセット機能
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
