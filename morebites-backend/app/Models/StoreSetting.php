<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StoreSetting extends Model
{
    protected $table = 'store_settings';

    protected $fillable = [
        'min_prep_time',
        'max_prep_time',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'min_prep_time' => 'integer',
            'max_prep_time' => 'integer',
        ];
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public static function current(): self
    {
        $setting = static::query()->first();
        if (! $setting) {
            $setting = static::query()->create([
                'min_prep_time' => 15,
                'max_prep_time' => 20,
            ]);
        }

        return $setting;
    }

    public function formattedLabel(): string
    {
        $min = (int) ($this->min_prep_time ?: 15);
        $max = (int) ($this->max_prep_time ?: 20);

        if ($min === $max) {
            return "about {$min} mins";
        }

        return "about {$min}–{$max} mins";
    }

    public function estimateText(): string
    {
        return "Preparing — ready in " . $this->formattedLabel();
    }
}

