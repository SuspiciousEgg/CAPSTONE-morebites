import { customerApi } from "./client";

const FALLBACK_DELIVERY = 40;
const FALLBACK_SERVICE = 20;

/** Load current delivery/service fees (optional distance in km or a full address). */
export async function fetchDeliveryFees(km = null, address = null) {
  try {
    const res = await customerApi.quoteFees(km, address);
    const data = res.data || res;
    const distance = data.distance_km != null ? Number(data.distance_km) : (km != null ? Number(km) : null);
    const isExceeded = data.deliverable === false || (distance != null && distance > 10);
    return {
      deliverable: !isExceeded,
      error: isExceeded ? (data.error || "Delivery not available beyond 10km") : null,
      deliveryFee: isExceeded ? 0 : Number(data.delivery_fee ?? FALLBACK_DELIVERY),
      serviceFee: isExceeded ? 0 : Number(data.service_fee ?? FALLBACK_SERVICE),
      distanceKm: distance,
      tierLabel: isExceeded ? null : (data.tier_label || null),
      formula: data.formula || null,
      calculation: Array.isArray(data.calculation) ? data.calculation : [],
      feesTotal: isExceeded ? 0 : Number(data.fees_total ?? (FALLBACK_DELIVERY + FALLBACK_SERVICE)),
    };
  } catch {
    const distance = km != null ? Number(km) : null;
    const isExceeded = distance != null && distance > 10;
    return {
      deliverable: !isExceeded,
      error: isExceeded ? "Delivery not available beyond 10km" : null,
      deliveryFee: isExceeded ? 0 : FALLBACK_DELIVERY,
      serviceFee: isExceeded ? 0 : FALLBACK_SERVICE,
      distanceKm: distance,
      tierLabel: null,
      formula: null,
      calculation: [],
      feesTotal: isExceeded ? 0 : (FALLBACK_DELIVERY + FALLBACK_SERVICE),
    };
  }
}

export function feesFromOrder(order) {
  return {
    deliveryFee: Number(order?.delivery_fee ?? FALLBACK_DELIVERY),
    serviceFee: Number(order?.service_fee ?? FALLBACK_SERVICE),
  };
}
