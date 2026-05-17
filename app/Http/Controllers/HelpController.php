<?php

namespace App\Http\Controllers;

use Inertia\Inertia;

class HelpController extends Controller
{
    public function howToUse()
    {
        return Inertia::render('Help/HowToUse');
    }
}
