/**
 * PROMPT 45 — Digital Receipt Screen (Post-Payment Proof of Completed Transaction)
 *
 * Investigation Summary:
 * 1. PDF / Sharing Libraries in Customer Mobile (`morebites-customer`):
 *    - Prior to Prompt 45, `morebites-customer/package.json` did not include `jspdf`, `expo-print`,
 *      `expo-sharing`, or `react-native-view-shot`. On the web admin side (`RecordsReports.jsx`),
 *      PDF exports are generated via a zero-dependency PDF 1.4 binary stream builder (with `window.jsPDF`
 *      interop).
 *    - Installed Expo SDK 54 compatible `expo-sharing`, `expo-print`, and `react-native-view-shot`
 *      for native PDF/image receipt sharing via the system share sheet, and mirrored the web PDF 1.4
 *      stream generator for Expo Web so "Share Receipt" works across Android, iOS, and Web.
 * 2. Loyalty Points Earn-on-Completion Logic:
 *    - Active in `ReportController.php` (line 83) and `RecordsReports.jsx` (line 1016):
 *      completed/delivered orders earn `round(total / 2)` loyalty points (`Order::loyaltyPointsEarned()`).
 *    - Pulled directly from `order.points_earned` returned by the backend (with matching fallback
 *      `Math.round(total / 2)`), rendered as `"Points Earned: [X] pts"`.
 */

import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";
import { customerApi } from "../src/api/client";
import { feesFromOrder } from "../src/api/fees";
import { useCart } from "../src/context/CartContext";

const FONT = "Plus Jakarta Sans";
const PRIMARY = "#F97000";

function parseOrder(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function formatDateTimeLabel(isoOrLabel, fallbackLabel) {
  if (fallbackLabel && typeof fallbackLabel === "string" && fallbackLabel.trim()) {
    return fallbackLabel.trim();
  }
  if (!isoOrLabel) return "—";
  const parsed = new Date(isoOrLabel);
  if (Number.isNaN(parsed.getTime())) {
    return String(isoOrLabel);
  }
  const datePart = parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart} · ${timePart}`;
}

export function deriveReceiptNumber(order = {}, fallbackOrderId = "") {
  if (order?.receipt_number && String(order.receipt_number).startsWith("RCPT-")) {
    return String(order.receipt_number);
  }
  const rawSource =
    order?.order_id ||
    order?.orderId ||
    order?.id ||
    fallbackOrderId ||
    order?.db_id ||
    "0";
  const digits = String(rawSource).replace(/\D+/g, "");
  const padded = (digits || "0").padStart(5, "0");
  return `RCPT-${padded}`;
}

function buildReceiptPdfBlob(receiptData) {
  const lines = [
    "MOREBITES - OFFICIAL DIGITAL RECEIPT",
    `Receipt Number: ${receiptData.receiptNumber}`,
    `Order ID: ${receiptData.orderId}`,
    `Order Placed: ${receiptData.orderPlacedLabel}`,
    `Payment Confirmed: ${receiptData.paymentConfirmedLabel}`,
    `Payment Method: ${receiptData.paymentMethodLabel}`,
    `Rider: ${receiptData.riderName}`,
    `Delivery Address: ${receiptData.address}`,
    `Points Earned: ${receiptData.pointsEarned} pts`,
    "",
    "ORDERED ITEMS",
    "------------------------------------------------------------",
    ...receiptData.items.map((item) => {
      const qty = Number(item.quantity || 1);
      const lineTotal = Number(item.price || 0) * qty;
      const sizeText = item.size ? ` (${item.size})` : "";
      return `${qty}x ${item.name}${sizeText} - PHP ${lineTotal.toLocaleString()}`;
    }),
    "------------------------------------------------------------",
    `Subtotal: PHP ${Number(receiptData.subtotal).toLocaleString()}`,
    `Delivery Fee: PHP ${Number(receiptData.deliveryFee).toLocaleString()}`,
    `Service Fee: PHP ${Number(receiptData.serviceFee).toLocaleString()}`,
    `TOTAL AMOUNT PAID: PHP ${Number(receiptData.total).toLocaleString()}`,
    "",
    "Thank you for ordering with MoreBites!",
  ];

  const pdfStream = [
    "BT",
    "/F1 10 Tf",
    "40 750 Td",
    "15 TL",
    ...lines.map((l) => `(${String(l).replace(/[()\\]/g, "\\$&")}) '`),
    "ET",
  ].join("\n");

  const header = "%PDF-1.4\n";
  const obj1 = "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n";
  const obj2 = "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n";
  const obj3 =
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n";
  const obj4 = `4 0 obj << /Length ${pdfStream.length} >> stream\n${pdfStream}\nendstream endobj\n`;
  const obj5 = "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n";

  const offset1 = header.length;
  const offset2 = offset1 + obj1.length;
  const offset3 = offset2 + obj2.length;
  const offset4 = offset3 + obj3.length;
  const offset5 = offset4 + obj4.length;
  const xrefOffset = offset5 + obj5.length;

  const pad = (n) => String(n).padStart(10, "0");
  const xref = [
    "xref",
    "0 6",
    "0000000000 65535 f ",
    `${pad(offset1)} 00000 n `,
    `${pad(offset2)} 00000 n `,
    `${pad(offset3)} 00000 n `,
    `${pad(offset4)} 00000 n `,
    `${pad(offset5)} 00000 n `,
    "trailer << /Size 6 /Root 1 0 R >>",
    "startxref",
    String(xrefOffset),
    "%%EOF",
  ].join("\n");

  const pdfBody = header + obj1 + obj2 + obj3 + obj4 + obj5 + xref;
  return new Blob([pdfBody], { type: "application/pdf" });
}

function buildReceiptHtml(receiptData) {
  const itemRows = receiptData.items
    .map((item) => {
      const qty = Number(item.quantity || 1);
      const lineTotal = Number(item.price || 0) * qty;
      const sizeText = item.size ? ` (${item.size})` : "";
      return `
        <tr>
          <td style="padding: 8px 0; color: #4B5563; font-size: 13px;">
            ${qty}x ${item.name}${sizeText}
          </td>
          <td style="padding: 8px 0; color: #121212; font-size: 13px; font-weight: 600; text-align: right;">
            &#8369;${lineTotal.toLocaleString()}
          </td>
        </tr>`;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Receipt ${receiptData.receiptNumber}</title>
      </head>
      <body style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; background: #FFFFFF; color: #121212; padding: 28px; max-width: 520px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-size: 22px; font-weight: 800; color: #121212;">MoreBites Digital Receipt</div>
          <div style="font-size: 13px; color: #6B7280; margin-top: 4px;">Confirmed Post-Payment Transaction Proof</div>
          <div style="display: inline-block; margin-top: 12px; padding: 6px 14px; border: 1px solid #F97000; border-radius: 18px; color: #F97000; font-weight: 700; font-size: 13px;">
            ${receiptData.receiptNumber}
          </div>
        </div>

        <div style="border: 1px solid #E5E7EB; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 7px 0; color: #6B7280; font-size: 13px;">Receipt Number</td>
              <td style="padding: 7px 0; color: #121212; font-size: 13px; font-weight: 700; text-align: right;">${receiptData.receiptNumber}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #6B7280; font-size: 13px;">Order ID</td>
              <td style="padding: 7px 0; color: #121212; font-size: 13px; font-weight: 600; text-align: right;">${receiptData.orderId}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #6B7280; font-size: 13px;">Order Placed</td>
              <td style="padding: 7px 0; color: #121212; font-size: 13px; font-weight: 600; text-align: right;">${receiptData.orderPlacedLabel}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #6B7280; font-size: 13px;">Payment Confirmed</td>
              <td style="padding: 7px 0; color: #121212; font-size: 13px; font-weight: 600; text-align: right;">${receiptData.paymentConfirmedLabel}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #6B7280; font-size: 13px;">Payment Method</td>
              <td style="padding: 7px 0; color: #16A34A; font-size: 13px; font-weight: 700; text-align: right;">${receiptData.paymentMethodLabel}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #6B7280; font-size: 13px;">Completed By (Rider)</td>
              <td style="padding: 7px 0; color: #121212; font-size: 13px; font-weight: 600; text-align: right;">${receiptData.riderName}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #6B7280; font-size: 13px;">Delivery Address</td>
              <td style="padding: 7px 0; color: #121212; font-size: 13px; font-weight: 600; text-align: right;">${receiptData.address}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #6B7280; font-size: 13px;">Loyalty Program</td>
              <td style="padding: 7px 0; color: #F97000; font-size: 13px; font-weight: 700; text-align: right;">Points Earned: ${receiptData.pointsEarned} pts</td>
            </tr>
          </table>
        </div>

        <div style="border: 1px solid #E5E7EB; border-radius: 12px; padding: 16px;">
          <div style="font-size: 15px; font-weight: 700; margin-bottom: 10px;">Ordered Items</div>
          <table style="width: 100%; border-collapse: collapse;">
            ${itemRows}
          </table>
          <hr style="border: none; border-top: 1px solid #F0F0F0; margin: 10px 0;" />
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 5px 0; color: #6B7280; font-size: 13px;">Subtotal</td>
              <td style="padding: 5px 0; color: #121212; font-size: 13px; font-weight: 600; text-align: right;">&#8369;${Number(receiptData.subtotal).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #6B7280; font-size: 13px;">Delivery Fee</td>
              <td style="padding: 5px 0; color: #121212; font-size: 13px; font-weight: 600; text-align: right;">&#8369;${Number(receiptData.deliveryFee).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #6B7280; font-size: 13px;">Service Fee</td>
              <td style="padding: 5px 0; color: #121212; font-size: 13px; font-weight: 600; text-align: right;">&#8369;${Number(receiptData.serviceFee).toLocaleString()}</td>
            </tr>
          </table>
          <hr style="border: none; border-top: 1px solid #F0F0F0; margin: 10px 0;" />
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #121212; font-size: 16px; font-weight: 800;">Total Amount Paid</td>
              <td style="padding: 6px 0; color: #F97000; font-size: 22px; font-weight: 800; text-align: right;">&#8369;${Number(receiptData.total).toLocaleString()}</td>
            </tr>
          </table>
        </div>
      </body>
    </html>`;
}

function DetailRow({ label, value, valueStyle, last }) {
  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueStyle]}>{value}</Text>
    </View>
  );
}

function SummaryRow({ label, value, prominent }) {
  return (
    <View style={[styles.summaryRow, prominent && styles.totalAmountPaidRow]}>
      <Text style={[styles.summaryLabel, prominent && styles.totalAmountPaidLabel]}>{label}</Text>
      <Text style={[styles.summaryValue, prominent && styles.totalAmountPaidValue]}>
        ₱{Number(value || 0).toLocaleString()}
      </Text>
    </View>
  );
}

export default function ReceiptScreen() {
  const params = useLocalSearchParams();
  const initialOrder = parseOrder(params.order);
  const { clearCart } = useCart();

  const rawDbId =
    (Array.isArray(params.dbId) ? params.dbId[0] : params.dbId) ||
    initialOrder.db_id ||
    initialOrder.dbId ||
    "";
  const dbId = rawDbId ? String(rawDbId) : "";

  const [orderData, setOrderData] = useState(initialOrder);
  const [fetching, setFetching] = useState(Boolean(dbId));
  const [sharing, setSharing] = useState(false);
  const receiptCaptureRef = useRef(null);

  const loadFullOrder = useCallback(async () => {
    if (!dbId) {
      setFetching(false);
      return;
    }
    try {
      const res = await customerApi.order(dbId);
      const fetched = res?.data || res;
      if (fetched && typeof fetched === "object") {
        setOrderData((prev) => ({ ...prev, ...fetched }));
      }
    } catch {
      // Fallback to passed order payload if offline
    } finally {
      setFetching(false);
    }
  }, [dbId]);

  useEffect(() => {
    loadFullOrder();
  }, [loadFullOrder]);

  const rawOrderId =
    orderData?.order_id ||
    orderData?.orderId ||
    orderData?.id ||
    (Array.isArray(params.orderId) ? params.orderId[0] : params.orderId) ||
    "#ORD-00000";
  const orderId = String(rawOrderId).startsWith("#") ? String(rawOrderId) : `#${rawOrderId}`;
  const receiptNumber = deriveReceiptNumber(orderData, orderId);

  const items = Array.isArray(orderData?.items) ? orderData.items : [];
  const total = Number(orderData?.total) || 0;
  const { deliveryFee, serviceFee } = feesFromOrder(orderData);
  const itemsSubtotal = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
    0
  );
  const subtotal =
    itemsSubtotal > 0 ? itemsSubtotal : Math.max(total - deliveryFee - serviceFee, 0);

  const orderPlacedLabel = formatDateTimeLabel(
    orderData?.ordered_at || orderData?.date || orderData?.created_at,
    orderData?.ordered_at_label || orderData?.dateLabel
  );

  const paymentConfirmedLabel = formatDateTimeLabel(
    orderData?.payment_confirmed_at || orderData?.delivered_at || orderData?.updated_at,
    orderData?.payment_confirmed_at_label || orderData?.delivered_at_label
  );

  const paymentMethodLabel = "Cash on Delivery (COD) — Paid";
  const riderName =
    orderData?.driver ||
    orderData?.rider_name ||
    orderData?.rider?.name ||
    "Assigned Delivery Rider";
  const address =
    orderData?.address ||
    orderData?.delivery_address ||
    [orderData?.street, orderData?.barangay, orderData?.city].filter(Boolean).join(", ") ||
    "Delivery address unavailable";

  // Loyalty calculation matching ReportController.php (`(int) round($spent / 2)`)
  const pointsEarned =
    orderData?.points_earned != null
      ? Number(orderData.points_earned)
      : Math.round(total / 2);

  const shareReceipt = async () => {
    if (sharing) return;
    setSharing(true);

    const receiptPayload = {
      receiptNumber,
      orderId,
      orderPlacedLabel,
      paymentConfirmedLabel,
      paymentMethodLabel,
      riderName,
      address,
      pointsEarned,
      items,
      subtotal,
      deliveryFee,
      serviceFee,
      total,
    };

    const plainTextSummary = [
      `MoreBites Digital Receipt (${receiptNumber})`,
      `Order ID: ${orderId}`,
      `Order Placed: ${orderPlacedLabel}`,
      `Payment Confirmed: ${paymentConfirmedLabel}`,
      `Payment Method: ${paymentMethodLabel}`,
      `Rider: ${riderName}`,
      `Delivery Address: ${address}`,
      `Points Earned: ${pointsEarned} pts`,
      `---`,
      ...items.map(
        (item) =>
          `${item.quantity}x ${item.name}${item.size ? ` (${item.size})` : ""} — ₱${(
            Number(item.price || 0) * Number(item.quantity || 1)
          ).toLocaleString()}`
      ),
      `Subtotal: ₱${subtotal.toLocaleString()}`,
      `Delivery Fee: ₱${deliveryFee.toLocaleString()}`,
      `Service Fee: ₱${serviceFee.toLocaleString()}`,
      `Total Amount Paid: ₱${total.toLocaleString()}`,
    ].join("\n");

    try {
      if (Platform.OS === "web") {
        const blob = buildReceiptPdfBlob(receiptPayload);
        const filename = `${receiptNumber}.pdf`;
        const file =
          typeof File !== "undefined"
            ? new File([blob], filename, { type: "application/pdf" })
            : null;

        if (
          file &&
          typeof navigator !== "undefined" &&
          navigator.canShare &&
          navigator.canShare({ files: [file] })
        ) {
          await navigator.share({
            title: `MoreBites Receipt ${receiptNumber}`,
            text: `Digital Receipt ${receiptNumber} for Order ${orderId}`,
            files: [file],
          });
        } else if (typeof window !== "undefined" && typeof document !== "undefined") {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
        return;
      }

      const canUseExpoSharing = await Sharing.isAvailableAsync();

      if (canUseExpoSharing) {
        try {
          const html = buildReceiptHtml(receiptPayload);
          const pdfResult = await Print.printToFileAsync({ html });
          if (pdfResult?.uri) {
            await Sharing.shareAsync(pdfResult.uri, {
              mimeType: "application/pdf",
              dialogTitle: `Share Receipt ${receiptNumber}`,
              UTI: "com.adobe.pdf",
            });
            return;
          }
        } catch {
          // Fallback to screenshot capture via react-native-view-shot
        }

        if (receiptCaptureRef.current) {
          try {
            const imageUri = await captureRef(receiptCaptureRef, {
              format: "png",
              quality: 1,
            });
            if (imageUri) {
              await Sharing.shareAsync(imageUri, {
                mimeType: "image/png",
                dialogTitle: `Share Receipt ${receiptNumber}`,
              });
              return;
            }
          } catch {
            // Fallback to native Share sheet below
          }
        }
      }

      await Share.share({
        title: `MoreBites Receipt ${receiptNumber}`,
        message: plainTextSummary,
      });
    } catch (err) {
      if (err?.message && !/cancel|dismiss/i.test(err.message)) {
        Alert.alert("Share Receipt", "Could not share receipt right now. Please try again.");
      }
    } finally {
      setSharing(false);
    }
  };

  const backToHome = () => {
    clearCart();
    router.replace("/(tabs)/home");
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/orders"))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color="#121212" />
        </Pressable>
        <Text style={styles.headerTitle}>Receipt</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View ref={receiptCaptureRef} collapsable={false} style={styles.receiptCaptureWrap}>
          <View style={styles.topSection}>
            <View style={styles.receiptIconCircle}>
              <Ionicons name="receipt-outline" size={40} color={PRIMARY} />
              <View style={styles.paidCheckBadge}>
                <Ionicons name="checkmark" size={13} color="#FFFFFF" />
              </View>
            </View>
            <Text style={styles.title}>Digital Receipt</Text>
            <Text style={styles.subtitle}>Payment confirmed & delivery completed</Text>
            <View style={styles.receiptBadge}>
              <Ionicons name="document-text-outline" size={14} color={PRIMARY} />
              <Text style={styles.receiptBadgeText}>{receiptNumber}</Text>
            </View>
          </View>

          {fetching && !items.length ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator size="small" color={PRIMARY} />
              <Text style={styles.loadingText}>Loading receipt details…</Text>
            </View>
          ) : null}

          <View style={styles.detailsCard}>
            <Text style={styles.sectionTitle}>Transaction & Delivery Details</Text>
            <DetailRow
              label="Receipt Number"
              value={receiptNumber}
              valueStyle={styles.receiptNumberValue}
            />
            <DetailRow label="Order ID" value={orderId} />
            <DetailRow label="Order Placed" value={orderPlacedLabel} />
            <DetailRow label="Payment Confirmed" value={paymentConfirmedLabel} />
            <DetailRow
              label="Payment Method"
              value={paymentMethodLabel}
              valueStyle={styles.paidMethodValue}
            />
            <DetailRow label="Rider Name" value={riderName} />
            <DetailRow label="Delivery Address" value={address} last />

            <View style={styles.loyaltyBanner}>
              <View style={styles.loyaltyIconWrap}>
                <Ionicons name="sparkles" size={16} color={PRIMARY} />
              </View>
              <Text style={styles.loyaltyText}>Points Earned: {pointsEarned} pts</Text>
            </View>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Order & Payment Summary</Text>
            {items.length ? (
              items.map((item, index) => (
                <View
                  key={`${item.id || item.name}-${item.size || "reg"}-${index}`}
                  style={styles.itemRow}
                >
                  <Text style={styles.itemText}>
                    {item.quantity}x {item.name}
                    {item.size ? ` (${item.size})` : ""}
                  </Text>
                  <Text style={styles.itemPrice}>
                    ₱{(Number(item.price || 0) * Number(item.quantity || 1)).toLocaleString()}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyItemsText}>Item details unavailable</Text>
            )}

            <View style={styles.divider} />
            <SummaryRow label="Subtotal" value={subtotal} />
            <SummaryRow label="Delivery Fee" value={deliveryFee} />
            <SummaryRow label="Service Fee" value={serviceFee} />
            <View style={styles.divider} />
            <SummaryRow label="Total Amount Paid" value={total} prominent />
          </View>
        </View>

        <Pressable
          style={[styles.shareButton, sharing && styles.buttonDisabled]}
          onPress={shareReceipt}
          disabled={sharing}
        >
          {sharing ? (
            <ActivityIndicator size="small" color="#121212" />
          ) : (
            <>
              <Ionicons name="share-social-outline" size={19} color="#121212" />
              <Text style={styles.shareButtonText}>Share Receipt</Text>
            </>
          )}
        </Pressable>

        <Pressable style={styles.homeButton} onPress={backToHome}>
          <Text style={styles.homeButtonText}>Back to Home</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  headerTitle: {
    flex: 1,
    color: "#121212",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  headerRightSpacer: {
    width: 24,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 28,
  },
  receiptCaptureWrap: {
    backgroundColor: "#FFFFFF",
  },
  topSection: {
    alignItems: "center",
  },
  receiptIconCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "#FFF4EB",
    borderWidth: 1.5,
    borderColor: "#FED7AA",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  paidCheckBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#22C55E",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 24,
    fontWeight: "700",
    marginTop: 14,
  },
  subtitle: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 13,
    marginTop: 6,
  },
  receiptBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: PRIMARY,
    backgroundColor: "#FFF9F5",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 14,
  },
  receiptBadgeText: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  loadingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    marginTop: 16,
  },
  loadingText: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 13,
  },
  detailsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginTop: 22,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 13,
  },
  detailValue: {
    flex: 1,
    color: "#121212",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
    marginLeft: 18,
  },
  receiptNumberValue: {
    color: PRIMARY,
    fontWeight: "700",
  },
  paidMethodValue: {
    color: "#16A34A",
    fontWeight: "700",
  },
  loyaltyBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFF4EB",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  loyaltyIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  loyaltyText: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  sectionTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  itemText: {
    flex: 1,
    color: "#4B5563",
    fontFamily: FONT,
    fontSize: 13,
    marginRight: 12,
  },
  itemPrice: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
  },
  emptyItemsText: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 13,
    paddingVertical: 6,
  },
  divider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginVertical: 10,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 13,
  },
  summaryValue: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
  },
  totalAmountPaidRow: {
    marginTop: 4,
    marginBottom: 2,
    paddingVertical: 4,
  },
  totalAmountPaidLabel: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "800",
  },
  totalAmountPaidValue: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 24,
    fontWeight: "800",
  },
  shareButton: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D4D4D4",
    borderRadius: 9,
    marginTop: 22,
  },
  shareButtonText: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  homeButton: {
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY,
    borderRadius: 9,
    marginTop: 12,
  },
  homeButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "700",
  },
});
