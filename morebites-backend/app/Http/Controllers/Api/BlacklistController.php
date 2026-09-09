<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DriverBlacklist;
use Illuminate\Http\Request;

class BlacklistController extends Controller
{
    public function index(Request $request)
    {
        $query = DriverBlacklist::query()
            ->with('driver')
            ->whereHas('driver', fn ($q) => $q->whereNotNull('archived_at'))
            ->latest('blacklisted_at');

        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('driver_code', 'like', "%{$search}%")
                    ->orWhere('license_number', 'like', "%{$search}%")
                    ->orWhere('reason', 'like', "%{$search}%");
            });
        }

        $rows = $query->get()->map(fn (DriverBlacklist $d) => $this->transform($d));

        return response()->json(['data' => $rows]);
    }

    public function show(DriverBlacklist $blacklist)
    {
        return response()->json(['data' => $this->transform($blacklist)]);
    }

    public function updateNotes(Request $request, DriverBlacklist $blacklist)
    {
        $data = $request->validate([
            'notes' => ['nullable', 'string'],
        ]);

        $blacklist->update(['notes' => $data['notes'] ?? '']);

        return response()->json(['data' => $this->transform($blacklist->fresh())]);
    }

    private function transform(DriverBlacklist $d): array
    {
        return [
            'id' => $d->driver_code ?: ('DRIVER-'.str_pad((string) $d->id, 3, '0', STR_PAD_LEFT)),
            'db_id' => $d->id,
            'name' => $d->name,
            'license' => $d->license_number,
            'reason' => $d->reason,
            'date' => $d->blacklisted_at?->format('F d, Y h:i A'),
            'phone' => $d->phone,
            'attachment' => [
                'name' => $d->attachment_name ?: 'No attachment',
                'meta' => $d->attachment_meta ?: '-',
            ],
            'notes' => $d->notes,
        ];
    }
}
