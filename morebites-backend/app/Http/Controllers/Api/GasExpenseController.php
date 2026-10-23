<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\GasExpense;
use App\Models\Order;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GasExpenseController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $fromDate = $request->query('from_date');
        $toDate = $request->query('to_date');
        $driverId = $request->query('driver_id');

        $query = GasExpense::query()->with(['user:id,name,role', 'driver:id,name'])->latest('expense_date')->latest('id');

        if ($fromDate) {
            $query->where('expense_date', '>=', $fromDate);
        }
        if ($toDate) {
            $query->where('expense_date', '<=', $toDate);
        }
        if ($driverId) {
            $query->where('driver_id', $driverId);
        }

        $expenses = $query->get()->map(function (GasExpense $e) {
            return [
                'id' => $e->id,
                'amount' => (float) $e->amount,
                'amount_label' => '₱' . number_format((float) $e->amount, 2),
                'expense_date' => $e->expense_date?->format('Y-m-d') ?: $e->created_at?->format('Y-m-d'),
                'note' => $e->note ?: 'Fuel / Gas Expense',
                'driver_id' => $e->driver_id,
                'driver_name' => $e->driver?->name ?: null,
                'order_id' => $e->order_id,
                'logged_by_id' => $e->user_id,
                'logged_by_name' => $e->user?->name ?: 'Staff',
                'logged_by_role' => $e->user?->role ?: 'staff',
                'created_at' => $e->created_at?->toISOString(),
            ];
        });

        // Compute summary metrics for delivery fees collected vs gas expenses
        $ordersQuery = Order::query()
            ->realOrderCodes()
            ->where('order_type', 'Online Order')
            ->where('status', 'Completed');

        if ($fromDate) {
            $fromDt = Carbon::createFromFormat('Y-m-d', $fromDate)->startOfDay()->setTimezone('UTC');
            $ordersQuery->where('created_at', '>=', $fromDt);
        }
        if ($toDate) {
            $toDt = Carbon::createFromFormat('Y-m-d', $toDate)->endOfDay()->setTimezone('UTC');
            $ordersQuery->where('created_at', '<=', $toDt);
        }
        if ($driverId) {
            $ordersQuery->where('driver_id', $driverId);
        }

        $deliveryOrders = $ordersQuery->get(['id', 'delivery_fee', 'total']);
        $totalDeliveryFees = (float) $deliveryOrders->sum(fn ($o) => (float) ($o->delivery_fee ?? 40.0));
        $totalGasExpense = (float) $expenses->sum('amount');
        $netDeliveryIncome = $totalDeliveryFees - $totalGasExpense;

        return response()->json([
            'data' => [
                'expenses' => $expenses,
                'summary' => [
                    'delivery_fees_collected' => $totalDeliveryFees,
                    'delivery_fees_collected_label' => '₱' . number_format($totalDeliveryFees, 2),
                    'total_gas_expense' => $totalGasExpense,
                    'total_gas_expense_label' => '₱' . number_format($totalGasExpense, 2),
                    'net_delivery_income' => $netDeliveryIncome,
                    'net_delivery_income_label' => ($netDeliveryIncome >= 0 ? '₱' : '-₱') . number_format(abs($netDeliveryIncome), 2),
                    'completed_deliveries_count' => $deliveryOrders->count(),
                ],
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'gt:0'],
            'expense_date' => ['required', 'date'],
            'driver_id' => ['nullable', 'exists:users,id'],
            'order_id' => ['nullable', 'exists:orders,id'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $user = $request->user();
        $expense = GasExpense::query()->create([
            'user_id' => $user?->id,
            'driver_id' => $validated['driver_id'] ?? null,
            'order_id' => $validated['order_id'] ?? null,
            'expense_date' => $validated['expense_date'],
            'amount' => $validated['amount'],
            'note' => $validated['note'] ?? null,
        ]);

        $actor = $user?->name ?: 'Staff';
        $noteSuffix = $expense->note ? " ({$expense->note})" : '';
        ActivityLog::query()->create([
            'actor' => $actor,
            'action' => "Logged gas expense of ₱" . number_format((float) $expense->amount, 2) . $noteSuffix,
        ]);

        $expense->load(['user:id,name,role', 'driver:id,name']);

        return response()->json([
            'data' => [
                'id' => $expense->id,
                'amount' => (float) $expense->amount,
                'amount_label' => '₱' . number_format((float) $expense->amount, 2),
                'expense_date' => $expense->expense_date?->format('Y-m-d'),
                'note' => $expense->note ?: 'Fuel / Gas Expense',
                'driver_id' => $expense->driver_id,
                'driver_name' => $expense->driver?->name ?: null,
                'logged_by_name' => $expense->user?->name ?: $actor,
                'created_at' => $expense->created_at?->toISOString(),
            ],
            'message' => 'Gas expense logged successfully.',
        ], 201);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $expense = GasExpense::query()->findOrFail($id);
        $amount = (float) $expense->amount;
        $note = $expense->note;
        $expense->delete();

        $actor = $request->user()?->name ?: 'Staff';
        ActivityLog::query()->create([
            'actor' => $actor,
            'action' => "Removed gas expense of ₱" . number_format($amount, 2) . ($note ? " ({$note})" : ''),
        ]);

        return response()->json([
            'message' => 'Gas expense removed successfully.',
        ]);
    }
}

