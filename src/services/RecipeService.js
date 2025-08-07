// src/services/RecipeService.js - ユーザーレシピDB統合版
const axios = require('axios');

class RecipeService {
  constructor() {
    this.apiKey = process.env.RAKUTEN_API_KEY;
    this.baseUrl = 'https://app.rakuten.co.jp/services/api/Recipe';
    this.requestCount = 0;
    this.lastRequestTime = 0;
    this.rateLimitDelay = 1000;
  }

  // レート制限対応
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  // 食材から料理を提案（ユーザーレシピ + 楽天API）
  async suggestRecipesByIngredients(ingredients, options = {}, sheetsService = null) {
    const {
      categoryId = null,
      maxResults = 10,
      excludeIngredients = [],
      difficulty = null
    } = options;

    try {
      console.log(`🎯 Starting hybrid recipe search for ingredients: ${ingredients.join(', ')}`);
      console.log(`🚫 Excluding ingredients: ${excludeIngredients.join(', ')}`);
      
      const allRecipes = new Map();
      
      // 検索対象から除外食材を除く
      const searchIngredients = ingredients
        .filter(ingredient => !this.isExcluded(ingredient, excludeIngredients))
        .slice(0, 3);
      
      if (searchIngredients.length === 0) {
        return this.getFallbackRecipes(['野菜']).slice(0, maxResults);
      }

      // 🏠 ユーザーレシピDBから検索
      if (sheetsService) {
        console.log(`📚 Searching user recipe database...`);
        const userRecipes = await this.searchUserRecipes(sheetsService, searchIngredients, excludeIngredients);
        userRecipes.forEach(recipe => {
          if (!allRecipes.has(recipe.recipeId)) {
            allRecipes.set(recipe.recipeId, recipe);
          }
        });
        console.log(`📚 Found ${userRecipes.length} user recipes`);
      }

      // 🌐 楽天APIから検索（ユーザーレシピが少ない場合は多めに取得）
      const userRecipeCount = allRecipes.size;
      const apiTargetCount = Math.max(maxResults - userRecipeCount, Math.ceil(maxResults / 2));
      
      if (apiTargetCount > 0) {
        console.log(`🌐 Searching Rakuten API for ${apiTargetCount} recipes...`);
        const apiRecipes = await this.searchRakutenAPI(searchIngredients, apiTargetCount);
        apiRecipes.forEach(recipe => {
          if (!allRecipes.has(recipe.recipeId)) {
            allRecipes.set(recipe.recipeId, recipe);
          }
        });
        console.log(`🌐 Found ${apiRecipes.length} API recipes`);
      }

      let validRecipes = Array.from(allRecipes.values());

      // 除外フィルター適用
      if (excludeIngredients.length > 0) {
        validRecipes = validRecipes.filter(recipe => {
          return !this.containsExcludedIngredients(recipe, excludeIngredients);
        });
      }

      // ハイブリッドスコアリング
      validRecipes = validRecipes.map(recipe => {
        const matchScore = this.calculateHybridMatchScore(recipe, searchIngredients);
        const sourceBonus = recipe.userRecipe ? 1.5 : 0; // ユーザーレシピにボーナス
        
        return {
          ...recipe,
          matchScore: matchScore + sourceBonus,
          availableIngredients: this.getAvailableIngredients(recipe, searchIngredients)
        };
      });

      // スコア順でソート（ユーザーレシピ優先）
      validRecipes.sort((a, b) => {
        // ユーザーレシピを優先
        if (a.userRecipe && !b.userRecipe) return -1;
        if (!a.userRecipe && b.userRecipe) return 1;
        
        // 同じソース内では適合度でソート
        return b.matchScore - a.matchScore;
      });

      const finalCount = Math.min(validRecipes.length, maxResults);
      console.log(`🎉 Hybrid result: returning ${finalCount} recipes`);
      
      // ソース別の内訳をログ出力
      const userCount = validRecipes.filter(r => r.userRecipe).length;
      const apiCount = validRecipes.length - userCount;
      console.log(`📊 Recipe sources: ${userCount} user recipes, ${apiCount} API recipes`);

      return validRecipes.slice(0, maxResults);

    } catch (error) {
      console.error('🚨 Hybrid recipe suggestion error:', error.message);
      const safeIngredients = ingredients.filter(ing => !excludeIngredients.includes(ing));
      return this.getFallbackRecipes(safeIngredients).slice(0, maxResults);
    }
  }

  // ユーザーレシピ検索
  async searchUserRecipes(sheetsService, searchIngredients, excludeIngredients = []) {
    try {
      const range = 'レシピ管理!A:M';
      const response = await sheetsService.sheets.spreadsheets.values.get({
        spreadsheetId: sheetsService.spreadsheetId,
        range: range,
      });

      const rows = response.data.values || [];
      if (rows.length <= 1) return [];

      const userRecipes = rows.slice(1)
        .filter(row => row[0] && row[0].startsWith('user_')) // ユーザー登録レシピのみ
        .map(row => {
          const ingredients = [row[2], row[3], row[4], row[5], row[6]]
            .filter(ingredient => ingredient && ingredient.trim())
            .map(ingredient => ingredient.trim());

          return {
            recipeId: row[0] || '',
            recipeTitle: row[1] || '',
            recipeUrl: 'https://recipe.rakuten.co.jp/', // ユーザーレシピ用のデフォルトURL
            foodImageUrl: null,
            recipeMaterial: ingredients,
            recipeIndication: row[7] || '約30分',
            recipeCost: '手作り',
            difficulty: row[8] || '普通',
            category: row[9] || 'その他',
            memo: row[10] || '',
            registeredBy: row[11] || '',
            registeredAt: row[12] || '',
            userRecipe: true, // ユーザーレシピフラグ
            rank: 0
          };
        });

      // 検索食材でフィルタリング
      const matchingRecipes = userRecipes.filter(recipe => {
        // 除外食材チェック
        if (this.containsExcludedIngredients(recipe, excludeIngredients)) {
          return false;
        }

        // 検索食材との一致チェック
        const recipeIngredients = recipe.recipeMaterial.map(ing => ing.toLowerCase());
        const hasMatch = searchIngredients.some(searchIng => 
          recipeIngredients.some(recipeIng => 
            recipeIng.includes(searchIng.toLowerCase()) || 
            searchIng.toLowerCase().includes(recipeIng)
          )
        );

        if (hasMatch) {
          console.log(`✅ User recipe match: "${recipe.recipeTitle}"`);
        }

        return hasMatch;
      });

      return matchingRecipes;

    } catch (error) {
      console.error('ユーザーレシピ検索エラー:', error);
      return [];
    }
  }

  // 楽天API検索（既存の実装を流用）
  async searchRakutenAPI(ingredients, maxResults) {
    const apiRecipes = [];
    const maxPerIngredient = Math.ceil(maxResults / ingredients.length);

    for (let i = 0; i < Math.min(ingredients.length, 2); i++) {
      const ingredient = ingredients[i];
      console.log(`🔍 API search: "${ingredient}"`);
      
      try {
        const results = await this.searchRecipes(ingredient, { maxResults: maxPerIngredient });
        apiRecipes.push(...results);
        
        // API制限対策
        if (i < ingredients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1200));
        }
      } catch (error) {
        console.error(`API search error for "${ingredient}":`, error.message);
      }
    }

    // 重複除去
    const uniqueRecipes = [];
    const seenIds = new Set();
    
    for (const recipe of apiRecipes) {
      if (!seenIds.has(recipe.recipeId)) {
        seenIds.add(recipe.recipeId);
        recipe.userRecipe = false; // APIレシピフラグ
        uniqueRecipes.push(recipe);
      }
    }

    return uniqueRecipes.slice(0, maxResults);
  }

  // ハイブリッドマッチスコア計算
  calculateHybridMatchScore(recipe, availableIngredients) {
    let exactMatches = 0;
    let partialMatches = 0;
    
    const materials = Array.isArray(recipe.recipeMaterial) ? 
      recipe.recipeMaterial : 
      this.getMaterialString(recipe.recipeMaterial).split('、');
    
    availableIngredients.forEach(ingredient => {
      const ingredientLower = ingredient.toLowerCase();
      
      // 完全一致チェック
      if (materials.some(mat => mat.toLowerCase().includes(ingredientLower))) {
        exactMatches += 2;
      }
      // タイトル一致チェック
      else if (recipe.recipeTitle.toLowerCase().includes(ingredientLower)) {
        partialMatches += 1;
      }
    });

    const totalScore = exactMatches + partialMatches;
    return totalScore;
  }

  // 楽天API検索（単体）
  async searchRecipes(keyword, options = {}) {
    const { categoryId = null, maxResults = 20 } = options;

    try {
      await this.waitForRateLimit();

      const params = {
        applicationId: this.apiKey,
        keyword: keyword,
        hits: Math.min(maxResults, 20)
      };

      if (categoryId) {
        params.categoryId = categoryId;
      }

      const response = await axios.get(`${this.baseUrl}/CategoryRanking/20170426`, {
        params,
        timeout: 15000,
        headers: { 'User-Agent': 'FridgeBot/1.0' }
      });

      if (response.data && response.data.result && Array.isArray(response.data.result)) {
        const recipes = response.data.result
          .filter(recipe => recipe && recipe.recipeTitle)
          .map((recipe, index) => ({
            recipeId: recipe.recipeId || `generated_${Date.now()}_${index}`,
            recipeTitle: recipe.recipeTitle || 'タイトル不明',
            recipeUrl: recipe.recipeUrl || `https://recipe.rakuten.co.jp/recipe/${recipe.recipeId}/`,
            foodImageUrl: recipe.foodImageUrl || null,
            recipeMaterial: recipe.recipeMaterial || [],
            recipeIndication: recipe.recipeIndication || '調理時間不明',
            recipeCost: recipe.recipeCost || '指定なし',
            rank: parseInt(recipe.rank) || 0,
            userRecipe: false
          }));

        return recipes;
      }

      return [];

    } catch (error) {
      if (error.response && error.response.status === 429) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      return [];
    }
  }

  // 期限切れ近い食材から料理提案（ユーザーレシピ対応）
  async suggestUrgentRecipes(expiringIngredients, sheetsService = null) {
    if (!expiringIngredients || expiringIngredients.length === 0) {
      return [];
    }

    const ingredients = expiringIngredients.map(item => item.name).slice(0, 2);
    console.log(`🚨 Urgent recipe search for: ${ingredients.join(', ')}`);

    const urgentRecipes = [];

    // ユーザーレシピから緊急レシピを検索
    if (sheetsService) {
      const userRecipes = await this.searchUserRecipes(sheetsService, ingredients);
      urgentRecipes.push(...userRecipes);
    }

    // 楽天APIからも検索
    for (const ingredient of ingredients) {
      const apiRecipes = await this.searchRecipes(ingredient, { maxResults: 3 });
      urgentRecipes.push(...apiRecipes);
      
      if (ingredients.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    // 緊急度情報を追加
    const processedRecipes = urgentRecipes.map(recipe => ({
      ...recipe,
      urgentIngredient: expiringIngredients[0].name,
      daysLeft: this.calculateDaysLeft(expiringIngredients[0].expiryDate),
      urgencyLevel: this.calculateDaysLeft(expiringIngredients[0].expiryDate) <= 1 ? 'critical' : 'high'
    }));

    // 重複除去
    const uniqueRecipes = [];
    const seenIds = new Set();
    
    for (const recipe of processedRecipes) {
      if (!seenIds.has(recipe.recipeId)) {
        seenIds.add(recipe.recipeId);
        uniqueRecipes.push(recipe);
      }
    }

    return uniqueRecipes
      .sort((a, b) => {
        // ユーザーレシピ優先
        if (a.userRecipe && !b.userRecipe) return -1;
        if (!a.userRecipe && b.userRecipe) return 1;
        
        // 緊急度でソート
        if (a.daysLeft !== b.daysLeft) {
          return a.daysLeft - b.daysLeft;
        }
        return (b.rank || 0) - (a.rank || 0);
      })
      .slice(0, 8);
  }

  // ユーティリティメソッド群
  isExcluded(ingredient, excludeIngredients) {
    return excludeIngredients.some(exclude => 
      ingredient.toLowerCase().includes(exclude.toLowerCase()) ||
      exclude.toLowerCase().includes(ingredient.toLowerCase())
    );
  }

  containsExcludedIngredients(recipe, excludeIngredients) {
    const materialString = this.getMaterialString(recipe.recipeMaterial).toLowerCase();
    const titleString = recipe.recipeTitle.toLowerCase();
    
    return excludeIngredients.some(exclude => {
      const excludeLower = exclude.toLowerCase().trim();
      return materialString.includes(excludeLower) || titleString.includes(excludeLower);
    });
  }

  getMaterialString(recipeMaterial) {
    if (Array.isArray(recipeMaterial)) {
      return recipeMaterial.join('、');
    }
    return String(recipeMaterial || '');
  }

  getAvailableIngredients(recipe, availableIngredients) {
    const materialString = this.getMaterialString(recipe.recipeMaterial).toLowerCase();
    return availableIngredients.filter(ingredient => 
      materialString.includes(ingredient.toLowerCase())
    );
  }

  getFallbackRecipes(ingredients) {
    if (!ingredients || ingredients.length === 0) {
      ingredients = ['野菜'];
    }
    
    return [
      {
        recipeId: 'fallback_1',
        recipeTitle: `${ingredients[0]}の基本炒め物`,
        recipeUrl: 'https://recipe.rakuten.co.jp/',
        recipeMaterial: [ingredients[0], '塩', 'こしょう', '油'],
        recipeIndication: '約15分',
        userRecipe: false,
        fallback: true
      }
    ];
  }

  // 簡略メソッド
  async getPopularRecipes(maxResults = 10, sheetsService = null) {
    try {
      // ユーザーレシピから人気そうなものを選択（登録日が新しいもの）
      if (sheetsService) {
        const userRecipes = await this.searchUserRecipes(sheetsService, ['人気'], []);
        if (userRecipes.length > 0) {
          return userRecipes.slice(0, Math.min(maxResults, 5));
        }
      }
      
      return await this.searchRecipes('人気', { maxResults: Math.min(maxResults, 8) });
    } catch (error) {
      return this.getFallbackRecipes(['人気の食材']).slice(0, maxResults);
    }
  }

  async getSeasonalRecipes(sheetsService = null) {
    const month = new Date().getMonth() + 1;
    let seasonalKeyword = month >= 3 && month <= 5 ? '春野菜' :
                        month >= 6 && month <= 8 ? '夏野菜' :
                        month >= 9 && month <= 11 ? '秋の味覚' : '冬野菜';

    try {
      const recipes = [];
      
      // ユーザーレシピから季節のレシピを検索
      if (sheetsService) {
        const userRecipes = await this.searchUserRecipes(sheetsService, [seasonalKeyword], []);
        recipes.push(...userRecipes);
      }
      
      // 楽天APIからも検索
      const apiRecipes = await this.searchRecipes(seasonalKeyword, { maxResults: 5 });
      recipes.push(...apiRecipes);
      
      return recipes.slice(0, 5);
    } catch (error) {
      return this.getFallbackRecipes([seasonalKeyword]).slice(0, 3);
    }
  }

  async suggestBalancedMeals(inventory, sheetsService = null) {
    try {
      const mainIngredients = inventory
        .filter(item => item.currentAmount > 0)
        .slice(0, 2)
        .map(item => item.name);

      if (mainIngredients.length === 0) {
        return [];
      }

      return await this.suggestRecipesByIngredients(mainIngredients, { maxResults: 5 }, sheetsService);
    } catch (error) {
      return this.getFallbackRecipes(mainIngredients || ['バランス', '栄養']);
    }
  }

  calculateDaysLeft(expiryDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const expiryDate = new Date(expiryDateStr);
    expiryDate.setHours(0, 0, 0, 0);
    
    const diffTime = expiryDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

module.exports = RecipeService;
