// 楽天レシピAPI修正版 - 正しいエンドポイント使用

class RakutenRecipeAPIFix {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://app.rakuten.co.jp/services/api/Recipe';
    this.categories = null; // カテゴリキャッシュ
  }

  // 1. カテゴリ一覧を取得
  async getCategories() {
    if (this.categories) {
      return this.categories; // キャッシュから返す
    }

    try {
      const axios = require('axios');
      
      console.log(`🔍 楽天カテゴリAPI呼び出し中...`);
      
      const response = await axios.get(`${this.baseUrl}/CategoryList/20170426`, {
        params: {
          applicationId: this.apiKey
        },
        timeout: 10000
      });

      console.log(`📋 楽天カテゴリAPIレスポンス:`, {
        status: response.status,
        hasData: !!response.data,
        hasResult: !!response.data?.result,
        resultType: typeof response.data?.result,
        resultIsArray: Array.isArray(response.data?.result)
      });

      if (response.data && response.data.result) {
        let allCategories = [];
        const result = response.data.result;
        
        // 楽天APIの構造: <large>, <medium>, <small> 階層
        if (result.large && Array.isArray(result.large)) {
          console.log(`📊 大カテゴリ: ${result.large.length}件`);
          allCategories.push(...result.large.map(cat => ({ ...cat, level: 'large' })));
        }
        
        if (result.medium && Array.isArray(result.medium)) {
          console.log(`📊 中カテゴリ: ${result.medium.length}件`);
          allCategories.push(...result.medium.map(cat => ({ ...cat, level: 'medium' })));
        }
        
        if (result.small && Array.isArray(result.small)) {
          console.log(`📊 小カテゴリ: ${result.small.length}件`);
          allCategories.push(...result.small.map(cat => ({ ...cat, level: 'small' })));
        }

        // フラット構造の場合（バックアップ処理）
        if (allCategories.length === 0 && Array.isArray(result)) {
          console.log(`📊 フラット構造: ${result.length}件`);
          allCategories = result;
        }

        // オブジェクト形式で直接カテゴリがある場合
        if (allCategories.length === 0 && typeof result === 'object') {
          const flattenCategories = Object.values(result).flat();
          if (Array.isArray(flattenCategories) && flattenCategories.length > 0) {
            allCategories = flattenCategories;
          }
        }
        
        if (allCategories.length === 0) {
          console.error(`❌ カテゴリ解析失敗:`, result);
          return this.getDefaultCategories();
        }
        
        this.categories = allCategories;
        console.log(`✅ 楽天レシピカテゴリ取得成功: ${this.categories.length}カテゴリ`);
        
        // カテゴリレベル別サンプル表示
        const largeCats = this.categories.filter(c => c.level === 'large').slice(0, 5);
        const mediumCats = this.categories.filter(c => c.level === 'medium').slice(0, 5);
        
        console.log(`📊 大カテゴリ例:`, largeCats.map(c => `${c.categoryId}:${c.categoryName}`));
        console.log(`📊 中カテゴリ例:`, mediumCats.map(c => `${c.categoryId}:${c.categoryName}`));
        
        return this.categories;
      } else {
        console.error(`❌ 楽天カテゴリAPIレスポンス異常:`, response.data);
        return this.getDefaultCategories();
      }
      
    } catch (error) {
      console.error('楽天カテゴリ取得エラー:', error.message);
      return this.getDefaultCategories();
    }
  }

  // デフォルトカテゴリ（API取得失敗時）- 確実に動作するカテゴリIDのみ
  getDefaultCategories() {
    console.log(`🔄 デフォルトカテゴリを使用`);
    
    return [
      { categoryId: '30', categoryName: '人気メニュー', level: 'large' },
      { categoryId: '31', categoryName: '定番の肉料理', level: 'large' },
      { categoryId: '32', categoryName: '定番の魚料理', level: 'large' },
      { categoryId: '14', categoryName: 'ご飯もの', level: 'large' },
      { categoryId: '15', categoryName: 'パスタ', level: 'large' },
      { categoryId: '18', categoryName: 'サラダ', level: 'large' },
      { categoryId: '17', categoryName: '汁物・スープ', level: 'large' },
      { categoryId: '23', categoryName: '鍋料理', level: 'large' }
    ];
  }

  // 2. 食材に適したカテゴリIDを特定
  async findRelevantCategories(ingredient) {
    const categories = await this.getCategories();
    
    if (!Array.isArray(categories) || categories.length === 0) {
      console.log(`⚠️ カテゴリ取得失敗、デフォルト使用`);
      return this.getDefaultCategoriesForIngredient(ingredient);
    }
    
    const relevantCategories = categories.filter(cat => {
      const categoryName = (cat.categoryName || cat.name || '').toLowerCase();
      const ingredientLower = ingredient.toLowerCase();
      
      // 直接一致
      if (categoryName.includes(ingredientLower)) {
        return true;
      }
      
      // 食材タイプ別マッピング（より保守的に）
      const ingredientTypeMapping = {
        'キャベツ': ['野菜', 'サラダ', '人気'],
        '人参': ['野菜', '人気'],
        'じゃがいも': ['野菜', '人気'],
        '玉ねぎ': ['野菜', '人気'],
        'にんにく': ['野菜', '人気'],
        '豚肉': ['肉', '人気'],
        '豚バラ肉': ['肉', '人気'],
        '牛肉': ['肉', '人気'],
        '鶏肉': ['肉', '人気']
      };
      
      const relatedTerms = ingredientTypeMapping[ingredient] || ['人気'];
      
      return relatedTerms.some(term => 
        categoryName.includes(term.toLowerCase())
      );
    });

    // 大カテゴリ（level: 'large'）を優先し、400エラーになりやすい詳細カテゴリを除外
    const safeCategories = relevantCategories.filter(cat => {
      const categoryId = parseInt(cat.categoryId || cat.id);
      
      // 安全なカテゴリIDの範囲（実績のあるもの）
      const safeIds = [14, 15, 16, 17, 18, 23, 30, 31, 32, 33];
      
      // 大カテゴリまたは安全IDリストに含まれるもの
      return cat.level === 'large' || safeIds.includes(categoryId) || categoryId <= 50;
    });

    console.log(`🎯 ${ingredient}の関連カテゴリ: ${relevantCategories.length}件 → 安全: ${safeCategories.length}件`);
    safeCategories.forEach(cat => {
      console.log(`  ${cat.categoryId || cat.id}: ${cat.categoryName || cat.name} (${cat.level || 'unknown'})`);
    });

    // 安全なカテゴリが見つからない場合はデフォルト使用
    if (safeCategories.length === 0) {
      return this.getDefaultCategoriesForIngredient(ingredient);
    }

    return safeCategories.slice(0, 3); // 最大3カテゴリに制限
  }

  // 食材別デフォルトカテゴリ（確実に動作するIDのみ）
  getDefaultCategoriesForIngredient(ingredient) {
    const defaults = {
      'キャベツ': [
        { categoryId: '18', categoryName: 'サラダ', level: 'large' },
        { categoryId: '30', categoryName: '人気メニュー', level: 'large' }
      ],
      '人参': [
        { categoryId: '30', categoryName: '人気メニュー', level: 'large' },
        { categoryId: '31', categoryName: '定番の肉料理', level: 'large' }
      ],
      'じゃがいも': [
        { categoryId: '30', categoryName: '人気メニュー', level: 'large' },
        { categoryId: '14', categoryName: 'ご飯もの', level: 'large' }
      ],
      '豚肉': [
        { categoryId: '31', categoryName: '定番の肉料理', level: 'large' },
        { categoryId: '30', categoryName: '人気メニュー', level: 'large' }
      ],
      '豚バラ肉': [
        { categoryId: '31', categoryName: '定番の肉料理', level: 'large' },
        { categoryId: '30', categoryName: '人気メニュー', level: 'large' }
      ]
    };

    const result = defaults[ingredient] || [
      { categoryId: '30', categoryName: '人気メニュー', level: 'large' },
      { categoryId: '31', categoryName: '定番の肉料理', level: 'large' }
    ];

    console.log(`🔄 ${ingredient}のデフォルトカテゴリ: ${result.length}件`);
    return result;
  }

  // 3. カテゴリ別ランキングから適切なレシピを取得
  async searchByCategory(ingredient, maxResults = 10) {
    try {
      const relevantCategories = await this.findRelevantCategories(ingredient);
      const allRecipes = [];

      console.log(`🔍 ${ingredient}のカテゴリ検索: ${relevantCategories.length}カテゴリ`);

      // カテゴリを信頼性順にソート（大きな数字のカテゴリは詳細すぎて使えない場合がある）
      const sortedCategories = relevantCategories.sort((a, b) => {
        const aId = parseInt(a.categoryId || a.id);
        const bId = parseInt(b.categoryId || b.id);
        
        // 小さなID（メインカテゴリ）を優先、大きなID（詳細カテゴリ）は後回し
        if (aId <= 50 && bId > 50) return -1;
        if (aId > 50 && bId <= 50) return 1;
        
        return aId - bId;
      });

      console.log(`📊 カテゴリ優先順位:`);
      sortedCategories.slice(0, 5).forEach(cat => {
        console.log(`  ${cat.categoryId || cat.id}: ${cat.categoryName || cat.name}`);
      });

      // 各カテゴリから少しずつレシピを取得（エラー耐性強化）
      let successCount = 0;
      for (const category of sortedCategories.slice(0, 5)) { // 最大5カテゴリ試行
        try {
          const categoryId = category.categoryId || category.id;
          const categoryName = category.categoryName || category.name;
          
          // 大きすぎるカテゴリID（1000以上）はスキップ
          if (parseInt(categoryId) > 1000) {
            console.log(`⏭️ 詳細カテゴリ ${categoryId} はスキップ`);
            continue;
          }
          
          console.log(`🔍 カテゴリ別検索: ${categoryName} (ID: ${categoryId})`);
          
          const categoryRecipes = await this.getCategoryRanking(categoryId, Math.ceil(maxResults / 2));
          
          if (categoryRecipes.length > 0) {
            console.log(`  ✅ カテゴリ ${categoryId} から ${categoryRecipes.length}件取得`);
            
            // 食材関連性でフィルタリング
            const relevantRecipes = categoryRecipes.filter(recipe => {
              const isRelevant = this.isRecipeRelevant(recipe, ingredient);
              if (isRelevant) {
                console.log(`    ✅ 関連レシピ: ${recipe.recipeTitle}`);
              }
              return isRelevant;
            });
            
            console.log(`    関連レシピ: ${relevantRecipes.length}件`);
            allRecipes.push(...relevantRecipes);
            successCount++;
            
            // 十分なレシピが集まったら終了
            if (allRecipes.length >= maxResults) {
              console.log(`🎯 十分なレシピ数に到達、検索終了`);
              break;
            }
          } else {
            console.log(`  ⚠️ カテゴリ ${categoryId} からレシピ取得なし`);
          }
          
          // API制限対策
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (catError) {
          console.error(`❌ カテゴリ ${category.categoryId || category.id} 検索エラー: ${catError.message}`);
          
          // 400エラーの場合は該当カテゴリを今後スキップするためのログ
          if (catError.response && catError.response.status === 400) {
            console.log(`🚫 カテゴリ ${category.categoryId || category.id} は無効、スキップ推奨`);
          }
          
          continue; // エラーが出ても他のカテゴリを試行
        }
      }

      console.log(`📊 検索結果: ${successCount}カテゴリ成功, ${allRecipes.length}件取得`);

      // 重複除去
      const uniqueRecipes = [];
      const seenIds = new Set();
      
      for (const recipe of allRecipes) {
        const recipeKey = recipe.recipeId || recipe.recipeTitle;
        if (!seenIds.has(recipeKey)) {
          seenIds.add(recipeKey);
          uniqueRecipes.push(recipe);
        }
      }

      console.log(`✅ ${ingredient}のカテゴリ別検索最終結果: ${uniqueRecipes.length}件`);
      uniqueRecipes.forEach(recipe => {
        console.log(`  - ${recipe.recipeTitle}`);
      });
      
      return uniqueRecipes.slice(0, maxResults);
      
    } catch (error) {
      console.error(`カテゴリ別検索エラー (${ingredient}):`, error.message);
      return [];
    }
  }

  // 4. カテゴリランキング取得
  async getCategoryRanking(categoryId, hits = 10) {
    try {
      const axios = require('axios');
      
      const response = await axios.get(`${this.baseUrl}/CategoryRanking/20170426`, {
        params: {
          applicationId: this.apiKey,
          categoryId: categoryId,
          hits: Math.min(hits, 20)
        },
        timeout: 15000
      });

      if (response.data && response.data.result && Array.isArray(response.data.result)) {
        return response.data.result.map((recipe, index) => ({
          recipeId: recipe.recipeId || `generated_${Date.now()}_${index}`,
          recipeTitle: recipe.recipeTitle || 'タイトル不明',
          recipeUrl: recipe.recipeUrl || `https://recipe.rakuten.co.jp/recipe/${recipe.recipeId}/`,
          foodImageUrl: recipe.foodImageUrl || null,
          recipeMaterial: recipe.recipeMaterial || [],
          recipeIndication: recipe.recipeIndication || '調理時間不明',
          recipeCost: recipe.recipeCost || '指定なし',
          rank: parseInt(recipe.rank) || 0,
          categoryId: categoryId,
          userRecipe: false
        }));
      }

      return [];
    } catch (error) {
      console.error(`カテゴリランキング取得エラー (${categoryId}):`, error.message);
      return [];
    }
  }

  // 5. レシピの関連性判定（緩和版）
  isRecipeRelevant(recipe, ingredient) {
    const title = recipe.recipeTitle.toLowerCase();
    const materials = Array.isArray(recipe.recipeMaterial) ? 
      recipe.recipeMaterial.join(' ').toLowerCase() : 
      String(recipe.recipeMaterial || '').toLowerCase();
    
    const ingredientLower = ingredient.toLowerCase();
    
    // 1. 直接一致（最高優先度）
    if (title.includes(ingredientLower) || materials.includes(ingredientLower)) {
      console.log(`    🎯 直接一致: ${recipe.recipeTitle}`);
      return true;
    }
    
    // 2. 関連語チェック
    const relatedWords = {
      'キャベツ': ['きゃべつ', 'cabbage', 'キヤベツ', 'ロールキャベツ'],
      '人参': ['にんじん', 'ニンジン', 'carrot', '人参', 'ニンジン'],
      '玉ねぎ': ['たまねぎ', 'タマネギ', 'onion', '玉葱', 'オニオン'],
      'じゃがいも': ['ジャガイモ', 'potato', 'ポテト', 'じゃが芋', 'ジャガ芋'],
      'にんにく': ['ニンニク', 'garlic', 'ガーリック'],
      '豚肉': ['豚', 'ぶた肉', 'ポーク', 'pork', '豚バラ', '豚こま'],
      '豚バラ肉': ['豚バラ', '豚ばら肉', 'バラ肉', '豚肉']
    };
    
    const related = relatedWords[ingredient] || [];
    
    for (const word of related) {
      if (title.includes(word.toLowerCase()) || materials.includes(word.toLowerCase())) {
        console.log(`    🔗 関連語一致 (${word}): ${recipe.recipeTitle}`);
        return true;
      }
    }
    
    // 3. キャベツの場合は特別ルール（「野菜炒め」「サラダ」なども通す）
    if (ingredient === 'キャベツ') {
      const cabbageFriendlyTerms = ['野菜炒め', '炒め物', 'サラダ', '野菜', 'ミックス'];
      
      for (const term of cabbageFriendlyTerms) {
        if (title.includes(term) || materials.includes(term)) {
          console.log(`    🥬 キャベツ特別ルール (${term}): ${recipe.recipeTitle}`);
          return true;
        }
      }
    }
    
    // 4. 豚肉の場合も特別ルール
    if (ingredient.includes('豚')) {
      const porkFriendlyTerms = ['肉炒め', '炒め物', '焼肉', 'ステーキ'];
      
      for (const term of porkFriendlyTerms) {
        if (title.includes(term) || materials.includes(term)) {
          console.log(`    🐷 豚肉特別ルール (${term}): ${recipe.recipeTitle}`);
          return true;
        }
      }
    }
    
    return false;
  }

  // 6. 改良版検索メソッド（統合版で使用）
  async improvedSearch(ingredient, maxResults = 6) {
    console.log(`🔥 楽天API改良版検索開始: ${ingredient}`);
    
    try {
      // カテゴリ別検索を実行
      const recipes = await this.searchByCategory(ingredient, maxResults);
      
      if (recipes.length > 0) {
        console.log(`✅ 改良版検索成功: ${recipes.length}件`);
        recipes.forEach(recipe => {
          console.log(`  - ${recipe.recipeTitle} (カテゴリ${recipe.categoryId})`);
        });
        return recipes;
      } else {
        console.log(`⚠️ カテゴリ別検索で結果なし、フォールバック実行`);
        return this.getFallbackRecipes(ingredient);
      }
      
    } catch (error) {
      console.error('改良版検索エラー:', error.message);
      return this.getFallbackRecipes(ingredient);
    }
  }

  // フォールバックレシピ
  getFallbackRecipes(ingredient) {
    const fallbackPatterns = {
      'キャベツ': [
        { title: 'キャベツの簡単炒め', materials: ['キャベツ', '塩', 'こしょう'] },
        { title: 'キャベツサラダ', materials: ['キャベツ', 'マヨネーズ'] }
      ],
      '人参': [
        { title: '人参のきんぴら', materials: ['人参', '醤油', 'みりん'] },
        { title: '人参グラッセ', materials: ['人参', 'バター', '砂糖'] }
      ]
    };
    
    const patterns = fallbackPatterns[ingredient] || [
      { title: `${ingredient}の簡単料理`, materials: [ingredient, '塩', 'こしょう'] }
    ];
    
    return patterns.map((pattern, index) => ({
      recipeId: `fallback_${ingredient}_${index}`,
      recipeTitle: pattern.title,
      recipeUrl: 'https://recipe.rakuten.co.jp/',
      recipeMaterial: pattern.materials,
      recipeIndication: '約15分',
      userRecipe: false,
      fallback: true
    }));
  }
}

module.exports = RakutenRecipeAPIFix;
