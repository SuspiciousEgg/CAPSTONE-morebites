<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\GasExpense;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class GasExpenseReportTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $driver;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::query()->create([
            'name' => 'Reports Admin',
            'email' => 'admin@morebites.test',
            'phone' => '+639171234567',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'status' => 'Active',
        ]);

        $this->driver = User::query()->create([
            'name' => 'John Driver',
            'email' => 'driver@morebites.test',
            'phone' => '+639179876543',
            'password' => Hash::make('password'),
            'role' => 'driver',
            'status' => 'Active',
        ]);
    }

    public function test_can_log_gas_expense_and_logs_activity(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/gas-expenses', [
                'amount' => 150.50,
                'expense_date' => Carbon::now()->toDateString(),
                'driver_id' => $this->driver->id,
                'note' => '3 delivery runs to town proper',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.amount', 150.5)
            ->assertJsonPath('data.driver_name', 'John Driver')
            ->assertJsonPath('data.note', '3 delivery runs to town proper');

        $this->assertDatabaseHas('gas_expenses', [
            'amount' => 150.50,
            'driver_id' => $this->driver->id,
            'note' => '3 delivery runs to town proper',
        ]);

        $this->assertDatabaseHas('activity_logs', [
            'actor' => 'Reports Admin',
        ]);
    }

    public function test_gas_expense_requires_positive_amount_and_valid_date(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/gas-expenses', [
                'amount' => -20,
                'expense_date' => 'invalid-date',
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['amount', 'expense_date']);
    }

    public function test_gas_expense_index_computes_delivery_finance_summary(): void
    {
        // 2 completed online orders with delivery fees
        Order::query()->create([
            'order_code' => '#ORD-00101',
            'customer_name' => 'Test Customer',
            'order_type' => 'Online Order',
            'status' => 'Completed',
            'total' => 350.00,
            'delivery_fee' => 45.00,
            'created_at' => Carbon::now(),
        ]);

        Order::query()->create([
            'order_code' => '#ORD-00102',
            'customer_name' => 'Test Customer',
            'order_type' => 'Online Order',
            'status' => 'Completed',
            'total' => 280.00,
            'delivery_fee' => 40.00,
            'created_at' => Carbon::now(),
        ]);

        // 1 cancelled order (should not count towards delivery fees)
        Order::query()->create([
            'order_code' => '#ORD-00103',
            'customer_name' => 'Test Customer',
            'order_type' => 'Online Order',
            'status' => 'Cancelled',
            'total' => 300.00,
            'delivery_fee' => 40.00,
            'created_at' => Carbon::now(),
        ]);

        // Gas expense: 50.00
        GasExpense::query()->create([
            'user_id' => $this->admin->id,
            'driver_id' => $this->driver->id,
            'amount' => 50.00,
            'expense_date' => Carbon::now()->toDateString(),
            'note' => 'Fuel replenishment',
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/gas-expenses');

        $response->assertStatus(200);

        // delivery fees = 45 + 40 = 85. gas = 50. net = 35.
        $response->assertJsonPath('data.summary.delivery_fees_collected', 85)
            ->assertJsonPath('data.summary.total_gas_expense', 50)
            ->assertJsonPath('data.summary.net_delivery_income', 35)
            ->assertJsonPath('data.summary.completed_deliveries_count', 2);
    }

    public function test_reports_api_surfaces_delivery_finance_and_drivers(): void
    {
        Order::query()->create([
            'order_code' => '#ORD-00104',
            'customer_name' => 'Test Customer',
            'order_type' => 'Online Order',
            'status' => 'Completed',
            'total' => 400.00,
            'delivery_fee' => 50.00,
            'created_at' => Carbon::now(),
        ]);

        GasExpense::query()->create([
            'user_id' => $this->admin->id,
            'amount' => 30.00,
            'expense_date' => Carbon::now()->toDateString(),
            'note' => 'Morning gas',
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/reports?tab=delivery');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'delivery_finance' => [
                        'delivery_fees_collected',
                        'total_gas_expense',
                        'net_delivery_income',
                        'completed_deliveries_count',
                        'gas_expenses',
                    ],
                    'drivers',
                    'delivery_records',
                ],
            ]);

        $response->assertJsonPath('data.delivery_finance.delivery_fees_collected', 50)
            ->assertJsonPath('data.delivery_finance.total_gas_expense', 30)
            ->assertJsonPath('data.delivery_finance.net_delivery_income', 20);
    }

    public function test_can_delete_gas_expense(): void
    {
        $expense = GasExpense::query()->create([
            'user_id' => $this->admin->id,
            'amount' => 75.00,
            'expense_date' => Carbon::now()->toDateString(),
            'note' => 'Mistake entry',
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->deleteJson("/api/gas-expenses/{$expense->id}");

        $response->assertStatus(200);

        $this->assertDatabaseMissing('gas_expenses', [
            'id' => $expense->id,
        ]);
    }
}
