<?php

return [
    'tiers' => [
        ['min_km' => 0, 'max_km' => 1, 'fee' => 30, 'sort_order' => 1],
        ['min_km' => 1, 'max_km' => 2, 'fee' => 35, 'sort_order' => 2],
        ['min_km' => 2, 'max_km' => 5, 'fee' => 40, 'sort_order' => 3],
        ['min_km' => 5, 'max_km' => 10, 'fee' => 60, 'sort_order' => 4],
        ['min_km' => 10, 'max_km' => null, 'fee' => 80, 'sort_order' => 5],
    ],
];
