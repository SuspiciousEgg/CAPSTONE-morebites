<?php

namespace App\Support;

use InvalidArgumentException;

class UnitConverter
{
    public const CATEGORY_MASS = 'mass';
    public const CATEGORY_VOLUME = 'volume';
    public const CATEGORY_COUNT = 'count';

    /**
     * Scaling factors relative to base unit for each category:
     * - Mass base: gram ('g')
     * - Volume base: milliliter ('ml')
     * - Count base: piece ('pcs')
     */
    private const MASS_FACTORS = [
        'g' => 1.0,
        'gram' => 1.0,
        'grams' => 1.0,
        'gm' => 1.0,
        'gms' => 1.0,
        'kg' => 1000.0,
        'kilogram' => 1000.0,
        'kilograms' => 1000.0,
        'kgs' => 1000.0,
    ];

    private const VOLUME_FACTORS = [
        'ml' => 1.0,
        'milliliter' => 1.0,
        'milliliters' => 1.0,
        'l' => 1000.0,
        'liter' => 1000.0,
        'liters' => 1000.0,
        'litre' => 1000.0,
        'litres' => 1000.0,
    ];

    private const COUNT_FACTORS = [
        'pcs' => 1.0,
        'pc' => 1.0,
        'piece' => 1.0,
        'pieces' => 1.0,
    ];

    /**
     * Normalizes a unit string to its canonical representation ('g', 'kg', 'L', 'ml', 'pcs').
     */
    public static function normalize(?string $unit): ?string
    {
        if ($unit === null) {
            return null;
        }

        $clean = strtolower(trim($unit));
        if ($clean === '') {
            return null;
        }

        if (isset(self::MASS_FACTORS[$clean])) {
            return in_array($clean, ['kg', 'kilogram', 'kilograms', 'kgs'], true) ? 'kg' : 'g';
        }

        if (isset(self::VOLUME_FACTORS[$clean])) {
            return in_array($clean, ['l', 'liter', 'liters', 'litre', 'litres'], true) ? 'L' : 'ml';
        }

        if (isset(self::COUNT_FACTORS[$clean])) {
            return 'pcs';
        }

        return $clean;
    }

    /**
     * Returns the physical category of the unit ('mass', 'volume', 'count'), or null if unrecognized.
     */
    public static function category(?string $unit): ?string
    {
        if ($unit === null) {
            return null;
        }

        $clean = strtolower(trim($unit));
        if (isset(self::MASS_FACTORS[$clean])) {
            return self::CATEGORY_MASS;
        }

        if (isset(self::VOLUME_FACTORS[$clean])) {
            return self::CATEGORY_VOLUME;
        }

        if (isset(self::COUNT_FACTORS[$clean])) {
            return self::CATEGORY_COUNT;
        }

        return null;
    }

    /**
     * Checks whether two units belong to the same physical category and can be converted.
     */
    public static function isCompatible(?string $fromUnit, ?string $toUnit): bool
    {
        if ($fromUnit === null || $toUnit === null) {
            return true;
        }

        $normFrom = self::normalize($fromUnit);
        $normTo = self::normalize($toUnit);

        if ($normFrom === $normTo) {
            return true;
        }

        $catFrom = self::category($fromUnit);
        $catTo = self::category($toUnit);

        if ($catFrom === null || $catTo === null) {
            return false;
        }

        return $catFrom === $catTo;
    }

    /**
     * Converts a quantity from one unit to another.
     * Throws InvalidArgumentException if units are incompatible.
     */
    public static function convert(float $qty, ?string $fromUnit, ?string $toUnit): float
    {
        if ($fromUnit === null || $toUnit === null) {
            return $qty;
        }

        $cleanFrom = strtolower(trim($fromUnit));
        $cleanTo = strtolower(trim($toUnit));

        if ($cleanFrom === $cleanTo) {
            return $qty;
        }

        $normFrom = self::normalize($fromUnit);
        $normTo = self::normalize($toUnit);

        if ($normFrom === $normTo) {
            return $qty;
        }

        $catFrom = self::category($fromUnit);
        $catTo = self::category($toUnit);

        if ($catFrom === null || $catTo === null || $catFrom !== $catTo) {
            throw new InvalidArgumentException("Incompatible unit conversion from '{$fromUnit}' to '{$toUnit}'.");
        }

        $factors = match ($catFrom) {
            self::CATEGORY_MASS => self::MASS_FACTORS,
            self::CATEGORY_VOLUME => self::VOLUME_FACTORS,
            self::CATEGORY_COUNT => self::COUNT_FACTORS,
            default => null,
        };

        if ($factors === null || ! isset($factors[$cleanFrom], $factors[$cleanTo])) {
            throw new InvalidArgumentException("Missing conversion factor between '{$fromUnit}' and '{$toUnit}'.");
        }

        $baseValue = $qty * $factors[$cleanFrom];
        $converted = $baseValue / $factors[$cleanTo];

        return round($converted, 6);
    }

    /**
     * Returns a list of compatible units for a given inventory unit.
     */
    public static function compatibleUnits(?string $unit): array
    {
        $cat = self::category($unit);

        return match ($cat) {
            self::CATEGORY_MASS => ['g', 'kg'],
            self::CATEGORY_VOLUME => ['ml', 'L'],
            self::CATEGORY_COUNT => ['pcs'],
            default => $unit ? [self::normalize($unit)] : ['pcs', 'g', 'kg', 'ml', 'L'],
        };
    }
}
