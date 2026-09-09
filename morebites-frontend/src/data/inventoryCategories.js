export const INVENTORY_CATEGORIES = {
  'Raw Materials': {
    defaultUnit: 'kg',
    trackExpiry: true,
    subcategories: ['Flour & Bases', 'Oil & Fats', 'Packaging', 'Dry Goods'],
  },
  Meat: {
    defaultUnit: 'kg',
    trackExpiry: true,
    subcategories: ['Chicken', 'Pork', 'Beef', 'Fish', 'Processed Meat'],
    subcategoryDetails: {
      Chicken: {
        label: 'Chicken Part',
        options: [
          'Thigh',
          'Breast',
          'Wings',
          'Drumstick',
          'Whole Chicken',
          'Ground Chicken',
          'Liver',
        ],
      },
    },
  },
  Ingredients: {
    defaultUnit: 'kg',
    trackExpiry: true,
    subcategories: ['Vegetables', 'Dairy', 'Sauces & Condiments', 'Spices', 'Frozen Goods'],
  },
  Beverages: {
    defaultUnit: 'pcs',
    trackExpiry: true,
    subcategories: ['Soft Drinks', 'Juice', 'Water', 'Syrups & Mixers'],
  },
  Dessert: {
    defaultUnit: 'pcs',
    trackExpiry: true,
    subcategories: ['Frozen', 'Dry Mix', 'Toppings', 'Ready-to-Serve'],
  },
  Sides: {
    defaultUnit: 'pcs',
    trackExpiry: true,
    subcategories: ['Frozen', 'Prepared', 'Snacks'],
  },
  'Non-Perishables': {
    defaultUnit: 'pcs',
    trackExpiry: false,
    subcategories: ['Utensils', 'Cleaning Supplies', 'Disposables', 'Storage'],
  },
}

export const INVENTORY_CATEGORY_LIST = Object.keys(INVENTORY_CATEGORIES)

export function getCategoryConfig(category) {
  return INVENTORY_CATEGORIES[category] || null
}

export function getSubcategoryDetailConfig(category, subcategory) {
  const config = getCategoryConfig(category)
  if (!config?.subcategoryDetails || !subcategory) return null
  return config.subcategoryDetails[subcategory] || null
}

export function formatInventoryCategory(category, subcategory, subcategoryDetail = null) {
  if (!category) return '—'
  const parts = [category]
  if (subcategory) parts.push(subcategory)
  if (subcategoryDetail) parts.push(subcategoryDetail)
  return parts.join(' › ')
}
