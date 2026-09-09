import { useCallback, useState } from "react";
import { driverApi } from "../api/client";

export function useDriverOrder(dbId) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!dbId) {
      setLoading(false);
      setError("Missing order id");
      return null;
    }
    setLoading(true);
    setError("");
    try {
      const res = await driverApi.order(dbId);
      const data = res.data || res;
      setOrder(data);
      return data;
    } catch (err) {
      setError(err.message || "Failed to load order");
      return null;
    } finally {
      setLoading(false);
    }
  }, [dbId]);

  return { order, loading, error, reload, setOrder };
}

export function statusStep(status) {
  switch (status) {
    case "Assigned":
      return 1;
    case "Picked Up":
      return 2;
    case "Out for Delivery":
      return 3;
    case "Delivered":
    case "Completed":
      return 4;
    default:
      return 1;
  }
}

export function formatPeso(amount) {
  const value = Number(amount || 0);
  return `₱${value.toLocaleString("en-PH", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
