// 関連性判定緩和版楽天レシピAPIサービス
class RelaxedRakutenRecipeAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://app.rakuten.co.jp/services/api/Recipe';
    this.cache = new Map();
    this.lastApiCall = 0;
    this.minInterval = 2000;
  }

  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall;
    
    if (timeSinceLastCall < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastCall;
      console.log(`⏳ レート制限対策: ${waitTime}ms待機中...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastApiCall = Date.now();
  }

  // 1. メイン検索（関連性判定を大幅緩和）
  async comprehensiveSearch(ingredient, options = {}) {
    const maxResults = options.maxResults || 6;
    console.log(`🔍 ${ingredient}の緩和版包括検索開始`);

    try {
      // 戦略1: 関連カテゴリから検索（緩和版）
      const categoryResults = await this.searchByRelevantCategoriesRelaxed(ingredient, maxResults);
      console.log(`📂 緩和版カテゴリ検索結果: ${categoryResults.length}件`);

      // 戦略2: 広範囲カテゴリ検索
      const broadResults = await this.broadCategorySearch(ingredient, 4);
      console.log(`🌐 広範囲検索結果: ${broadResults.length}件`);

      // 戦略3: 知識ベースレシピ（最後の手段）
      const knowledgeResults = this.generateKnowledgeBasedRecipes(ingredient);
      console.log(`📚 知識ベースレシピ: ${knowledgeResults.length}件`);

      // 結果統合（APIレシピを優先）
      const allRecipes = [
        ...categoryResults.map(r => ({ ...r, searchMethod: 'category_relaxed', priority: 90 })),
        ...broadResults.map(r => ({ ...r, searchMethod: 'broad', priority: 80 })),
        ...knowledgeResults.map(r => ({ ...r, searchMethod: 'knowledge', priority: 60 }))
      ];

      // 緩い重複除去とランキング
      const finalRecipes = this.relaxedRanking(allRecipes, ingredient);
      
      console.log(`✅ 緩和版最終結果: ${finalRecipes.length}件`);
      
      // APIレシピがあれば優先、なければ知識ベース
      const apiRecipes = finalRecipes.filter(r => !r.isKnowledgeBased);
      if (apiRecipes.length > 0) {
        console.log(`🎯 APIレシピ優先: ${apiRecipes.length}件`);
        return apiRecipes.slice(0, maxResults);
      } else {
        console.log(`📚 知識ベースレシピ使用: ${knowledgeResults.length}件`);
        return knowledgeResults.slice(0, maxResults);
      }

    } catch (error) {
      console.error('緩和版包括検索エラー:', error.message);
      return this.generateKnowledgeBasedRecipes(ingredient);
    }
  }

  // 2. 緩和版関連カテゴリ検索
  async searchByRelevantCategoriesRelaxed(ingredient, maxResults = 8) {
    try {
      const categories = this.getAllRelevantCategories(ingredient); // より多くのカテゴリ
      const allRecipes = [];

      console.log(`🎯 ${ingredient}の関連カテゴリ: ${categories.length}カテゴリ`);

      for (const category of categories.slice(0, 4)) { // より多くのカテゴリを試行
        try {
          await this.waitForRateLimit();
          
          console.log(`🔍 カテゴリ${category.id}(${category.name})から検索中...`);
          
          const categoryRecipes = await this.getCategoryRanking(category.id, 20); // より多く取得
          
          if (categoryRecipes.length > 0) {
            // 🆕 大幅に緩和された関連性チェック
            const relevantRecipes = categoryRecipes.filter(recipe => 
              this.isVeryLooselyRelevant(recipe, ingredient)
            );

            console.log(`  ✅ カテゴリ${category.id}: ${categoryRecipes.length}件→${relevantRecipes.length}件関連（緩和版）`);
            
            // デバッグ: 取得したレシピのタイトルを表示
            relevantRecipes.slice(0, 3).forEach(recipe => {
              console.log(`    📝 "${recipe.recipeTitle}"`);
            });
            
            allRecipes.push(...relevantRecipes);
          } else {
            console.log(`  ⚠️ カテゴリ${category.id}: レシピ取得なし`);
          }
          
        } catch (catError) {
          console.error(`❌ カテゴリ${category.id}検索エラー: ${catError.message}`);
        }
      }

      return allRecipes.slice(0, maxResults);
    } catch (error) {
      console.error('緩和版関連カテゴリ検索エラー:', error);
      return [];
    }
  }

  // 3. 広範囲カテゴリ検索
  async broadCategorySearch(ingredient, maxCategories = 4) {
    try {
      // より多くのカテゴリをチェック
      const broadCategories = [
        { id: '30', name: '人気メニュー' },
        { id: '31', name: '定番の肉料理' },
        { id: '32', name: '定番の魚料理' },
        { id: '18', name: 'サラダ' },
        { id: '17', name: '汁物・スープ' },
        { id: '14', name: 'ご飯もの' }
      ];

      const allRecipes = [];

      for (const category of broadCategories.slice(0, maxCategories)) {
        try {
          await this.waitForRateLimit();
          
          const categoryRecipes = await this.getCategoryRanking(category.id, 15);
          
          // 🆕 さらに緩い関連性チェック
          const relatedRecipes = categoryRecipes.filter(recipe => 
            this.isExtremelyLooselyRelevant(recipe, ingredient)
          );

          if (relatedRecipes.length > 0) {
            console.log(`🌐 広範囲カテゴリ${category.id}: ${relatedRecipes.length}件関連`);
            allRecipes.push(...relatedRecipes);
          }

        } catch (error) {
          console.error(`広範囲カテゴリ${category.id}エラー:`, error.message);
        }
      }

      return allRecipes;
    } catch (error) {
      console.error('広範囲カテゴリ検索エラー:', error);
      return [];
    }
  }

  // 4. 🆕 とても緩い関連性判定
  isVeryLooselyRelevant(recipe, ingredient) {
    const title = recipe.recipeTitle.toLowerCase();
    const materials = Array.isArray(recipe.recipeMaterial) ? 
      recipe.recipeMaterial.join(' ').toLowerCase() : 
      String(recipe.recipeMaterial || '').toLowerCase();
    
    const ingredientLower = ingredient.toLowerCase();

    // 1. 直接一致（最高優先度）
    if (title.includes(ingredientLower) || materials.includes(ingredientLower)) {
      console.log(`    🎯 直接一致: "${recipe.recipeTitle}"`);
      return true;
    }

    // 2. 同義語一致
    const synonyms = this.getAllSynonyms(ingredient); // より多くの同義語
    for (const synonym of synonyms) {
      if (title.includes(synonym.toLowerCase()) || materials.includes(synonym.toLowerCase())) {
        console.log(`    🔗 同義語一致 (${synonym}): "${recipe.recipeTitle}"`);
        return true;
      }
    }

    // 3. 🆕 部分文字一致（2文字以上）
    if (ingredientLower.length >= 2) {
      const partials = [
        ingredientLower.substring(0, 2),
        ingredientLower.substring(1),
        ingredientLower.slice(-2)
      ];
      
      for (const partial of partials) {
        if (partial.length >= 2 && (title.includes(partial) || materials.includes(partial))) {
          console.log(`    📝 部分一致 (${partial}): "${recipe.recipeTitle}"`);
          return true;
        }
      }
    }

    // 4. 🆕 カテゴリ関連語一致
    const categoryWords = this.getCategoryRelatedWords(ingredient);
    for (const word of categoryWords) {
      if (title.includes(word) || materials.includes(word)) {
        console.log(`    📂 カテゴリ関連語一致 (${word}): "${recipe.recipeTitle}"`);
        return true;
      }
    }

    return false;
  }

  // 5. 🆕 極めて緩い関連性判定（広範囲検索用）
  isExtremelyLooselyRelevant(recipe, ingredient) {
    const title = recipe.recipeTitle.toLowerCase();
    const materials = Array.isArray(recipe.recipeMaterial) ? 
      recipe.recipeMaterial.join(' ').toLowerCase() : 
      String(recipe.recipeMaterial || '').toLowerCase();
    
    const ingredientLower = ingredient.toLowerCase();

    // より緩い条件
    if (title.includes(ingredientLower) || materials.includes(ingredientLower)) {
      return true;
    }

    // 食材系の一般的なワードでも通す
    const generalFoodWords = this.getGeneralFoodWords(ingredient);
    for (const word of generalFoodWords) {
      if (title.includes(word) || materials.includes(word)) {
        return true;
      }
    }

    return false;
  }

  // 6. より包括的な同義語取得
  getAllSynonyms(ingredient) {
    const synonymMap = {
      'キャベツ': ['きゃべつ', 'cabbage', 'キヤベツ', 'ロールキャベツ', '野菜'],
      '人参': ['にんじん', 'ニンジン', 'carrot', '人参', '野菜'],
      '玉ねぎ': ['たまねぎ', 'タマネギ', 'onion', '玉葱', 'オニオン', '野菜'],
      'じゃがいも': ['ジャガイモ', 'potato', 'ポテト', 'じゃが芋', 'ジャガ芋', '芋', '野菜'],
      'にんにく': ['ニンニク', 'garlic', 'ガーリック', '野菜'],
      '豚肉': ['豚', 'ぶた肉', 'ポーク', 'pork', '豚バラ', '豚こま', '肉'],
      '豚バラ肉': ['豚バラ', '豚ばら肉', 'バラ肉', '豚肉', '肉']
    };
    
    return synonymMap[ingredient] || ['食材', '料理'];
  }

  // 7. カテゴリ関連語取得
  getCategoryRelatedWords(ingredient) {
    const categoryMap = {
      'キャベツ': ['野菜', '炒め', 'サラダ', '蒸し', '茹で'],
      '人参': ['野菜', '煮物', 'きんぴら', '炒め', '和風'],
      'じゃがいも': ['芋', 'ポテト', '煮物', 'フライ', '焼き'],
      '豚バラ肉': ['豚', '肉', '角煮', '炒め', '焼き'],
      '豚肉': ['豚', '肉', '炒め', '焼き', '煮込み']
    };
    
    return categoryMap[ingredient] || ['料理', '簡単', '美味しい'];
  }

  // 8. 一般的な食材ワード
  getGeneralFoodWords(ingredient) {
    const generalMap = {
      'キャベツ': ['野菜'],
      '人参': ['野菜'],
      'じゃがいも': ['野菜', '芋'],
      '豚バラ肉': ['肉'],
      '豚肉': ['肉']
    };
    
    return generalMap[ingredient] || [];
  }

  // 9. より多くのカテゴリを取得
  getAllRelevantCategories(ingredient) {
    const categoryMap = {
      'キャベツ': [
        { id: '18', name: 'サラダ' },
        { id: '30', name: '人気メニュー' },
        { id: '17', name: '汁物・スープ' },
        { id: '31', name: '定番の肉料理' }
      ],
      '人参': [
        { id: '30', name: '人気メニュー' },
        { id: '31', name: '定番の肉料理' },
        { id: '17', name: '汁物・スープ' },
        { id: '18', name: 'サラダ' }
      ],
      'じゃがいも': [
        { id: '30', name: '人気メニュー' },
        { id: '31', name: '定番の肉料理' },
        { id: '14', name: 'ご飯もの' },
        { id: '17', name: '汁物・スープ' }
      ],
      '豚肉': [
        { id: '31', name: '定番の肉料理' },
        { id: '30', name: '人気メニュー' },
        { id: '14', name: 'ご飯もの' },
        { id: '17', name: '汁物・スープ' }
      ],
      '豚バラ肉': [
        { id: '31', name: '定番の肉料理' },
        { id: '30', name: '人気メニュー' },
        { id: '14', name: 'ご飯もの' },
        { id: '17', name: '汁物・スープ' }
      ]
    };
    
    return categoryMap[ingredient] || [
      { id: '30', name: '人気メニュー' },
      { id: '31', name: '定番の肉料理' },
      { id: '18', name: 'サラダ' }
    ];
  }

  // 10. 緩和版ランキング
  relaxedRanking(recipes, ingredient) {
    // より緩いスコアリング
    const scoredRecipes = recipes.map(recipe => {
      let score = recipe.priority || 0;
      
      const title = recipe.recipeTitle.toLowerCase();
      const materials = Array.isArray(recipe.recipeMaterial) ? 
        recipe.recipeMaterial.join(' ').toLowerCase() : 
        String(recipe.recipeMaterial || '').toLowerCase();
      
      const ingredientLower = ingredient.toLowerCase();
      
      // 直接一致は高スコア
      if (title.includes(ingredientLower) || materials.includes(ingredientLower)) {
        score += 100;
      }
      
      // 同義語一致
      const synonyms = this.getAllSynonyms(ingredient);
      for (const synonym of synonyms) {
        if (title.includes(synonym.toLowerCase()) || materials.includes(synonym.toLowerCase())) {
          score += 50;
        }
      }
      
      // APIレシピは知識ベースより優先
      if (!recipe.isKnowledgeBased) {
        score += 30;
      }
      
      return { ...recipe, finalScore: score };
    });

    // 重複除去（緩い条件）
    const uniqueRecipes = [];
    const seenTitles = new Set();
    
    for (const recipe of scoredRecipes) {
      const normalizedTitle = recipe.recipeTitle.toLowerCase().replace(/[　\s]/g, '');
      if (!seenTitles.has(normalizedTitle)) {
        seenTitles.add(normalizedTitle);
        uniqueRecipes.push(recipe);
      }
    }

    // スコア順ソート
    uniqueRecipes.sort((a, b) => {
      // 知識ベースでないものを優先
      if (!a.isKnowledgeBased && b.isKnowledgeBased) return -1;
      if (a.isKnowledgeBased && !b.isKnowledgeBased) return 1;
      
      return (b.finalScore || 0) - (a.finalScore || 0);
    });

    // デバッグ情報
    console.log(`📊 緩和版ランキング結果 (${ingredient}):`);
    uniqueRecipes.slice(0, 6).forEach((recipe, index) => {
      const source = recipe.isKnowledgeBased ? '知識ベース' : 'API';
      console.log(`  ${index + 1}. ${recipe.recipeTitle} (${recipe.finalScore || 0}点, ${source})`);
    });
    
    return uniqueRecipes;
  }

  // 11. 知識ベースレシピ生成（既存と同じ）
  generateKnowledgeBasedRecipes(ingredient) {
    const recipeDatabase = {
      'キャベツ': [
        {
          title: 'キャベツと豚肉の味噌炒め',
          materials: ['キャベツ', '豚肉', '味噌', '醤油', 'みりん'],
          time: '15分',
          difficulty: '簡単',
          category: '炒め物'
        },
        {
          title: 'キャベツのコールスロー',
          materials: ['キャベツ', 'マヨネーズ', 'ケチャップ', '塩', 'こしょう'],
          time: '10分',
          difficulty: '簡単',
          category: 'サラダ'
        }
      ]
      // 他の食材も同様...
    };

    const recipes = recipeDatabase[ingredient] || [
      {
        title: `${ingredient}の簡単料理`,
        materials: [ingredient, '塩', 'こしょう', '油'],
        time: '10分',
        difficulty: '簡単',
        category: 'その他'
      }
    ];

    return recipes.map((recipe, index) => ({
      recipeId: `knowledge_${ingredient}_${index}`,
      recipeTitle: recipe.title,
      recipeUrl: 'https://recipe.rakuten.co.jp/',
      recipeMaterial: recipe.materials,
      recipeIndication: recipe.time,
      difficulty: recipe.difficulty,
      category: recipe.category,
      userRecipe: false,
      relevanceScore: 75,
      isKnowledgeBased: true,
      finalScore: 75
    }));
  }

  // 12. カテゴリランキング取得（既存と同じ）
  async getCategoryRanking(categoryId, hits = 10) {
    try {
      const axios = require('axios');
      const cacheKey = `category_${categoryId}_${hits}`;
      
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }
      
      const response = await axios.get(`${this.baseUrl}/CategoryRanking/20170426`, {
        params: {
          applicationId: this.apiKey,
          categoryId: categoryId,
          hits: Math.min(hits, 20)
        },
        timeout: 15000
      });

      let recipes = [];
      if (response.data && response.data.result && Array.isArray(response.data.result)) {
        recipes = response.data.result.map((recipe, index) => ({
          recipeId: recipe.recipeId || `cat_${categoryId}_${index}`,
          recipeTitle: recipe.recipeTitle || 'タイトル不明',
          recipeUrl: recipe.recipeUrl || '',
          foodImageUrl: recipe.foodImageUrl || null,
          recipeMaterial: recipe.recipeMaterial || [],
          recipeIndication: recipe.recipeIndication || '調理時間不明',
          recipeCost: recipe.recipeCost || '指定なし',
          rank: parseInt(recipe.rank) || 0,
          categoryId: categoryId,
          userRecipe: false,
          isKnowledgeBased: false
        }));
      }

      this.cache.set(cacheKey, recipes);
      return recipes;
    } catch (error) {
      console.error(`カテゴリランキング取得エラー (${categoryId}):`, error.message);
      return [];
    }
  }

  // 13. メイン検索メソッド
  async improvedSearch(ingredient, maxResults = 6) {
    console.log(`🚀 緩和版楽天API検索開始: ${ingredient}`);
    
    try {
      const results = await this.comprehensiveSearch(ingredient, { maxResults });
      
      console.log(`✅ 緩和版検索完了: ${results.length}件`);
      return results;
      
    } catch (error) {
      console.error('緩和版検索エラー:', error.message);
      return this.generateKnowledgeBasedRecipes(ingredient);
    }
  }
}

module.exports = RelaxedRakutenRecipeAPI;
