import { customerApi } from "./client";

const FALLBACK_DELIVERY = 40;
const FALLBACK_SERVICE = 20;

/** Load current delivery/service fees (optional distance in km or a full address). */
export async function fetchDeliveryFees(km = null, address = null) {
  try {
    const res = await customerApi.quoteFees(km, address);
    const data = res.data || res;
    return {
      deliveryFee: Number(data.delivery_fee ?? FALLBACK_DELIVERY),
      serviceFee: Number(data.service_fee ?? FALLBACK_SERVICE),
      distanceKm: data.distance_km ?? km,
      tierLabel: data.tier_label || null,
      formula: data.formula || null,
      calculation: Array.isArray(data.calculation) ? data.calculation : [],
      feesTotal: Number(data.fees_total ?? 0),
    };
  } catch {
    return {
      deliveryFee: FALLBACK_DELIVERY,
      serviceFee: FALLBACK_SERVICE,
      distanceKm: km,
      tierLabel: null,
      formula: null,
      calculation: [],
      feesTotal: FALLBACK_DELIVERY + FALLBACK_SERVICE,
    };
  }
}

export function feesFromOrder(order) {
  return {
    deliveryFee: Number(order?.delivery_fee ?? FALLBACK_DELIVERY),
    serviceFee: Number(order?.service_fee ?? FALLBACK_SERVICE),
  };
}
