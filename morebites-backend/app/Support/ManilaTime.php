<?php

namespace App\Support;

use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

class ManilaTime
{
    public const TZ = 'Asia/Manila';

    public static function now(): Carbon
    {
        return Carbon::now(self::TZ);
    }

    public static function todayString(): string
    {
        return self::now()->toDateString();
    }

    public static function toManila(mixed $value): ?Carbon
    {
        if ($value === null || $value === '') {
            return null;
        }

        if ($value instanceof CarbonInterface) {
            return Carbon::instance($value)->copy()->setTimezone(self::TZ);
        }

        return Carbon::parse($value)->setTimezone(self::TZ);
    }

    public static function format(mixed $value, string $format): ?string
    {
        $dt = self::toManila($value);

        return $dt ? $dt->format($format) : null;
    }

    /**
     * Start of a Manila calendar day (YYYY-MM-DD) converted to UTC for DB querying.
     */
    public static function startOfDayUtc(?string $ymd = null): Carbon
    {
        $day = $ymd
            ? Carbon::createFromFormat('Y-m-d', $ymd, self::TZ)
            : self::now();

        return $day->copy()->startOfDay()->setTimezone('UTC');
    }

    /**
     * End of a Manila calendar day (YYYY-MM-DD) converted to UTC for DB querying.
     */
    public static function endOfDayUtc(?string $ymd = null): Carbon
    {
        $day = $ymd
            ? Carbon::createFromFormat('Y-m-d', $ymd, self::TZ)
            : self::now();

        return $day->copy()->endOfDay()->setTimezone('UTC');
    }

    /**
     * @return array{0: Carbon, 1: Carbon}
     */
    public static function dayRangeUtc(?string $ymd = null): array
    {
        return [self::startOfDayUtc($ymd), self::endOfDayUtc($ymd)];
    }

    public static function startOfWeekUtc(): Carbon
    {
        return self::now()->startOfWeek()->setTimezone('UTC');
    }

    public static function startOfMonthUtc(): Carbon
    {
        return self::now()->startOfMonth()->setTimezone('UTC');
    }

    /**
     * Signed calendar days between today in Asia/Manila and a YYYY-MM-DD calendar date.
     * Positive = days remaining, 0 = today, negative = days past.
     */
    public static function calendarDaysUntil(mixed $date): ?int
    {
        if ($date === null || $date === '') {
            return null;
        }

        $targetYmd = $date instanceof CarbonInterface
            ? $date->format('Y-m-d')
            : Carbon::parse($date)->format('Y-m-d');

        $todayMidnight = Carbon::createFromFormat('Y-m-d', self::todayString(), self::TZ)->startOfDay();
        $targetMidnight = Carbon::createFromFormat('Y-m-d', $targetYmd, self::TZ)->startOfDay();

        return (int) $todayMidnight->diffInDays($targetMidnight, false);
    }
}

