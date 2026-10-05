export const STATUS_COLORS = {
  IN_STOCK: { bg: '#dcfce7', color: '#166534', label: 'In Stock' },
  LOW_STOCK: { bg: '#fef3c7', color: '#92400e', label: 'Low Stock' },
  OUT_OF_STOCK: { bg: '#fee2e2', color: '#991b1b', label: 'Out of Stock' },
};

export const CATEGORY_LABELS = {
  FOOD: 'Food & Beverage',
  DECORATION: 'Decoration',
  UTENSIL: 'Utensils & Cutlery',
  ELECTRONIC: 'Electronics & Lighting',
  FURNITURE: 'Furniture',
  OTHER: 'Other',
};

export const getUsedQty = (item) => Number(item?.allocated_quantity || 0);

/** On-hand stock. Booking quantities are already taken out of `quantity`. */
export const getAvailableQty = (item) => {
  if (item == null) return 0;
  if (item.available_quantity != null && item.available_quantity !== '') {
    return Number(item.available_quantity);
  }
  return Number(item.quantity || 0);
};

export const parseItemToForm = (item) => ({
  name: item.name,
  category: item.category,
  quantity: item.quantity,
  unit: item.unit,
  price_per_unit: item.price_per_unit,
  status: item.status,
  last_restocked: item.last_restocked || new Date().toISOString().split('T')[0],
  description: item.description || '',
});
