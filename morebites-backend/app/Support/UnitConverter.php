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
     * Canonical normalization map for kitchen portion tools and packaging units.
     */
    private const KITCHEN_UNIT_ALIASES = [
        'scoop' => 'scoop',
        'scoops' => 'scoop',
        'cup' => 'cup',
        'cups' => 'cup',
        'ladle' => 'ladle',
        'ladles' => 'ladle',
        'slice' => 'slice',
        'slices' => 'slice',
        'portion' => 'portion',
        'portions' => 'portion',
        'serving' => 'portion',
        'servings' => 'portion',
        'tbsp' => 'tbsp',
        'tablespoon' => 'tbsp',
        'tablespoons' => 'tbsp',
        'tsp' => 'tsp',
        'teaspoon' => 'tsp',
        'teaspoons' => 'tsp',
        'pack' => 'pack',
        'packs' => 'pack',
        'pkg' => 'pack',
        'bag' => 'bag',
        'bags' => 'bag',
        'bottle' => 'bottle',
        'bottles' => 'bottle',
        'can' => 'can',
        'cans' => 'can',
        'box' => 'box',
        'boxes' => 'box',
        'jar' => 'jar',
        'jars' => 'jar',
        'tray' => 'tray',
        'trays' => 'tray',
    ];

    /**
     * Normalizes a unit string to its canonical representation (e.g. 'g', 'kg', 'L', 'ml', 'pcs', 'scoop', 'ladle', 'pack').
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

        if (isset(self::KITCHEN_UNIT_ALIASES[$clean])) {
            return self::KITCHEN_UNIT_ALIASES[$clean];
        }

        return $clean;
    }

    /**
     * Returns the physical category of the unit ('mass', 'volume', 'count'), or null for custom/kitchen units.
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
     * Checks whether two units belong to the same physical category (or are the exact same custom/kitchen unit).
     */
    public static function isCompatible(?string $fromUnit, ?string $toUnit): bool
    {
        if ($fromUnit === null || $toUnit === null) {
            return true;
        }

        $normFrom = self::normalize($fromUnit);
        $normTo = self::normalize($toUnit);

        if ($normFrom === null || $normTo === null) {
            return true;
        }

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
     * Checks whether a recipe unit is compatible with an inventory item, taking into account
     * any configured kitchen portion tool (e.g. 1 pack = 8 scoops, 1 L = 12 ladles).
     */
    public static function isCompatibleWithInventory(
        ?string $recipeUnit,
        ?string $stockUnit,
        ?string $portionUnit = null,
        ?float $portionsPerUnit = null
    ): bool {
        if ($recipeUnit === null || trim($recipeUnit) === '') {
            return true;
        }

        if (self::isCompatible($recipeUnit, $stockUnit)) {
            return true;
        }

        if ($portionUnit !== null && trim($portionUnit) !== '' && $portionsPerUnit !== null && $portionsPerUnit > 0) {
            $normRecipe = self::normalize($recipeUnit);
            $normPortion = self::normalize($portionUnit);
            if ($normRecipe !== null && $normRecipe === $normPortion) {
                return true;
            }
        }

        return false;
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
     * Converts a recipe quantity into the inventory item's stock unit, supporting
     * kitchen portion tools (e.g. 1.5 scoops / 8 scoops-per-pack = 0.1875 pack).
     */
    public static function toStockUnit(
        float $qty,
        ?string $recipeUnit,
        ?string $stockUnit,
        ?string $portionUnit = null,
        ?float $portionsPerUnit = null
    ): float {
        $normRecipe = self::normalize($recipeUnit);
        $normStock = self::normalize($stockUnit);

        if ($normRecipe === null || $normStock === null || $normRecipe === $normStock) {
            return $qty;
        }

        if ($portionUnit !== null && trim($portionUnit) !== '' && $portionsPerUnit !== null && $portionsPerUnit > 0) {
            $normPortion = self::normalize($portionUnit);
            if ($normPortion !== null && $normRecipe === $normPortion) {
                return round($qty / $portionsPerUnit, 6);
            }
        }

        return self::convert($qty, $recipeUnit, $stockUnit);
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

    /**
     * Returns compatible units for an inventory item, putting its configured kitchen portion tool first.
     */
    public static function compatibleUnitsForInventory(
        ?string $stockUnit,
        ?string $portionUnit = null,
        ?float $portionsPerUnit = null
    ): array {
        $units = self::compatibleUnits($stockUnit);

        if ($portionUnit !== null && trim($portionUnit) !== '' && $portionsPerUnit !== null && $portionsPerUnit > 0) {
            $normPortion = self::normalize($portionUnit);
            if ($normPortion !== null && ! in_array($normPortion, $units, true)) {
                array_unshift($units, $normPortion);
            }
        }

        return array_values($units);
    }
}
