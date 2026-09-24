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

const CUSTOM_CATEGORIES_KEY = 'morebites_custom_inventory_categories'

export function getCustomCategories() {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(CUSTOM_CATEGORIES_KEY) : null
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCustomCategory(name) {
  const trimmed = String(name || '').trim()
  if (!trimmed) return null
  const current = getCustomCategories()
  const exists =
    current.some((c) => c.toLowerCase() === trimmed.toLowerCase()) ||
    INVENTORY_CATEGORY_LIST.some((c) => c.toLowerCase() === trimmed.toLowerCase())
  if (!exists) {
    const next = [...current, trimmed]
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(next))
      }
    } catch (e) {
      console.error(e)
    }
  }
  return trimmed
}

export function getAllCategories() {
  const custom = getCustomCategories()
  const set = new Set([...INVENTORY_CATEGORY_LIST, ...custom])
  return Array.from(set)
}

export function getCategoryConfig(category) {
  if (!category) return null
  if (INVENTORY_CATEGORIES[category]) {
    return INVENTORY_CATEGORIES[category]
  }
  return {
    defaultUnit: 'pcs',
    trackExpiry: true,
    subcategories: ['General'],
  }
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
