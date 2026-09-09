<?php

use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\ArchiveController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BlacklistController;
use App\Http\Controllers\Api\CustomerAppController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DeliveryRateController;
use App\Http\Controllers\Api\DispatchController;
use App\Http\Controllers\Api\ExpiringStockController;
use App\Http\Controllers\Api\DriverAppController;
use App\Http\Controllers\Api\DriverController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\MenuController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\TrackingController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);
Route::post('/driver/login', [DriverAppController::class, 'login']);
Route::post('/customer/register', [CustomerAppController::class, 'register']);
Route::post('/customer/login', [CustomerAppController::class, 'login']);
Route::get('/customer/menu', [CustomerAppController::class, 'menu']);
Route::get('/delivery-rates', [DeliveryRateController::class, 'index']);
Route::get('/delivery-rates/quote', [DeliveryRateController::class, 'quote']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/customer/me', [CustomerAppController::class, 'me']);
    Route::patch('/customer/profile', [CustomerAppController::class, 'updateProfile']);
    Route::get('/customer/orders', [CustomerAppController::class, 'orders']);
    Route::get('/customer/orders/{order}', [CustomerAppController::class, 'showOrder']);
    Route::post('/customer/orders', [CustomerAppController::class, 'placeOrder']);

    Route::get('/driver/me', [DriverAppController::class, 'me']);
    Route::patch('/driver/profile', [DriverAppController::class, 'updateProfile']);
    Route::post('/driver/change-password', [DriverAppController::class, 'changePassword']);
    Route::patch('/driver/location', [DriverAppController::class, 'updateLocation']);
    Route::get('/driver/orders', [DriverAppController::class, 'orders']);
    Route::get('/driver/orders/{order}', [DriverAppController::class, 'showOrder']);
    Route::get('/driver/orders/{order}/tracking', [TrackingController::class, 'show']);
    Route::patch('/driver/orders/{order}/status', [DriverAppController::class, 'updateOrderStatus']);
    Route::post('/driver/orders/{order}/status', [DriverAppController::class, 'updateOrderStatus']);
    Route::post('/driver/orders/{order}/report', [DriverAppController::class, 'reportIssue']);

    Route::get('/customer/orders/{order}/tracking', [TrackingController::class, 'show']);
    Route::post('/customer/orders/{order}/rate', [CustomerAppController::class, 'rateOrder']);

    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/dashboard', [DashboardController::class, 'index']);

    Route::get('/orders/menu-options', [OrderController::class, 'menuOptions']);
    Route::get('/orders', [OrderController::class, 'index']);
    Route::post('/orders', [OrderController::class, 'store']);
    Route::patch('/orders/{order}/status', [OrderController::class, 'updateStatus']);
    Route::get('/orders/{order}/tracking', [TrackingController::class, 'show']);

    Route::get('/menu', [MenuController::class, 'index']);
    Route::post('/menu', [MenuController::class, 'store']);
    Route::put('/menu/{menu}', [MenuController::class, 'update']);
    Route::post('/menu/{menu}', [MenuController::class, 'update']);
    Route::patch('/menu/{menu}/availability', [MenuController::class, 'toggleAvailability']);
    Route::patch('/menu/{menu}/archive', [MenuController::class, 'archive']);
    Route::patch('/menu/{menu}/restore', [MenuController::class, 'restore']);

    Route::get('/inventory/logs', [InventoryController::class, 'logs']);
    Route::get('/inventory/expiring', [ExpiringStockController::class, 'index']);
    Route::post('/inventory/{inventory}/expiring/waste', [ExpiringStockController::class, 'markWaste']);
    Route::post('/inventory/{inventory}/expiring/kitchen-priority', [ExpiringStockController::class, 'setKitchenPriority']);
    Route::post('/inventory/{inventory}/expiring/promo', [ExpiringStockController::class, 'setPromo']);
    Route::post('/inventory/{inventory}/expiring/resolve', [ExpiringStockController::class, 'resolve']);
    Route::get('/inventory', [InventoryController::class, 'index']);
    Route::post('/inventory', [InventoryController::class, 'store']);
    Route::put('/inventory/{inventory}', [InventoryController::class, 'update']);
    Route::post('/inventory/{inventory}/restock', [InventoryController::class, 'restock']);
    Route::delete('/inventory/{inventory}', [InventoryController::class, 'destroy']);

    Route::get('/dispatch', [DispatchController::class, 'index']);
    Route::get('/dispatch/fleet', [TrackingController::class, 'fleet']);
    Route::post('/dispatch/{order}/assign', [DispatchController::class, 'assign']);

    Route::get('/reports', [ReportController::class, 'index']);
    Route::post('/reports/generate', [ReportController::class, 'generate']);
    Route::delete('/reports/{report}', [ReportController::class, 'destroy']);

    Route::middleware('not.cashier')->group(function () {
        Route::post('/delivery-rates', [DeliveryRateController::class, 'store']);
        Route::put('/delivery-rates/{deliveryRate}', [DeliveryRateController::class, 'update']);
        Route::delete('/delivery-rates/{deliveryRate}', [DeliveryRateController::class, 'destroy']);

        Route::get('/customers', [CustomerController::class, 'index']);
        Route::get('/customers/{customer}', [CustomerController::class, 'show']);

        Route::get('/accounts', [AccountController::class, 'index']);
        Route::post('/accounts/admins', [AccountController::class, 'storeAdmin']);
        Route::post('/accounts/drivers', [AccountController::class, 'storeDriver']);
        Route::post('/accounts/cashiers', [AccountController::class, 'storeCashier']);
        Route::put('/accounts/{user}', [AccountController::class, 'update']);
        Route::patch('/accounts/{user}/role-access', [AccountController::class, 'updateRoleAccess']);
        Route::post('/accounts/{user}/block', [AccountController::class, 'block']);

        Route::get('/drivers', [DriverController::class, 'index']);
        Route::get('/drivers/{user}', [DriverController::class, 'show']);
        Route::post('/drivers/{user}/suspend', [DriverController::class, 'suspend']);

        Route::get('/blacklist', [BlacklistController::class, 'index']);
        Route::get('/blacklist/{blacklist}', [BlacklistController::class, 'show']);
        Route::patch('/blacklist/{blacklist}/notes', [BlacklistController::class, 'updateNotes']);
        Route::get('/archive', [ArchiveController::class, 'index']);
        Route::post('/archive/{user}/restore', [ArchiveController::class, 'restore']);
        Route::delete('/archive/{user}', [ArchiveController::class, 'destroy']);
    });
});
