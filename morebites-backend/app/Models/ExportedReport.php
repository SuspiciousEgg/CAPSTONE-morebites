<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ExportedReport extends Model
{
    protected $fillable = ['name', 'format', 'size'];
}
